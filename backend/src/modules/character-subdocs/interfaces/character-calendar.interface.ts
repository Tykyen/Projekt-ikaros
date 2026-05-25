export interface CalendarDisplaySettings {
  defaultView?: 'month' | 'week' | 'day';
  isHiddenInAggregate?: boolean;
}

/**
 * 9.2c — Strukturované fantasy datum. Mirror FE engine
 * (`@/shared/lib/calendarEngine/types`). monthIndex je 0-based.
 */
export interface FantasyDate {
  year: number;
  monthIndex: number;
  day: number;
  hour?: number;
  minute?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /**
   * 9.2c — slug kalendáře, ke kterému event patří. Null/undefined →
   * fallback na `World.defaultCalendarConfigSlug`.
   */
  calendarConfigId?: string;
  /** 9.2c — fantasy datum začátku. Refactor ze starého `string` na object. */
  start?: FantasyDate;
  /** 9.2c — fantasy datum konce (multi-day events). */
  end?: FantasyDate;
  allDay?: boolean;
  hourStart?: string;
  hourEnd?: string;
  description?: string;
  /**
   * 9.2-FIX — volný emoji/symbol per event. Barva je pevně dána
   * `CharacterCalendar.color` (per entita), symbol odlišuje typ.
   */
  symbol?: string;
}

export interface CharacterCalendar {
  id: string;
  characterId: string;
  worldId: string;
  color: string;
  displaySettings: CalendarDisplaySettings;
  events: CalendarEvent[];
  /** D-073 (2026-05-23) — optimistic concurrency token. */
  updatedAt?: Date;
}
