# Krok 7d — RPG System Presets: Design Spec

**Datum vzniku:** 2026-05-03
**Aktualizováno:** 2026-05-06 (revize během brainstormingu Fáze 3.4)
**Stav:** Schváleno (po revizi)

---

## Přehled

Systém presetů `CharacterSheet` šablon per RPG systém. Při vytvoření světa se `WorldSettings.diarySchema` auto-seedne dle `World.system`. Při změně systému se stará verze archivuje do samostatné kolekce, nová se naseeduje z presetu. Hráči mají přístup k historickým verzím schématu, aby mohli vyplňovat `diaryData` dle starého layoutu.

**Path API:** `/api/system-presets`, `/api/worlds/:worldId/diary-schema-versions`
**Moduly:**
- `backend/src/modules/system-presets/` (nový)
- Rozšíření `backend/src/modules/worlds/` (`DiarySchemaVersion` subsoubory + service rozšíření)

---

## Rozdíly proti původní verzi (2026-05-03)

| Téma | Verze 2026-05-03 | Verze 2026-05-06 (aktuální) | Důvod |
|---|---|---|---|
| **Auth pro DiarySchemaVersions GET** | "JWT, min. Player" | `WorldRole ≥ Hrac` (member) + Admin/Superadmin shortcut + anti-leak (`assertMember` pattern) | Konzistence s Timeline (Fáze 3.2) — stejný pattern |
| **DTO validace** | Bez class-validator dekorátorů | Plná class-validator validace na všech vstupech | `whitelist: true` v ValidationPipe by stripoval pole; bez validace HTTP layer není chráněn |
| **`@Global()` SystemPresetsModule** | Spec navrhoval `@Global()` | **Bez `@Global()`** — standardní import do `WorldsModule` a `AppModule` | Žádný jiný modul v projektu není `@Global()`; explicit import je čitelnější |
| **Detail presetů** | "Obsah je odpovědnost PJ/designu" (minimal scaffold) | **Detailní per-RPG presety** s 15-25 RPG-specifickými bloky každý | User decision (Fáze 3.4 brainstorming) — chceme "ready to use" pro hráče, ne jen kostru |
| **Anti-leak (write/admin)** | Implicitní | Explicitní `403` pro neexistující svět při PATCH se změnou systému | Konzistence s WorldNews/Timeline pattern |

---

## Datový model

### SystemPreset (statický TypeScript soubor per systém)

```typescript
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface SystemPreset {
  system: string;        // unikátní identifikátor, např. "dnd5e"
  displayName: string;   // "D&D 5e"
  schema: SchemaBlock[]; // RPG-specifické bloky (15-25 položek)
}
```

`SchemaBlock` je již existující ([characters/interfaces/character.interface.ts:10](../../../backend/src/modules/characters/interfaces/character.interface.ts#L10)):
```typescript
interface SchemaBlock {
  key: string;           // unikátní klíč, např. "level", "hp"
  label: string;         // zobrazované jméno, např. "Úroveň", "Životy"
  type: string;          // "text" | "number" | "textarea" | "select" | atd.
  config?: Record<string, unknown>;  // extra config (např. select options)
  order: number;         // pořadí zobrazení
}
```

### DiarySchemaVersion (nová Mongo kolekce `diary_schema_versions`)

```typescript
@Schema({ timestamps: false, collection: 'diary_schema_versions' })
export class DiarySchemaVersionSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true, min: 1 }) version: number;  // auto-increment per world
  @Prop({ required: true }) system: string;            // systém aktivní v době archivace
  @Prop({ type: [Object], default: [] })
  schema: Record<string, unknown>[];                   // archivovaná kopie SchemaBlock[]
  @Prop({ required: true, default: () => new Date() })
  archivedAt: Date;
}

// index: { worldId: 1, version: -1 }
// unique compound: { worldId: 1, version: 1 }
```

### Co se nemění

- `WorldSettings.diarySchema: SchemaBlock[]` — aktuální schéma (existuje)
- `Character.diaryData: Record<string, unknown>` — klíče starých bloků přetrvávají

---

## Podporované systémy (16) — detailní obsah

| Soubor | system | displayName | Bloky (přibližně) |
|--------|--------|-------------|-------------------|
| `dnd5e.preset.ts` | `dnd5e` | D&D 5e | ~25: Level, Class, Subclass, Race, Background, Alignment, HP, AC, Speed, Initiative, 6 ability scores (STR/DEX/CON/INT/WIS/CHA), proficiency bonus, 6 saves, 18 skills, hit dice, languages, equipment, spells |
| `dnd2e.preset.ts` | `dnd2e` | D&D 2e | ~20: Level, Class, Race, Alignment, HP, AC (descending!), THAC0, Hit Dice, 6 saves (Paralyze/Death, Rod/Staff, Petrification, Breath, Spell), 6 ability scores, Languages, Equipment |
| `dnd3plus.preset.ts` | `dnd3plus` | D&D 3+ (3e/3.5e/Pathfinder) | ~22: Level, Class, Race, Alignment, HP, AC (touch/flatfooted), BAB, 3 saves (Fort/Ref/Will), 6 ability scores, Skill points, Feats, Languages, Equipment |
| `drd-hero.preset.ts` | `drd-hero` | DrD Hero | ~18: Úroveň, Povolání, Rasa, Charakteristiky (Síla, Obratnost, Odolnost, Inteligence, Charisma, Bystrost), Životy, Magenergie, Útok, Obrana, Dovednosti, Zkušenosti, Vybavení |
| `drd16-warrior.preset.ts` | `drd16-warrior` | DrD 16 — Bojovník | ~17: Úroveň, Rasa, atributy (DrD16 set), Životy, Únava, Bojové styly, Zbraňová specializace, Vybavení, Výzkum, Cesta hrdiny |
| `drd16-wizard.preset.ts` | `drd16-wizard` | DrD 16 — Čaroděj | ~17: + Magenergie, Sféra, Naučená kouzla, Komponenty |
| `drd16-thief.preset.ts` | `drd16-thief` | DrD 16 — Zloděj | ~17: + Zlodějské dovednosti, Skrýše |
| `drd16-ranger.preset.ts` | `drd16-ranger` | DrD 16 — Hraničář | ~17: + Lovecké dovednosti, Stopování, Společník |
| `drd16-alchemy.preset.ts` | `drd16-alchemy` | DrD 16 — Alchymista | ~17: + Receptury, Komponenty, Laboratoř |
| `gurps.preset.ts` | `gurps` | GURPS | ~20: Points (total/spent), 4 attributes (ST/DX/IQ/HT), HP, FP, Will, Per, Speed, Move, Advantages, Disadvantages, Quirks, Skills, Languages, Equipment |
| `call-of-cthulhu.preset.ts` | `call-of-cthulhu` | Call of Cthulhu (7e) | ~22: Occupation, 8 characteristics (STR/CON/SIZ/DEX/APP/INT/POW/EDU), HP, MP, Sanity, Luck, Move, Build, Damage Bonus, Skills (Occupation/Personal), Backstory, Equipment |
| `fate.preset.ts` | `fate` | Fate Core | ~12: High Concept, Trouble, 3 Aspects, Refresh, Skills (Pyramid), Stunts, Stress (Physical/Mental), Consequences (Mild/Moderate/Severe), Extras |
| `shadowrun.preset.ts` | `shadowrun` | Shadowrun (5e/6e) | ~22: Metatype, 8 attributes (Body/Agility/Reaction/Strength/Willpower/Logic/Intuition/Charisma), Edge, Essence, Initiative, Limits (Physical/Mental/Social), Skills, Qualities, Magic/Resonance, Cyberware, Lifestyle |
| `jad.preset.ts` | `jad` | Jad | ~12: Generické bloky (Úroveň, Atributy, Životy, Dovednosti, Vybavení) — Jad je domain-specific systém, presety jsou minimal scaffold s poznámkou že PJ doplní |
| `pi.preset.ts` | `pi` | Pi | ~12: Generické bloky stejně jako Jad |
| `matrix-custom.preset.ts` | `matrix-custom` | Matrix custom | ~10: Velmi obecné placeholder bloky pro custom kampaně — Jméno, Rasa, Atributy (custom), Inventory, Notes |

**Pravidlo pro každý preset:** RPG-specifické fieldy mají správné `key` (lowercase, bez diakritiky, např. `level`, `hpCurrent`, `hpMax`), `label` v češtině s diakritikou (např. `Úroveň`, `Životy`), realistický `type` (`number` pro číselné, `text` pro krátký text, `textarea` pro popis, `select` s `config.options` pro enum). `order` je vzestupný od 1.

**Co testujeme:** existence presetu, struktura (každý má `system/displayName/schema`), `findOne` vrací správný preset.
**Co netestujeme:** přesný obsah `schema[]` jednotlivých presetů — RPG referenční hodnoty se mohou lišit dle edition; PJ může editovat přes existující `PUT /api/worlds/:id/settings` endpoint.

---

## API endpointy

### SystemPresetsModule (nový)

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/system-presets` | bez JWT | Seznam všech systémů (`system` + `displayName`, **bez `schema[]`** — úspora bandwidth) |
| `GET` | `/api/system-presets/:system` | bez JWT | Detail presetu — plné `SchemaBlock[]` |

**Anonymní GET** — presety jsou veřejné (žádný citlivý content; frontend si je může lazy načítat při výběru systému).

### DiarySchemaVersions (přidáno do WorldsModule)

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/worlds/:worldId/diary-schema-versions` | JWT + member světa (`≥ Hrac`) | Seznam verzí **bez `schema[]`** (jen `version`, `system`, `archivedAt`) |
| `GET` | `/api/worlds/:worldId/diary-schema-versions/:version` | JWT + member světa | Konkrétní verze s plným `schema[]` |

**Auth pattern (konzistence s Timeline):**
- `assertMember(worldId, requester)` — Admin/Superadmin shortcut, jinak `WorldRole ≥ Hrac`
- Neexistující svět → 404 (auth-required, leak světa není kritický)
- Member, ale verze neexistuje → 404 (běžný not-found)

### Rozšíření stávajících endpointů

**`POST /api/worlds`** — pokud `system` odpovídá presetu → naseeduje `WorldSettings.diarySchema`; pokud preset neexistuje (např. `system: "matrix"`) → `diarySchema = []`.

**`PATCH /api/worlds/:id`** (existující endpoint, žádná nová HTTP cesta) — pokud se mění `system`:
1. Načti aktuální `WorldSettings`
2. Pokud `diarySchema.length > 0` → archivuj jako nový `DiarySchemaVersion` (next version per worldId)
3. Naseeduj novou `diarySchema` z presetu (nebo `[]` pokud preset neexistuje)

Archivace neproběhne pokud `diarySchema` je prázdná — aby se nevytvářely zbytečné `version: 1, schema: []` záznamy.

---

## Architektura modulu

### SystemPresetsModule

```
backend/src/modules/system-presets/
├── system-presets.module.ts
├── system-presets.controller.ts
├── system-presets.service.ts
├── system-presets.service.spec.ts
├── interfaces/
│   └── system-preset.interface.ts
└── presets/
    ├── index.ts                    # exportuje SYSTEM_PRESETS: SystemPreset[]
    ├── dnd5e.preset.ts
    ├── dnd2e.preset.ts
    ├── dnd3plus.preset.ts
    ├── drd-hero.preset.ts
    ├── drd16-warrior.preset.ts
    ├── drd16-wizard.preset.ts
    ├── drd16-thief.preset.ts
    ├── drd16-ranger.preset.ts
    ├── drd16-alchemy.preset.ts
    ├── gurps.preset.ts
    ├── call-of-cthulhu.preset.ts
    ├── fate.preset.ts
    ├── shadowrun.preset.ts
    ├── jad.preset.ts
    ├── pi.preset.ts
    └── matrix-custom.preset.ts
```

`SystemPresetsModule` exportuje `SystemPresetsService` pro `WorldsModule` import. Není `@Global()` — standardní explicit import.

### DiarySchemaVersions (subsložka WorldsModule)

```
backend/src/modules/worlds/diary-schema-versions/
├── diary-schema-version.interface.ts
├── diary-schema-versions-repository.interface.ts
├── diary-schema-versions.repository.ts
└── diary-schema-versions.schema.ts
```

`WorldsService` rozšíří constructor o injekci `SystemPresetsService` + `IDiarySchemaVersionsRepository`. Žádné cyklické závislosti (SystemPresetsModule nezávisí na WorldsModule).

`WorldsController` dostane 2 nové GET endpointy s `@UseGuards(JwtAuthGuard)`.

---

## Logika flows

### Vytvoření světa

```
POST /api/worlds { system: "dnd5e", ... }
  → WorldsService.create()
  → SystemPresetsService.findOne("dnd5e") → preset nebo null
  → WorldSettings init: diarySchema = preset?.schema ?? []
  → save World + WorldSettings + WorldMembership (jako dosud)
```

> Implementační detail: `WorldSettings` se zatím vytváří on-demand v `updateSettings()`. Pro auto-seed při create musíme:
>   - (a) vytvořit `WorldSettings` v `WorldsService.create()` — preferováno (deterministic)
>   - (b) lazy-init při prvním read s seed logikou — fragile
> **Spec volí (a).** Existující `IWorldSettingsRepository` by měl být schopen `save()` ihned po `worlds.save()`.

### Změna systému

```
PATCH /api/worlds/:id { system: "drd-hero" }
  → WorldsService.update() (existující, rozšířené)
  → existing = findById(:id)
  → if dto.system && dto.system !== existing.system:
      → settings = await worldSettingsRepo.findByWorldId(:id)
      → if settings && settings.diarySchema.length > 0:
          → version = (await diarySchemaVersionsRepo.findLastVersion(:id)) + 1 (nebo 1)
          → diarySchemaVersionsRepo.create({
              worldId: :id, version, system: existing.system,
              schema: settings.diarySchema, archivedAt: new Date()
            })
      → preset = systemPresetsService.findOne(dto.system)
      → worldSettingsRepo.upsert(:id, { diarySchema: preset?.schema ?? [] })
  → standardní worlds update (dosavadní logika)
```

### Hráč a historické verze

```
GET /api/worlds/:worldId/diary-schema-versions  (member)
  → assertMember (worldId, requester)
  → diarySchemaVersionsRepo.findByWorldId (worldId, { selectSchema: false })
  → vrátí pole { version, system, archivedAt }

GET /api/worlds/:worldId/diary-schema-versions/:version
  → assertMember
  → diarySchemaVersionsRepo.findByWorldIdAndVersion (worldId, version)
  → vrátí celý DiarySchemaVersion vč. schema[]
  → 404 pokud verze neexistuje pro daný worldId
```

---

## Validace

| Pravidlo | Vrstva | Chyba |
|---|---|---|
| `version` v URL je integer ≥ 1 | controller `@Param` + class-validator | 400 |
| `system` v URL existuje | service (`findOne` vrátí null) | 404 |
| `worldId` neexistující (GET versions) | service `assertMember` | 404 |
| Non-member žádá versions | service `assertMember` | 403 |
| `:version` neexistuje pro daný `worldId` | repository → service | 404 |

---

## Testy

### `system-presets.service.spec.ts`

- `findAll()` → vrátí pole 16 objektů `{ system, displayName }` (bez `schema[]`)
- `findOne("dnd5e")` → vrátí kompletní preset včetně `schema[]`
- `findOne("dnd5e").schema` → není prázdné (sanity check, ~25 bloků)
- `findOne("neexistujici")` → vrátí `null`
- Každý preset v `SYSTEM_PRESETS`: má `system` + `displayName` + neprázdný `schema`
- Žádné dva presety nemají stejný `system` (uniqueness)
- Každý `SchemaBlock` má povinné `key`, `label`, `type`, `order`

### `diary-schema-versions.repository.spec.ts` (volitelné)

- `findLastVersion("worldX")` → vrátí 0 pro neexistující world
- `findLastVersion` po insertu version=1, version=2 → vrátí 2

### `worlds.service.spec.ts` (rozšíření existujících)

- Vytvoření světa se známým `system="dnd5e"` → `WorldSettings.diarySchema` naseedována (mock `SystemPresetsService.findOne`)
- Vytvoření světa s neznámým `system="custom"` (žádný preset) → `WorldSettings.diarySchema = []`
- PATCH se změnou `system` (neprázdné stávající schéma) → `DiarySchemaVersionsRepository.create` voláno, pak `WorldSettings.upsert` s novým schématem
- PATCH se změnou `system` (prázdné stávající schéma) → repository.create **NEvoláno**, jen upsert
- PATCH bez změny `system` → ani archivace, ani re-seed
- PATCH se změnou `system` na neznámý → archivace + `diarySchema = []`

### `worlds.controller.spec.ts` nebo e2e (versions endpoints)

- `GET /api/worlds/:id/diary-schema-versions` jako member → 200, pole bez `schema[]`
- jako non-member → 403
- jako anon → 401
- neexistující svět → 404
- `GET /:version` neexistující → 404

---

## Závislosti

| Závisí na | Proč |
|-----------|------|
| Krok 7a Characters (existující) | `SchemaBlock` interface |
| Krok 6 WorldSettings (existující) | `diarySchema` pole |
| Krok 2 Worlds (existující) | rozšiřujeme `create` a `update` flow |

---

## Mimo scope

- **Validace `schema[]` při manuálním PUT `/api/worlds/:id/settings`** — PJ může editovat schema; spec neřeší per-block validaci
- **Migrace `Character.diaryData`** při změně systému — klíče starých bloků přetrvávají, frontend používá historickou verzi pro renderování
- **Pojmenované verze** (např. "Pre-DrD switch") — verze jsou jen číslo
- **Diff mezi verzemi** — frontend funkce, mimo backend
- **Seznam podporovaných typů `SchemaBlock.type`** — netvrdíme strict enum; frontend renderer rozhoduje (text/number/textarea/select/...)
