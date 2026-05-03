# Návrh: Krok 7d — RPG System Presets

## Přehled

Systém presetů CharacterSheet šablon per RPG systém. Při vytvoření světa se `WorldSettings.diarySchema` auto-seedne dle `World.system`. Při změně systému se stará verze archivuje do samostatné kolekce, nová se naseeduje z presetu. Hráči mají přístup k historickým verzím schématu aby mohli vyplňovat `diaryData` dle starého layoutu.

---

## Datový model

### SystemPreset (statický TypeScript soubor per systém)

```typescript
interface SystemPreset {
  system: string        // unikátní identifikátor, např. "dnd5e", "drd-hero"
  displayName: string   // zobrazovaný název, např. "D&D 5e", "DrD Hero"
  schema: SchemaBlock[] // kopíruje se do WorldSettings.diarySchema při aplikaci
}
```

Jeden soubor per systém v `src/modules/system-presets/presets/`. Přidání nového presetu = nový soubor + registrace v rejstříku. Žádná migrace DB.

### DiarySchemaVersion (nová MongoDB kolekce)

```typescript
interface DiarySchemaVersion {
  id: string
  worldId: string
  version: number       // auto-increment per world (1, 2, 3...)
  system: string        // systém který byl aktivní v době archivace
  schema: SchemaBlock[] // archivovaná kopie schématu
  archivedAt: Date
}
```

### Co se nemění

- `WorldSettings.diarySchema: SchemaBlock[]` — aktuální/aktivní schéma (již existuje)
- `Character.diaryData: Record<string, unknown>` — klíče starých bloků přetrvávají; hráč je vyplňuje přes historické schéma

---

## Podporované systémy

| Soubor | system | displayName |
|--------|--------|-------------|
| `dnd5e.preset.ts` | `dnd5e` | D&D 5e |
| `dnd2e.preset.ts` | `dnd2e` | D&D 2e |
| `dnd3plus.preset.ts` | `dnd3plus` | D&D 3+ |
| `drd-hero.preset.ts` | `drd-hero` | DrD Hero |
| `drd16-alchemy.preset.ts` | `drd16-alchemy` | DrD 16 — Alchymista |
| `drd16-ranger.preset.ts` | `drd16-ranger` | DrD 16 — Hraničář |
| `drd16-thief.preset.ts` | `drd16-thief` | DrD 16 — Zloděj |
| `drd16-warrior.preset.ts` | `drd16-warrior` | DrD 16 — Bojovník |
| `drd16-wizard.preset.ts` | `drd16-wizard` | DrD 16 — Čaroděj |
| `gurps.preset.ts` | `gurps` | GURPS |
| `call-of-cthulhu.preset.ts` | `call-of-cthulhu` | Call of Cthulhu |
| `fate.preset.ts` | `fate` | Fate |
| `shadowrun.preset.ts` | `shadowrun` | Shadowrun |
| `jad.preset.ts` | `jad` | Jad |
| `pi.preset.ts` | `pi` | Pi |
| `matrix-custom.preset.ts` | `matrix-custom` | Matrix custom |

Seznam je rozšiřitelný — nový preset = nový soubor + registrace.

---

## API endpointy

### SystemPresetsModule (nový)

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/system-presets` | bez JWT | Seznam všech systémů (`system` + `displayName`) |
| `GET` | `/api/system-presets/:system` | bez JWT | Detail presetu — plné `SchemaBlock[]` |

### DiarySchemaVersions (přidáno do WorldsModule)

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/worlds/:worldId/diary-schema-versions` | JWT, min. Player | Seznam verzí bez `schema[]` (jen meta: version, system, archivedAt) |
| `GET` | `/api/worlds/:worldId/diary-schema-versions/:version` | JWT, min. Player | Konkrétní verze s plným `schema[]` |

### Rozšíření stávajících endpointů

**POST /api/worlds** — pokud `system` odpovídá presetu → naseeduje `WorldSettings.diarySchema`; pokud preset neexistuje → `diarySchema = []`

**PATCH /api/worlds/:id** — pokud se mění `system`:
1. Archivuje aktuální `diarySchema` jako nový `DiarySchemaVersion`
2. Naseeduje novou `diarySchema` z presetu (nebo `[]` pokud preset neexistuje)

Archivace proběhne pouze pokud aktuální `diarySchema.length > 0`.

---

## Architektura modulu

### SystemPresetsModule

```
src/modules/system-presets/
  presets/
    dnd5e.preset.ts
    dnd2e.preset.ts
    dnd3plus.preset.ts
    drd-hero.preset.ts
    drd16-alchemy.preset.ts
    drd16-ranger.preset.ts
    drd16-thief.preset.ts
    drd16-warrior.preset.ts
    drd16-wizard.preset.ts
    gurps.preset.ts
    call-of-cthulhu.preset.ts
    fate.preset.ts
    shadowrun.preset.ts
    jad.preset.ts
    pi.preset.ts
    matrix-custom.preset.ts
    index.ts              // exportuje SYSTEM_PRESETS: SystemPreset[]
  interfaces/
    system-preset.interface.ts
  system-presets.service.ts
  system-presets.controller.ts
  system-presets.module.ts  // @Global() — dostupný v WorldsModule bez importu
```

### DiarySchemaVersions (uvnitř WorldsModule)

```
src/modules/worlds/
  diary-schema-versions/
    diary-schema-version.interface.ts
    diary-schema-versions-repository.interface.ts
    diary-schema-versions.repository.ts
    diary-schema-versions.schema.ts
```

`WorldsService` rozšíří o injekci `SystemPresetsService` + `IDiarySchemaVersionsRepository`. Žádné cyklické závislosti.

---

## Logika flows

### Vytvoření světa

```
POST /api/worlds { system: "dnd5e", ... }
  → WorldsService.create()
  → SystemPresetsService.findOne("dnd5e") → preset nebo null
  → WorldSettings seed: diarySchema = preset?.schema ?? []
```

### Změna systému

```
PATCH /api/worlds/:id { system: "drd-hero" }
  → WorldsService.update()
  → Načti aktuální WorldSettings
  → Pokud diarySchema.length > 0:
      version = poslední version pro worldId + 1 (nebo 1 pokud žádná)
      DiarySchemaVersionsRepo.create({ worldId, version, system: starý, schema: starý, archivedAt: now })
  → SystemPresetsService.findOne("drd-hero") → preset nebo null
  → WorldSettings update: diarySchema = preset?.schema ?? []
```

### Hráč a historické verze

Hráč načte `GET /api/worlds/:worldId/diary-schema-versions` → vidí seznam verzí. Pro konkrétní verzi zavolá `GET .../diary-schema-versions/1` → dostane `schema[]` → frontend renderuje staré bloky a hráč vyplňuje `Character.diaryData` (klíče starých bloků tam stále jsou).

---

## Testování

### SystemPresetsService

- `findAll()` → vrátí pole objektů `{ system, displayName }` pro všechny registrované presety
- `findOne("dnd5e")` → vrátí správný preset s `schema[]`
- `findOne("neexistujici")` → vrátí `null`

### WorldsService (nové testy)

- Vytvoření světa se známým `system` → `diarySchema` naseedována z presetu
- Vytvoření světa s neznámým `system` → `diarySchema = []`
- PATCH se změnou `system` (neprázdné stávající schéma) → archivace + nová seed
- PATCH se změnou `system` (prázdné stávající schéma) → žádná archivace + nová seed
- PATCH se změnou `system` na neznámý → archivace + `diarySchema = []`

### Co netestujeme

- Obsah konkrétních presetů (SchemaBlock hodnoty) — odpovědnost PJ/designu
- Frontend rendering historických verzí

---

## Závislosti

| Závisí na | Proč |
|-----------|------|
| Krok 7a Characters | `SchemaBlock` interface; `diaryData` na Character |
| Krok 6 WorldSettings | `diarySchema` pole již existuje |
| Krok 2 Worlds | rozšiřujeme `create` a `update` flow |
