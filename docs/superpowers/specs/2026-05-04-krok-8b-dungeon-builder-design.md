# Krok 8b — Dungeon Builder: Design spec

**Datum:** 2026-05-04  
**Status:** Schváleno  
**Závisí na:** Krok 8a (MapScene, MapTemplate, upload z Kroku 3c)

---

## Přehled

Backend podpora pro editor dungeonů. PJ si ukládá rozdělanou práci do kolekce `dungeonMaps` a exportuje hotový dungeon jako MapTemplate nebo MapScene (integrace s Krok 8a). PNG generuje frontend — backend persistuje JSON a vytváří MapTemplate/MapScene.

---

## Datové modely

### DungeonMap

MongoDB kolekce: `dungeonMaps`

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `worldId` | `string` | required | Vazba na svět |
| `name` | `string` | `""` | Název dungeonu |
| `gridType` | `'square' \| 'hex'` | `'square'` | Typ mřížky |
| `gridWidth` | `number` | `20` | Počet sloupců |
| `gridHeight` | `number` | `20` | Počet řádků |
| `cellSize` | `number` | `40` | Px na buňku |
| `theme` | `'dyson' \| 'modern'` | `'dyson'` | Vizuální styl |
| `cells` | `DungeonCell[][]` | prázdné pole | 2D pole buněk [row][col] |
| `decorations` | `DungeonDecoration[]` | `[]` | Speciální objekty na buňkách |
| `lastModified` | `DateTime?` | null | UTC, nastavuje service |

Index: `{ worldId: 1 }`

---

### DungeonCell

```ts
{
  type: 'empty' | 'floor' | 'wall' | 'door' | 'door-locked'
       | 'stairs-up' | 'stairs-down' | 'water' | 'lava' | 'pit'
  wallEdges: {
    // square grid:
    top: boolean, right: boolean, bottom: boolean, left: boolean
    // hex grid (rozšíření):
    nw?: boolean, n?: boolean, ne?: boolean,
    se?: boolean, s?: boolean, sw?: boolean
  }
  floorVariant?: string   // 'stone' | 'wood' | 'dirt'
}
```

`wallEdges` určuje kde přesně leží zeď na hraně buňky.

---

### DungeonDecoration

```ts
{
  id: string
  type: string    // 'chest' | 'table' | 'pillar' | 'altar' | 'trap' | 'campfire' | ...
  cellX: number
  cellY: number
  rotation: 0 | 90 | 180 | 270
}
```

---

## REST API

### `/api/dungeon-maps`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| GET | `/api/dungeon-maps?worldId=` | PJ+ | Seznam dungeonů světa |
| GET | `/api/dungeon-maps/:id` | PJ+ | Dungeon dle ID |
| POST | `/api/dungeon-maps` | PJ+ | Vytvoř dungeon |
| PUT | `/api/dungeon-maps/:id` | PJ+ | Nahraď dungeon (nastaví `lastModified`) |
| DELETE | `/api/dungeon-maps/:id` | PJ+ | Smaž dungeon |
| POST | `/api/dungeon-maps/:id/export-template` | PJ+ | Vytvoř MapTemplate z dungeonu |
| POST | `/api/dungeon-maps/:id/export-scene` | PJ+ | Vytvoř MapScene z dungeonu |

> **PJ+** = `role <= UserRole.PJ`

---

### Export endpointy

**`POST /api/dungeon-maps/:id/export-template`**

Request body:
```json
{ "imageUrl": "https://..." }
```

Backend vytvoří `MapTemplate` s:
- `imageUrl` z requestu
- `config.size` = `dungeonMap.cellSize`
- `name` = `dungeonMap.name`

Vrátí: `{ templateId: string }`

---

**`POST /api/dungeon-maps/:id/export-scene`**

Request body:
```json
{ "imageUrl": "https://...", "worldId": "abc123" }
```

Backend vytvoří `MapScene` s výše uvedenými hodnotami + `worldId`, `isActive: false`.

Vrátí: `{ sceneId: string }`

---

## Struktura modulu

```
src/modules/dungeon-maps/
  schemas/
    dungeon-map.schema.ts
  interfaces/
    dungeon-map.interface.ts
    dungeon-maps-repository.interface.ts
  repositories/
    dungeon-maps.repository.ts
  dto/
    create-dungeon-map.dto.ts
    update-dungeon-map.dto.ts
    export-template.dto.ts
    export-scene.dto.ts
  dungeon-maps.service.ts
  dungeon-maps.controller.ts
  dungeon-maps.module.ts
```

---

## Klíčové invarianty

1. **Export nepřepisuje zdrojová data** — dungeon v `dungeonMaps` zůstane nezměněn po exportu
2. **PNG generuje frontend** — backend nikdy nekreslí, jen persistuje JSON a vytváří MapTemplate/MapScene
3. **Max jedna aktivní scéna per world** — řeší Maps modul (z Kroku 8a), export-scene jen vytvoří neaktivní scénu
