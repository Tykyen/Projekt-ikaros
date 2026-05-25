/**
 * 9.2b — Utility helpers pro fantasy/gregoriánský kalendář.
 *
 * Port logiky z FE `src/shared/lib/calendarEngine/` (9.2a). Důvod kopie
 * (ne import): backend a frontend repo jsou samostatné npm projekty,
 * sdílený package by vyžadoval workspace setup. Mirror tax řeší sketch test
 * parity (FE engine spec snapshot vs BE utils snapshot).
 */
import type {
  CelestialBody,
  CelestialOverride,
  CelestialState,
  LunarPhase,
  WorldCalendarConfig,
} from './interfaces/world-calendar-config.interface';

const PHASES_ORDERED: readonly LunarPhase[] = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
];

const GREGORIAN_MONTH_DAYS = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isGregorianLike(config: WorldCalendarConfig): boolean {
  if (config.months.length !== 12) return false;
  if (config.daysOfWeek.length !== 7) return false;
  for (let i = 0; i < 12; i++) {
    if (config.months[i].daysCount !== GREGORIAN_MONTH_DAYS[i]) return false;
  }
  return true;
}

export function daysInMonth(
  monthIndex: number,
  year: number,
  config: WorldCalendarConfig,
): number {
  const normalizedMonth = mod(monthIndex, config.months.length);
  if (isGregorianLike(config) && normalizedMonth === 1) {
    return isLeapYear(year) ? 29 : 28;
  }
  return config.months[normalizedMonth].daysCount;
}

/** `(year:0, monthIndex:0, day:1)` → `absDay 0`. monthIndex 0-based. */
export function toAbsDay(
  year: number,
  monthIndex: number,
  day: number,
  config: WorldCalendarConfig,
): number {
  if (isGregorianLike(config)) {
    const y = year;
    const leapsBefore =
      y > 0
        ? Math.floor((y - 1) / 4) -
          Math.floor((y - 1) / 100) +
          Math.floor((y - 1) / 400) +
          1
        : Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
    let days = y * 365 + leapsBefore;
    for (let i = 0; i < monthIndex; i++) {
      days += daysInMonth(i, y, config);
    }
    return days + (day - 1);
  }
  const yearLen = config.months.reduce((acc, m) => acc + m.daysCount, 0);
  let days = year * yearLen;
  for (let i = 0; i < monthIndex; i++) {
    days += config.months[i].daysCount;
  }
  return days + (day - 1);
}

export function getLunarPhase(
  globalAbsDay: number,
  body: CelestialBody,
): LunarPhase {
  const cyclePos = mod(globalAbsDay - body.epochOffset, body.orbitalPeriodDays);
  const segment = Math.floor((cyclePos / body.orbitalPeriodDays) * 8);
  return PHASES_ORDERED[Math.min(segment, PHASES_ORDERED.length - 1)];
}

/**
 * Pro daný den vrátí stav každého nebeského tělesa (8-fázový cyklus).
 * Manual overrides přebíjejí výpočet.
 *
 * `monthIndex` 0-based (kompatibilita s FE engine).
 */
export function calculateCelestialStates(
  year: number,
  monthIndex: number,
  day: number,
  config: WorldCalendarConfig,
  overrides: CelestialOverride[],
): CelestialState[] {
  if (config.celestialBodies.length === 0) return [];
  const absDay = toAbsDay(year, monthIndex, day, config);

  return config.celestialBodies.map((body) => {
    const override = overrides.find((o) => o.bodyId === body.id);
    if (override) {
      return {
        bodyId: body.id,
        name: body.name,
        phase: override.phase,
        color: body.color,
        isManualOverride: true,
      };
    }
    return {
      bodyId: body.id,
      name: body.name,
      phase: getLunarPhase(absDay, body),
      color: body.color,
      isManualOverride: false,
    };
  });
}
