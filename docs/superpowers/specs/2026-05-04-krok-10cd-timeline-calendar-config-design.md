# Krok 10c — TimelineEvent: Design Spec

**Datum vzniku:** 2026-05-04 (původně sdružený spec 10c+10d)
**Aktualizováno:** 2026-05-06 (revize během brainstormingu Fáze 3.2)
**Stav:** Schváleno (po revizi)

---

## Přehled

Modul `timeline` pro historickou časovou osu světa — události s ručně zadaným datem (rok/měsíc/den/hodina) v rámci fantasy kalendáře.

**Path API:** `/api/timeline`
**Modul (kód):** `backend/src/modules/timeline/`

**Scope této fáze:** Pouze backend, **pouze TimelineEvent CRUD** — bez calendar config integrace (viz "Mimo scope" níže).

---

## Rozdíly proti původní verzi (2026-05-04)

| Téma | Verze 2026-05-04 | Verze 2026-05-06 (aktuální) | Důvod |
|---|---|---|---|
| **Rozsah specu** | TimelineEvent **+** WorldCalendarConfig (sjednocené) | Pouze TimelineEvent | Roadmap2.md odděluje 3.2 (timeline) a 4.1 (calendar). Timeline funguje samostatně s placeholderem `celestialStates: []`. |
| **Auth (write POST/PUT/DELETE)** | `WorldRole >= PJ` (jen plný PJ) | `WorldRole >= PomocnyPJ` (Admin/Superadmin shortcut + PomocnyPJ světa) | Konzistence s WorldNews modulem (Fáze 3.1). PomocnyPJ je v projektu validní role pro správu obsahu světa. |
| **DTO validace** | DTOs bez class-validator dekorátorů | Plná class-validator validace (`@IsString`, `@IsInt`, `@Min`, atd.) | `whitelist: true` v ValidationPipe by bez dekorátorů strippal všechna pole. Bez validace je modul kapotuje na úrovni HTTP. |
| **`month` validace v rozsahu** | Spec zmiňuje "1..months.length → 400", ale plán neukazuje kde | Validace `month >= 1` na DTO úrovni (`@Min(1)`); přesný range proti `months.length` přijde s calendar config v 4.1 | Bez calendar config nemůžeme určit horní hranici. Nedoporučujeme tichou akceptaci 0/zápor. |
| **Anti-leak (neexistující svět)** | Implicitní (assertPjOnly nekontroluje) | Explicitní pattern: `assertCanWrite` kontroluje `worldsRepo.findById` → 403 (ne 404) per WorldNews precedent | Konzistence; minimalizace info leak při auth selhání. |
| **`celestialStates` v response** | Vypočtené z calendar configu | **Vždy `[]`** v této fázi (placeholder) | Calendar config přichází v 4.1. `celestialOverrides` se ukládá do DB — frontend je má k dispozici, ale nemá s čím počítat. V 4.1 endpoint retroaktivně začne vracet vypočítané stavy. |
| **WorldCalendarConfig** | Implementováno společně | **Mimo scope** (Fáze 4.1) | Viz sekce "Mimo scope této fáze". |

---

## Datový model

### Mongoose schema `TimelineEventSchemaClass`

```ts
// backend/src/modules/timeline/schemas/timeline-event.schema.ts
@Schema({ timestamps: true, collection: 'timeline_events' })
export class TimelineEventSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true, min: 0 }) year: number;
  @Prop({ required: true, min: 1 }) month: number;
  @Prop({ required: true, min: 1 }) day: number;
  @Prop({ default: null }) hour: number | null;
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 50000 }) text: string;
  @Prop({ default: null }) imageUrl: string | null;
  @Prop({ default: null }) link: string | null;
  @Prop({ type: [Object], default: [] })
  celestialOverrides: { bodyId: string; value: string }[];
}
```

**Indexy:**
```
{ worldId: 1, year: 1, month: 1, day: 1 }
```

**Poznámky:**

- `worldId: required` — timeline je vždy per-svět (žádné globální události)
- `year` může být 0 nebo záporný (events před "rokem 0" světa) — necháme `min: 0` defaultně, pokud chce historik předhistorii, sníží přes update; **otevřený bod**: pokud je negative year vyžadovaný, sundat `min: 0`
- `month`, `day`: `min: 1` — sanity check; přesný range vůči calendar configu přijde v 4.1
- `hour`: nullable (volitelné — některé eventy nemají přesný čas)
- `text` max 50 000 (delší než news — historický popis může být rozsáhlý)
- `imageUrl`: zacházení s base64 — viz níže
- `celestialOverrides`: pole `{ bodyId, value }` — uloženo per-event; v 4.1 bude existovat WorldCalendarConfig service, který tento override aplikuje na vypočtený stav tělesa
- `timestamps: true` — `createdAt` + `updatedAt` (rozdíl proti WorldNews — timeline má smysl audit, není parity-driven)

---

## API endpointy

Prefix: `/api/timeline`

| Metoda | URL | Auth | Popis |
|--------|-----|------|-------|
| GET | `/?worldId=&limit=&fromYear=&toYear=` | JWT + member světa | Seznam událostí filtrovaných per svět |
| GET | `/:id` | JWT + member světa **(dle worldId události)** | Detail události |
| POST | `/` | JWT + Admin/Superadmin **\|** `WorldRole≥PomocnyPJ` na `worldId` z body | Vytvoř událost |
| PUT | `/:id` | Stejné jako POST, hodnoceno per `worldId` **existujícího** dokumentu | Aktualizuj událost (partial) |
| DELETE | `/:id` | Stejné jako PUT | Smaž událost |

### Query parametry pro `GET /`

| Parametr | Typ | Default | Popis |
|----------|-----|---------|-------|
| `worldId` | string | **povinné** | ID světa (timeline není globální) |
| `limit` | number | 100 (max 500) | Max počet vrácených položek |
| `fromYear` | number | — | Filtr: events od tohoto roku (≥) |
| `toYear` | number | — | Filtr: events do tohoto roku (≤) |

**Sort:** `year asc, month asc, day asc, hour asc` (chronologicky vzestupně — historické čtení).

### Tělo POST `/`

```ts
// CreateTimelineEventDto
{
  worldId: string                  // povinné
  year: number                     // celé
  month: number                    // ≥ 1
  day: number                      // ≥ 1
  hour?: number                    // 0..23 (volitelné)
  title: string                    // 1..200
  text: string                     // 1..50000
  imageUrl?: string | null         // URL nebo data: URI
  link?: string                    // URL
  celestialOverrides?: { bodyId: string; value: string }[]
}
```

### Tělo PUT `/:id`

`UpdateTimelineEventDto` — všechna pole optional **kromě**:
- `worldId` v body je **zakázáno** — vrátí `400 Bad Request: "worldId is immutable"` (defense-in-depth jako u WorldNews)
- `imageUrl: null` v body **zachová** stávající hodnotu (per parity, viz "Base64 stripping" níže)

PUT je **partial update** (PATCH semantika).

### Response — `celestialStates` placeholder

V této fázi (3.2) je response struktura:

```ts
interface TimelineEventResponse {
  id: string
  worldId: string
  year: number
  month: number
  day: number
  hour?: number
  title: string
  text: string
  imageUrl: string | null     // strippé pro list endpoint, plné pro detail
  link: string | null
  celestialOverrides: { bodyId: string; value: string }[]
  celestialStates: []         // VŽDY prázdné pole v 3.2
  createdAt: Date
  updatedAt: Date
}
```

Pole `celestialStates: []` je **forward-compat placeholder** — frontend ho může bezpečně použít, vědom si, že hodnoty přijdou v 4.1.

---

## Base64 stripping (per parity)

Stará specifikace ([docs/old/eventy-kalendar-timeline.md]) má specifické chování:

- `GET /api/timeline?worldId=` (list): pokud `imageUrl` začíná `data:`, vrátí `null` (úspora bandwidth — uživatel se musí podívat na detail pro plné base64)
- `GET /api/timeline/:id` (detail): vrátí plné `imageUrl` včetně `data:` URI
- `PUT /api/timeline/:id`: pokud klient pošle `imageUrl: null`, server **zachová stávající hodnotu** (proto, že list endpoint vrací null pro base64 — frontend by neměl ztratit data při PUT)

To je rozdíl proti WorldNews (PUT `null` by smazal field). Důvod: legacy frontend pošle zpět celý objekt z list endpointu, kde už `imageUrl` byl strippnut. Bez tohoto chování by PUT smazal obrázek.

**Implementace:** Helper `stripBase64(url)` v `timeline.service.ts`. PUT logika: `imageUrl = dto.imageUrl === null ? existing.imageUrl : dto.imageUrl`.

---

## Autorizace (service-side)

```
async assertCanWrite(worldId: string, requester: WorldNewsRequester):
  // Admin/Superadmin shortcut (UserRole.Superadmin = 1, UserRole.Admin = 2)
  if requester.role <= UserRole.Admin: return

  // worldId vždy non-null pro timeline; existence check
  world = await worldsRepo.findById(worldId)
  if !world: throw 403 'Nedostatečná oprávnění'   // anti-leak

  // PomocnyPJ a vyšší
  membership = await membershipRepo.findByUserAndWorld(requester.id, worldId)
  if !membership: throw 403
  if membership.role < WorldRole.PomocnyPJ: throw 403
```

**Pro GET** existuje paralelní `assertMember` který kontroluje členství (jakákoli role ≥ Hrac, tj. ≥ 0):

```
async assertMember(worldId, userId):
  world = await worldsRepo.findById(worldId)
  if !world: throw 404 'Svět nenalezen'   // GET je auth-required, leak světa není kritický

  membership = await membershipRepo.findByUserAndWorld(userId, worldId)
  if !membership || membership.role < WorldRole.Hrac: throw 403 'Nejsi členem'
```

> Poznámka: Pending (-1) NEMÁ právo číst. Hrac (0) a výše ano. Toto je rozdíl proti world-currencies, který stejnou logiku používá.

---

## Validace (class-validator + Mongoose)

| Pravidlo | Vrstva | Chyba |
|---|---|---|
| `worldId`, `title`, `text`, `year`, `month`, `day` povinné | DTO | 400 |
| `title` ≤ 200, `text` ≤ 50000 | DTO + DB | 400 / 422 |
| `month >= 1`, `day >= 1` | DTO | 400 |
| `hour` v rozsahu 0..23 (pokud zadané) | DTO | 400 |
| `imageUrl` (pokud `string` non-`null`): URL nebo `data:` URI | DTO | 400 |
| `link` (pokud zadané): valid URL | DTO | 400 |
| `celestialOverrides[i].bodyId`, `.value`: string | DTO | 400 |
| `worldId` v PUT body | Service | 400 (immutable) |
| `worldId` v POST odkazuje na neexistující svět | Service (assertCanWrite) | 403 (anti-leak) |
| `:id` neexistuje (PUT/DELETE/GET) | Repository | 404 |
| `limit > 500` | DTO | 400 |
| `month` proti `months.length` | **Mimo scope (4.1)** | — |

---

## Testy

`backend/src/modules/timeline/timeline.service.spec.ts` — fokus na business invarianty:

### Read path

- `findAll(worldId)` jako member → vrátí events seřazené chronologicky
- `findAll` jako non-member → 403
- `findAll` neexistující svět → 404 (auth-required, není anti-leak case)
- `findAll` strippe `data:` URI v `imageUrl` (list)
- `findAll` zachová normal URL
- `findById` zachová `data:` URI (detail)
- `findById` neexistující → 404
- `celestialStates: []` v response (placeholder)

### Write path (autorizace)

- POST jako anon → 401 (JwtAuthGuard)
- POST jako Hrac → 403
- POST jako Korektor (role 1) → 403
- POST jako PomocnyPJ (role 2) → 201
- POST jako PJ (role 3) → 201
- POST jako Admin → 201
- POST jako Superadmin → 201
- **POST do W2 jako PJ světa W1 → 403** (cross-world isolation)
- POST do neexistujícího světa → 403 (anti-leak)
- PUT s `worldId` v body → 400 (immutability)
- PUT/DELETE neexistující `:id` → 404
- PUT s `imageUrl: null` na event s existujícím URL → URL zachován
- PUT s `imageUrl: 'https://...'` → nahradí
- PUT s `imageUrl: 'data:...'` → uloží base64

### Schema / validation

- POST bez `title` / `text` / `worldId` / `year` / `month` / `day` → 400
- POST `month=0` → 400 (`@Min(1)`)
- POST `hour=25` → 400 (`@Max(23)`)
- POST `title` > 200 chars → 400
- POST `link='not-a-url'` → 400

---

## Implementační poznámky

- **Bez WorldCalendarConfigService import** — modul je v této fázi nezávislý
- **`celestialOverrides`** se ukládá tak, jak přijde (validace tvaru objektu)
- **`celestialStates: []`** v response — hardcoded prázdné pole, frontend forward-compat
- Při GET endpointech se vrací `WorldNewsRequester` interface (typ `id`/`role`/`username`); auth check probíhá v service per pattern WorldNews
- TimelineModule importuje `WorldsModule` (membership + worlds repo přes DI)
- AppModule registrace: `TimelineModule` mezi existující moduly v `imports[]`

---

## Mimo scope této fáze

### Fáze 4.1 — WorldCalendarConfig (přesunuto)

Původní spec (2026-05-04) zahrnoval kompletní WorldCalendarConfig modul:

- Schema `world_calendar_configs` (1:1 per svět)
- `CelestialBody` typed union (moon, sun, planet, comet, other)
- Výpočetní utils `calculateCelestialStates(year, month, day, config, overrides)` — moon phases, sun rise/set, planet positions, comet periodicity
- `WorldCalendarConfigService` s upsert + výpočetní API
- API `GET/PUT /api/worlds/:worldId/calendar-config`

**Rozhodnutí:** Tato část je odložena do Fáze 4.1 per roadmap2.md. Kompletní design (algoritmy, schema, API) je zachovaný v původní verzi tohoto dokumentu (před 2026-05-06 revizí) a v původním plánu — bude reaktivován jako samostatný spec až Fáze 4.1 začne.

**Důsledky pro Timeline (3.2):**
- Žádný `WorldCalendarConfigService` v `TimelineModule.imports`
- Timeline GET response má pole `celestialStates: []` (placeholder)
- `celestialOverrides` se ukládá v DB, ale není při GET nijak interpretováno
- Při Fázi 4.1 se přidá `WorldCalendarConfigService` do TimelineModule a service `enrich()` začne plnit `celestialStates` reálně. Žádná schema změna; minimální dopad na frontend.

### Mimo scope obecně

- **WebSocket broadcast** nových events
- **Markdown rendering** v `text`
- **Image upload integration** (frontend pošle data: URI nebo image upload module URL)
- **Range validation** `month` proti `WorldCalendarConfig.months.length` (až s 4.1)
- **Search/full-text** v `text` poli (mimo Meilisearch scope této fáze)
