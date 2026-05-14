# Roadmap 2 — Opravný plán backendu

> Vznikl po auditu 2026-05-05 (viz konverzační historie). Původní `roadmap.md` označila 35 kroků jako ✅, audit našel **8 kritických mezer** a několik nepravdivých zelených.
> Tento dokument popisuje **co skutečně zbývá**, v pořadí dle rizika a závislostí.

**Stav:** `✅ hotovo` | `🚧 probíhá` | `⬜ plánováno` | `❓ ověřit`

---

## Fáze 0 — Pravdivá roadmapa ⬜

Před kódem opravit `roadmap.md`, aby neukazovala ✅ tam, kde nic není.

- [ ] Přepsat ✅ → ⬜ u kroků 1 (akj), 2 (JOIN), 3 (chat fields), 10a (API), 10b (standalone), 10c, 10d, 10f, 10g, 16b (refresh), 17 (room-info, calendar-month)
- [ ] Přepsat ⬜ → ✅ u Kroku 11c (IkarosGallery — hotové, roadmapa lže opačně)
- [ ] Doplnit poznámku, které kroky vznikly z **feature parity** se starým systémem a které jsou naše vlastní design rozhodnutí

**Čas:** 30 min

---

## Fáze 1 — Bezpečnost a kontraktní lži (HOTFIX) ⬜

### 1.1 AKJ cleanup ✅
**Rozhodnuto 2026-05-05:** AKJ je v novém systému per-world (`WorldMembership.akj: number`), ne per-user. Globální `User.akj: boolean` byl mrtvé pole, admin toggle byl no-op. JWT `akj` claim ze starého systému se NEPŘIDÁVÁ (vědomá odchylka od JWT kontraktu starého systému).

- [x] `User.akj: boolean` odstraněn z interface a repository
- [x] `PATCH /admin/users/:id/akj` endpoint a `updateUserAkj` metoda odstraněny
- [x] Spec testy aktualizovány
- [x] roadmap.md krok 1, 4, 15 aktualizovány

Spec: [2026-05-05-akj-cleanup-design.md](superpowers/specs/2026-05-05-akj-cleanup-design.md)
Plán: [2026-05-05-akj-cleanup.md](superpowers/plans/2026-05-05-akj-cleanup.md)

### 1.2 ~~JOIN flow~~ ✅ **(po fázi 4: hotové)**
Audit minul implementaci. `POST /worlds/:id/join` existuje (`worlds.controller.ts:103`), accessMode větvení v service, idempotence, `world.join.requested` event → IkarosMessage listener. Spec testy.

### 1.3 Auth refresh tokens ✅
**Hotovo 2026-05-05.** `POST /auth/refresh` s rotací a detekcí reuse přes `familyId`, `POST /auth/logout` (per-session, idempotent), `POST /auth/logout-all` (per-user, vyžaduje JWT). Login/register vrací oba tokeny. Změna hesla revokuje všechny refresh tokeny přes EventEmitter.

- [x] `RefreshToken` schema s TTL indexem (Mongo auto-cleanup), unique jti, indexy userId/familyId
- [x] Refresh token JWT s vlastním `JWT_REFRESH_SECRET`, TTL 30 dní (env `JWT_REFRESH_TTL_DAYS`)
- [x] Rotace + reuse detection (revoke celé `familyId` při zneužití, WARN log)
- [x] `/logout` idempotent (žádný info leak), `/logout-all` přes JwtAuthGuard
- [x] EventEmitter `user.password.changed` invaliduje všechny tokeny userId
- [x] 19 testů v `auth.service.spec` + 17 v `users.service.spec` + 6 v repository

Spec: [2026-05-05-auth-refresh-design.md](superpowers/specs/2026-05-05-auth-refresh-design.md)
Plán: [2026-05-05-auth-refresh.md](superpowers/plans/2026-05-05-auth-refresh.md)

**Fáze 1 hotová** (1.1, 1.2 ✅, 1.3 ✅).

---

## Fáze 2 — Chybějící API pro existující data ⬜

### 2.1 GameEvents API (Krok 10a) ✅
**Hotovo 2026-05-05.** Plný HTTP+service stack: schema + subdokumenty (EventConfirmation, EventComment), viditelnostní filter (groupOnly + targetGroup), role gating (PJ/PomocnýPJ světa + globální Admin/Superadmin bypass), RSVP toggle, 1-úrovňové komentáře s reakcemi, push při create (fire-and-forget). Reminder job opraven (groupOnly filter + Pending konstanta — Hrac dostává reminder).

- [x] Schema rozšíření + compound index `(worldId, date)`
- [x] Repository extends BaseMongoRepository (CRUD + ListFilters)
- [x] DTOs s class-validator (worldId povinný, imageUrl jen URL)
- [x] Service: findById, findList, create, update, delete, confirm, addComment, editComment, deleteComment, reactToComment
- [x] Controller pod `/api/game-events` (10 endpointů)
- [x] Push: fire-and-forget při create + reminderJob s groupOnly filtrem
- [x] 53 unit testů (viditelnost, role gating, push, comment threading, reactions)

Spec: [2026-05-05-game-events-api-design.md](superpowers/specs/2026-05-05-game-events-api-design.md)
Plán: [2026-05-05-game-events-api.md](superpowers/plans/2026-05-05-game-events-api.md)

### 2.2 Chat fields ✅
**Hotovo 2026-05-05.** ChatChannel.type (volný string, default `'all'`), ChatMessage `customFont`/`color`/`isDiceRoll`, soft-delete text "*Zpráva byla smazána autorem*", dice delete guard (jen PJ/PomocnýPJ + Admin/Superadmin), UpdateMessageDto diff-based attachments. Roadmap2 měl chybu — `type` patří na Channel, ne Message; opraveno.

- [x] Schema: ChatChannel.type, ChatMessage.customFont/color/isDiceRoll
- [x] DTO: CreateChannelDto/UpdateChannelDto + type, CreateMessageDto + customFont/color, UpdateMessageDto kompletně přepsán na diff (attachmentsToAdd/Remove)
- [x] sendMessage: dice detect (regex `🎲 HOD FATE` / `Hod Kostkou`), customFont/color propagace
- [x] deleteMessage: dice guard + soft-delete text (vč. global chat case)
- [x] editMessage: diff attachments, min-1-field validace
- [x] 19 nových testů (dice detect/guard, edit diff, content-only, limit >10)

Spec: [2026-05-05-chat-fields-design.md](superpowers/specs/2026-05-05-chat-fields-design.md)
Plán: [2026-05-05-chat-fields.md](superpowers/plans/2026-05-05-chat-fields.md)

### 2.3 ~~Endpointy z Kroku 17~~ ✅ **(po fázi 4: hotové)**
Všechny 4 endpointy ověřeny (room-info, getCalendarMonth, updateCalendarMonth, hospoda:join + ikaros:whisper).

### 2.4 Chybějící endpointy z Kroku 16b ✅
**Hotovo 2026-05-06.** Všechny 4 endpointy + role gating + spec testy. Důležité pravidlo autorizace: vlastník světa (`world.ownerId`) NENÍ automaticky autorizován pro `calendarconfig` — gating čistě dle `WorldRole ≥ PomocnyPJ` + globální Admin/Superadmin.

- [x] `PUT /api/worlds/:worldId/calendarconfig` — `WorldCalendarConfig` zápis (PomocnyPJ+ / Admin)
- [x] `POST /api/admin/users` — vytvoření uživatele adminem (AdminGuard, ConflictException na username/email)
- [x] `GET /api/users/exists/:username` — anon, case-sensitive (konzistence s registrací)
- [x] `PUT /api/users/:id/theme` — merge `themeSettings` (zachová klíče nepřepsané v patchi)
- [x] 16 nových spec testů (6 calendarconfig + 4 createUser + 4 exists + 2 updateTheme)

Spec: [2026-05-06-phase-2.4-design.md](superpowers/specs/2026-05-06-phase-2.4-design.md)
Plán: [2026-05-06-phase-2.4.md](superpowers/plans/2026-05-06-phase-2.4.md)

**Čas fáze 2:** 2–4 dny (po odečtení hotového JOIN a 17)

---

## Fáze 3 — Chybějící moduly (feature parity) ⬜

Všechny tři moduly jsou v `docs/old/` — descope není možný bez ztráty parity.

### 3.1 WorldNews (Krok 10g) ✅ **(hotovo 2026-05-06)**
- [x] `world-news/schemas/world-news.schema.ts`: worldId nullable, title, content, date (ISO UTC string), type, link, createdBy
- [x] Compound index `(worldId, date DESC)`
- [x] `world-news.service.ts`, `world-news.controller.ts`:
  - `GET /api/news?limit=&worldId=` (anon, varianta B: svět + globální při worldId filtru)
  - `GET /api/news/:id` (anon)
  - `POST /api/news` (Admin/Superadmin/PJ/PomocnyPJ)
  - `PUT /api/news/:id` (partial, worldId immutable)
  - `DELETE /api/news/:id` (hard delete)
- [x] Spec: anon read, role gating na write (≥PomocnyPJ + Admin/Superadmin)
- [x] Migrate skript `scripts/migrate-world-news/` (idempotent upsert per `_id`, dry-run, normalize `MatrixWorldId` → null)
- [x] Service spec: 23 testů (read path, autorizace cross-world, anti-leak, defense-in-depth `worldId` immutability, default values)
- [x] Mapper spec: 12 testů (PascalCase→camelCase, `normalizeWorldId`, validace)

**Čas:** 0,5 dne (hotovo)

### 3.2 TimelineEvent (Krok 10c) ✅ **(hotovo 2026-05-06)**
- [x] `timeline/schemas/timeline-event.schema.ts`: worldId, year/month/day (1-based), hour, title, text, imageUrl, link, celestialOverrides
- [x] Compound index `(worldId, year, month, day)`
- [x] Base64 stripping: GET list strippuje `data:` URI, GET detail zachovává, PUT s `imageUrl: null` zachová stávající (per parity)
- [x] CRUD endpointy `/api/timeline` (auth-required GET, role-gated write)
- [x] Auth: read = member světa (`WorldRole ≥ Hrac` + Admin/Superadmin), write = `WorldRole ≥ PomocnyPJ` + Admin/Superadmin (konzistence s WorldNews)
- [x] PUT immutable `worldId` (defense-in-depth check 400)
- [x] DTO validace přes class-validator
- [x] `celestialStates: []` placeholder — Fáze 4.1 ho začne plnit reálnými výpočty
- [x] Service spec: 29 testů (read path, autorizace cross-world, anti-leak, base64 stripping, immutability, default values)

**Závislost:** Krok 10d (WorldCalendarConfig) — odložen do Fáze 4.1; po implementaci proběhne retrofit `celestialStates` plnění (specifikováno v 4.1 plánu Task 6).

**Čas:** 1 den (hotovo)

### 3.4 RPG System Presets (Krok 7d) ✅ **(hotovo 2026-05-06)**
- [x] `system-presets/presets/` — 16 detailních TS presetů: D&D 5e/2e/3+, DrD Hero, 5x DrD16 (Bojovník/Čaroděj/Zloděj/Hraničář/Alchymista), GURPS, Call of Cthulhu, Fate, Shadowrun, Jad, Pi, Matrix custom
- [x] Každý preset 12-25 RPG-specifických bloků (key/label/type/order)
- [x] `GET /api/system-presets`, `GET /api/system-presets/:system` (anonymní)
- [x] Auto-seed `WorldSettings.diarySchema` při POST `/worlds` dle `world.system`
- [x] `DiarySchemaVersion` kolekce s compound unique indexem `(worldId, version)` — archivace při změně `world.system`
- [x] `GET /api/worlds/:id/diary-schema-versions`, `GET .../diary-schema-versions/:version` (member, anti-leak)
- [x] Service spec: 8 testů SystemPresets + 12 nových testů Worlds (auto-seed, archive/re-seed, version increment, anti-leak)
- [x] Auth: write `≥ PomocnyPJ` (existující WorldsService logika), GET versions `≥ Hrac`

**Čas:** 1 den (hotovo)

### 3.3 WorldWeather (Krok 10f) ✅ **(hotovo 2026-05-06)**
- [x] `world-weather/schemas/weather-generator.schema.ts`: config (tempMin/Max, weatherTypes s váhami, wind, pressure, humidity, customFields), currentWeather
- [x] Generátor s váženou náhodou (cloudiness/precipitation/pressure mapping helpers)
- [x] Endpointy `/api/worlds/:worldId/weather-generators`:
  - `GET /` (member, ≥ Hrac), `GET /:id` (member)
  - `POST /` (≥ PomocnyPJ + Admin/Superadmin)
  - `PUT/DELETE /:id` (write auth)
  - `POST /:id/generate` (write auth)
  - `PUT /:id/current` (write auth, ručně nastav)
  - `POST /:id/broadcast` — chat (`ChatService.createSystemMessage`) nebo mapa (`weather:updated` event přes EventEmitter → MapsGateway `@OnEvent`)
- [x] Seed default generátoru dle `world.genre` při create světa (přes WorldsService)
- [x] DTO validace přes class-validator (probability sum tolerance ±0.01)
- [x] Anti-leak: 403 pro neexistující svět při write, 404 při read
- [x] Service spec: 49 testů (CRUD auth, generate weighted random, setCurrentWeather, broadcast chat+map, validateConfig errors)
- [x] forwardRef circular dep řešení (WorldsModule ↔ WorldWeatherModule)

**Čas:** 1 den (hotovo)

---

## Fáze 4 — Ověření „zelených" kroků ✅

Audit klasifikoval některé kroky jako ✅ optimisticky. Ručně ověřeno:

- [x] **Krok 1.2 JOIN flow** — implementace existuje (viz fáze 1.2)
- [x] **Krok 17 endpointy** (room-info, getCalendarMonth, updateCalendarMonth, hospoda:join, ikaros:whisper) — ověřeno (viz fáze 2.3)
- [x] **Krok 7c** Universe visibility filter — ověřeno OK
- [x] **Krok 7d** `system-presets` modul — **modul neexistuje** → vznikla fáze 3.4
- [x] **Krok 15** `socket-io.adapter.ts` — `maxHttpBufferSize: 5MB` + CORS `FRONTEND_URL` ověřeno
- [ ] **Krok 16b drobnosti** — `PUT /worlds/:worldId/calendarconfig`, `POST /admin/users`, `GET /users/exists/:username`, `PUT /users/:id/theme` → **přesunuto do fáze 2.4** (endpointy chybí)
- [x] **Krok 18** `docs/websocket-api.md` pokrývá všech 7 gateway eventů — ověřeno

**Čas:** 1 hodina (jen čtení) — hotovo.

---

## Fáze 5 — Strukturální otázky (rozhodnout, ne stavět) ⬜

> **Pravidlo:** Frontend tento backend (zatím) nemá. Rozhodnutí padají dle **kontraktu starého systému** (`docs/old/`) — pokud staré API featuru mělo, držíme parity.

### 5.1 WorldCalendarConfig samostatná kolekce (Krok 10d) ✅ **(vyřešeno 2026-05-06)**
- ~~Aktuálně: pole přímo na `World` (ne uvnitř `WorldSettings`)~~
- **Implementováno:** samostatná kolekce `world_calendar_configs`, 1:1 per svět, přes `WorldCalendarConfigModule` (Fáze 4.1)
- API: `GET/PUT /api/worlds/:worldId/calendar-config` (member read, `≥PomocnyPJ` write)
- Pure-function utils s 13 unit testy (moon/sun/planet/comet/other + záporné delta)
- Timeline retrofit: `celestialStates` se naplňuje reálně z calendar configu (3 nové integration testy)

### 5.2 Calendar standalone modul (Krok 10b) ✅ **(hotovo 2026-05-06)**
- [x] `Character.isLocation` flag — lokace mají jen calendar subdoc
- [x] `CharacterCalendar` rozšířen: `color`, `displaySettings` (defaultView, isHiddenInAggregate)
- [x] `PUT /api/worlds/:worldId/characters/:slug/calendar` (vs původní PATCH) — full replace events
- [x] Nový `CalendarsModule` s 4 endpointy:
  - `GET /api/worlds/:worldId/calendars/aggregate` — PJ pohled (≥ PomocnyPJ + Admin)
  - `PATCH /api/worlds/:worldId/calendars/:slug/settings` — color/displaySettings (≥ PomocnyPJ)
  - `GET\|PUT /api/calenders/:slug?worldId=` — **legacy endpoint** s překlepem (parity)
- [x] Service: `aggregate` (filtruje isHiddenInAggregate), `updateSettings` (merge displaySettings), legacy delegace na `assertSubdocAccess`
- [x] Tests: 10 nových v calendars.service.spec, +3 v charakter-subdocs (isLocation/getCalendarsByWorldId)

---

## Fáze 6 — Test coverage ✅ (hotovo 2026-05-07)

Audit 2026-05-06: 18/20 invariantů pokryto unit testy (60+ specs). Doplněna 2 chybějící unit testy (refresh expirace, Chat→Push integrace) + 3 nové e2e suites pro security/business-critical flow přes `mongodb-memory-server`. Roadmap2 původně tvrdila "smoke-level 1/modul" — realita je hustší.

- [x] **Auth: refresh, expirace, blacklist** — `auth.service.spec.ts` (rotace, reuse, expirace TTL, logout idempotence, logout-all, password change revoke) + `auth-refresh.e2e-spec.ts` (7 testů end-to-end)
- [x] **Worlds: JOIN flow** — `worlds.service.spec.ts` (4 accessMode + Pending idempotence) + `worlds-join.e2e-spec.ts` (6 testů: public/open/private/closed + idempotence + Conflict + IkarosMessage event)
- [x] **GameEvents: confirm toggle, groupOnly viditelnost, comment moderation** — `game-events.service.spec.ts` (53 unit testů) + `game-events-role-gating.e2e-spec.ts` (5 testů: anon/Hrac/PomocnyPJ/Admin + group visibility)
- [x] **Chat: dice delete guard, type filter** — `chat.service.spec.ts` (19 testů, dice guard pro Hrac→403, type filter)
- [x] **Push: ChatService → push integrace** — `chat.service.spec.ts` (whisper visibleTo + push fan-out na členy kromě sendera, +1 nový test pro explicitní Chat→Push integraci)
- [x] **Universe: visibility filter** — `universe.service.spec.ts` (anon vs member viditelnost)

**Verifikace:** `cd backend && npm test` ✓, `npm run test:e2e` ✓ (5/5 suites, 20/20 testů, 13s sekvenčně).

Plán: [2026-05-06-faze-6-test-coverage.md](superpowers/plans/2026-05-06-faze-6-test-coverage.md)
Spec: [2026-05-06-faze-6-test-coverage-design.md](superpowers/specs/2026-05-06-faze-6-test-coverage-design.md)

---

## Pořadí prací (doporučené, po fázi 4)

| # | Co | Důvod | Čas |
|---|---|---|---|
| ✅ | Fáze 0 — pravdivá roadmapa | hotovo | — |
| ✅ | Fáze 4 — ověření zelených | hotovo (JOIN, 17, 7c, 7d, 15, 18); 16b drobnosti → fáze 2.4 | — |
| ✅ | Fáze 1.1 — AKJ cleanup | hotovo (2026-05-05) | — |
| ✅ | Fáze 1.3 — Auth refresh tokens | hotovo (2026-05-05) | — |
| ✅ | Fáze 2.1 — GameEvents API | hotovo (2026-05-05) | — |
| ✅ | Fáze 2.2 — chat fields | hotovo (2026-05-05) | — |
| ✅ | Fáze 2.4 — drobné endpointy z 16b | hotovo (2026-05-06) | — |
| ✅ | Fáze 3.1 — WorldNews | hotovo (2026-05-06) | — |
| ✅ | Fáze 3.2 — TimelineEvent | hotovo (2026-05-06) | — |
| ✅ | Fáze 4.1 — WorldCalendarConfig + Timeline retrofit | hotovo (2026-05-06) | — |
| ✅ | Fáze 3.4 — RPG System Presets | hotovo (2026-05-06) | — |
| ✅ | Fáze 5.2 — Calendar standalone modul | hotovo (2026-05-06) | — |
| ✅ | Fáze 3.3 — Weather | hotovo (2026-05-06) | — |
| ✅ | Fáze 6 — testy | hotovo (2026-05-07) | — |

**Celkový odhad po fázi 4:** 8–12 pracovních dní pro full parity (zhruba stejně, přibyl system-presets, ubyl JOIN+17+nějaké drobnosti).

---

## Otevřené otázky

1. ~~**Refresh strategie**~~ — **rozhodnuto:** rotace + blacklist.
2. **Krok 5.1 a 5.2:** rozhodnout dle kontraktu starého systému (frontend neexistuje, parity je pravidlo).
3. ~~**Weather priorita**~~ — **rozhodnuto:** v scope, fáze 3.3.
4. **Test cílový level:** smoke (1/modul) nebo integrace pro každý critical flow?

---

## Co tento dokument NENÍ

- Není to plán implementace jednotlivých featur — ten patří do `docs/superpowers/plans/YYYY-MM-DD-*.md` per fáze, vyrobí se přes skill `writing-plans` po souhlasu.
- Není to commitment dat — tady jsou odhady, ne deadliny.
- Nenahrazuje `roadmap.md` — ta zůstává jako historický pohled na původní plán; tento dokument je **delta proti realitě**.
