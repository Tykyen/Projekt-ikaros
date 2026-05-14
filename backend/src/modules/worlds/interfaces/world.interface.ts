export interface OfferedCharacter {
  slug: string;
  name: string;
}

export interface CalendarMonthConfig {
  name: string;
  daysCount: number;
}

export interface CelestialBody {
  name: string;
  orbitalPeriodDays: number;
  color: string;
}

export interface WorldCalendarConfig {
  daysOfWeek: string[];
  months: CalendarMonthConfig[];
  celestialBodies: CelestialBody[];
}

/**
 * Spec 2.4 — public owner summary populated do `World.owner` při `findById` /
 * `findBySlug`. Žádné citlivé pole (žádný email, lastLoginAt, role…).
 */
export interface PublicOwnerSummary {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface World {
  id: string;
  name: string;
  slug: string;
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
  calendarConfig?: WorldCalendarConfig;
  favoritePageSlugs: string[];
  createdAt: Date;
  updatedAt: Date;
  /** Spec 2.4 — populated jen při `findById` / `findBySlug` (controller endpointy). */
  owner?: PublicOwnerSummary;
}
