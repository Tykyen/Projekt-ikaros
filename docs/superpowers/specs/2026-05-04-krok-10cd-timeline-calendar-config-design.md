# Krok 10c+10d — TimelineEvent & WorldCalendarConfig: Design Spec

**Datum:** 2026-05-04  
**Stav:** Schváleno

---

## Kontext

Kroky 10c (TimelineEvent) a 10d (WorldCalendarConfig) jsou navrženy jako jeden celek — timeline events závisí na konfiguraci kalendáře pro řazení a výpočet stavů nebeských těles.

Scope: **pouze backend**.

---

## WorldCalendarConfig

### Schema

Uloženo jako samostatná kolekce `world_calendar_configs`, 1:1 per world.

```typescript
interface WorldCalendarConfig {
  worldId: string

  hoursPerDay: number          // výchozí 24
  daysOfWeek: string[]         // názvy dní v týdnu (může být prázdné)

  months: {
    name: string               // např. "Měsíc plamenů"
    daysCount: number
  }[]

  celestialBodies: CelestialBody[]

  referenceDate: {
    year: number
    month: number              // 1-based index do months[]
    day: number
    hour: number               // 0-based
  }
}
```

### CelestialBody

```typescript
type CelestialBodyType = 'moon' | 'sun' | 'planet' | 'comet' | 'other'

interface CelestialBody {
  id: string                   // nanoid — klíč pro overrides na TimelineEvent
  name: string
  type: CelestialBodyType
  config: MoonConfig | SunConfig | PlanetConfig | CometConfig | OtherConfig
  referenceState: string       // stav tělesa na referenceDate
}

interface MoonConfig {
  cycleLength: number          // délka cyklu v dnech
  phases: string[]             // pojmenované fáze, např. ['nový', 'dorůstající', 'úplněk', 'couvající']
}

interface SunConfig {
  riseHour: number[]           // hodina východu per měsíc (délka = months.length)
  setHour: number[]            // hodina západu per měsíc (délka = months.length)
}

interface PlanetConfig {
  orbitalPeriod: number        // oběžná doba v dnech
  constellations: string[]     // konstelace/znamení (planeta se pohybuje skrz ně)
}

interface CometConfig {
  periodYears: number          // perioda v rocích světa
  apparitionDurationYears: number  // jak dlouho je viditelná při průletu
}

interface OtherConfig {
  cycleLength: number
  states: string[]             // pojmenované stavy cyklu
}
```

### Výpočet absolutního dne

```
totalDaysPerYear = sum(months[].daysCount)

absoluteDay(year, month, day) =
  year * totalDaysPerYear
  + sum(months[0 .. month-2].daysCount)
  + day

referenceAbsoluteDay = absoluteDay(referenceDate.year, referenceDate.month, referenceDate.day)
```

### Výpočet stavu tělesa

`referenceState` je string odpovídající jedné z pojmenovaných hodnot tělesa (fáze, konstelace, stav). Při uložení configu backend převede `referenceState` na `referenceOffset` (číslo dní od začátku cyklu):

```
// Moon / Other:
referenceOffset = phases.indexOf(referenceState) * (cycleLength / phases.length)

// Planet:
referenceOffset = constellations.indexOf(referenceState) * (orbitalPeriod / constellations.length)

// Comet: referenceState = 'viditelná' | 'neviditelná'
// pokud 'viditelná': referenceOffset = 0 (začátek průletu)
// pokud 'neviditelná': referenceOffset = apparitionDays (první den mimo průlet)

// Sun: nemá cycleLength, referenceState se ignoruje
```

Stav na libovolném datu:

```
delta = absoluteDay(year, month, day) - referenceAbsoluteDay

// Moon / Other:
phaseIndex = ((delta + referenceOffset) % cycleLength + cycleLength) % cycleLength
state = phases[floor(phaseIndex / (cycleLength / phases.length))]

// Planet:
positionDeg = ((delta + referenceOffset) % orbitalPeriod / orbitalPeriod * 360 + 360) % 360
state = constellations[floor(positionDeg / (360 / constellations.length))]

// Comet:
totalPeriodDays = periodYears * totalDaysPerYear
apparitionDays = apparitionDurationYears * totalDaysPerYear
phaseInCycle = ((delta + referenceOffset) % totalPeriodDays + totalPeriodDays) % totalPeriodDays
state = phaseInCycle < apparitionDays ? 'viditelná' : 'neviditelná'

// Sun:
state = { riseHour: riseHour[month - 1], setHour: setHour[month - 1] }
```

### API

```
GET  /api/worlds/:worldId/calendar-config
PUT  /api/worlds/:worldId/calendar-config
```

**Přístup:**
- `GET` — všichni členové světa
- `PUT` — PJ / Admin (plný replace, validace délky `riseHour`/`setHour` = `months.length`)

---

## TimelineEvent

### Schema

```typescript
interface TimelineEvent {
  worldId: string
  year: number
  month: number                // 1-based index do months[]
  day: number
  hour?: number                // volitelné

  title: string
  text: string                 // plain text, může obsahovat URL
  imageUrl?: string | null
  link?: string | null

  celestialOverrides: {
    bodyId: string             // id z CelestialBody
    value: string              // manuální override ("úplněk", "90°", ...)
  }[]
}
```

### Index

```
{ worldId: 1, year: 1, month: 1, day: 1 }
```

### Computed celestialStates v response

Každý TimelineEvent v response obsahuje vypočtené pole (není uloženo v DB):

```typescript
celestialStates: {
  bodyId: string
  name: string
  type: CelestialBodyType
  state: string
  isManualOverride: boolean
}[]
```

Backend při GET načte `WorldCalendarConfig` pro daný `worldId`, vypočte stav každého tělesa pro datum eventu a aplikuje `celestialOverrides` (override přebíjí výpočet). Pokud config pro daný svět neexistuje, vrátí se `celestialStates: []` bez chyby.

### Base64 stripping

- `GET /api/timeline?worldId=` — stripuje `data:` URI z `imageUrl` (vrátí `null`)
- `GET /api/timeline/:id` — zachová plné `imageUrl`
- `PUT /api/timeline/:id` — pokud klient pošle `imageUrl: null`, backend zachová stávající hodnotu

### API

```
GET    /api/timeline?worldId=&limit=&fromYear=&toYear=
GET    /api/timeline/:id
POST   /api/timeline
PUT    /api/timeline/:id
DELETE /api/timeline/:id
```

### Přístup

| Endpoint | Role |
|---|---|
| `GET /api/timeline` | všichni členové světa |
| `GET /api/timeline/:id` | všichni členové světa |
| `POST /api/timeline` | PJ / Admin |
| `PUT /api/timeline/:id` | PJ / Admin |
| `DELETE /api/timeline/:id` | PJ / Admin |
| `GET /api/worlds/:worldId/calendar-config` | všichni členové světa |
| `PUT /api/worlds/:worldId/calendar-config` | PJ / Admin |

---

## Moduly

### `WorldCalendarConfigModule`

- `WorldCalendarConfigController` — GET + PUT endpointy
- `WorldCalendarConfigService` — CRUD + `calculateCelestialState(body, date, config)` logika
- `WorldCalendarConfigRepository` — Mongoose operace
- Exportuje `WorldCalendarConfigService` pro použití v `TimelineModule`

### `TimelineModule`

- `TimelineController` — CRUD endpointy + base64 stripping logika
- `TimelineService` — volá `WorldCalendarConfigService.calculateCelestialState()` při GET
- `TimelineRepository` — Mongoose operace
- Importuje `WorldCalendarConfigModule`

---

## Validace

- `PUT /calendar-config`: délka `riseHour` a `setHour` musí odpovídat `months.length` → `400`
- `POST/PUT /timeline`: `month` musí být v rozsahu `1..months.length` → `400`
- `PUT /calendar-config`: pokud `celestialBodies` obsahuje `SunConfig`, validovat délku polí

---

## Testy

### WorldCalendarConfigService

- `calculateCelestialState` — unit testy pro každý typ tělesa (moon, sun, planet, comet, other)
- Správné chování při záporném delta (datum před referenceDate)
- Správný výpočet `totalDaysPerYear` z konfigurace měsíců

### TimelineService

- `celestialOverrides` správně přebíjí výpočet (`isManualOverride: true`)
- Těleso bez overridu vrací `isManualOverride: false`
- Base64 stripping na list endpointu (`imageUrl` s `data:` → `null`)
- `imageUrl: null` v PUT zachová stávající hodnotu

### TimelineController

- `403` při pokusu o mutaci bez PJ/Admin role
- `400` při neplatném `month` mimo rozsah
