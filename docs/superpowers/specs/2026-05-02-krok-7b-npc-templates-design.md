# Návrh: Krok 7b — NPC Templates

## Přehled

Znovupoužitelné šablony NPC pro PJ — předlohy pro instanciaci nepřátel a NPC v taktické mapě (Krok 8). Každá šablona je per-world a obsahuje fixní combat stats (pro MapToken kompatibilitu) i volný `diarySchema` pro systém-specifické bloky (Fate aspekty, D&D save throws, Matrix stav...).

---

## Datový model

### NpcTemplate schema

```typescript
@Schema({ timestamps: true, collection: 'npcTemplates' })
NpcTemplateSchemaClass {
  worldId:     string                       // per-world izolace
  name:        string                       // název šablony
  imageUrl?:   string                       // URL obrázku NPC
  notes:       string                       // poznámky PJ; default ""

  // Fixní combat stats — Krok 8 MapToken je zdědí jako baseHp/baseArmor/injury
  maxHp:       number                       // default 5
  armor:       number                       // default 0
  injury:      number                       // default 0

  // Fixní schopnosti
  abilities:   TagValue[]                   // [{ label: "Útok mečem", value: "3d6" }, ...]

  // Systém-specifický stat block (Fate aspekty, sekvenční konflikty atd.)
  diarySchema: SchemaBlock[]                // definuje PJ; volný JSON, backend neinterpretuje
  diaryData:   Record<string, unknown>      // defaultní hodnoty; MapToken je zdědí při instanciaci
}
```

Index: `{ worldId: 1 }` — všechny dotazy jsou per-world.

### Sdílené typy

`SchemaBlock` je importován z `character.interface.ts`.

`TagValue` má stejnou strukturu jako existující `InfoBlock { label, value }` v `character.interface.ts`. Přidáme `TagValue` jako type alias vedle `InfoBlock`:

```typescript
// přidáme do character.interface.ts
export type TagValue = InfoBlock  // { label: string; value: string }
```

`SchemaBlock` je již definován v `character.interface.ts` — žádné duplicity.

```typescript
interface SchemaBlock {
  key:     string
  label:   string
  type:    string
  config?: Record<string, unknown>
  order:   number
}
```

### NpcTemplate interface

```typescript
interface NpcTemplate {
  id:          string
  worldId:     string
  name:        string
  imageUrl?:   string
  notes:       string
  maxHp:       number
  armor:       number
  injury:      number
  abilities:   TagValue[]
  diarySchema: SchemaBlock[]
  diaryData:   Record<string, unknown>
  createdAt:   Date
  updatedAt:   Date
}
```

---

## API endpointy

Základní cesta: `/api/worlds/:worldId/npc-templates`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/` | bez JWT | Všechny šablony daného světa |
| `GET` | `/:id` | bez JWT | Jedna šablona dle MongoDB ObjectId; 404 pokud neexistuje nebo jiný world |
| `POST` | `/` | JWT; PJ+ nebo Admin | Vytvoř šablonu |
| `PUT` | `/:id` | JWT; PJ+ nebo Admin | Přepíše celou šablonu (full replace) |
| `DELETE` | `/:id` | JWT; PJ+ nebo Admin | Smaž šablonu |

### Poznámky

- `worldId` se vždy bere z URL parametru — controller ho injectuje do DTO, nikdy z těla requestu
- GET endpointy jsou veřejné (konzistentní s `/characters/directory`)
- Žádný PATCH — šablona se vždy přepisuje celá (frontend posílá kompletní objekt)
- PUT ověří že šablona patří danému `worldId` před přepsáním; 404 jinak

---

## Architektura modulu

Vzor identický s Characters modulem (repository pattern, interface-first).

```
modules/npc-templates/
  npc-templates.module.ts
  npc-templates.controller.ts
  npc-templates.service.ts
  npc-templates.service.spec.ts
  schemas/
    npc-template.schema.ts
  interfaces/
    npc-template.interface.ts
    npc-templates-repository.interface.ts
  repositories/
    npc-templates.repository.ts
  dto/
    create-npc-template.dto.ts
    update-npc-template.dto.ts
```

### INpcTemplatesRepository

```typescript
interface INpcTemplatesRepository {
  findByWorld(worldId: string): Promise<NpcTemplate[]>
  findById(id: string): Promise<NpcTemplate | null>
  create(data: CreateNpcTemplateDto & { worldId: string }): Promise<NpcTemplate>
  update(id: string, worldId: string, data: UpdateNpcTemplateDto): Promise<NpcTemplate | null>
  delete(id: string, worldId: string): Promise<boolean>
}
```

`worldId` je součástí `update` a `delete` signatury — repository ověří shodu, vrátí null/false pokud neshoda.

---

## Access control

| Operace | Kdo může |
|---------|----------|
| GET všechny / GET /:id | kdokoliv (bez JWT) |
| POST | JWT; WorldRole.PJ nebo vyšší, nebo Admin+ |
| PUT /:id | JWT; WorldRole.PJ nebo vyšší, nebo Admin+ |
| DELETE /:id | JWT; WorldRole.PJ nebo vyšší, nebo Admin+ |

---

## Testování

Unit testy na service vrstvě s mockovanými repositories (vzor z `characters.service.spec.ts`).

### NpcTemplatesService — testy

- `findAll(worldId)` — mock vrátí 2 šablony, ověř že jsou vráceny; mock vrátí [] pro jiný worldId
- `findOne(id, worldId)` — nalezená šablona → vrátí ji; null → vyhodí NotFoundException
- `create(dto, worldId)` — ověř že `worldId` je z parametru (ne z dto); ověř defaultní hodnoty (`maxHp: 5, armor: 0, injury: 0`)
- `update(id, worldId, dto)` — null z repo → NotFoundException; úspěch → vrátí aktualizovanou šablonu
- `remove(id, worldId)` — false z repo → NotFoundException; úspěch → void

### Co netestujeme

- Validaci obsahu `diarySchema` a `diaryData` — frontend zodpovědnost
- Reálné MongoDB operace — mock stačí

---

## Závislosti

| Závisí na | Proč |
|-----------|------|
| Krok 6 Characters | sdílí `TagValue`, `SchemaBlock` typy |
| Krok 6 WorldMembership | access control (WorldRole check) |
| Krok 8 Mapy | `MapToken.templateId` odkazuje na NpcTemplate; `baseHp/baseArmor/injury` se kopírují z šablony |

---

## Vztah ke Kroku 8

Při přidání NPC na taktickou mapu (Krok 8) `MapToken` zdědí z NpcTemplate:
- `baseHp = template.maxHp`, `maxHp = template.maxHp`
- `baseArmor = template.armor`
- `injury = template.injury`
- `abilities = template.abilities`
- `personalDiarySchema = template.diarySchema`
- `customData = template.diaryData` (výchozí stav)

Tato logika patří do Kroku 8 — NpcTemplate jen data ukládá.
