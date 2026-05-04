# Krok 10f — WorldWeather: Design Spec

**Datum:** 2026-05-04  
**Stav:** Schváleno

---

## Přehled

Modul pro správu a generování počasí per world. PJ může vytvořit více generátorů počasí (per planeta, sféra, region), každý s vlastní konfigurací. Generátor produkuje `WeatherResult` který se uloží jako `currentWeather` — PJ jej pak může odeslat do chat kanálu nebo taktické mapy.

Tři módy pro PJ:
1. **Automatické generování** — `POST /:id/generate` vygeneruje výsledek z config parametrů
2. **Ruční nastavení** — `PUT /:id/current` PJ zadá hodnoty sám
3. **Broadcast** — `POST /:id/broadcast` odešle `currentWeather` do chatu nebo mapy

---

## Datový model

### Kolekce `world_weather_generators`

Více dokumentů per world (n:1 přes `worldId`).

```
WeatherGenerator {
  id: string
  worldId: string
  name: string              // "Albánie", "Měsíc Alpha", "Sféra Stínů"
  description?: string

  config: WeatherGeneratorConfig
  currentWeather?: WeatherResult   // výsledek posledního generate nebo ručního nastavení

  createdAt: Date
  updatedAt: Date
}
```

### WeatherGeneratorConfig

```
WeatherGeneratorConfig {
  tempMin: number
  tempMax: number
  tempUnit: 'C' | 'F'           // default 'C'

  weatherTypes: WeatherTypeEntry[]
  // Součet všech probability musí být 100 (validováno při PUT).
  // Každý entry:
  // {
  //   type: 'clear'|'cloudy'|'rain'|'storm'|'snow'|'fog'|'custom'
  //   label: string             // "ZATAŽENO", "BOUŘKA", "ÉTERICKÁ BOUŘE"
  //   icon: string              // client-side enum key
  //   probability: number       // 0–100
  //   cloudRange: [number, number]   // 0–8 (osminy oblačnosti)
  //   precipRange: [number, number]  // mm/h
  // }

  windMin: number               // km/h
  windMax: number
  windGustMultiplier: number    // násobitel pro nárazy, default 2.0

  pressureMin: number           // hPa
  pressureMax: number
  humidityMin: number           // %
  humidityMax: number

  customFields: CustomFieldConfig[]
  // Volitelná pole — magické anomálie, radiace, éterické jevy atd.
  // Každý entry:
  // {
  //   label: string             // "Magická anomálie", "Radiační úroveň"
  //   possibleValues: string[]  // ["Přítomna", "Silná", "Nepřítomna"]
  //   probability: number       // 0–100, šance na výskyt při generování
  // }
}
```

### WeatherResult

```
WeatherResult {
  generatedAt: Date
  isManual: boolean             // true = PJ nastavil ručně, false = generováno

  temperature: number           // zaokrouhleno na 1 desetinné místo
  tempUnit: string              // 'C' | 'F'
  weatherType: string           // label: "ZATAŽENO", "BOUŘKA"
  weatherIcon: string           // type key: clear/cloudy/rain/storm/snow/fog/custom

  cloudiness: {
    value: string               // "8/8 Zataženo"
    description: string         // "Obloha úplně zakrytá"
  }
  precipitation: {
    value: string               // "Beze srážek", "Slabý déšť"
    description: string
  }
  wind: {
    speed: number               // km/h
    gusts: number               // km/h
    unit: 'kmh'
  }
  pressure: {
    value: number               // hPa
    trend: string               // "Stabilní", "Mírný pokles", "Silný pokles", "Nárůst"
  }
  humidity: number              // %

  extras: {
    label: string               // "Magická anomálie"
    value: string               // "Přítomna"
    description?: string
  }[]

  narrativeText?: string        // volitelný narativní popis pro broadcast do chatu
}
```

---

## API endpointy

Prefix: `/api/worlds/:worldId/weather-generators`

### CRUD generátorů

| Metoda | URL | Popis | Auth |
|--------|-----|-------|------|
| GET | `/` | Seznam generátorů světa (včetně `currentWeather`) | člen světa |
| GET | `/:id` | Detail generátoru | člen světa |
| POST | `/` | Vytvoř generátor | PJ, Admin |
| PUT | `/:id` | Aktualizuj config a metadata | PJ, Admin |
| DELETE | `/:id` | Smaž generátor | PJ, Admin |

### Generování & ruční nastavení

| Metoda | URL | Popis | Auth |
|--------|-----|-------|------|
| POST | `/:id/generate` | Vygeneruj počasí z config, uloží do `currentWeather` | PJ, Admin |
| PUT | `/:id/current` | Ručně nastav `currentWeather` | PJ, Admin |

### Broadcast

| Metoda | URL | Popis | Auth |
|--------|-----|-------|------|
| POST | `/:id/broadcast` | Odešli `currentWeather` do chatu nebo mapy | PJ, Admin |

**Broadcast body:**
```json
{ "target": "chat", "channelId": "string" }
// nebo
{ "target": "map", "mapId": "string" }
```

- **chat** → vytvoří `ChatMessage` do cílového kanálu s formátovaným textem (název generátoru + klíčové hodnoty + `narrativeText`)
- **map** → emituje Socket.io event `weather:updated` do room `world:{worldId}` s celým `WeatherResult`

---

## Generovací algoritmus (`POST /:id/generate`)

Algoritmus zpracovává config sekvenčně:

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
6. **Tlak** — náhoda v `[pressureMin, pressureMax]`, trend:
   - >1015 → "Stabilní"
   - 1000–1015 → "Mírný pokles"
   - <1000 → "Silný pokles"
   - (při ručním opakování: trend porovnán s předchozí hodnotou)
7. **Vlhkost** — náhoda v `[humidityMin, humidityMax]`
8. **Custom fields** — pro každý `customField`: náhoda dle `probability`; pokud hit → random z `possibleValues`, přidej do `extras[]`
9. `isManual: false`, `generatedAt: now()`, `narrativeText: null`

---

## Seed při vytvoření světa

`POST /api/worlds` seeduje jeden defaultní generátor dle `world.genre`:

| Genre | Název | Config |
|-------|-------|--------|
| fantasy | "Výchozí prostředí" | tempMin: -5, tempMax: 30, mírné klima |
| sci-fi | "Výchozí prostředí" | tempMin: -60, tempMax: 60, extrémní rozsahy, nulová vlhkost |
| ostatní | "Výchozí prostředí" | tempMin: 0, tempMax: 25, neutrální |

PJ může generátor smazat nebo libovolně upravit.

---

## Validace

- `weatherTypes[].probability` součet musí být přesně 100 → 422 Unprocessable Entity
- `tempMin ≤ tempMax`, `windMin ≤ windMax`, `pressureMin ≤ pressureMax`, `humidityMin ≤ humidityMax` → 422
- `windGustMultiplier` musí být ≥ 1.0 → 422
- `POST /:id/broadcast` s `target: 'chat'` → `channelId` musí existovat v daném světě → 404 jinak
- `POST /:id/broadcast` → `currentWeather` musí existovat → 409 Conflict jinak
- `PUT /:id/current` → všechna povinná pole `WeatherResult` musí být přítomna → 422

---

## Přístupová pravidla

| Operace | Minimální role |
|---------|----------------|
| GET seznam / detail | člen světa |
| POST / PUT / DELETE generátor | PJ nebo Admin |
| POST generate | PJ nebo Admin |
| PUT current | PJ nebo Admin |
| POST broadcast | PJ nebo Admin |
