import type { WorldMapEntry } from './world-map.interface';

export interface IWorldMapsRepository {
  /** Všechny mapy světa (nesetříděné). Prázdné pole když doc neexistuje. */
  findByWorld(worldId: string): Promise<WorldMapEntry[]>;
  addMap(worldId: string, entry: WorldMapEntry): Promise<WorldMapEntry>;
  updateMap(
    worldId: string,
    mapId: string,
    patch: Partial<WorldMapEntry>,
  ): Promise<WorldMapEntry | null>;
  /** Vrací true když mapa existovala a byla smazána. */
  removeMap(worldId: string, mapId: string): Promise<boolean>;
  /** Přepíše `order` map podle pořadí `orderedIds`; vrací aktuální seznam. */
  reorder(worldId: string, orderedIds: string[]): Promise<WorldMapEntry[]>;
  /** Přepojí mapy `fromFolderId` → `toFolderId` (při mazání složky). */
  reparentMaps(
    worldId: string,
    fromFolderId: string,
    toFolderId: string | null,
  ): Promise<void>;
}
