# Auth refresh tokens — design

> Fáze 1.3 z [roadmap2.md](../../roadmap2.md). Implementace `POST /auth/refresh` s rotací a blacklistem (`RefreshToken` kolekce). Přidává `/auth/logout`, `/auth/logout-all`. Integrace se změnou hesla.

## Kontext

Aktuální stav (po fázi 1.1 AKJ cleanup):
- `auth.service.ts` má `register`, `login` — vrací jen `{ accessToken, user }`
- JWT 24h expiry, HS256, secret `JWT_SECRET`
- Žádný refresh, žádný logout — uživatel po 24h musí znovu přihlásit
- Žádný způsob, jak revokovat token před expiry (forced logout)

Roadmap2 fáze 1.3 stanovila: refresh token TTL 30 dní s vlastním secretem, rotace + blacklist, kolekce `RefreshToken`.

**Brainstorming 2026-05-05** uzavřel:
1. **Reuse detection:** B — auto-revoke celé rodiny při použití revoked tokenu
2. **Logout endpointy:** C — oba (`/auth/logout` per-session, `/auth/logout-all` per-user)
3. **Změna hesla:** A — automaticky revokuje všechny refresh tokeny userId
4. **Register response:** A — stejné jako login (accessToken + refreshToken)

## Cíl

1. Implementovat `POST /auth/refresh` s rotací a detekcí reuse
2. Implementovat `POST /auth/logout` (per-session, idempotent)
3. Implementovat `POST /auth/logout-all` (per-user, vyžaduje JWT)
4. Při loginu/registru vracet oba tokeny
5. Změna/reset hesla revokuje všechny refresh tokeny daného uživatele (přes EventEmitter)

## Architektura

Dva typy tokenů:

- **Access token** — krátkodobý (24h), HS256 + `JWT_SECRET`, **stateless**. Žádný `jti`, žádný DB lookup. Nese identitu (`sub`, `email`, `username`, `role`, ...).
- **Refresh token** — dlouhodobý (30d), HS256 + `JWT_REFRESH_SECRET`, **stateful s blacklistem**. Nese `sub`, `jti`, `familyId`, `type: 'refresh'`. Každý refresh ho rotuje (revoke starý + vystavit nový se stejným `familyId`).

Reuse detection: když přijde token s `revoked=true` v DB, server zruší **celou rodinu** (`familyId`) — předpoklad krádeže.

## Komponenty

```
backend/src/modules/auth/
├── auth.controller.ts          [+3 endpointy: /refresh, /logout, /logout-all]
├── auth.service.ts             [+ generateTokenPair, refresh, logout, logoutAll, revokeFamily, revokeAllForUser, OnEvent('user.password.changed')]
├── auth.module.ts              [+ MongooseModule.forFeature(RefreshToken), provide repository]
├── strategies/
│   └── jwt.strategy.ts         [beze změny]
├── schemas/
│   └── refresh-token.schema.ts [NEW]
├── interfaces/
│   ├── refresh-token.interface.ts            [NEW]
│   └── refresh-token-repository.interface.ts [NEW]
├── repositories/
│   └── refresh-token.repository.ts [NEW]
└── dto/
    ├── refresh.dto.ts          [NEW: { refreshToken: string }]
    └── logout.dto.ts           [NEW: { refreshToken: string }]
```

**Změny v existujících modulech:**
- `users/users.service.ts` — `changePassword` a `resetPassword` po úspěšném update emitují `user.password.changed` event s `{ userId }`
- `auth.service.ts` `register` a `login` vrací `{ accessToken, refreshToken, user }`

## Token formát

### Access token
- Algoritmus: HS256
- Secret: `JWT_SECRET` (existující env)
- TTL: 24h (beze změny)
- Payload (beze změny):
  ```ts
  { sub, email, username, role, characterPath, ikarosSkin }
  ```

### Refresh token
- Algoritmus: HS256
- Secret: `JWT_REFRESH_SECRET` (nový env, **musí být jiný než `JWT_SECRET`**)
- TTL: `JWT_REFRESH_TTL_DAYS` env (výchozí 30 dní)
- Payload:
  ```ts
  { sub: userId, jti: uuidV4(), familyId: uuidV4(), type: 'refresh' }
  ```

Pole `type: 'refresh'` brání záměně — pokud někdo pošle access token do `/refresh`, payload nemá `jti` ani `type='refresh'` → 401.

## Schema `RefreshToken`

Nová kolekce `refresh_tokens`:

```ts
{
  jti: string,           // unique index
  userId: string,        // index
  familyId: string,      // index (pro family revocation)
  expiresAt: Date,       // TTL index — Mongo auto-cleanup expired
  revoked: boolean,      // default false
  createdAt: Date,       // audit
}
```

Indexy:
- `jti` unique
- `userId` non-unique
- `familyId` non-unique
- `expiresAt` TTL (`{ expires: 0 }`) — Mongo automaticky maže dokumenty po `expiresAt`

## Endpointy

### `POST /api/auth/refresh`

**Request:**
```json
{ "refreshToken": "eyJhbGc..." }
```

**Flow:**
1. Verify JWT signature + expiry (`JWT_REFRESH_SECRET`) → 401 pokud invalid/expired
2. Check `payload.type === 'refresh'` → 401 pokud ne
3. Lookup `jti` v DB → 401 pokud neexistuje
4. Pokud `revoked === true` → revoke celou rodinu (`familyId`), 401, log WARN
5. Revoke starý `jti`
6. Generuj nový pár (`accessToken`, `refreshToken`) se stejným `familyId`, novým `jti`
7. Save nový refresh do DB
8. Vrať `{ accessToken, refreshToken }` — 200

### `POST /api/auth/logout`

**Auth:** žádná (anon, idempotent)

**Request:**
```json
{ "refreshToken": "eyJhbGc..." }
```

**Flow:**
1. Pokus verify (validate signature). Pokud invalid → 204 (idempotent, neprozradíme)
2. Pokud validní → revoke celou rodinu (`familyId`)
3. Vrať 204

### `POST /api/auth/logout-all`

**Auth:** `JwtAuthGuard` (vyžaduje validní access token)

**Flow:**
1. `userId = req.user.id`
2. Revoke všechny tokeny `userId` (`{ revoked: true }` na všech)
3. Vrať 204

## Error handling

| Situace | Endpoint | HTTP | Side-effect |
|---|---|---|---|
| `refreshToken` chybí | `/refresh` | 400 | — |
| JWT signature/format invalid | `/refresh` | 401 | — |
| JWT expired | `/refresh` | 401 | — |
| `type !== 'refresh'` (poslán access) | `/refresh` | 401 | — |
| `jti` není v DB | `/refresh` | 401 | — |
| `revoked === true` (reuse) | `/refresh` | 401 | **revoke familyId** + log WARN |
| Vše OK | `/refresh` | 200 + tokeny | revoke starý jti, save nový |
| `/logout` invalid token | `/logout` | 204 | — (idempotent) |
| `/logout` validní | `/logout` | 204 | revoke familyId |
| `/logout-all` bez JWT | `/logout-all` | 401 | — |
| `/logout-all` s JWT | `/logout-all` | 204 | revoke všechny rodiny userId |

**Race condition:** dvě paralelní `/refresh` se stejným tokenem. První projde, druhá narazí na `revoked=true` → spustí reuse detection (revoke rodina). Akceptujeme — cena za jistotu, alternativy vyžadují distribuovaný lock.

**Logging:** reuse detection log `WARN` s `userId`, `familyId`, `jti`. Slouží pro forenzii.

## Změna hesla → invalidace

`UsersService.changePassword(userId, dto)` a `UsersService.resetPassword(userId, dto)` po úspěšném `usersRepo.update()` zavolají `eventEmitter.emit('user.password.changed', { userId })`.

`AuthService` má `@OnEvent('user.password.changed')` listener, který zavolá `revokeAllForUser(userId)`.

**Důvod EventEmitter:** předchází circular dep mezi UsersModule ↔ AuthModule. Vzor je v projektu už použit (`world.join.requested` v worlds → ikaros-messages, Krok 2).

## Konfigurace

Nové env proměnné:

```
JWT_REFRESH_SECRET=<32+ char random>      # MUSÍ být jiný než JWT_SECRET
JWT_REFRESH_TTL_DAYS=30                   # výchozí
```

`auth.module.ts` načte přes `ConfigService`. Pokud `JWT_REFRESH_SECRET` chybí při startu, vyhodí stejně jako `JWT_SECRET` (`throw new Error('JWT_REFRESH_SECRET is not set')`).

## Testing

Žádné integration testy — projekt používá unit-level se Jest mocky. Držíme vzor.

### `auth.service.spec.ts` (rozšíření, ~14 nových testů)

```
describe('refresh')
  - vrátí nový accessToken + refreshToken pro validní token
  - revokuje starý jti po úspěšném refreshi
  - nový token má stejný familyId jako původní
  - vyhodí UnauthorizedException pro invalid signature
  - vyhodí UnauthorizedException pro expirovaný token
  - vyhodí UnauthorizedException pokud type !== 'refresh'
  - vyhodí UnauthorizedException pokud jti není v DB

describe('refresh — reuse detection')
  - vyhodí UnauthorizedException pokud token již revoked
  - při reuse zruší celou rodinu
  - legitimní rotace nezruší rodinu

describe('logout')
  - revokuje familyId pro validní token
  - vrátí 204 i pro neplatný token (idempotent)

describe('logoutAll')
  - revokuje všechny tokeny daného userId
  - ostatní uživatelé nedotčeni

describe('register/login')
  - vrátí accessToken + refreshToken + user
  - refreshToken existuje v DB s revoked=false

describe('password change invalidation')
  - OnEvent('user.password.changed') zruší všechny tokeny userId
```

### `users.service.spec.ts` (rozšíření, ~2 testy)

```
describe('changePassword')
  - emituje 'user.password.changed' s userId po úspěšné změně

describe('resetPassword')
  - emituje 'user.password.changed' s userId po úspěšné změně
```

### Existující testy

Všechny zelené (`register`, `login` testy je nutné aktualizovat, protože return shape se mění z `{ accessToken, user }` na `{ accessToken, refreshToken, user }`).

## Bezpečnostní úvahy

1. **Secrets oddělené:** `JWT_SECRET` a `JWT_REFRESH_SECRET` musí být různé. Pokud unikne jeden, druhý drží.
2. **TTL:** access 24h je dostatečně krátký, aby kompromitace neudělala dlouhodobou škodu. Refresh 30d vyvažuje UX (aktivní uživatel se nepřihlašuje denně).
3. **HTTPS:** mimo scope této spec, ale tokeny by neměly cestovat po HTTP. Deployment věc.
4. **Token storage v klientovi:** mimo scope (frontend neexistuje). Server je agnostic — vrací oba v response body, FE rozhodne (httpOnly cookie, localStorage, ...).
5. **Reuse detection vs. legitimní retry:** klient s flaky síťou může omylem poslat refresh dvakrát (síť vrátila timeout, klient retry-uje). Druhé volání spustí reuse → uživatel je odhlášen. **Akceptujeme** — alternativa (idempotency tokens, deduplication window) výrazně přidá komplexitu. Klient se musí zachovat správně (reagovat na 200 a nepoužít starý token znovu).

## Vztah ke starému systému

Starý systém (`docs/old/auth-jwt.md`):
- `POST /api/auth/refresh/:id` — endpoint existoval, ale **brala se jen userId v URL**, žádný refresh token. Insecure (kdokoli s userId si vystaví access token).
- Žádné rotace, žádný blacklist, žádný logout.

**Vědomá odchylka od starého systému** — bezpečnější design. Nový endpoint `POST /api/auth/refresh` (bez `/id`), body s refresh tokenem.

## Migrace

- **Existující kolekce:** žádné — `RefreshToken` je nová.
- **Existující access tokeny:** stále platné po deployi (24h max). Uživatelé se přihlásí znovu, jakmile vyprší.
- **Žádný breaking change** pro existující data v MongoDB.

## Rollback

Pokud něco selže:
1. Revert kód na `9760245c` (poslední AKJ commit)
2. `db.refresh_tokens.drop()` v MongoDB
3. Odstranit env `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL_DAYS`

Žádné permanentní změny v existujících kolekcích.

## Hotovo když

- [ ] `POST /api/auth/refresh` funguje, rotuje, detekuje reuse
- [ ] `POST /api/auth/logout` funguje (idempotent)
- [ ] `POST /api/auth/logout-all` funguje (vyžaduje JWT)
- [ ] `register` a `login` vrací `{ accessToken, refreshToken, user }`
- [ ] `changePassword` a `resetPassword` invalidují všechny refresh tokeny
- [ ] Všechny nové unit testy zelené (≥14 v auth, ≥2 v users)
- [ ] Existující testy aktualizované, všechny zelené
- [ ] `npm test` zelený
- [ ] `npx tsc --noEmit` čistý
- [ ] Swagger anotace na 3 nových endpointech
- [ ] roadmap2.md fáze 1.3 ✅
- [ ] roadmap.md krok 1 — `POST /api/auth/refresh` zaškrtnut
