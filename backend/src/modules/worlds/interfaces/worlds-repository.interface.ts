import { World } from './world.interface';

export interface IWorldsRepository {
  findById(id: string): Promise<World | null>;
  findBySlug(slug: string): Promise<World | null>;
  findAll(): Promise<World[]>;
  findByOwnerId(ownerId: string): Promise<World[]>;
  save(world: Partial<World>): Promise<World>;
  update(id: string, data: Partial<World>): Promise<World | null>;
  delete(id: string): Promise<boolean>;
}
