// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

import type { MonthlyArray } from './types';

/**
 * Lineární interpolace mezi měsíčními průměry — vrací očekávanou hodnotu pro daný den.
 *
 * Day 15 = vrchol měsíce (== monthlyAvg[monthIndex]).
 * Day < 15 = lerp směrem k předchozímu měsíci.
 * Day > 15 = lerp směrem k následujícímu měsíci.
 *
 * Wrap-around: leden ↔ prosinec (modulo monthsTotal).
 * Pro custom kalendáře s N měsíců funguje stejně.
 */
export function interpolateMonthly(
  monthly: MonthlyArray,
  monthIndex: number,
  day: number,
): number {
  const N = monthly.length;
  if (N === 0) throw new Error('interpolateMonthly: empty monthly array');
  if (N === 1) return monthly[0];

  const i = ((monthIndex % N) + N) % N;
  const current = monthly[i];
  const prev = monthly[(i - 1 + N) % N];
  const next = monthly[(i + 1) % N];

  // Předpoklad měsíce má ~30 dní; vrchol = den 15
  const clampedDay = Math.max(1, Math.min(30, day));

  if (clampedDay < 15) {
    // lerp z prev → current, day 1 = 50/50, day 15 = 100% current
    const t = (clampedDay - 1) / 14; // 0..1
    return prev * (1 - t) * 0.5 + current * (0.5 + 0.5 * t);
  } else if (clampedDay > 15) {
    // lerp z current → next
    const t = (clampedDay - 15) / 15; // 0..1
    return current * (1 - 0.5 * t) + next * (0.5 * t);
  }
  return current;
}

/**
 * Vrátí index "ekvivalentního měsíce" pro custom kalendář.
 * Mapuje custom month (0..N-1) na fraction 0..1, pak na 12-month equivalent.
 *
 * Použití: když má preset 12-month data, ale svět má custom 13-month kalendář,
 * tahle funkce řekne "měsíc 7 ve 13-month je ekvivalentní měsíci 6.46 ve 12-month".
 */
export function mapCustomMonthTo12(
  customIndex: number,
  customTotal: number,
): { lowerIndex: number; upperIndex: number; fraction: number } {
  if (customTotal === 12) {
    return { lowerIndex: customIndex, upperIndex: customIndex, fraction: 0 };
  }
  const fraction12 = (customIndex / customTotal) * 12;
  const lower = Math.floor(fraction12) % 12;
  const upper = (lower + 1) % 12;
  const frac = fraction12 - Math.floor(fraction12);
  return { lowerIndex: lower, upperIndex: upper, fraction: frac };
}
