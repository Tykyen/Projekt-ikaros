# Krok 10b — Calendar: Design Spec

**Datum vzniku:** 2026-05-04
**Aktualizováno:** 2026-05-06 (revize během brainstormingu Fáze 5.2 — auth pattern, DTO validace, anti-leak)
**Stav:** Schváleno (po revizi)

---

## Kontext

Existující `character-subdocs` modul již obsahuje základní calendar implementaci (`GET/PATCH /api/worlds/:worldId/characters/:slug/calendar`). Krok 10b tuto implementaci rozšiřuje a doplňuje o:

1. Změnu sémantiky z `PATCH` na `PUT` (full replace events)
2. `isLocation` flag na Character (lokace má jen calendar subdoc)
3. Nastavení vzhledu kalendáře (barva, display preferences) — PomocnyPJ+ / Admin
4. Agregovaný PJ pohled — všechny události světa v jednom poli
5. Legacy endpoint `/api/calenders/:slug?worldId=` pro budoucí migraci dat ze starého systému

Scope: **pouze backend**.

---

## Rozdíly proti původní verzi (2026-05-04)

| Téma | Verze 2026-05-04 | Verze 2026-05-06 (aktuální) | Důvod |
|---|---|---|---|
| **Auth `aggregate`** | "PJ / PomocnýPJ / Admin" | `WorldRole >= PomocnyPJ` + Admin/Superadmin shortcut | Explicit pattern (assertCanWrite-like) — konzistence s WorldNews/Timeline/Calendar/Weather |
| **Auth `settings`** | "PJ nebo globální Admin" (jen plný PJ) | `WorldRole >= PomocnyPJ` + Admin/Superadmin | Konzistence s ostatními moduly. PomocnyPJ je validní role pro správu obsahu světa (color/displaySettings je drobný kosmetický detail) |
| **DTO validace** | Bez class-validator dekorátorů | Plná class-validator validace (`@IsString`, `@IsOptional`, `@IsHexColor`, atd.) | `whitelist: true` v ValidationPipe by stripoval pole bez dekorátorů |
| **Anti-leak (`worldId` neexistuje)** | Implicitní | Explicit: 403 pro write (settings), 404 pro read (aggregate, GET legacy) — auth-required GET | Konzistence s WorldNews/Timeline pattern |
| **`assertSubdocAccess`** | Existující helper z `character-subdocs` | ✓ Projekt-standard, použijeme jako-je | Žádná změna — funguje pro vlastníka i PJ/Admin |

---

## isLocation flag (lokace jako entity s kalendářem)

Lokace (místnosti, budovy, tábory...) jsou modelovány jako postava s `isNpc=true` + `isLocation=true`. Na rozdíl od NPC nedostávají deník, poznámky, finance ani inventář — pouze kalendář. PJ vidí jejich události v agregovaném pohledu stejně jako ostatní postavy.

```typescript
// Přidáno na Character interface + schema:
isLocation: boolean;  // výchozí false
```

Logika tvorby subdokumentů při `character.created`:
- `isLocation=false` → existující chování (diary, calendar, notes; pro CP i finance+inventory)
- `isLocation=true` → pouze calendar

---

## Schema změny

### `Character` — nové pole

```typescript
@Prop({ default: false }) isLocation: boolean;
```

`Character` interface taktéž rozšířen o `isLocation: boolean`. DTOs (`CreateCharacterDto`, `UpdateCharacterDto`) doplněny o:
```typescript
@IsOptional()
@IsBoolean()
isLocation?: boolean;
```

### `CharacterCalendar` — nová pole

```typescript
interface CalendarDisplaySettings {
  defaultView?: 'month' | 'week' | 'day';
  isHiddenInAggregate?: boolean; // PJ může schovat postavu z agregovaného pohledu
}

// Přidáno do CharacterCalendarSchemaClass:
@Prop({ default: '#3B82F6' })
color: string;                          // hex barva, výchozí modrá

@Prop({ type: Object, default: {} })
displaySettings: CalendarDisplaySettings;
```

`CalendarEvent` interface zůstává beze změny: `id, title, description?, start?, end?, hourStart?, hourEnd?, allDay?`.

---

## Změny v `character-subdocs`

### Endpoint: `PUT /api/worlds/:worldId/characters/:slug/calendar`

- HTTP metoda změněna z `PATCH` na `PUT`
- Sémantika: tělo requestu **plně nahradí** pole `events`
- Pole `color` a `displaySettings` se tímto endpointem **nedotýkají**
- Přístup: vlastník postavy nebo PJ/Admin (přes `assertSubdocAccess`)

### `CharacterSubdocsService.updateCalendar()` — sémantika

Nově `updateCalendar(characterId, { events })` — **full replace**. Helper metoda `getCalendarsByWorldId(worldId)` se přidá pro CalendarsModule (aggregate logic).

---

## Nový `CalendarsModule`

Samostatný modul s vlastním controllerem a service. Importuje `CharacterSubdocsModule` a `CharactersModule`.

### Endpoint 1: Agregovaný PJ pohled

```
GET /api/worlds/:worldId/calendars/aggregate
```

**Auth:** `JwtAuthGuard` + `assertCanModerate(worldId, requester)` — Admin/Superadmin shortcut **|** `WorldRole ≥ PomocnyPJ`

```
private async assertCanModerate(worldId, requester):
  if requester.role <= UserRole.Admin: return
  world = await worldsRepo.findById(worldId)
  if !world: throw 404 'Svět nenalezen'  // GET je auth-required, leak světa není kritický
  membership = await membershipRepo.findByUserAndWorld(requester.id, worldId)
  if !membership || membership.role < WorldRole.PomocnyPJ: throw 403
```

**Response:**
```typescript
{
  characters: {
    characterId: string;
    slug: string;
    name: string;
    color: string;
    displaySettings: CalendarDisplaySettings;
  }[];
  events: (CalendarEvent & {
    characterId: string;
    slug: string;
    name: string;
    color: string;
  })[];
}
```

**Logika:**
- Načte všechny `CharacterCalendar` záznamy pro daný `worldId` (přes `CharacterSubdocsService.getCalendarsByWorldId`)
- Filtruje postavy kde `displaySettings.isHiddenInAggregate === true`
- Obohacuje události o `characterId`, `slug`, `name`, `color` z character záznamu
- Výsledek: jeden sloučený seznam událostí ze všech viditelných postav

### Endpoint 2: PJ nastavení vzhledu

```
PATCH /api/worlds/:worldId/calendars/:slug/settings
```

**Auth:** Stejné jako aggregate — `assertCanModerate` (≥ PomocnyPJ + Admin shortcut). Anti-leak: 403 pro neexistující svět při write.

**Body** (DTO `UpdateCalendarSettingsDto` s class-validator):
```typescript
{
  color?: string;                       // @IsHexColor
  displaySettings?: Partial<CalendarDisplaySettings>;
}
```

**Logika:** Přeloží `slug + worldId` → `characterId`, aktualizuje `color` a/nebo `displaySettings` na `CharacterCalendar` dokumentu. Merge `displaySettings` (ne replace).

### Endpoint 3 & 4: Legacy endpoints

```
GET /api/calenders/:slug?worldId=
PUT /api/calenders/:slug?worldId=
```

**Auth:** `JwtAuthGuard` + delegace na `assertSubdocAccess` (vlastník postavy nebo PJ/Admin).

**Validace:** Pokud chybí `worldId` query param → `400 Bad Request` (DTO `@IsString @IsNotEmpty`).

**Logika:**
- Přeloží `slug + worldId` → `characterId`
- `GET`: deleguje na existující `getCalendar(characterId)` ze `CharacterSubdocsService`
- `PUT`: deleguje na existující `updateCalendar(characterId, { events })` — full replace

Legacy URL zachovává překlep "calenders" (zpětná kompatibilita se starým systémem — parity rule).

---

## Access control

| Endpoint | Auth |
|---|---|
| `PUT /worlds/:worldId/characters/:slug/calendar` | `JwtAuthGuard` + `assertSubdocAccess` (vlastník nebo PJ/Admin) |
| `GET /worlds/:worldId/characters/:slug/calendar` | Stejné |
| `GET /worlds/:worldId/calendars/aggregate` | `JwtAuthGuard` + `assertCanModerate` (≥ PomocnyPJ + Admin) |
| `PATCH /worlds/:worldId/calendars/:slug/settings` | Stejné jako aggregate |
| `GET\|PUT /calenders/:slug?worldId=` | `JwtAuthGuard` + `assertSubdocAccess` |

---

## Validace (DTO + service)

| Pravidlo | Vrstva | Chyba |
|---|---|---|
| `events[].title` non-empty | DTO | 400 |
| `events[].start`, `end`, `hourStart`, `hourEnd` ISO date string | DTO | 400 |
| `color` valid hex | DTO `@IsHexColor` | 400 |
| `displaySettings.defaultView ∈ {'month','week','day'}` | DTO `@IsIn` | 400 |
| `displaySettings.isHiddenInAggregate` boolean | DTO | 400 |
| `:slug` neexistuje pro daný `worldId` | Service | 404 |
| `worldId` query param chybí (legacy) | DTO `@IsNotEmpty` | 400 |
| `worldId` neexistuje při `aggregate` GET | Service | 404 |
| `worldId` neexistuje při `settings` PATCH | Service | 403 (anti-leak) |

---

## Testy

### `CalendarsService.spec.ts` (nový)

- `aggregate(worldId, requester)`:
  - Admin/Superadmin shortcut
  - PomocnyPJ světa W1 → 200 s daty
  - non-member W1 → 403
  - Pending → 403
  - neexistující svět → 404
  - filtruje `isHiddenInAggregate=true`
  - obohacuje events o character info
  - postavy bez events → prázdné `events`, ale `characters` obsahuje
- `updateSettings(worldId, slug, dto, requester)`:
  - Admin smí upravit
  - PomocnyPJ světa smí upravit
  - Hrac → 403
  - Korektor → 403
  - cross-world: PJ W1 ne W2 → 403
  - non-existing svět → 403 (anti-leak)
  - non-existing slug → 404
  - merge `displaySettings` (ne replace)
- `legacyGet(slug, worldId, requester)` / `legacyPut`:
  - vlastník postavy → 200
  - PJ jiné postavy v témž světě → 200 (přes assertSubdocAccess)
  - chybějící worldId → 400

### `CharacterSubdocsService` — aktualizovat existující testy

- `updateCalendar` nyní full replace — test
- `getCalendarsByWorldId` — nový method, test pro filter dle worldId
- `onCharacterCreated` event handler — pokud `isLocation=true`, vytvoří jen calendar subdoc (ne diary/notes/finance/inventory)

### Co netestujeme

- Konkrétní obsah `CalendarEvent.description` (volný text)
- Frontend rendering aggregate view

---

## Architektura modulu

```
backend/src/modules/calendars/                      # NEW MODULE
├── calendars.module.ts
├── calendars.controller.ts
├── calendars.service.ts
├── calendars.service.spec.ts
└── dto/
    ├── update-calendar-settings.dto.ts
    └── legacy-calendar-query.dto.ts                # query param worldId

backend/src/modules/calendars/calenders/            # legacy controller (s překlepem)
└── calenders.controller.ts                         # @Controller('calenders')
```

`CalendarsModule` exportuje nic — pouze controller endpointy. Závisí na:
- `CharactersModule` — `ICharactersRepository` (slug → characterId, character info)
- `CharacterSubdocsModule` — `CharacterSubdocsService` (existing methods + nový `getCalendarsByWorldId`)
- `WorldsModule` — `IWorldMembershipRepository`, `IWorldsRepository` (auth)

---

## Migrace dat

Migrace dat ze staré kolekce `calenders` (keyed by characterSlug) do nové `character_calendars` (keyed by characterId) **není součástí tohoto kroku**. Řeší se v Kroku 16 — Finalizace & Integrace.

Legacy endpoint `/api/calenders/:slug?worldId=` je připraven pro budoucí migraci — přistupuje k novým datům přes starý URL vzor.

---

## Mimo scope

- **Migrace dat** ze staré DB (Krok 16)
- **Frontend rendering** aggregate view
- **Real-time push** updates při změně calendar (mimo scope této fáze)
- **Recurring events** (každý event má specifické datum)
- **Notification reminder** (volitelný field, mimo MVP)
