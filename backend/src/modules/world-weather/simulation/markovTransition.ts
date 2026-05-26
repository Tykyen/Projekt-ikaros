// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

import { MARKOV_MATRICES } from './markovMatrices';
import type { KoppenZone, WeatherType } from './types';

/**
 * Vybere další weather type na základě aktuálního + Köppen zóny.
 *
 * Princip: kumulativní pravděpodobnost — vygeneruje uniform [0, 1), porovná s cum-sum
 * řádku matrixu pro daný `current` type.
 *
 * Pokud `current === null` (cold start, žádný předchozí stav) → použij rovnoměrné rozložení
 * vážené `defaultProbabilities` (z config.weatherTypes).
 *
 * @param current Aktuální weather type, nebo null pro cold start
 * @param zone Köppen zóna pro výběr matrixu
 * @param rng Seedable RNG, default Math.random
 */
export function transitionWeatherType(
  current: WeatherType | null,
  zone: KoppenZone,
  rng: () => number = Math.random,
): WeatherType {
  const matrix = MARKOV_MATRICES[zone] ?? MARKOV_MATRICES.Cfb;

  if (current === null) {
    // Cold start — uniform weighted nad všemi types
    // Použij `clear` row jako reference distribution (typicky stable starting point)
    return pickFromRow(matrix.clear, rng);
  }

  const row = matrix[current];
  return pickFromRow(row, rng);
}

/**
 * Vybere klíč z distribution (mapování type → probability).
 * Předpoklad: hodnoty sčítají na 1.0 (validováno v testech).
 */
function pickFromRow(
  row: Readonly<Record<WeatherType, number>>,
  rng: () => number,
): WeatherType {
  const r = rng();
  let cum = 0;
  // Deterministic order — explicit klíč list
  const order: WeatherType[] = [
    'clear',
    'cloudy',
    'rain',
    'storm',
    'snow',
    'fog',
  ];
  for (const key of order) {
    cum += row[key];
    if (r < cum) return key;
  }
  // Fallback (numerická chyba sčítání)
  return 'clear';
}

/**
 * Helper — vrátí distribution pro daný (zone, currentType) jako pole [type, probability].
 * Užitečné pro UI debug / tooltip „pravděpodobnost zítřejšího počasí".
 */
export function getTransitionDistribution(
  current: WeatherType | null,
  zone: KoppenZone,
): Array<{ type: WeatherType; probability: number }> {
  const matrix = MARKOV_MATRICES[zone] ?? MARKOV_MATRICES.Cfb;
  const row = current ? matrix[current] : matrix.clear;
  const order: WeatherType[] = [
    'clear',
    'cloudy',
    'rain',
    'storm',
    'snow',
    'fog',
  ];
  return order.map((type) => ({ type, probability: row[type] }));
}
