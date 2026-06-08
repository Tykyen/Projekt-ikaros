import { ActiveMapWeather, World } from './world.interface';

export interface IWorldsRepository {
  findById(id: string): Promise<World | null>;
  findByIds(ids: string[]): Promise<World[]>;
  findBySlug(slug: string): Promise<World | null>;
  /** D-NEW-slug-rename — najde svět i podle starého slugu (redirect lookup). */
  findByCurrentOrPreviousSlug(slug: string): Promise<World | null>;
  /** D-NEW-slug-rename — atomický rename, pushne starý do `previousSlugs`. */
  renameSlug(worldId: string, newSlug: string): Promise<World | null>;
  existsBySlug(slug: string): Promise<boolean>;
  findByOwnerId(ownerId: string): Promise<World[]>;
  findDeleted(): Promise<World[]>;
  findExpiredDeleted(cutoff: Date): Promise<World[]>;
  findAll(): Promise<World[]>;
  increment(id: string, field: string, by: number): Promise<void>;
  save(world: Partial<World>): Promise<World>;
  update(id: string, data: Partial<World>): Promise<World | null>;
  /** D-NEW-theme-bg-empty — explicit $unset pro themeBackgroundUrl. */
  clearThemeBackgroundUrl(id: string): Promise<void>;
  /** D-NEW-theme-bg-empty migrace — vyčistí pre-existing `themeBackgroundUrl: ''`. */
  migrateEmptyThemeBackgroundUrls(): Promise<{ updated: number }>;
  delete(id: string): Promise<boolean>;
  addFavoriteSlug(worldId: string, slug: string): Promise<void>;
  removeFavoriteSlug(worldId: string, slug: string): Promise<void>;
  /** 10.2i — nastaví počasí vyslané na taktickou mapu světa. */
  setActiveMapWeather(
    worldId: string,
    weather: ActiveMapWeather,
  ): Promise<void>;
  /** 10.2i — zruší počasí na mapě (`activeMapWeather: null`). */
  clearActiveMapWeather(worldId: string): Promise<void>;
}
