export type CelestialBodyType = 'moon' | 'sun' | 'planet' | 'comet' | 'other';

export interface MoonConfig {
  cycleLength: number;
  phases: string[];
}
export interface SunConfig {
  riseHour: number[];
  setHour: number[];
}
export interface PlanetConfig {
  orbitalPeriod: number;
  constellations: string[];
}
export interface CometConfig {
  periodYears: number;
  apparitionDurationYears: number;
}
export interface OtherConfig {
  cycleLength: number;
  states: string[];
}

export interface CelestialBody {
  id: string;
  name: string;
  type: CelestialBodyType;
  config: MoonConfig | SunConfig | PlanetConfig | CometConfig | OtherConfig;
  referenceState: string;
}

export interface CalendarMonth {
  name: string;
  daysCount: number;
}

export interface CalendarReferenceDate {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export interface CelestialState {
  bodyId: string;
  name: string;
  type: CelestialBodyType;
  state: string;
  isManualOverride: boolean;
}

export interface CelestialOverride {
  bodyId: string;
  value: string;
}

export interface WorldCalendarConfig {
  id: string;
  worldId: string;
  hoursPerDay: number;
  daysOfWeek: string[];
  months: CalendarMonth[];
  celestialBodies: CelestialBody[];
  referenceDate: CalendarReferenceDate | null;
  createdAt: Date;
  updatedAt: Date;
}
