import { World } from './world.interface';

export interface IWorldsRepository {
  findById(id: string): Promise<World | null>;
  findByIds(ids: string[]): Promise<World[]>;
  findBySlug(slug: string): Promise<World | null>;
  existsBySlug(slug: string): Promise<boolean>;
  findAll(): Promise<World[]>;
  increment(id: string, field: string, by: number): Promise<void>;
  save(world: Partial<World>): Promise<World>;
  update(id: string, data: Partial<World>): Promise<World | null>;
  delete(id: string): Promise<boolean>;
}
