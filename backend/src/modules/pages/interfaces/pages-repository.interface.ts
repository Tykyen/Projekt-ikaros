import { Page } from './page.interface';

export interface IPagesRepository {
  findById(id: string): Promise<Page | null>;
  findBySlugAndWorld(slug: string, worldId: string): Promise<Page | null>;
  findByWorld(worldId: string, type?: string): Promise<Page[]>;
  existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean>;
  save(page: Partial<Page>): Promise<Page>;
  update(id: string, data: Partial<Page>): Promise<Page | null>;
  delete(id: string): Promise<boolean>;
}
