# Krok 10f — WorldWeather: Design Spec

**Datum vzniku:** 2026-05-04
**Aktualizováno:** 2026-05-06 (revize během brainstormingu Fáze 3.3 — auth pattern + DTO validace)
**Stav:** Schváleno (po revizi)

---

## Přehled

Modul pro správu a generování počasí per world. PJ může vytvořit více generátorů počasí (per planeta, sféra, region), každý s vlastní konfigurací. Generátor produkuje `WeatherResult` který se uloží jako `currentWeather` — PJ jej pak může odeslat do chat kanálu nebo taktické mapy.

**Path API:** `/api/worlds/:worldId/weather-generators`
**Modul:** `backend/src/modules/world-weather/` (nový)

Tři módy pro PJ:
1. **Automatické generování** — `POST /:id/generate` vygeneruje výsledek z config parametrů
2. **Ruční nastavení** — `PUT /:id/current` PJ zadá hodnoty sám
3. **Broadcast** — `POST /:id/broadcast` odešle `currentWeather` do chatu nebo mapy

---

## Rozdíly proti původní verzi (2026-05-04)

| Téma | Verze 2026-05-04 | Verze 2026-05-06 (aktuální) | Důvod |
|---|---|---|---|
| **Auth (write)** | "PJ nebo Admin" (`WorldRole >= PJ`) | `WorldRole >= PomocnyPJ` + Admin/Superadmin shortcut | Konzistence s WorldNews/Timeline/Calendar (Fáze 3.1/3.2/4.1) — PomocnyPJ je validní role pro správu obsahu světa |
| **Auth (read)** | "člen světa" (nejasné) | `WorldRole >= Hrac` (Pending vyloučen) + Admin/Superadmin shortcut | Explicit pattern — konzistentní s Timeline `assertMember` |
| **DTO validace** | Bez class-validator dekorátorů | Plná class-validator validace (`@IsNumber`, `@Min`, `@IsArray`, `@ValidateNested`) | `whitelist: true` v ValidationPipe by stripoval pole; bez dekorátorů HTTP layer není chráněn |
| **Anti-leak (write)** | Implicitní | Explicitní `403` pro neexistující svět při create/update/delete | Konzistence s WorldNews/Timeline/Calendar pattern |
| **Anti-leak (read)** | Implicitní | `404` pro neexistující svět (auth-required GET, leak světa není kritický) | Konzistence s Timeline |
| **`weatherTypes[].probability` validace** | "Součet musí být 100" | Service-level validation s tolerancí ±0.01 (float arithmetic safety) | Float sum může mít drobnou rounding chybu (např. 99.99999) |

---

## Datový model

### Kolekce `world_weather_generators`

Více dokumentů per world (n:1 přes `worldId`).

```typescript
@Schema({ timestamps: true, collection: 'world_weather_generators' })
export class WeatherGeneratorSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true, maxlength: 100 }) name: string;
  @Prop({ default: null }) description: string | null;

  @Prop({ type: Object, required: true })
  config: Record<string, unknown>;             // WeatherGeneratorConfig

  @Prop({ type: Object, default: null })
  currentWeather: Record<string, unknown> | null;  // WeatherResult
}

// Index
{ worldId: 1, createdAt: 1 }
```

### WeatherGenerator (entita)

```typescript
interface WeatherGenerator {
  id: string;
  worldId: string;
  name: string;                       // "Albánie", "Měsíc Alpha"
  description: string | null;
  config: WeatherGeneratorConfig;
  currentWeather: WeatherResult | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### WeatherGeneratorConfig

```typescript
type WeatherType =
  | 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'custom';

interface WeatherTypeEntry {
  type: WeatherType;
  label: string;                      // "ZATAŽENO", "BOUŘKA"
  icon: string;                       // client-side enum key
  probability: number;                // 0..100
  cloudRange: [number, number];       // 0..8 (osminy oblačnosti)
  precipRange: [number, number];      // mm/h
}

interface CustomFieldConfig {
  label: string;                      // "Magická anomálie", "Radiace"
  possibleValues: string[];           // ["Přítomna", "Silná", "Nepřítomna"]
  probability: number;                // 0..100, šance na výskyt
}

interface WeatherGeneratorConfig {
  tempMin: number;
  tempMax: number;
  tempUnit: 'C' | 'F';                // default 'C'

  weatherTypes: WeatherTypeEntry[];   // sum probability = 100 (±0.01)

  windMin: number;                    // km/h
  windMax: number;
  windGustMultiplier: number;         // ≥ 1.0, default 2.0

  pressureMin: number;                // hPa
  pressureMax: number;
  humidityMin: number;                // %
  humidityMax: number;

  customFields: CustomFieldConfig[];
}
```

### WeatherResult

```typescript
interface WeatherResult {
  generatedAt: Date;
  isManual: boolean;                  // true = PJ ručně, false = generováno

  temperature: number;                // 1 desetinné místo
  tempUnit: 'C' | 'F';
  weatherType: string;                // label: "ZATAŽENO"
  weatherIcon: string;                // type key: clear/cloudy/...

  cloudiness: { value: string; description: string };
  precipitation: { value: string; description: string };
  wind: { speed: number; gusts: number; unit: 'kmh' };
  pressure: { value: number; trend: string };
  humidity: number;

  extras: {
    label: string;
    value: string;
    description?: string;
  }[];

  narrativeText: string | null;       // volitelný popis pro broadcast
}
```

---

## API endpointy

Prefix: `/api/worlds/:worldId/weather-generators`

### CRUD generátorů

| Metoda | URL | Popis | Auth |
|--------|-----|-------|------|
| GET | `/` | Seznam generátorů světa (vč. `currentWeather`) | JWT + `≥ Hrac` |
| GET | `/:id` | Detail generátoru | JWT + `≥ Hrac` |
| POST | `/` | Vytvoř generátor | JWT + Admin/Superadmin **\|** `≥ PomocnyPJ` |
| PUT | `/:id` | Aktualizuj config a metadata | Stejné jako POST |
| DELETE | `/:id` | Smaž generátor | Stejné jako POST |

### Generování & ruční nastavení

| Metoda | URL | Popis | Auth |
|--------|-----|-------|------|
| POST | `/:id/generate` | Vygeneruj počasí, uloží do `currentWeather` | Stejné jako write |
| PUT | `/:id/current` | Ručně nastav `currentWeather` | Stejné jako write |

### Broadcast

| Metoda | URL | Popis | Auth |
|--------|-----|-------|------|
| POST | `/:id/broadcast` | Odešli `currentWeather` do chatu / mapy | Stejné jako write |

**Broadcast body (discriminated union):**

```ts
// chat target
{ "target": "chat", "channelId": "string" }

// map target
{ "target": "map", "mapId": "string" }
```

- **chat** → vytvoří `ChatMessage` do cílového kanálu (formátovaný text: název + klíčové hodnoty + `narrativeText`)
- **map** → emituje Socket.io event `weather:updated` do room `world:{worldId}` s celým `WeatherResult`

---

## Autorizace

### `assertCanWrite(worldId, requester)` — pro POST/PUT/DELETE/generate/current/broadcast

```
if requester.role <= UserRole.Admin: return  // Admin/Superadmin shortcut
world = worldsRepo.findById(worldId)
if !world: throw 403 'Nedostatečná oprávnění'  // anti-leak
membership = membershipRepo.findByUserAndWorld(requester.id, worldId)
if !membership || membership.role < WorldRole.PomocnyPJ:
  throw 403 'Nedostatečná oprávnění'
```

### `assertMember(worldId, requester)` — pro GET endpointy

```
if requester.role <= UserRole.Admin: return
world = worldsRepo.findById(worldId)
if !world: throw 404 'Svět nenalezen'  // GET je auth-required, leak světa není kritický
membership = membershipRepo.findByUserAndWorld(requester.id, worldId)
if !membership: throw 403 'Nejsi členem'
if membership.role < WorldRole.Hrac: throw 403 'Pending členství'
```

---

## Generovací algoritmus (`POST /:id/generate`)

Pure function `generateWeather(config: WeatherGeneratorConfig): WeatherResult`. Žádná závislost na DB ani DI — testovatelné samostatně.

1. **Typ počasí** — vážená náhoda z `weatherTypes[].probability`
2. **Teplota** — náhoda v `[tempMin, tempMax]`, zaokrouhleno na 1 desetinné místo
3. **Oblačnost** — náhoda v `cloudRange` zvoleného type → textový popis:
   - 0/8 → "Jasno, obloha bez mraků"
   - 1–2/8 → "Skoro jasno"
   - 3–4/8 → "Polojasno"
   - 5–6/8 → "Oblačno"
   - 7/8 → "Převážně zataženo"
   - 8/8 → "Zataženo, obloha úplně zakrytá"
4. **Srážky** — náhoda v `precipRange` (mm/h) → textový popis:
   - 0 → "Beze srážek"
   - 0–2 → "Slabý déšť / sníh"
   - 2–10 → "Střední srážky"
   - >10 → "Silné srážky"
5. **Vítr** — náhoda v `[windMin, windMax]`, nárazy = `speed × windGustMultiplier`
6. **Tlak** — náhoda v `[pressureMin, pressureMax]`, trend dle hodnoty:
   - >1015 → "Stabilní"
   - 1000–1015 → "Mírný pokles"
   - <1000 → "Silný pokles"
7. **Vlhkost** — náhoda v `[humidityMin, humidityMax]`
8. **Custom fields** — pro každý `customField`: vážená náhoda dle `probability`; pokud hit → random z `possibleValues`, přidá se do `extras[]`
9. `isManual: false`, `generatedAt: now()`, `narrativeText: null`

**Determinismus testů:** Service utilizuje injectable `RandomProvider` (interface s `random(): number`); v testech mockovaný pro deterministic outputs.

---

## Seed při vytvoření světa

`POST /api/worlds` seeduje jeden defaultní generátor dle `world.genre`:

| Genre | Název | Config |
|-------|-------|--------|
| `fantasy`, `dark-fantasy`, `heroic-fantasy`, `sword-sorcery`, `grimdark`, `mytologicky` | "Výchozí prostředí" | tempMin: -5, tempMax: 30 (mírné klima) |
| `cyberpunk`, `sci-fi`, `hard-sci-fi`, `soft-sci-fi`, `biopunk` | "Výchozí prostředí" | tempMin: -60, tempMax: 60 (extrémní rozsahy, nulová vlhkost) |
| `space-opera`, `military` | "Výchozí prostředí" | tempMin: -100, tempMax: 50 (vesmírné prostředí) |
| `postapo`, `post-postapo`, `dieselpunk` | "Výchozí prostředí" | tempMin: -10, tempMax: 45 (drsné podmínky) |
| ostatní/neznámé | "Výchozí prostředí" | tempMin: 0, tempMax: 25 (neutrální) |

Každý seed má 4 weather typy (`clear` 40%, `cloudy` 30%, `rain` 20%, `storm` 10%) s rozumnými cloudRange/precipRange pro daný klimat. PJ může generátor smazat nebo libovolně upravit.

> Genre detection: stejný pattern jako `WorldCurrenciesService.seedForWorld()` v `world-currencies.service.ts:84` — sdílený set genre stringů.

---

## Validace (DTO + service)

| Pravidlo | Vrstva | Chyba |
|---|---|---|
| `name` 1..100 chars | DTO `@MaxLength(100)` | 400 |
| `tempMin <= tempMax` | Service | 422 |
| `windMin <= windMax`, `pressureMin <= pressureMax`, `humidityMin <= humidityMax` | Service | 422 |
| `windGustMultiplier >= 1.0` | DTO `@Min(1)` | 400 |
| `tempUnit ∈ {'C', 'F'}` | DTO `@IsIn` | 400 |
| `weatherTypes[].type ∈` enum | DTO `@IsIn` | 400 |
| `weatherTypes[].probability ∈ [0, 100]` | DTO `@Min(0) @Max(100)` | 400 |
| `weatherTypes[].probability` sum = 100 (±0.01) | Service | 422 |
| `cloudRange`, `precipRange` jsou tuples [min, max], min ≤ max | DTO `@IsArray` + service | 400/422 |
| `customFields[].possibleValues` non-empty | DTO `@ArrayMinSize(1)` | 400 |
| `customFields[].probability ∈ [0, 100]` | DTO | 400 |
| `humidityMin/Max ∈ [0, 100]` | DTO | 400 |
| Broadcast `target ∈ {'chat', 'map'}` | DTO `@IsIn` | 400 |
| Broadcast `chat` → `channelId` musí existovat ve světě | Service | 404 |
| Broadcast → `currentWeather` musí existovat | Service | 409 Conflict |
| `worldId`, `:id` neexistující | Service | 404 / 403 (anti-leak) |

---

## Závislosti

| Modul | Použití |
|-------|---------|
| `WorldsModule` | `IWorldsRepository`, `IWorldMembershipRepository` (auth) |
| `ChatModule` | broadcast `target: 'chat'` — vytvoří ChatMessage |
| Existující WebSocket gateway | broadcast `target: 'map'` — emit Socket.io event do `world:{worldId}` |

> **Pozn.:** Pokud `ChatModule` nebo gateway pro maps nejsou plně dostupné v době implementace, broadcast feature může být **odložena jako follow-up** (loguje warning, vrací 503). Spec nenařizuje plný broadcast hned.

---

## Testy

### `world-weather.utils.spec.ts` — pure logic (TDD)

- `generateWeather` s mockovaným `RandomProvider`:
  - Weather type: vážená náhoda správně volí dle probability
  - Temperature: v rozsahu `[tempMin, tempMax]`
  - Cloudiness mapping: 0/8 → "Jasno", 8/8 → "Zataženo, ..."
  - Precipitation mapping: 0 → "Beze srážek", >10 → "Silné srážky"
  - Wind gusts = speed × multiplier
  - Pressure trend mapping
  - Custom fields hit/miss dle probability

### `world-weather.service.spec.ts`

- CRUD autorizace (Admin/PomocnyPJ/Hrac/Korektor)
- Cross-world isolation (PJ světa W1 nesmí do W2)
- Anti-leak (neexistující svět → 403 write / 404 read)
- `weatherTypes` sum != 100 → 422
- `tempMin > tempMax` → 422
- Broadcast `currentWeather` neexistuje → 409
- Broadcast `chat` → cílový channel neexistuje → 404
- `seedForWorld(worldId, genre)` — vytvoří defaultní generator dle genre

### Co netestujeme

- Detail Socket.io emit handlingu (mockujeme gateway)
- Detail ChatMessage formátování (mockujeme ChatService)

---

## Architektura modulu

```
backend/src/modules/world-weather/
├── world-weather.module.ts
├── world-weather.controller.ts
├── world-weather.service.ts
├── world-weather.service.spec.ts
├── world-weather.utils.ts                    # pure functions
├── world-weather.utils.spec.ts
├── interfaces/
│   ├── weather-generator.interface.ts        # WeatherGenerator + Config + Result
│   └── weather-generator-repository.interface.ts
├── repositories/
│   └── weather-generator.repository.ts
├── schemas/
│   └── weather-generator.schema.ts
├── dto/
│   ├── create-weather-generator.dto.ts
│   ├── update-weather-generator.dto.ts
│   ├── set-current-weather.dto.ts
│   └── broadcast-weather.dto.ts
└── seed/
    └── world-weather.seed.ts                 # genre → default config mapping
```

Service injectuje:
- `'IWeatherGeneratorRepository'`
- `'IWorldMembershipRepository'`, `'IWorldsRepository'` (přes `WorldsModule`)
- `ChatService` (broadcast target=chat) — *volitelné podle dostupnosti*
- Maps gateway (broadcast target=map) — *volitelné*

Modul exportuje `WorldWeatherService` pro `WorldsService.create()` (auto-seed).

---

## Mimo scope

- **Historie počasí** (záznamy minulých `currentWeather` per generator)
- **Forecast** (předpověď budoucího počasí)
- **Sezónnost** (změny config dle ročního období) — vyžaduje `WorldCalendarConfig` integraci, mimo MVP
- **Auto-broadcast** při změně `currentWeather` (now je manuální `POST /:id/broadcast`)
- **Image attachments** v `WeatherResult` (frontend záležitost)
