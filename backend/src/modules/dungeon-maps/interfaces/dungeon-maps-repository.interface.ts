import type { DungeonMap } from './dungeon-map.interface';

export interface IDungeonMapsRepository {
  findByWorld(worldId: string): Promise<DungeonMap[]>;
  findById(id: string): Promise<DungeonMap | null>;
  create(data: Partial<DungeonMap>): Promise<DungeonMap>;
  replace(id: string, data: Partial<DungeonMap>): Promise<DungeonMap | null>;
  delete(id: string): Promise<boolean>;
}
