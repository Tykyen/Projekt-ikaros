// AUTO-COPIED to FE via scripts/sync-simulation-to-fe.ts — DO NOT EDIT FE COPY DIRECTLY
// Source of truth: backend/src/modules/world-weather/simulation/

/**
 * Variance simulation module — sdílený mezi BE (real generování) a FE (trial preview).
 * Synced via `scripts/sync-simulation-to-fe.ts` (manual run; parity test gate v CI obou repos).
 */

export {
  mulberry32,
  gaussianFromUniform,
  gaussianRandom,
  seededGaussian,
  hashSeed,
} from './gaussianRandom';
export { interpolateMonthly, mapCustomMonthTo12 } from './seasonalInterp';
export { KOPPEN_STDDEV, stdDevFor } from './koppenStdDev';
export { MARKOV_MATRICES, validateMatrix } from './markovMatrices';
export {
  transitionWeatherType,
  getTransitionDistribution,
} from './markovTransition';
export {
  generateTemperature,
  isAnomaly,
  classifyStormAnomaly,
} from './varianceModel';
export {
  CLIMATE_EPOCHS,
  getClimateEpochForYear,
  getClimateEpochOffset,
} from './climateEpochs';
export type { ClimateEpoch } from './climateEpochs';
export type {
  KoppenZone,
  WeatherType,
  MonthlyArray,
  MarkovMatrix,
  AnomalyType,
  TemperatureInput,
  TemperatureOutput,
} from './types';
