import { World } from './world.interface';

export interface IWorldsRepository {
  findById(id: string): Promise<World | null>;
  findByIds(ids: string[]): Promise<World[]>;
  findBySlug(slug: string): Promise<World | null>;
  findAll(): Promise<World[]>;
  findByOwnerId(ownerId: string): Promise<World[]>;
  save(world: Partial<World>): Promise<World>;
  update(id: string, data: Partial<World>): Promise<World | null>;
  existsBySlug(slug: string): Promise<boolean>;
  increment(id: string, field: string, by: number): Promise<void>;
  delete(id: string): Promise<boolean>;
  addFavoriteSlug(worldId: string, slug: string): Promise<void>;
  removeFavoriteSlug(worldId: string, slug: string): Promise<void>;
}
