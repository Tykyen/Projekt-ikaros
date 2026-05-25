/**
 * 9.2b — `CelestialState` + `CelestialOverride` sjednoceny s
 * `world-calendar-config` modulem (8-fázový lunar cyklus).
 * Import místo duplikace.
 */
import type {
  CelestialOverride as CelestialOverrideShared,
  CelestialState as CelestialStateShared,
} from '../../world-calendar-config/interfaces/world-calendar-config.interface';

export type CelestialOverride = CelestialOverrideShared;
export type CelestialState = CelestialStateShared;

export interface TimelineEvent {
  id: string;
  worldId: string;
  year: number;
  month: number; // 1-based (legacy timeline shape; engine používá 0-based monthIndex → konverze v service)
  day: number; // 1-based
  hour?: number; // 0..23
  title: string;
  text: string;
  imageUrl: string | null;
  /** 9.3 — focal point obrázku (0–100), null = center 50/50. */
  imageFocalX: number | null;
  imageFocalY: number | null;
  link: string | null;
  /** 9.3 — interní wiki link (slug stránky světa), nezávislý na `link`. */
  pageSlug: string | null;
  celestialOverrides: CelestialOverride[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TimelineEventResponse extends TimelineEvent {
  celestialStates: CelestialState[];
}
