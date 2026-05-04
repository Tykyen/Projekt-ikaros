# Krok 10b — Calendar: Design Spec

**Datum:** 2026-05-04  
**Stav:** Schváleno

---

## Kontext

Existující `character-subdocs` modul již obsahuje základní calendar implementaci (`GET/PATCH /api/worlds/:worldId/characters/:slug/calendar`). Krok 10b tuto implementaci rozšiřuje a doplňuje o:

1. Změnu sémantiky z `PATCH` na `PUT` (full replace events)
2. Nastavení vzhledu kalendáře (barva, display preferences) — jen PJ/Admin
3. Agregovaný PJ pohled — všechny události světa v jednom poli
4. Legacy endpoint `/api/calenders/:slug?worldId=` pro budoucí migraci dat ze starého systému

Scope: **pouze backend**.

---

## Schema změny

### `CharacterCalendar` — nová pole

```typescript
interface CalendarDisplaySettings {
  defaultView?: 'month' | 'week' | 'day';
  isHiddenInAggregate?: boolean; // PJ může schovat postavu z agregovaného pohledu
}

// Přidáno do CharacterCalendarSchemaClass:
color: string;                          // výchozí '#3B82F6'
displaySettings: CalendarDisplaySettings; // výchozí {}
```

`CalendarEvent` interface zůstává beze změny: `id, title, description?, start?, end?, hourStart?, hourEnd?, allDay?`.

---

## Změny v `character-subdocs`

### Endpoint: `PUT /api/worlds/:worldId/characters/:slug/calendar`

- HTTP metoda změněna z `PATCH` na `PUT`
- Sémantika: tělo requestu **plně nahradí** pole `events`
- Pole `color` a `displaySettings` se tímto endpointem **nedotýkají**
- Přístup: vlastník postavy nebo PJ/Admin (přes `assertSubdocAccess`)

---

## Nový `CalendarsModule`

Samostatný modul s vlastním controllerem a service. Importuje `CharacterSubdocsModule` a `CharactersModule`.

### Endpoint 1: Agregovaný PJ pohled

```
GET /api/worlds/:worldId/calendars/aggregate
```

**Přístup:** PJ / PomocnýPJ / Admin (ověření WorldRole)

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
- Načte všechny `CharacterCalendar` záznamy pro daný `worldId`
- Filtruje postavy kde `displaySettings.isHiddenInAggregate === true`
- Obohacuje události o `characterId`, `slug`, `name`, `color` z character záznamu
- Výsledek: jeden sloučený seznam událostí ze všech viditelných postav

### Endpoint 2: PJ nastavení vzhledu

```
PATCH /api/worlds/:worldId/calendars/:slug/settings
```

**Přístup:** pouze PJ / Admin

**Body:**
```typescript
{
  color?: string;
  displaySettings?: Partial<CalendarDisplaySettings>;
}
```

**Logika:** Přeloží `slug + worldId` → `characterId`, aktualizuje `color` a/nebo `displaySettings` na `CharacterCalendar` dokumentu. Merge `displaySettings` (ne replace).

### Endpoint 3 & 4: Legacy endpoints

```
GET /api/calenders/:slug?worldId=
PUT /api/calenders/:slug?worldId=
```

**Přístup:** vlastník postavy nebo PJ/Admin (přes `assertSubdocAccess`)

**Validace:** Pokud chybí `worldId` query param → `400 Bad Request`

**Logika:**
- Přeloží `slug + worldId` → `characterId`
- `GET`: deleguje na existující `getCalendar(characterId)` ze `CharacterSubdocsService`
- `PUT`: deleguje na existující `updateCalendar(characterId, { events })` — full replace

Legacy URL zachovává překlep "calenders" (zpětná kompatibilita se starým systémem).

---

## Access control

| Endpoint | Guard | Podmínka |
|---|---|---|
| `PUT /worlds/:worldId/characters/:slug/calendar` | JwtAuthGuard | `assertSubdocAccess` (vlastník nebo PJ/Admin) |
| `GET /worlds/:worldId/characters/:slug/calendar` | JwtAuthGuard | `assertSubdocAccess` (vlastník nebo PJ/Admin) |
| `GET /worlds/:worldId/calendars/aggregate` | JwtAuthGuard | WorldRole ≥ PomocnýPJ |
| `PATCH /worlds/:worldId/calendars/:slug/settings` | JwtAuthGuard | WorldRole = PJ nebo globální Admin |
| `GET\|PUT /calenders/:slug?worldId=` | JwtAuthGuard | `assertSubdocAccess` |

---

## Testy

- `CalendarsService` unit testy:
  - agregace správně filtruje `isHiddenInAggregate`
  - agregace obohacuje události o character info
  - `settings` update funguje jen pro PJ/Admin
  - legacy překlad `slug + worldId` → `characterId`
- `character-subdocs` — aktualizovat testy pro `PUT` místo `PATCH`

---

## Migrace dat

Migrace dat ze staré kolekce `calenders` (keyed by characterSlug) do nové `character_calendars` (keyed by characterId) **není součástí tohoto kroku**. Řeší se v Kroku 16 — Finalizace & Integrace.

Legacy endpoint `/api/calenders/:slug?worldId=` je připraven pro budoucí migraci — přistupuje k novým datům přes starý URL vzor.
