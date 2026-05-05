import { Page } from './page.interface';

export interface IPagesRepository {
  findAll(): Promise<Page[]>;
  findById(id: string): Promise<Page | null>;
  findBySlugAndWorld(slug: string, worldId: string): Promise<Page | null>;
  findByWorld(worldId: string, type?: string): Promise<Page[]>;
  existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean>;
  save(page: Partial<Page>): Promise<Page>;
  update(id: string, data: Partial<Page>): Promise<Page | null>;
  delete(id: string): Promise<boolean>;
  findDirectory(worldId: string): Promise<Pick<Page, 'id' | 'slug' | 'title' | 'type' | 'order'>[]>;
  findAllSlugs(worldId: string): Promise<string[]>;
  findRandom(worldId: string, count: number): Promise<Page[]>;
  findBySlugs(slugs: string[], worldId: string): Promise<Page[]>;
  findRecent(limit: number, worldIds?: string[]): Promise<Page[]>;
}
