import type { Sound } from './sound.interface';

export interface ISoundsRepository {
  findByWorld(worldId: string): Promise<Sound[]>;
  findGlobal(): Promise<Sound[]>;
  findGlobalPending(): Promise<Sound[]>;
  findById(id: string): Promise<Sound | null>;
  findGlobalByUrlOrName(url: string, name: string): Promise<Sound | null>;
  create(data: Partial<Sound>): Promise<Sound>;
  updateById(id: string, data: Partial<Sound>): Promise<Sound | null>;
  updateByIdAndWorld(id: string, worldId: string, data: Partial<Sound>): Promise<Sound | null>;
  deleteById(id: string): Promise<boolean>;
  deleteByIdAndWorld(id: string, worldId: string): Promise<boolean>;
}
