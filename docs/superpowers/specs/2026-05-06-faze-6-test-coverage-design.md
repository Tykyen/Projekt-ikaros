# Fáze 6 — Test coverage hotfix (design)

**Datum:** 2026-05-06
**Spec verze:** 1
**Vychází z:** [docs/roadmap2.md](../../roadmap2.md) Fáze 6 (řádek 210–222)

---

## 1. Cíl

Doplnit cílené testy tak, aby každý security/business invariant uvedený ve Fázi 6 měl alespoň jeden zelený test, a aby kritické HTTP flow měly e2e pokrytí napříč vrstvami (guard + DTO + service + DB + events).

**Není cílem:**
- Coverage % threshold v CI (samostatné rozhodnutí)
- Performance / load testy
- Frontend (neexistuje)
- Refactoring testovací infrastruktury beyond shared `app-factory` helper

## 2. Stav před prací (audit 2026-05-06)

### 2.1 Unit-level pokrytí (18 z 20 invariantů ✅)

| # | Položka Fáze 6 | Invariant | Pokrytí |
|---|---|---|---|
| 1 | Auth refresh | Rotace tokenu | ✅ `auth.service.spec.ts:177` |
| 1 | Auth refresh | Reuse detection (revoke familyId) | ✅ `auth.service.spec.ts:251` |
| 1 | Auth refresh | **Expirace TTL** | **❌ chybí** |
| 1 | Auth refresh | Logout idempotence | ✅ `auth.service.spec.ts:298` |
| 1 | Auth refresh | Logout-all per-user | ✅ `auth.service.spec.ts:313` |
| 1 | Auth refresh | Revokace při změně hesla | ✅ `auth.service.spec.ts:320` |
| 2 | Worlds JOIN | accessMode `public` → Hrac | ✅ `worlds.service.spec.ts:124` |
| 2 | Worlds JOIN | accessMode `open` → Pending + event | ✅ `worlds.service.spec.ts:141` |
| 2 | Worlds JOIN | `closed` → 403 | ✅ `worlds.service.spec.ts:103` |
| 2 | Worlds JOIN | Idempotence Pending case | ✅ `worlds.service.spec.ts:157` |
| 2 | Worlds JOIN | Conflict pro Hrac role | ✅ `worlds.service.spec.ts:113` |
| 3 | GameEvents | Confirm toggle | ✅ `game-events.service.spec.ts:472,487` |
| 3 | GameEvents | groupOnly + targetGroup viditelnost | ✅ `game-events.service.spec.ts:116,180` |
| 3 | GameEvents | Comment moderation (cizí jen PJ/Admin) | ✅ `game-events.service.spec.ts:768` |
| 4 | Chat | Dice delete guard | ✅ `chat.service.spec.ts:755–806` |
| 4 | Chat | Type filter (volný string) | ✅ `chat.service.spec.ts:168` |
| 5 | Push | Whisper jen recipient | ✅ `chat.service.spec.ts:1589` |
| 5 | Push | Group push všem členům | ✅ `game-events.service.spec.ts:277` |
| 5 | Push | **Chat → Push event binding** | **❌ chybí** |
| 6 | Universe | Visibility filter | ✅ `universe.service.spec.ts:94–124` |

**Závěr:** Fáze 6 je na unit-level z 90 % hotová. Roadmap2 byla nepřesná („smoke-level 1 spec/modul" — realita je hustší).

### 2.2 E2E pokrytí (chybí)

Existující e2e: `app.e2e-spec.ts` (smoke), `auth-throttle.e2e-spec.ts` (throttler).

Chybí e2e pro: auth refresh flow, worlds JOIN flow, role gating napříč auth-required moduly.

## 3. Strategie — Hybrid C

Per rozhodnutí z brainstormingu (turn 2026-05-06):
- **E2E** přidat **jen** pro security-critical flow (auth, worlds JOIN, role gating), kde guard + DTO + service + DB kombinace má největší riziko cross-layer regrese.
- **Unit-only** zůstávají invarianty čisté business logiky (Chat type filter, Universe visibility, Push payload).

## 4. Co se přidá

### 4.1 Unit testy (2 nové)

**4.1.1 Refresh token expirace**
- Soubor: `backend/src/modules/auth/auth.service.spec.ts`
- Test: `'odmítne expirovaný refresh token (TTL přečtená z JWT)'`
- Postup: vytvoř JWT s `expiresIn: '-1s'` (nebo mockovat `jwtService.verify` → throw `TokenExpiredError`), ověř že `refresh()` hodí `UnauthorizedException`.

**4.1.2 Chat → Push event binding**
- Soubor: `backend/src/modules/chat/chat.service.spec.ts` (případně `push.service.spec.ts`)
- Test: `'sendMessage volá PushService.send pro každého aktivního člena kanálu (kromě sendera)'`
- Postup: spy na `pushService.sendToUser`, vyvolej `sendMessage` v kanálu se 3 členy, ověř volání pro 2 z nich.
- **Pozn.:** Pokud integrace probíhá přes `EventEmitter` (a ne přímé volání), test ověří, že `chat.message.created` event je vyemitován a že `PushService` má `@OnEvent` listener registrovaný.

### 4.2 E2E suites (3 nové)

Společná infrastruktura: `backend/test/helpers/app-factory.ts` + `backend/test/helpers/db.ts` + `backend/test/helpers/auth.ts`.

#### 4.2.1 `backend/test/auth-refresh.e2e-spec.ts`

Scénáře:
1. `register → /auth/login` vrací `{accessToken, refreshToken}`
2. `/auth/refresh` s validním tokenem → nový pair, starý nepoužitelný (rotation)
3. **Reuse detection:** dvojí použití starého tokenu po rotaci → 401 + revoke celé `familyId` (ověřit přes 3. refresh — taky 401)
4. **Expirace:** zfalšovat krátkou TTL přes env override v `app-factory`, počkat (`jest.useFakeTimers` nebo přímý DB update `expiresAt`) → 401
5. `/auth/logout` (per-session) — daný token unusable, jiné v rodině stále valid
6. `/auth/logout-all` — všechny tokeny userId revoked
7. **Password change** přes `PATCH /users/:id/password` → vyemituje `user.password.changed` → všechny refresh tokeny userId revoked

#### 4.2.2 `backend/test/worlds-join.e2e-spec.ts`

Scénáře (každý jako fresh world). Reálné hodnoty `accessMode` v kódu: `'public' | 'open' | 'private' | 'closed'` (viz [worlds.service.ts:173,187](../../../backend/src/modules/worlds/worlds.service.ts#L173)).

1. `accessMode: 'public'` → POST `/worlds/:id/join` → 201, membership.role = Hrac, `playerCount` inkrement
2. `accessMode: 'open'` → POST → 201, role = Pending, IkarosMessage v DB pro ownera, `world.join.requested` event vyemitován
3. `accessMode: 'private'` → POST → 201, role = Pending (default mode, stejné chování jako `open`)
4. `accessMode: 'closed'` → POST → 403 ForbiddenException
5. **Idempotence Pending:** dvojí JOIN do `open` světa → 2× stejná membership.id, žádná duplikace v DB, **žádný druhý event**
6. **Conflict pro Hrac:** ručně promotion membership na Hrac (přes přímý DB update v testu) + druhý JOIN → 409 ConflictException

**Pozn.:** Staré API ([docs/old/svety.md:226–229](../../old/svety.md#L226)) říká `Hrac (public) | Pending (ostatní)`. Nový kód sedí. Mode `closed` je jediný, který v JOINu hází 403.

#### 4.2.3 `backend/test/game-events-role-gating.e2e-spec.ts`

Scénáře (jeden svět, různí uživatelé):
1. **Anonymous** POST `/game-events` → 401
2. **Hrac** POST → 403
3. **PomocnyPJ** POST → 201
4. **PJ** POST → 201
5. **Admin** (globální, ne member světa) POST → 201 (bypass)
6. **groupOnly viditelnost:** event s `groupOnly: true, targetGroup: 'A'`. Hrac v group A vidí (GET list), Hrac v group B nevidí.
7. **Cross-world izolace:** Hrac světa X vidí jen eventy světa X.

### 4.3 Sdílené e2e helpers

`backend/test/helpers/app-factory.ts`:
```typescript
export async function createTestApp(opts?: { ttlOverrides?: { refresh?: string } }): Promise<{ app, mongo, close }>
```
- Nastartuje `mongodb-memory-server`
- Vytvoří NestJS testovací modul s reálným `AppModule`, ale `MONGO_URI` směrovaným na in-memory instance
- Aplikuje globální guards/pipes z `main.ts` (response interceptor, http exception filter, validation pipe)
- Vrátí čistý `INestApplication` + `mongoose.Connection`

`backend/test/helpers/auth.ts`:
```typescript
export async function registerUser(app, { username, password, role? }): Promise<{ user, accessToken, refreshToken }>
export async function loginUser(app, { username, password }): Promise<{ accessToken, refreshToken }>
export function authHeader(token: string): { Authorization: string }
```

`backend/test/helpers/db.ts`:
```typescript
export async function clearAllCollections(connection: mongoose.Connection): Promise<void>
```

Refactor stávajících `app.e2e-spec.ts` a `auth-throttle.e2e-spec.ts` na shared `createTestApp`.

## 5. Struktura souborů (delta)

```
backend/test/
  app.e2e-spec.ts                        (refactored — používá app-factory)
  auth-throttle.e2e-spec.ts              (refactored)
  auth-refresh.e2e-spec.ts               (NEW)
  worlds-join.e2e-spec.ts                (NEW)
  game-events-role-gating.e2e-spec.ts    (NEW)
  helpers/
    app-factory.ts                       (NEW)
    auth.ts                              (NEW)
    db.ts                                (NEW)
  jest-e2e.json                          (no change)

backend/src/modules/auth/auth.service.spec.ts            (+1 test: TTL expirace)
backend/src/modules/chat/chat.service.spec.ts            (+1 test: Push integrace)
```

## 6. Akceptační kritéria

- [ ] `cd backend && npm test` zelený (všechny unit testy včetně 2 nových)
- [ ] `cd backend && npm run test:e2e` zelený (5 e2e suites)
- [ ] `app.e2e-spec.ts` a `auth-throttle.e2e-spec.ts` používají `createTestApp` (žádná duplikace setup kódu)
- [ ] [docs/roadmap2.md](../../roadmap2.md) — řádky 210–222 (Fáze 6) přepsat na `✅` s odkazy na konkrétní spec soubory; řádek 242 v tabulce pořadí prací přepsat na ✅
- [ ] Žádná nová položka v `docs/dluhy.md` (případné nálezy během psaní testů zapsat tam, ne tiše opravit)
- [ ] Commit message per `.claude/rules/dluhy-log.md` standard (proč, ne co)

## 7. Out of scope

- **Coverage threshold v CI:** vyžaduje samostatné rozhodnutí o číselném prahu (např. lines ≥ 70 %, branches ≥ 60 %). Mimo tuto fázi.
- **Performance / load testy:** mimo scope test parity.
- **Migration testy:** scripts/migrate-world-news/ má vlastní logiku, není v Fázi 6.
- **Gateway/WebSocket e2e:** stávající `app.gateway.spec.ts` pokrývá unit-level, e2e přes socket.io-client je samostatná investice.
- **Frontend:** neexistuje.

## 8. Rizika a mitigace

| Riziko | Mitigace |
|---|---|
| `mongodb-memory-server` pomalý na Windows (5–10 s startup) | Sdílená app-factory s lazy startup, `--maxWorkers=1` v jest-e2e |
| EventEmitter handlery se nezavolají v testovacím prostředí (async race) | Wait-for-event helper s timeout, nebo `await Promise.resolve()` flush |
| `passport-jwt` v testech vyžaduje reálné secrety | `app-factory` nastaví `JWT_SECRET` a `JWT_REFRESH_SECRET` z fixtures |
| Při refactoru `auth-throttle.e2e-spec.ts` rozbití throttler stavu (sdílený singleton) | Ověřit, že `createTestApp` nestartuje sdílený throttler instance napříč testy; v případě potřeby `clearAllCollections` + reset throttler cache |
| Test pro Chat→Push integraci najde, že integrace neexistuje | Pokud najdu chybějící integraci, **zapsat do `docs/dluhy.md` a prokomunikovat**, ne tiše doplnit (per base.md) |

## 9. Odhad

| Krok | Čas |
|---|---|
| 1. Refactor `app-factory.ts` helper | 30 min |
| 2. Unit: refresh expirace test | 15 min |
| 3. E2E: auth-refresh suite | 1.5–2 h |
| 4. E2E: worlds-join suite | 1.5 h |
| 5. E2E: game-events-role-gating suite | 1.5 h |
| 6. Unit: Chat → Push integrace | 30 min |
| 7. Roadmap2 update + commit | 15 min |
| **Celkem** | **6–8 h** |

## 10. Pokračování

Po schválení tohoto specu invoke `superpowers:writing-plans` skill pro detailní implementační plán s checkpointy.
