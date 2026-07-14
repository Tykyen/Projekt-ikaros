import type { DungeonMap } from './dungeon-map.interface';

export interface IDungeonMapsRepository {
  // 21.3a — ownerId filtr: hráč-podporovatel vidí jen svoje podzemí.
  findByWorld(worldId: string, ownerId?: string): Promise<DungeonMap[]>;
  // 21.3c — osobní knihovna vlastníka (dokumenty s worldId null).
  findLibrary(ownerId: string): Promise<DungeonMap[]>;
  // 21.3c cleanup — hard-delete účtu: smaž knihovnu vlastníka (world stavby
  // maže world-hard-delete cascade; ve živých světech zůstávají PJ).
  deleteLibraryByOwner(ownerId: string): Promise<number>;
  findById(id: string): Promise<DungeonMap | null>;
  create(data: Partial<DungeonMap>): Promise<DungeonMap>;
  replace(id: string, data: Partial<DungeonMap>): Promise<DungeonMap | null>;
  delete(id: string): Promise<boolean>;
}
