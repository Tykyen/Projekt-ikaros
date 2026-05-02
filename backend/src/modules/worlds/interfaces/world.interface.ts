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
}
