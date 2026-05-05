import type { MapScene } from './map-scene.interface';

export interface IMapsRepository {
  findByWorld(worldId: string): Promise<MapScene[]>;
  findActiveByWorld(worldId: string): Promise<MapScene | null>;
  findById(id: string): Promise<MapScene | null>;
  create(data: Partial<MapScene>): Promise<MapScene>;
  setActive(id: string, worldId: string): Promise<void>;
  replace(id: string, data: Partial<MapScene>): Promise<MapScene | null>;
  delete(id: string): Promise<boolean>;
}
