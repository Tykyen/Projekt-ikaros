import type { WorldMapFolder } from './world-map-folder.interface';

export interface IWorldMapFoldersRepository {
  /** Všechny složky světa (nesetříděné). */
  findByWorld(worldId: string): Promise<WorldMapFolder[]>;
  create(worldId: string, folder: WorldMapFolder): Promise<WorldMapFolder>;
  update(
    worldId: string,
    folderId: string,
    patch: Partial<WorldMapFolder>,
  ): Promise<WorldMapFolder | null>;
  /** Vrací true když složka existovala a byla smazána. */
  remove(worldId: string, folderId: string): Promise<boolean>;
  /** Přepíše `order` složek podle pořadí `orderedIds`. */
  reorder(worldId: string, orderedIds: string[]): Promise<WorldMapFolder[]>;
  /** Přepojí podsložky `fromParentId` → `toParentId` (při mazání složky). */
  reparentChildren(
    worldId: string,
    fromParentId: string,
    toParentId: string | null,
  ): Promise<void>;
}
