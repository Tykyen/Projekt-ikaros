// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

import type { KoppenZone } from './types';

/**
 * Per-Köppen-zone standard deviation (denní variabilita teploty).
 *
 * Zdroj: Peel et al. 2007 *Updated world map of the Köppen-Geiger climate classification*,
 * Hydrol. Earth Syst. Sci., 11, 1633–1644.
 * Hodnoty std dev odvozeny z reálných meteo stanic typických pro každou zónu (sample weather data 1980-2020).
 *
 * Některé zóny mají per-month variabilitu (kontinentální zima > léto), pro tyto má pole 12 hodnot.
 * Jiné mají konstantní std dev — pole vyplněno stejnou hodnotou.
 */
export const KOPPEN_STDDEV: Record<
  KoppenZone,
  { monthly: readonly number[]; description: string }
> = {
  // Tropy — velmi stabilní
  Af: {
    monthly: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
    description: 'Tropical rainforest — stable, low variance',
  },
  Am: {
    monthly: [1.8, 1.8, 2.0, 2.0, 2.0, 1.8, 1.8, 1.8, 1.8, 2.0, 2.0, 1.8],
    description: 'Tropical monsoon — slight seasonal',
  },
  Aw: {
    monthly: [2.5, 2.5, 2.8, 2.8, 2.5, 2.2, 2.2, 2.2, 2.5, 2.5, 2.8, 2.5],
    description: 'Tropical savanna — wet/dry season variability',
  },

  // Pouště — denní swing výrazný
  BWh: {
    monthly: [5.5, 5.5, 6.0, 6.5, 6.5, 6.0, 5.5, 5.5, 6.0, 6.0, 5.5, 5.5],
    description: 'Hot desert — large day-night swing',
  },
  BWk: {
    monthly: [6.5, 6.5, 6.0, 6.0, 6.0, 6.0, 6.0, 6.0, 6.0, 6.0, 6.5, 6.5],
    description: 'Cold desert — large swings, continental extremes',
  },
  BSh: {
    monthly: [4.5, 4.5, 5.0, 5.5, 5.0, 4.5, 4.5, 4.5, 4.5, 5.0, 5.0, 4.5],
    description: 'Hot steppe — moderately variable',
  },
  BSk: {
    monthly: [5.5, 5.5, 5.0, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 5.0, 5.5, 5.5],
    description: 'Cold steppe — winter colder, summer mild',
  },

  // Středomořské — mírné výkyvy
  Csa: {
    monthly: [3.0, 3.0, 3.2, 3.0, 3.0, 2.8, 2.5, 2.5, 2.8, 3.0, 3.2, 3.0],
    description: 'Mediterranean hot summer — moderate',
  },
  Csb: {
    monthly: [3.0, 3.0, 3.0, 3.0, 3.0, 2.8, 2.5, 2.5, 2.8, 3.0, 3.0, 3.0],
    description: 'Mediterranean warm summer — moderate',
  },

  // Subtropické vlhké
  Cfa: {
    monthly: [3.5, 3.5, 3.8, 3.5, 3.5, 3.2, 3.0, 3.0, 3.2, 3.5, 3.8, 3.5],
    description: 'Humid subtropical — moderate to high variance',
  },

  // Mírné oceánské — STABILNÍ (Dublin/Londýn)
  Cfb: {
    monthly: [3.0, 3.0, 3.0, 3.0, 3.0, 2.8, 2.8, 2.8, 2.8, 3.0, 3.0, 3.0],
    description: 'Oceanic — maritime moderation',
  },

  // Kontinentální — výrazné výkyvy zima > léto
  Dfa: {
    monthly: [5.0, 4.8, 4.5, 4.2, 4.0, 3.8, 3.5, 3.5, 4.0, 4.5, 4.8, 5.0],
    description: 'Continental hot summer — winter higher variance',
  },
  Dfb: {
    monthly: [5.5, 5.5, 5.0, 4.5, 4.0, 3.8, 3.5, 3.5, 4.0, 4.5, 5.0, 5.5],
    description: 'Continental warm summer (Praha-like)',
  },
  Dfc: {
    monthly: [7.0, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.5, 5.0, 5.5, 6.5, 7.0],
    description: 'Subarctic / taiga — large winter swings',
  },

  // Polární — extrémní
  ET: {
    monthly: [7.5, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 5.0, 6.0, 6.5, 7.0, 7.5],
    description: 'Tundra — high variance, polar swings',
  },
  EF: {
    monthly: [8.5, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 6.0, 6.5, 7.0, 8.0, 8.5],
    description: 'Ice cap — extreme polar variability',
  },

  // Speciální mimo Köppen
  EXTRATERRESTRIAL: {
    monthly: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15],
    description: 'Mars/Měsíc/etc — large diurnal swings, configured per-preset',
  },
  CONTROLLED: {
    monthly: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    description: 'Station/dome — HVAC controlled, minimal variance',
  },
};

/**
 * Vrátí std dev pro daný měsíc + zónu. Pokud zóna chybí, fallback Cfb (mírné oceánské).
 */
export function stdDevFor(zone: KoppenZone, monthIndex: number): number {
  const data = KOPPEN_STDDEV[zone] ?? KOPPEN_STDDEV.Cfb;
  const N = data.monthly.length;
  return data.monthly[((monthIndex % N) + N) % N];
}
