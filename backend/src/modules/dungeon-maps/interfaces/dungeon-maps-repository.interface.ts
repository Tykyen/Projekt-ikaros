import type { DungeonMap } from './dungeon-map.interface';

export interface IDungeonMapsRepository {
  // 21.3a — ownerId filtr: hráč-podporovatel vidí jen svoje podzemí.
  findByWorld(worldId: string, ownerId?: string): Promise<DungeonMap[]>;
  findById(id: string): Promise<DungeonMap | null>;
  create(data: Partial<DungeonMap>): Promise<DungeonMap>;
  replace(id: string, data: Partial<DungeonMap>): Promise<DungeonMap | null>;
  delete(id: string): Promise<boolean>;
}
