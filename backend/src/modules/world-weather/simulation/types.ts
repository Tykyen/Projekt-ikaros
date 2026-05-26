// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

/**
 * Köppen-Geiger klimatické zóny (Peel et al. 2007).
 * Mírně zjednodušená sada — 16 hlavních zón používaných v presetech.
 */
export type KoppenZone =
  | 'Af' // Tropical rainforest
  | 'Am' // Tropical monsoon
  | 'Aw' // Tropical savanna
  | 'BWh' // Hot desert
  | 'BWk' // Cold desert
  | 'BSh' // Hot steppe
  | 'BSk' // Cold steppe
  | 'Csa' // Mediterranean hot summer
  | 'Csb' // Mediterranean warm summer
  | 'Cfa' // Humid subtropical
  | 'Cfb' // Oceanic
  | 'Dfa' // Continental hot summer
  | 'Dfb' // Continental warm summer
  | 'Dfc' // Subarctic
  | 'ET' // Tundra
  | 'EF' // Ice cap
  | 'EXTRATERRESTRIAL' // Mars/Měsíc/etc — bypass Köppen
  | 'CONTROLLED'; // Stanice/kupole — řízené HVAC

/**
 * Weather type — interní enum kompatibilní s WeatherTypeEntry['type'].
 */
export type WeatherType =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog';

/**
 * 12-hodnotové pole (Jan..Dec resp. Month0..Month11 pro custom kalendáře).
 * Pro custom calendar with !=12 months má délku = počet měsíců v daném kalendáři.
 */
export type MonthlyArray = readonly number[];

/**
 * Markov transition matrix — z aktuálního weather type na další.
 * Řádky musí sčítat = 1 (validace v testech).
 */
export type MarkovMatrix = Readonly<
  Record<WeatherType, Readonly<Record<WeatherType, number>>>
>;

/**
 * Anomaly typ — populated když |temp - expected| > 2 * stdDev.
 */
export type AnomalyType = 'heat_wave' | 'cold_snap' | 'severe_storm' | null;

/**
 * Public input pro generování teploty.
 */
export interface TemperatureInput {
  /** 0-based měsíc v ročním cyklu (custom calendar friendly). */
  monthIndex: number;
  /** 1-based den v měsíci (typ. 1-30, není moc citlivé). */
  day: number;
  /** Celkem měsíců v roce (12 pro Gregorian, custom). */
  monthsTotal: number;
  /** Měsíční průměry — délka = monthsTotal. */
  monthlyTemps: MonthlyArray;
  /** Měsíční std dev — délka = monthsTotal. Pokud chybí, použij `defaultStdDev`. */
  monthlyStdDev?: MonthlyArray;
  /** Fallback std dev když monthlyStdDev neexistuje. */
  defaultStdDev?: number;
  /** Seedable RNG seed pro deterministic output (testy + preview). Pokud chybí, použij Math.random. */
  seed?: number;
}

export interface TemperatureOutput {
  temperature: number;
  expectedAvg: number;
  stdDevUsed: number;
  isAnomaly: boolean;
  anomalyType: AnomalyType;
}
