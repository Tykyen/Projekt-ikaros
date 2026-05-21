import type { WorldPageTemplate } from './world-page-template.interface';

export interface IWorldPageTemplatesRepository {
  findByWorld(worldId: string): Promise<WorldPageTemplate[]>;
  findById(id: string): Promise<WorldPageTemplate | null>;
  existsByKey(worldId: string, key: string): Promise<boolean>;
  save(
    entity: Omit<WorldPageTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorldPageTemplate>;
  update(
    id: string,
    patch: Partial<Omit<WorldPageTemplate, 'id' | 'worldId' | 'createdAt'>>,
  ): Promise<WorldPageTemplate | null>;
  delete(id: string): Promise<boolean>;
}
