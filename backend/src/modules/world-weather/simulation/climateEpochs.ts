// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

/**
 * Climate epochs — historické/budoucí klimatické období s temperature offset.
 *
 * Vědecké zdroje:
 * - IPCC AR6 Working Group I report (2021) — modern + future scenarios
 * - Clark et al. 2009 Science — Last Glacial Maximum (LGM)
 * - McCormick et al. 2012 — Roman Climate Optimum
 * - Büntgen et al. 2016 Nature — Late Antique Little Ice Age
 * - Lamb 1965 + IPCC — Medieval Warm Period (MWP)
 * - Mann et al. 2009 Science — Little Ice Age
 *
 * Year is Gregorian (CE = positive, BCE = negative). Year 0 = 1 BCE (astronomical numbering).
 * Pokud rok < earliest epoch → fallback LGM. Pokud > latest → fallback far-future.
 *
 * Epoch ranges jsou **contiguous** — yearTo[n] === yearFrom[n+1]. Žádné gaps.
 */

export interface ClimateEpoch {
  id: string;
  name: string;
  /** Inclusive start (BCE = negative). */
  yearFrom: number;
  /** Exclusive end. */
  yearTo: number;
  /** Temperature offset proti modern baseline (1900-2020) in Celsius. */
  tempOffsetCelsius: number;
  /** Krátký popis pro UI. */
  description: string;
  /** Primární zdroj pro audit. */
  source: string;
}

export const CLIMATE_EPOCHS: readonly ClimateEpoch[] = [
  {
    id: 'last-glacial-maximum',
    name: 'Doba ledová (LGM)',
    yearFrom: -25000,
    yearTo: -18000,
    tempOffsetCelsius: -5,
    description:
      'Vrchol poslední doby ledové. Globální průměr -5°C, ledovce do Velké Británie.',
    source: 'Clark et al. 2009 Science',
  },
  {
    id: 'late-pleistocene',
    name: 'Pozdní pleistocén',
    yearFrom: -18000,
    yearTo: -10000,
    tempOffsetCelsius: -3,
    description: 'Konec doby ledové, ústup ledovců. Globální průměr -3°C.',
    source: 'Clark et al. 2009',
  },
  {
    id: 'early-holocene',
    name: 'Raný holocén',
    yearFrom: -10000,
    yearTo: -7000,
    tempOffsetCelsius: -0.5,
    description: 'Stabilizace klimatu po konci doby ledové.',
    source: 'IPCC AR6 paleo chapter',
  },
  {
    id: 'holocene-optimum',
    name: 'Holocénní klimatické optimum',
    yearFrom: -7000,
    yearTo: -3000,
    tempOffsetCelsius: 1.5,
    description:
      'Sahara byla zelená, vlhko v severní Africe. Globální průměr +1.5°C.',
    source: 'IPCC AR6',
  },
  {
    id: 'late-bronze-age',
    name: 'Pozdní doba bronzová',
    yearFrom: -3000,
    yearTo: -1000,
    tempOffsetCelsius: 0.3,
    description: 'Mírně teplejší než modern. Stabilní zemědělství.',
    source: 'IPCC AR6 paleo chapter',
  },
  {
    id: 'iron-age-cold',
    name: 'Doba železná (chladná)',
    yearFrom: -1000,
    yearTo: -200,
    tempOffsetCelsius: -0.3,
    description: 'Mírně chladnější. Konec bronzové éry, migrace.',
    source: 'IPCC AR6',
  },
  {
    id: 'roman-warm',
    name: 'Římské klimatické optimum',
    yearFrom: -200,
    yearTo: 400,
    tempOffsetCelsius: 0.5,
    description: 'Stabilní teplé klima. Vinné révy v Británii, rozkvět Říma.',
    source: 'McCormick et al. 2012',
  },
  {
    id: 'late-antique-cold',
    name: 'Pozdně-antický malý ledový pohyb',
    yearFrom: 400,
    yearTo: 800,
    tempOffsetCelsius: -0.5,
    description: 'Migrace národů, chlad, sopečné erupce 536 CE.',
    source: 'Büntgen et al. 2016 Nature',
  },
  {
    id: 'medieval-warm',
    name: 'Středověké klimatické optimum (MWP)',
    yearFrom: 800,
    yearTo: 1300,
    tempOffsetCelsius: 0.7,
    description:
      'Vikingská kolonizace Grónska, vinné révy v Anglii. Vrchol ~950-1250.',
    source: 'IPCC AR6, Lamb 1965',
  },
  {
    id: 'little-ice-age',
    name: 'Malá doba ledová',
    yearFrom: 1300,
    yearTo: 1850,
    tempOffsetCelsius: -0.7,
    description:
      'Zamrzlá Temže, krátká léta, hladomory. Maunder/Dalton solar minimum.',
    source: 'Mann et al. 2009 Science',
  },
  {
    id: 'pre-industrial',
    name: 'Pre-industriální',
    yearFrom: 1850,
    yearTo: 1900,
    tempOffsetCelsius: -0.2,
    description: 'IPCC baseline pre-industrial. Začátek průmyslové revoluce.',
    source: 'IPCC AR6',
  },
  {
    id: 'modern',
    name: 'Moderní',
    yearFrom: 1900,
    yearTo: 2020,
    tempOffsetCelsius: 0,
    description: 'Klimatický baseline 20. století. WMO 1981-2010 normals.',
    source: 'WMO',
  },
  {
    id: 'near-future',
    name: 'Blízká budoucnost',
    yearFrom: 2020,
    yearTo: 2050,
    tempOffsetCelsius: 1.2,
    description: 'IPCC SSP2-4.5 trajektorie. Heat waves, extrémy.',
    source: 'IPCC AR6 SSP2-4.5',
  },
  {
    id: 'mid-century',
    name: 'Polovina 21. století',
    yearFrom: 2050,
    yearTo: 2100,
    tempOffsetCelsius: 2.5,
    description: 'IPCC SSP2-4.5/SSP3-7.0. Permafrost rozpadá, sea level rise.',
    source: 'IPCC AR6',
  },
  {
    id: 'late-century',
    name: 'Konec 21. století',
    yearFrom: 2100,
    yearTo: 2200,
    tempOffsetCelsius: 3.5,
    description: 'IPCC SSP3-7.0. Velké klimatické posuny, biomy se přesouvají.',
    source: 'IPCC AR6 SSP3-7.0',
  },
  {
    id: 'far-future',
    name: 'Vzdálená budoucnost',
    yearFrom: 2200,
    yearTo: 3000,
    tempOffsetCelsius: 4.5,
    description: 'Spekulativní extrapolace high-emission scenarios.',
    source: 'IPCC AR6 extrapolated',
  },
];

/**
 * Najde epoch pro daný rok. Fallback:
 *  - year < earliest yearFrom → first epoch (LGM)
 *  - year >= last yearTo → last epoch (far-future)
 */
export function getClimateEpochForYear(year: number): ClimateEpoch {
  // Sorted by yearFrom — find first epoch which contains year
  for (const e of CLIMATE_EPOCHS) {
    if (year >= e.yearFrom && year < e.yearTo) return e;
  }
  // Fallback: pre-LGM → LGM; post-3000 → far-future
  if (year < CLIMATE_EPOCHS[0].yearFrom) return CLIMATE_EPOCHS[0];
  return CLIMATE_EPOCHS[CLIMATE_EPOCHS.length - 1];
}

/** Vrátí offset v °C pro daný rok (volá `getClimateEpochForYear`). */
export function getClimateEpochOffset(year: number): number {
  return getClimateEpochForYear(year).tempOffsetCelsius;
}
