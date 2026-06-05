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
  findDirectory(
    worldId: string,
    types?: string[],
  ): Promise<
    Pick<
      Page,
      | 'id'
      | 'slug'
      | 'title'
      | 'type'
      | 'order'
      | 'updatedAt'
      | 'imageUrl'
      | 'imageFocalX'
      | 'imageFocalY'
      | 'imageZoom'
      | 'imageFit'
      | 'ownerUserId'
      | 'accessRequirements'
      | 'isWoodWide'
    >[]
  >;
  findAllSlugs(worldId: string): Promise<string[]>;
  findRandom(worldId: string, count: number): Promise<Page[]>;
  findBySlugs(slugs: string[], worldId: string): Promise<Page[]>;
  findRecent(limit: number, worldIds?: string[]): Promise<Page[]>;
  /**
   * 7.1l — Najde všechny stránky v daném světě, jejichž `content` (TipTap HTML)
   * obsahuje odkaz na cílový slug. Použito pro „Odkazuje sem" panel ve vieweru.
   * Vrací jen lehký projekt `{slug, title, type}` — bez `content`/`plainText`.
   */
  findBacklinksToSlug(
    worldId: string,
    targetSlug: string,
  ): Promise<Pick<Page, 'slug' | 'title' | 'type'>[]>;
}
