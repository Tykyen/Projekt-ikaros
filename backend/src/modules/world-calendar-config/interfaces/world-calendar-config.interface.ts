/**
 * 9.2b — Multi-config kalendáře per svět.
 *
 * Shape je mirror FE `src/shared/lib/calendarEngine/types.ts` (9.2a).
 * Drop původní discriminated union (`CelestialBodyType` moon/sun/planet/comet/other)
 * — sjednoceno na uniform shape s `orbitalPeriodDays` + `epochOffset`.
 * 8-fázový lunární cyklus (z FE engine) pokryje vše, co rozlišovaly typed bodies.
 */

export type LunarPhase =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

export interface MonthDef {
  name: string;
  daysCount: number;
  /** 9.3-F-II — intercalary měsíc (vkládá se jen v přestupných lunisolar letech). */
  isIntercalary?: boolean;
}

export interface CelestialBody {
  id: string;
  name: string;
  orbitalPeriodDays: number;
  color: string;
  epochOffset: number;
  icon?: string;
}

export interface Season {
  id: string;
  name: string;
  startMonthIndex: number;
  startDay: number;
  color: string;
  icon?: string;
}

/**
 * 9.3-F-I — Pravidlo přestupného roku pro non-Gregorian kalendáře.
 * Mirror FE `src/shared/lib/calendarEngine/types.ts`.
 */
export type LeapYearRuleType = 'every-4' | 'solar-hijri-33' | 'islamic-30';

export interface LeapYearRule {
  type: LeapYearRuleType;
  leapMonthIndex: number;
}

/**
 * 9.3-F-II — Lunisolární pravidlo (Metonic 19-letý cyklus).
 * V přestupných letech se aktivují měsíce s `isIntercalary: true`.
 */
export type LunisolarRuleType = 'metonic-19';

export interface LunisolarRule {
  type: LunisolarRuleType;
  /** 1-based pozice přestupných roků v cyklu (např. Hebrew: [3,6,8,11,14,17,19]). */
  leapYearsInCycle: number[];
}

export interface WorldCalendarConfig {
  id: string;
  worldId: string;
  slug: string;
  name: string;
  hoursPerDay: number;
  daysOfWeek: string[];
  months: MonthDef[];
  celestialBodies: CelestialBody[];
  seasons: Season[];
  /** 9.3-F-I — opt-in leap pravidlo (bez něj fast-path pevná daysInYear). */
  leapYearRule?: LeapYearRule;
  /** 9.3-F-II — opt-in lunisolar pravidlo (intercalary měsíce v leap letech). */
  lunisolar?: LunisolarRule;
  epochOffset: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Celestial state (timeline retrofit) ───────────────────────────────

export interface CelestialState {
  bodyId: string;
  name: string;
  phase: LunarPhase;
  color: string;
  isManualOverride: boolean;
}

export interface CelestialOverride {
  bodyId: string;
  phase: LunarPhase;
}
