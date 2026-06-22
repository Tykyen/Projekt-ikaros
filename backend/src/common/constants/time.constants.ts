export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const HOURS_2_MS = 2 * HOUR_MS;
export const HOURS_23_MS = 23 * HOUR_MS;
export const HOURS_25_MS = 25 * HOUR_MS;

// 15.9 — okno připomínky 1h před začátkem (cron běží à 15 min, okno ~0.75–1.25h).
export const MIN_45_MS = 45 * MINUTE_MS;
export const MIN_75_MS = 75 * MINUTE_MS;

// 9.1-I — game events archive cut-off (Matrix-style 24h window).
// „Nadcházející" = date ≥ now − ACTIVE_WINDOW_MS, „Archiv" = date < now − ACTIVE_WINDOW_MS.
export const ACTIVE_WINDOW_HOURS = 24;
export const ACTIVE_WINDOW_MS = ACTIVE_WINDOW_HOURS * HOUR_MS;
