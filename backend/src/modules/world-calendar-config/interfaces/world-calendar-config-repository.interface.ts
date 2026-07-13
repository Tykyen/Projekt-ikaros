import type { WorldCalendarConfig } from './world-calendar-config.interface';

export interface IWorldCalendarConfigRepository {
  findAllByWorldId(worldId: string): Promise<WorldCalendarConfig[]>;
  /** D-SEC-GAP-2026-07-11 — anti-abuse: počet kalendářů světa (creation cap). */
  countByWorldId(worldId: string): Promise<number>;
  findBySlug(
    worldId: string,
    slug: string,
  ): Promise<WorldCalendarConfig | null>;
  /** @returns null pokud slug už existuje pro daný svět (caller mapuje na 409). */
  create(
    worldId: string,
    data: Omit<
      WorldCalendarConfig,
      'id' | 'worldId' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<WorldCalendarConfig | null>;
  patch(
    worldId: string,
    slug: string,
    data: Partial<
      Omit<
        WorldCalendarConfig,
        'id' | 'worldId' | 'slug' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<WorldCalendarConfig | null>;
  remove(worldId: string, slug: string): Promise<boolean>;
}
