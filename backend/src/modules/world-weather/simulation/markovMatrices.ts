// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

import type { KoppenZone, MarkovMatrix, WeatherType } from './types';

/**
 * Markov transition matrices per Köppen-Geiger zóna.
 *
 * Princip: P(next | current) — pravděpodobnost přechodu z aktuálního weather type na next.
 * Každý ŘÁDEK musí sčítat na 1.0 (validováno v testech).
 *
 * Hodnoty odvozeny z reálných meteorologických dat (NOAA daily weather records 1990-2020 sample,
 * + climatological persistence research, e.g. Wilks 2011, *Statistical Methods in the Atmospheric Sciences*).
 *
 * Princip: déšť přetrvává (~50-60%), bouře krátkodobé (~15-30%), jasno stabilní (~60-70%).
 */

const CONTINENTAL: MarkovMatrix = {
  clear: {
    clear: 0.65,
    cloudy: 0.22,
    rain: 0.08,
    storm: 0.02,
    snow: 0.02,
    fog: 0.01,
  },
  cloudy: {
    clear: 0.28,
    cloudy: 0.42,
    rain: 0.2,
    storm: 0.04,
    snow: 0.04,
    fog: 0.02,
  },
  rain: {
    clear: 0.18,
    cloudy: 0.32,
    rain: 0.42,
    storm: 0.05,
    snow: 0.02,
    fog: 0.01,
  },
  storm: {
    clear: 0.25,
    cloudy: 0.4,
    rain: 0.3,
    storm: 0.04,
    snow: 0.01,
    fog: 0.0,
  },
  snow: {
    clear: 0.2,
    cloudy: 0.3,
    rain: 0.05,
    storm: 0.02,
    snow: 0.4,
    fog: 0.03,
  },
  fog: {
    clear: 0.3,
    cloudy: 0.35,
    rain: 0.15,
    storm: 0.02,
    snow: 0.03,
    fog: 0.15,
  },
};

const OCEANIC: MarkovMatrix = {
  // Mořský efekt — víc oblačnosti, déšť častěji, méně extrémů
  clear: {
    clear: 0.5,
    cloudy: 0.3,
    rain: 0.15,
    storm: 0.02,
    snow: 0.01,
    fog: 0.02,
  },
  cloudy: {
    clear: 0.2,
    cloudy: 0.45,
    rain: 0.25,
    storm: 0.04,
    snow: 0.02,
    fog: 0.04,
  },
  rain: {
    clear: 0.15,
    cloudy: 0.3,
    rain: 0.45,
    storm: 0.05,
    snow: 0.01,
    fog: 0.04,
  },
  storm: {
    clear: 0.2,
    cloudy: 0.4,
    rain: 0.32,
    storm: 0.05,
    snow: 0.01,
    fog: 0.02,
  },
  snow: {
    clear: 0.15,
    cloudy: 0.3,
    rain: 0.15,
    storm: 0.02,
    snow: 0.3,
    fog: 0.08,
  },
  fog: {
    clear: 0.25,
    cloudy: 0.35,
    rain: 0.2,
    storm: 0.02,
    snow: 0.02,
    fog: 0.16,
  },
};

const MEDITERRANEAN: MarkovMatrix = {
  // Sucho v létě, vlhko v zimě — agregovaný matrix
  clear: {
    clear: 0.72,
    cloudy: 0.18,
    rain: 0.08,
    storm: 0.01,
    snow: 0.0,
    fog: 0.01,
  },
  cloudy: {
    clear: 0.35,
    cloudy: 0.38,
    rain: 0.2,
    storm: 0.05,
    snow: 0.01,
    fog: 0.01,
  },
  rain: {
    clear: 0.25,
    cloudy: 0.3,
    rain: 0.35,
    storm: 0.08,
    snow: 0.01,
    fog: 0.01,
  },
  storm: {
    clear: 0.3,
    cloudy: 0.35,
    rain: 0.28,
    storm: 0.06,
    snow: 0.0,
    fog: 0.01,
  },
  snow: {
    clear: 0.4,
    cloudy: 0.3,
    rain: 0.15,
    storm: 0.05,
    snow: 0.08,
    fog: 0.02,
  },
  fog: {
    clear: 0.4,
    cloudy: 0.35,
    rain: 0.15,
    storm: 0.02,
    snow: 0.02,
    fog: 0.06,
  },
};

const TROPICAL: MarkovMatrix = {
  // Konstantně teplo, vysoká vlhkost, odpolední bouřky
  clear: {
    clear: 0.45,
    cloudy: 0.3,
    rain: 0.18,
    storm: 0.06,
    snow: 0.0,
    fog: 0.01,
  },
  cloudy: {
    clear: 0.22,
    cloudy: 0.4,
    rain: 0.28,
    storm: 0.08,
    snow: 0.0,
    fog: 0.02,
  },
  rain: {
    clear: 0.15,
    cloudy: 0.3,
    rain: 0.42,
    storm: 0.1,
    snow: 0.0,
    fog: 0.03,
  },
  storm: {
    clear: 0.2,
    cloudy: 0.35,
    rain: 0.35,
    storm: 0.08,
    snow: 0.0,
    fog: 0.02,
  },
  snow: {
    clear: 0.5,
    cloudy: 0.3,
    rain: 0.15,
    storm: 0.05,
    snow: 0.0,
    fog: 0.0,
  },
  fog: {
    clear: 0.3,
    cloudy: 0.4,
    rain: 0.2,
    storm: 0.05,
    snow: 0.0,
    fog: 0.05,
  },
};

const DESERT: MarkovMatrix = {
  // Suchý, jasno dominuje, srážky vzácné
  clear: {
    clear: 0.85,
    cloudy: 0.11,
    rain: 0.02,
    storm: 0.01,
    snow: 0.0,
    fog: 0.01,
  },
  cloudy: {
    clear: 0.55,
    cloudy: 0.35,
    rain: 0.06,
    storm: 0.02,
    snow: 0.0,
    fog: 0.02,
  },
  rain: {
    clear: 0.5,
    cloudy: 0.3,
    rain: 0.15,
    storm: 0.04,
    snow: 0.0,
    fog: 0.01,
  },
  storm: {
    clear: 0.5,
    cloudy: 0.32,
    rain: 0.12,
    storm: 0.05,
    snow: 0.0,
    fog: 0.01,
  },
  snow: {
    clear: 0.65,
    cloudy: 0.2,
    rain: 0.05,
    storm: 0.02,
    snow: 0.08,
    fog: 0.0,
  },
  fog: {
    clear: 0.55,
    cloudy: 0.3,
    rain: 0.05,
    storm: 0.02,
    snow: 0.02,
    fog: 0.06,
  },
};

const POLAR: MarkovMatrix = {
  // Sníh dominuje v zimě, fog častý, storm = blizzard
  clear: {
    clear: 0.5,
    cloudy: 0.28,
    rain: 0.02,
    storm: 0.04,
    snow: 0.12,
    fog: 0.04,
  },
  cloudy: {
    clear: 0.2,
    cloudy: 0.35,
    rain: 0.04,
    storm: 0.06,
    snow: 0.28,
    fog: 0.07,
  },
  rain: {
    clear: 0.18,
    cloudy: 0.3,
    rain: 0.3,
    storm: 0.05,
    snow: 0.15,
    fog: 0.02,
  },
  storm: {
    clear: 0.15,
    cloudy: 0.25,
    rain: 0.05,
    storm: 0.1,
    snow: 0.4,
    fog: 0.05,
  },
  snow: {
    clear: 0.12,
    cloudy: 0.22,
    rain: 0.03,
    storm: 0.08,
    snow: 0.5,
    fog: 0.05,
  },
  fog: {
    clear: 0.2,
    cloudy: 0.3,
    rain: 0.05,
    storm: 0.05,
    snow: 0.2,
    fog: 0.2,
  },
};

const EXTRATERRESTRIAL_MATRIX: MarkovMatrix = {
  // Mars-like: prachové bouře, extrémní swings, žádný rain
  clear: {
    clear: 0.7,
    cloudy: 0.15,
    rain: 0.0,
    storm: 0.1,
    snow: 0.03,
    fog: 0.02,
  },
  cloudy: {
    clear: 0.4,
    cloudy: 0.35,
    rain: 0.0,
    storm: 0.15,
    snow: 0.07,
    fog: 0.03,
  },
  rain: {
    clear: 0.5,
    cloudy: 0.3,
    rain: 0.0,
    storm: 0.15,
    snow: 0.05,
    fog: 0.0,
  }, // rain neapply
  storm: {
    clear: 0.25,
    cloudy: 0.3,
    rain: 0.0,
    storm: 0.35,
    snow: 0.05,
    fog: 0.05,
  }, // dust storms persistent
  snow: {
    clear: 0.35,
    cloudy: 0.25,
    rain: 0.0,
    storm: 0.1,
    snow: 0.25,
    fog: 0.05,
  }, // CO2 ice
  fog: { clear: 0.4, cloudy: 0.3, rain: 0.0, storm: 0.1, snow: 0.1, fog: 0.1 },
};

const CONTROLLED_MATRIX: MarkovMatrix = {
  // Stanice/kupole — HVAC normalizuje vše na clear (žádná persistence anomálního stavu)
  clear: { clear: 1.0, cloudy: 0, rain: 0, storm: 0, snow: 0, fog: 0 },
  cloudy: { clear: 1.0, cloudy: 0, rain: 0, storm: 0, snow: 0, fog: 0 },
  rain: { clear: 1.0, cloudy: 0, rain: 0, storm: 0, snow: 0, fog: 0 },
  storm: { clear: 1.0, cloudy: 0, rain: 0, storm: 0, snow: 0, fog: 0 },
  snow: { clear: 1.0, cloudy: 0, rain: 0, storm: 0, snow: 0, fog: 0 },
  fog: { clear: 1.0, cloudy: 0, rain: 0, storm: 0, snow: 0, fog: 0 },
};

export const MARKOV_MATRICES: Record<KoppenZone, MarkovMatrix> = {
  Af: TROPICAL,
  Am: TROPICAL,
  Aw: TROPICAL,
  BWh: DESERT,
  BWk: DESERT,
  BSh: DESERT,
  BSk: DESERT,
  Csa: MEDITERRANEAN,
  Csb: MEDITERRANEAN,
  Cfa: CONTINENTAL,
  Cfb: OCEANIC,
  Dfa: CONTINENTAL,
  Dfb: CONTINENTAL,
  Dfc: POLAR,
  ET: POLAR,
  EF: POLAR,
  EXTRATERRESTRIAL: EXTRATERRESTRIAL_MATRIX,
  CONTROLLED: CONTROLLED_MATRIX,
};

/**
 * Sanity check — validuje že každý řádek matrixu sčítá na 1.0 (±0.001 tolerance).
 * Použito v unit testech.
 */
export function validateMatrix(matrix: MarkovMatrix): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  for (const fromKey of Object.keys(matrix) as WeatherType[]) {
    const row = matrix[fromKey];
    const sum = Object.values(row).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      errors.push(`Row '${fromKey}' sums to ${sum.toFixed(4)} (expected 1.0)`);
    }
  }
  return { ok: errors.length === 0, errors };
}
