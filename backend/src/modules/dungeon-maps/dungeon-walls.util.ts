import type { MapWall } from '../maps/interfaces/map-scene.interface';
import type {
  DungeonCell,
  DungeonMap,
} from './interfaces/dungeon-map.interface';

/**
 * 21.3b+e — převod buňkové mapy na `MapWall[]` taktické mapy (LoS).
 *
 * Per druh mapy (21.3e):
 * - **dungeon** (negativ): pohled blokuje skála (`empty`/`wall`); dveřní buňky
 *   (kromě `archway`) → `door` segment.
 * - **city** (pozitiv): pohled blokují `building` a `city-wall`; `gate` →
 *   `door` segment (průjezd hradbou), ostatní terén volný.
 *
 * Zdi = hranice blokující↔volné; hrany se slévají po přímých bězích
 * (řádek/sloupec), takže L mapa dá stovky segmentů, ne tisíce. Souřadnice
 * v map-space px: buňka (x,y) → [x*cellSize, y*cellSize].
 */

const DUNGEON_BLOCKING: ReadonlySet<string> = new Set(['empty', 'wall']);
const CITY_BLOCKING: ReadonlySet<string> = new Set(['building', 'city-wall']);
// 21.3g — krajina: hustý les, hory a budovy kryjí výhled; kopce/pole ne.
const WILDERNESS_BLOCKING: ReadonlySet<string> = new Set([
  'forest',
  'mountain',
  'building',
]);

const DUNGEON_DOORS: ReadonlySet<string> = new Set([
  'door',
  'door-locked',
  'door-trapped',
  'door-secret',
  'portcullis',
]);
const CITY_DOORS: ReadonlySet<string> = new Set(['gate']);

const LOCKED_TYPES: ReadonlySet<string> = new Set([
  'door-locked',
  'portcullis',
]);

export function dungeonWallsToMapWalls(
  dungeon: Pick<
    DungeonMap,
    'cells' | 'gridWidth' | 'gridHeight' | 'cellSize' | 'mapKind'
  >,
): MapWall[] {
  const { cells, cellSize: s } = dungeon;
  const h = dungeon.gridHeight;
  const w = dungeon.gridWidth;
  const kind =
    dungeon.mapKind === 'city' || dungeon.mapKind === 'wilderness'
      ? dungeon.mapKind
      : 'dungeon';
  const blocking =
    kind === 'city'
      ? CITY_BLOCKING
      : kind === 'wilderness'
        ? WILDERNESS_BLOCKING
        : DUNGEON_BLOCKING;
  // Krajina dveře nemá (brány jsou městské).
  const doorTypes =
    kind === 'city'
      ? CITY_DOORS
      : kind === 'wilderness'
        ? new Set<string>()
        : DUNGEON_DOORS;

  // Mimo grid: dungeon = skála (blokuje), město = otevřený terén (neblokuje).
  const outsideBlocks = kind === 'dungeon';
  const blocksAt = (x: number, y: number): boolean => {
    if (y < 0 || y >= h || x < 0 || x >= w) return outsideBlocks;
    const cell: DungeonCell | undefined = cells[y]?.[x];
    return cell ? blocking.has(cell.type) : outsideBlocks;
  };

  const walls: MapWall[] = [];
  let seq = 0;
  const pushWall = (x1: number, y1: number, x2: number, y2: number): void => {
    walls.push({
      id: `dgw-${seq++}`,
      points: [x1, y1, x2, y2],
      type: 'wall',
      blocksSight: true,
    });
  };

  // Vodorovné hrany (mezi řádky y-1 a y, včetně okrajů y=0 a y=h).
  for (let y = 0; y <= h; y++) {
    let runStart = -1;
    for (let x = 0; x <= w; x++) {
      const boundary = x < w && blocksAt(x, y - 1) !== blocksAt(x, y);
      if (boundary && runStart < 0) runStart = x;
      if (!boundary && runStart >= 0) {
        pushWall(runStart * s, y * s, x * s, y * s);
        runStart = -1;
      }
    }
  }

  // Svislé hrany (mezi sloupci x-1 a x, včetně okrajů).
  for (let x = 0; x <= w; x++) {
    let runStart = -1;
    for (let y = 0; y <= h; y++) {
      const boundary = y < h && blocksAt(x - 1, y) !== blocksAt(x, y);
      if (boundary && runStart < 0) runStart = y;
      if (!boundary && runStart >= 0) {
        pushWall(x * s, runStart * s, x * s, y * s);
        runStart = -1;
      }
    }
  }

  // Dveře/brány — napříč průchodem, kolmo na osu chodby/hradby.
  const passable = (x: number, y: number): boolean =>
    y >= 0 && y < h && x >= 0 && x < w && !blocksAt(x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const type = cells[y]?.[x]?.type;
      if (!type || !doorTypes.has(type)) continue;
      const horizontal = passable(x - 1, y) && passable(x + 1, y);
      const cx = x * s;
      const cy = y * s;
      const points = horizontal
        ? // průchod běží vodorovně → dveřní plocha svisle středem buňky
          [cx + s / 2, cy, cx + s / 2, cy + s]
        : [cx, cy + s / 2, cx + s, cy + s / 2];
      walls.push({
        id: `dgw-${seq++}`,
        points,
        type: 'door',
        door: { open: false, locked: LOCKED_TYPES.has(type) },
        blocksSight: true,
      });
    }
  }

  return walls;
}
