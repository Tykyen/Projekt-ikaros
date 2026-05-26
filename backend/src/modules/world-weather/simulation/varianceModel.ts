// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

import { gaussianFromUniform, mulberry32 } from './gaussianRandom';
import { interpolateMonthly } from './seasonalInterp';
import type {
  AnomalyType,
  TemperatureInput,
  TemperatureOutput,
  WeatherType,
} from './types';

/**
 * Hlavní teplotní generátor — Gaussian variance + extrémy.
 *
 * Algoritmus:
 *  1. Spočítej `expectedAvg` interpolací mezi měsíčními průměry (sezónní variabilita v daném měsíci).
 *  2. Vyber std dev (z monthlyStdDev[monthIndex] nebo defaultStdDev fallback).
 *  3. Gaussian sample N(0, 1) × stdDev → typický denní výkyv.
 *  4. S 5% pravděpodobností přidej extreme shift (±2-3 σ) → heat wave / cold snap.
 *  5. Vyhodnoť anomálii: |result - expectedAvg| > 2 * stdDev → flag + classify.
 *
 * Deterministic když `seed` poskytnut, jinak Math.random.
 */
export function generateTemperature(
  input: TemperatureInput,
): TemperatureOutput {
  const {
    monthIndex,
    day,
    monthsTotal,
    monthlyTemps,
    monthlyStdDev,
    defaultStdDev = 4.0,
    seed,
  } = input;

  if (monthlyTemps.length !== monthsTotal) {
    throw new Error(
      `monthlyTemps length (${monthlyTemps.length}) !== monthsTotal (${monthsTotal})`,
    );
  }

  const rng = seed !== undefined ? mulberry32(seed) : Math.random;

  // 1. Expected average for given month + day
  const expectedAvg = interpolateMonthly(monthlyTemps, monthIndex, day);

  // 2. Std dev for this month
  let stdDev = defaultStdDev;
  if (monthlyStdDev && monthlyStdDev.length === monthsTotal) {
    const N = monthlyStdDev.length;
    stdDev = monthlyStdDev[((monthIndex % N) + N) % N];
  }

  // 3. Gaussian variance — typical day
  const u1 = rng();
  const u2 = rng();
  const z = gaussianFromUniform(u1, u2);
  const variance = z * stdDev;

  // 4. Extreme events — 5% chance of >2σ shift
  const extremeRoll = rng();
  let extremeShift = 0;
  if (extremeRoll < 0.05) {
    const sign = rng() > 0.5 ? 1 : -1;
    extremeShift = sign * stdDev * (2 + rng()); // 2-3 σ
  }

  const temperature =
    Math.round((expectedAvg + variance + extremeShift) * 10) / 10;

  // 5. Anomaly classification
  const deviation = Math.abs(temperature - expectedAvg);
  const isAnom = deviation > 2 * stdDev;
  let anomalyType: AnomalyType = null;
  if (isAnom) {
    if (temperature > expectedAvg) anomalyType = 'heat_wave';
    else anomalyType = 'cold_snap';
  }

  return {
    temperature,
    expectedAvg: Math.round(expectedAvg * 10) / 10,
    stdDevUsed: stdDev,
    isAnomaly: isAnom,
    anomalyType,
  };
}

/**
 * Helper — vyhodnotí anomálii bez generování (např. pro ručně nastavenou teplotu).
 */
export function isAnomaly(
  temperature: number,
  expectedAvg: number,
  stdDev: number,
): { isAnomaly: boolean; anomalyType: AnomalyType } {
  const dev = Math.abs(temperature - expectedAvg);
  if (dev <= 2 * stdDev) return { isAnomaly: false, anomalyType: null };
  return {
    isAnomaly: true,
    anomalyType: temperature > expectedAvg ? 'heat_wave' : 'cold_snap',
  };
}

/**
 * Helper — klasifikace bouře jako anomálie (mimo teplotní rámec).
 * Storm anomaly = storm trvající >1 den (Markov persistence > average) NEBO storm v zóně kde je vzácné.
 */
export function classifyStormAnomaly(
  current: WeatherType,
  consecutiveDays: number,
): AnomalyType {
  if (current === 'storm' && consecutiveDays >= 2) return 'severe_storm';
  return null;
}
