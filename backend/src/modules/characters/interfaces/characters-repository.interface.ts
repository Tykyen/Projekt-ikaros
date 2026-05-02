import { Character } from './character.interface';

export interface ICharactersRepository {
  findAll(): Promise<Character[]>;
  findById(id: string): Promise<Character | null>;
  findBySlugAndWorld(slug: string, worldId: string): Promise<Character | null>;
  findByWorld(worldId: string): Promise<Character[]>;
  findByUserAndWorld(userId: string, worldId: string): Promise<Character | null>;
  existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean>;
  save(character: Partial<Character>): Promise<Character>;
  update(id: string, data: Partial<Character>): Promise<Character | null>;
  delete(id: string): Promise<boolean>;
}
