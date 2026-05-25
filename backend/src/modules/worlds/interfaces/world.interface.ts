export interface OfferedCharacter {
  slug: string;
  name: string;
}

/**
 * 9.2b — `WorldCalendarConfig` přesunut do `world-calendar-config` modulu
 * jako multi-config kolekce. Inline `World.calendarConfig` field zrušen.
 */

/**
 * Spec 2.4 — public owner summary populated do `World.owner` při `findById` /
 * `findBySlug`. Žádné citlivé pole (žádný email, lastLoginAt, role…).
 */
export interface PublicOwnerSummary {
  id: string;
  username: string;
  avatarUrl?: string;
  /** Poslední aktivita — `undefined` u „neviditelného" módu. */
  lastSeenAt?: Date;
}

export interface World {
  id: string;
  name: string;
  slug: string;
  /** D-NEW-slug-rename — historie předchozích slugů (redirect na current). */
  previousSlugs?: string[];
  description?: string;
  imageUrl?: string;
  genre?: string;
  tones?: string[];
  playersWanted?: string;
  playerCount: number;
  /** 2.2 — volitelná max kapacita světa (pro sort "volná místa" + 2.3 wizard). */
  maxPlayers?: number | null;
  dice?: string[];
  system: string;
  ownerId: string;
  isActive: boolean;
  accessMode: string;
  offeredCharacters?: OfferedCharacter[];
  favoritePageSlugs: string[];
  /** 9.2b — slug výchozího kalendáře z `world_calendar_configs`. Auto-seed = 'gregorian'. */
  defaultCalendarConfigSlug: string;
  /** 9.2b — společný absDay epoch napříč kalendáři světa. */
  timelineEpoch: number;
  /** Krok 5.0 — id sdíleného základu světového motivu. */
  themeId: string;
  /** Krok 5.0 — custom theme: mapa CSS token → hodnota nad `themeId`. */
  themeOverrides: Record<string, string>;
  /** Krok 5.0 — custom theme: URL vlastního pozadí světa. */
  themeBackgroundUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Spec 2.4 — populated jen při `findById` / `findBySlug` (controller endpointy). */
  owner?: PublicOwnerSummary;
}
