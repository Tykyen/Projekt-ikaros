# Backend — verifikační příručka

Cíl: objektivně zjistit, zda backend funguje jako celek. Tento dokument popisuje **jak** ověřit jednotlivé části. Smoke skript `scripts/backend-smoke-test.ts` automatizuje většinu těchto kroků; tato příručka je pro manuální debug a CI dokumentaci.

> **Důležité:** smoke skript pracuje pouze s daty s prefixem `TEST_VERIFICATION_`. Nikdy nemaže produkční data.

---

## 0) Předpoklady

- Node.js ≥ 22 (viz `@types/node` v `backend/package.json`).
- Spuštěná instance MongoDB dosažitelná přes `MONGODB_URI` z `backend/.env`.
- `backend/.env` (zkopíruj z `backend/.env.example`, doplň VAPID a Cloudinary).

---

## 1) Spuštění projektu

Z `backend/`:

```bash
npm install
npm run start:dev    # watch mód (TS přes ts-node)
# nebo
npm run start        # bez watch
# nebo (po buildu)
npm run start:prod
```

Default port: `3000`. Default API prefix: `/api`. Swagger: `http://localhost:3000/docs`.

**Ověření, že běží:**

```bash
curl http://localhost:3000/api/health
```

Měl bys dostat JSON s polem `data.status: "ok"` (response wrapper `{ data }` přidává globální [response.interceptor.ts](backend/src/common/interceptors/response.interceptor.ts)).

---

## 2) Build

```bash
npm run build        # nest build → dist/
```

Selhání = TypeScript / Nest CLI chyba; `npm run typecheck` ji izoluje na úroveň TS bez Nest pluginu.

---

## 3) Lint

```bash
npm run lint:check   # check-only (CI mode)
npm run lint         # auto-fix
```

---

## 4) Unit testy

```bash
npm test             # všechny *.spec.ts
npm run test:cov     # s coverage do coverage/
```

---

## 5) E2E testy

```bash
npm run test:e2e
```

Konfigurace: [backend/test/jest-e2e.json](backend/test/jest-e2e.json). `mongodb-memory-server` startuje izolovanou Mongo per spec, takže e2e nepotřebuje běžící DB.

Klíčové specy:
- `app.e2e-spec.ts` — bootstrap a základní endpointy
- `auth-refresh.e2e-spec.ts`, `auth-throttle.e2e-spec.ts` — JWT lifecycle
- `worlds-join.e2e-spec.ts` — worlds JOIN flow + accessMode varianty
- `game-events-role-gating.e2e-spec.ts` — role-gating pro PJ/Admin mutace
- `smoke-full-app.e2e-spec.ts` — boot kompletního AppModule

---

## 6) Ověření databáze

### 6.1 Connection
- `/api/health` ukáže `checks.mongo.ok = true` (readyState=1).
- Manuálně: `mongosh "$MONGODB_URI"` → `db.runCommand({ ping: 1 })`.

### 6.2 Seed dat
[matrix-world.seed.ts](backend/src/database/seed/matrix-world.seed.ts) běží přes `OnApplicationBootstrap`:
- Vytvoří svět `Matrix` (slug `matrix`, ID `6d6174726978000000000001`) pokud neexistuje.
- Vyžaduje aspoň jednoho uživatele s rolí `Superadmin` (jinak se přeskočí, viz log).

Ověř ručně:
```bash
mongosh "$MONGODB_URI" --eval 'db.worlds.findOne({ slug: "matrix" })'
```

Pokud chybí Superadmin, ručně povýšit:
```js
db.users.updateOne({ email: "<email>" }, { $set: { role: 1 } })
```
(role 1 = Superadmin podle [user.interface.ts](backend/src/modules/users/interfaces/user.interface.ts))

---

## 7) Ověření JWT

### 7.1 Login flow
```bash
# 1) register
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"foo@bar.cz","username":"foo","password":"pass1234"}'

# 2) login
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"foo@bar.cz","password":"pass1234"}'
```

Odpověď: `{ data: { accessToken, refreshToken, user } }`.

### 7.2 Bearer ověření
```bash
curl -H "Authorization: Bearer <accessToken>" http://localhost:3000/api/worlds/my
```
Bez tokenu → `401 Unauthorized`.

### 7.3 Refresh rotace
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

Použije-li se refresh token podruhé, celá rodina se zruší (reuse detection v [auth.service.ts:104](backend/src/modules/auth/auth.service.ts#L104)).

---

## 8) Ověření rolí

Role hierarchie ([user.interface.ts](backend/src/modules/users/interfaces/user.interface.ts)):
- `Superadmin=1, Admin=2, PJ=3, Korektor=4, Hrac=5, Ctenar=6, Zadatel=7, Zakaz=8, …`

Pro mutace v rámci světa rozhoduje **WorldRole** v membership (viz `world-membership.interface.ts`): `PomocnyPJ` a výš smí psát; globální `Admin/Superadmin` mají shortcut.

> Vlastník světa **není** automaticky autorizován (memory `project_world_authorization`). Audit musí vždy probíhat přes membership nebo global role.

Ověření:
- Vytvoř druhého uživatele s default rolí `Hrac`.
- Pokus se o `POST /api/worlds/:id/pages` → musí vrátit `403`.
- Povyš ho na `PomocnyPJ` v membership a opakuj → `201`.

---

## 9) Ověření WebSocket gateways

Gateways jsou v [backend/src/gateways/](backend/src/gateways/) a v každém modulu jako `*.gateway.ts`. Custom adapter: [socket-io.adapter.ts](backend/src/socket-io.adapter.ts).

Připojení (browser konzole nebo Node klient):
```js
const socket = io('http://localhost:3000', {
  auth: { token: '<accessToken>' },
  transports: ['websocket'],
});
socket.on('connect', () => console.log('connected', socket.id));
```

Eventy: viz [docs/websocket-api.md](docs/websocket-api.md).

---

## 10) Ověření modulů

Smoke skript automaticky testuje níže uvedené flow. Pro manuální ověření přes Swagger ([http://localhost:3000/docs](http://localhost:3000/docs)) vždy vyžaduje Bearer token z auth/login.

| Modul | Klíčový endpoint | Co ověřit |
|---|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/refresh`, `/logout` | tokeny v odpovědi, throttling |
| Users | `GET /api/users/me` | username, role, lastSeenAt |
| Worlds | `POST /api/worlds`, `GET /api/worlds/:id/settings` | accessMode, ownerId |
| World settings | `PUT /api/worlds/:worldId/settings` | role gating ≥ PJ |
| Pages | `POST /api/worlds/:worldId/pages` | role gating, slug uniqueness |
| Characters | `POST /api/worlds/:worldId/characters` | NPC vs hráčské |
| NPC templates | `POST /api/worlds/:worldId/npc-templates` | global vs world-bound |
| Game events | `POST /api/game-events` | role gating, RSVP |
| Timeline | `POST /api/timeline` | role gating, ASC sort |
| World weather | `POST /api/worlds/:worldId/weather-generators` | config validace |
| World news | `POST /api/news` | anonymní GET (anti-leak 403), auth POST |
| Ikaros articles | `POST /api/ikaros-articles` | Draft → Submit → Approve flow |
| Push | `GET /api/push/vapid-public-key` | VAPID env |
| Upload | `POST /api/upload/*` | Cloudinary env |
| Admin | `GET /api/admin/*` | role gating Admin+ |

---

## 11) Auth-leak policy

Per [.claude/rules/auth-leak-policy.md](.claude/rules/auth-leak-policy.md):

| Endpoint | Neexistuje | Cizí | Bez auth |
|---|---|---|---|
| Anonymní (`/news/...`) | 403 | 403 | n/a |
| Auth-required | 404 | 403 | 401 |

Smoke skript ověří:
- `GET /api/worlds/my` bez tokenu → `401`
- `POST /api/worlds/:id/pages` jako Hrac → `403`

---

## 12) Smoke skript

Dva režimy:

### 12.1 `smoke:be` — proti běžícímu backendu

Vyžaduje, aby backend běžel a měl reálné MongoDB.

```bash
cd backend
npm run smoke:be
# nebo
BASE_URL=https://staging.ikaros.cz npm run smoke:be
```

Default `BASE_URL=http://localhost:3000`.

### 12.2 `smoke:be:full` — orchestrace s in-memory Mongo

Nepotřebuje běžící backend ani Mongo. Orchestrátor:
1. spustí `MongoMemoryServer` (z `mongodb-memory-server`, který je v devDeps),
2. spawnuje backend (`npm run start`) na náhodném volném portu s in-memory Mongo URI,
3. vygeneruje validní VAPID klíče přes `web-push.generateVAPIDKeys()` (jinak push.service crashne při bootstrapu),
4. nastaví fake Cloudinary klíče (jen pro health — uploady se netestují),
5. počká na `/api/health` (mongo.ok=true),
6. spustí smoke test,
7. backend zabije, Mongo zastaví.

```bash
cd backend
npm run smoke:be:full
```

### Společné

Obě varianty vypisují PASS/FAIL/TODO report. Exit code `0` při všech PASS, `1` při FAIL/TODO.

### Testovací data
- Vše prefixováno `TEST_VERIFICATION_`.
- Smoke skript po sobě uklízí pouze data s tímto prefixem.
- Pokud něco selže uprostřed, zbylá data lze ručně smazat:
  ```js
  db.worlds.deleteMany({ slug: /^test-verification-/ })
  db.users.deleteMany({ email: /^test_verification_/i })
  db.pages.deleteMany({ slug: /^test-verification-/ })
  db.characters.deleteMany({ slug: /^test-verification-/ })
  db.npctemplates.deleteMany({ name: /^TEST_VERIFICATION_/ })
  db.gameevents.deleteMany({ title: /^TEST_VERIFICATION_/ })
  db.timelineevents.deleteMany({ title: /^TEST_VERIFICATION_/ })
  db.weathergenerators.deleteMany({ name: /^TEST_VERIFICATION_/ })
  db.worldnews.deleteMany({ title: /^TEST_VERIFICATION_/ })
  db.ikarosarticles.deleteMany({ title: /^TEST_VERIFICATION_/ })
  ```

---

## 13) Co dělat při FAIL

1. Zkontroluj `/api/health` — zúží to scope (DB? env? Cloudinary?).
2. Zkontroluj backend logy (NestJS `Logger` výstup, primárně chyby ze seed/auth).
3. Spusť `npm run test:e2e` — pokud projde, problém je v env/data, ne v kódu.
4. Pokud něco neumíš objektivně otestovat (např. WS gateway bez klienta), zapiš to v reportu jako **TODO/FAIL** — nikdy nepředstírej úspěch.
