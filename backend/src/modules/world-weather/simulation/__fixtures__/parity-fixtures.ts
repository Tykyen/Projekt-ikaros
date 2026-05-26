// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

/**
 * Parity fixtures — deterministic test cases pro variance simulation.
 *
 * Účel: ověřit, že BE i FE produkují IDENTICKÝ output pro stejný seed.
 * CI gate v obou repos běží tytéž fixtures.
 *
 * Pokud změníš simulation logiku, AKTUALIZUJ tento soubor s novými očekávanými hodnotami
 * (jeden zdroj pravdy = `npm run sim:fixtures:regenerate` v BE).
 */

import type { TemperatureInput } from '../types';

export const PRAHA_CONFIG = {
  monthlyTemps: [-1, 0, 4, 9, 14, 17, 19, 19, 14, 9, 4, 0] as const,
  monthlyStdDev: [
    5.5, 5.5, 5.0, 4.5, 4.0, 3.8, 3.5, 3.5, 4.0, 4.5, 5.0, 5.5,
  ] as const,
  monthsTotal: 12,
};

export const SINGAPORE_CONFIG = {
  monthlyTemps: [26, 27, 28, 28, 28, 28, 27, 27, 27, 27, 27, 26] as const,
  monthlyStdDev: [
    1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5,
  ] as const,
  monthsTotal: 12,
};

export const MARS_GALE_CONFIG = {
  monthlyTemps: [
    -65, -70, -75, -80, -75, -65, -55, -50, -55, -60, -65, -65,
  ] as const,
  monthlyStdDev: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15] as const,
  monthsTotal: 12,
};

export interface ParityFixture {
  name: string;
  input: TemperatureInput;
  expectedTemperature: number; // ±0.1 tolerance
  expectedIsAnomaly: boolean;
}

/**
 * Generated 2026-05-26 — pokud změníš simulation logiku, regeneruj.
 *
 * Hodnoty vznikly spuštěním `generateTemperature()` v BE s konkrétními seedy.
 * Cíl: každý seed musí dát identický temperature ±0.1 v BE i FE.
 */
/**
 * Hodnoty regenerovány 2026-05-26 přes PARITY_REGENERATE=1 npm test.
 * Pro úpravu po legitimní změně simulation logiky:
 *   1. cd backend && PARITY_REGENERATE=1 npx jest parity.spec
 *   2. Update hodnoty zde dle console output
 *   3. ts-node backend/scripts/sync-simulation-to-fe.ts (zkopíruje do FE)
 *   4. Commit oba repos současně
 */
export const PARITY_FIXTURES: ParityFixture[] = [
  {
    name: 'Praha leden den 1 seed=42',
    input: { ...PRAHA_CONFIG, monthIndex: 0, day: 1, seed: 42 },
    expectedTemperature: -5.8,
    expectedIsAnomaly: false,
  },
  {
    name: 'Praha červenec den 15 seed=42',
    input: { ...PRAHA_CONFIG, monthIndex: 6, day: 15, seed: 42 },
    expectedTemperature: 15.7,
    expectedIsAnomaly: false,
  },
  {
    name: 'Praha leden den 15 seed=100',
    input: { ...PRAHA_CONFIG, monthIndex: 0, day: 15, seed: 100 },
    expectedTemperature: -4.9,
    expectedIsAnomaly: false,
  },
  {
    name: 'Singapore srpen den 15 seed=42',
    input: { ...SINGAPORE_CONFIG, monthIndex: 7, day: 15, seed: 42 },
    expectedTemperature: 25.6,
    expectedIsAnomaly: false,
  },
  {
    name: 'Mars zima seed=1234 — extrémní variabilita',
    input: { ...MARS_GALE_CONFIG, monthIndex: 3, day: 15, seed: 1234 },
    expectedTemperature: -89.9,
    expectedIsAnomaly: false,
  },
  {
    name: 'Praha červenec seed=999 — vysoká teplota',
    input: { ...PRAHA_CONFIG, monthIndex: 6, day: 20, seed: 999 },
    expectedTemperature: 18.4,
    expectedIsAnomaly: false,
  },
  {
    name: 'Praha duben den 30 seed=7 — heat_wave anomálie',
    input: { ...PRAHA_CONFIG, monthIndex: 3, day: 30, seed: 7 },
    expectedTemperature: 23.9,
    expectedIsAnomaly: true,
  },
];
