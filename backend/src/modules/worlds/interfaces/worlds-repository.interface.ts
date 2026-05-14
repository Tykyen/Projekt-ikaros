import { World, WorldCalendarConfig } from './world.interface';

export interface IWorldsRepository {
  findById(id: string): Promise<World | null>;
  findByIds(ids: string[]): Promise<World[]>;
  findBySlug(slug: string): Promise<World | null>;
  existsBySlug(slug: string): Promise<boolean>;
  findByOwnerId(ownerId: string): Promise<World[]>;
  findAll(): Promise<World[]>;
  increment(id: string, field: string, by: number): Promise<void>;
  save(world: Partial<World>): Promise<World>;
  update(id: string, data: Partial<World>): Promise<World | null>;
  updateCalendarConfig(
    id: string,
    config: WorldCalendarConfig,
  ): Promise<World | null>;
  delete(id: string): Promise<boolean>;
  addFavoriteSlug(worldId: string, slug: string): Promise<void>;
  removeFavoriteSlug(worldId: string, slug: string): Promise<void>;
}
