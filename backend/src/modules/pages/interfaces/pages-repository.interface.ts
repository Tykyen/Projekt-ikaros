import { Page } from './page.interface';

export interface IPagesRepository {
  findAll(): Promise<Page[]>;
  findById(id: string): Promise<Page | null>;
  findBySlugAndWorld(slug: string, worldId: string): Promise<Page | null>;
  findByWorld(worldId: string, type?: string): Promise<Page[]>;
  existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean>;
  /** D-SEC-GAP-2026-07-11 — anti-abuse: počet stránek světa (creation cap). */
  countByWorld(worldId: string): Promise<number>;
  save(page: Partial<Page>): Promise<Page>;
  update(id: string, data: Partial<Page>): Promise<Page | null>;
  /**
   * RC-P1 fix — atomický optimistic lock: zapíše JEN když se `updatedAt` od
   * `expectedUpdatedAt` nezměnil (podmínka ve filtru). Vrací null při neshodě
   * verze (souběžný/stale zápis) NEBO neexistující stránce → volající rozliší
   * podle předchozího findById. Brání lost-updatu, který app-level check (mezi
   * findById a update) pod souběhem nechytí.
   */
  updateIfUnchanged(
    id: string,
    data: Partial<Page>,
    expectedUpdatedAt: Date,
  ): Promise<Page | null>;
  delete(id: string): Promise<boolean>;
  findDirectory(
    worldId: string,
    types?: string[],
  ): Promise<
    (Pick<
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
      | 'moderationHidden'
    > & {
      /** D-DATA-SYNC-ZBYTKY a — link na Character entity (null = čistá stránka).
       *  entry.id zůstává page ID; characterId je vedlejší pole. */
      characterId: string | null;
    })[]
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
