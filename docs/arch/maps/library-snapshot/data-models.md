# Datové modely

## `MapTemplate` schema — rozšířená verze

Současný stav: [`backend/src/modules/maps/schemas/map-template.schema.ts`](../../../../backend/src/modules/maps/schemas/map-template.schema.ts).

### Změny

| Pole | Před | Po | Důvod |
|---|---|---|---|
| `ownerId` | ❌ neexistuje | **`string` required** | per-PJ vlastnictví |
| `createdAt` | ❌ neexistuje | `Date` (auto) | audit, sort by recent |
| `updatedAt` | `lastModified` (optional) | `Date` (auto, replace `lastModified`) | konzistence s ostatními kolekcemi |
| `name` | string, default `''` | string, **required, min 1 char** | šablona bez jména = useless |
| `imageUrl` | string, default `''` | string, **required, min 1 char** | šablona bez pozadí = nehodí se uložit |
| `config` | Object, default `{size:40, originX:0, originY:0, showGrid:true}` | beze změny | OK |
| `npcTemplates` | `MixedArraySubSchema[]`, default `[]` | beze změny (zde se ukládají skutečně) | OK |
| `tokens` | `MixedArraySubSchema[]`, default `[]` | beze změny (zde se ukládají skutečně, **jen NPC**, viz `purpose.md`) | OK |
| `effects` | `MixedArraySubSchema[]`, default `[]` | beze změny | OK |
| `fogEnabled` | bool, default `false` | beze změny | OK |
| `revealedHexes` | `MixedArraySubSchema[]`, default `[]` | beze změny | OK |
| `activeSoundIds` | `string[]`, default `[]` | beze změny | OK |
| `lastModified` | optional Date | **REMOVE** (nahradit `updatedAt` z `timestamps: true`) | konzistence |

### Finální schema (po změně)

```ts
@Schema({ timestamps: true, collection: 'mapTemplates' })
export class MapTemplateSchemaClass {
  @Prop({ required: true, index: true }) ownerId: string;
  @Prop({ required: true, minlength: 1 }) name: string;
  @Prop({ required: true, minlength: 1 }) imageUrl: string;
  @Prop({ type: Object, default: { size: 40, originX: 0, originY: 0, showGrid: true } })
  config: Record<string, unknown>;
  @Prop({ type: [MixedArraySubSchema], default: [] }) npcTemplates: Record<string, unknown>[];
  @Prop({ type: [MixedArraySubSchema], default: [] }) tokens: Record<string, unknown>[];
  @Prop({ type: [MixedArraySubSchema], default: [] }) effects: Record<string, unknown>[];
  @Prop({ default: false }) fogEnabled: boolean;
  @Prop({ type: [MixedArraySubSchema], default: [] }) revealedHexes: Record<string, unknown>[];
  @Prop({ type: [String], default: [] }) activeSoundIds: string[];
  // createdAt + updatedAt přidá timestamps: true
}
```

### Index

```js
db.mapTemplates.createIndex({ ownerId: 1, updatedAt: -1 });
```

Důvod: `findAll` filtruje per `ownerId`, řadí podle `updatedAt desc` (nejnovější nahoře v UI).

## Invarianty

- **`ownerId` nelze měnit po vytvoření.** Šablona je vlastnictví. Pokud má jiný PJ chtít kopii, musí provést Save As — vytvoří nový dokument se svým ownerId.
- **`name` unikátní per `ownerId`.** Optional ujistění (jinak by PJ měl 5 šablon "Dungeon" a nevěděl která je která). Constraint přes compound unique index `{ ownerId: 1, name: 1 }`. **Soft option** — pokud nedávno se v repu řeší jinak (sufix `(2)`), tak ignorovat. **Rozhodnutí: ignorovat — nepřidávat unique constraint.** Klient se postará o sufix při kolizi (typicky Matrixář style).

## Validace na save

| Pole | Pravidlo |
|---|---|
| `name` | trim, min 1 char, max 100 |
| `imageUrl` | musí být present (validuje frontend i backend) |
| `tokens` | **PC tokens se odstraní serverside na save** — bezpečnostní default. Klient by je tam neměl posílat (FE filtr), ale BE musí zfiltrovat pro jistotu. |
| Ostatní | jak jsou |

## FE typescript types

Cesta: `src/features/world/tactical-map/types.ts`.

```ts
export interface MapTemplate {
  id: string;
  ownerId: string;
  name: string;
  imageUrl: string;
  config: MapSceneConfig;
  npcTemplates: NpcTemplate[];
  tokens: MapToken[];  // jen NPC tokeny
  effects: MapEffect[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  activeSoundIds: string[];
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
}
```

## Migrační skript

Nest CLI command (vytvořit pokud chybí infra) nebo standalone script (`backend/scripts/migrate-map-templates-ownerid.ts`):

```ts
async function migrate() {
  const TYKY_ID = await usersRepo.findOneByEmail('tykytanjunior@gmail.com').then(u => u._id.toString());
  if (!TYKY_ID) throw new Error('Superadmin user nenalezen — neabortuj migraci');

  const result = await db.collection('mapTemplates').updateMany(
    { ownerId: { $exists: false } },
    { $set: { ownerId: TYKY_ID, createdAt: new Date(), updatedAt: new Date() } }
  );

  console.log(`Updated ${result.modifiedCount} templates → owner=${TYKY_ID}`);
}
```

**Rollback:** žádný (forward-only). Pokud něco selže, manuální fix v Mongo.

**Spuštění:** jednou, před nasazením new schemy. Po migraci `ownerId` `required: true` v schemě je bezpečné (žádný dokument bez něj).
