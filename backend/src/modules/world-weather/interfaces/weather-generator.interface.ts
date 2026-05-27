export interface WeatherTypeEntry {
  type: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'custom';
  label: string;
  icon: string;
  probability: number;
  cloudRange: [number, number];
  precipRange: [number, number];
}

export interface CustomFieldConfig {
  label: string;
  possibleValues: string[];
  probability: number;
}

export interface WeatherGeneratorConfig {
  tempMin: number;
  tempMax: number;
  tempUnit: 'C' | 'F';
  weatherTypes: WeatherTypeEntry[];
  windMin: number;
  windMax: number;
  windGustMultiplier: number;
  pressureMin: number;
  pressureMax: number;
  humidityMin: number;
  humidityMax: number;
  customFields: CustomFieldConfig[];
  /** 9.4-I — měsíční průměry pro variance model. Délka = počet měsíců v calendar (12 default). Optional pro BC. */
  monthlyTemps?: number[];
  /** 9.4-I — měsíční std dev. Pokud chybí, fallback `KOPPEN_STDDEV[climateZone]` nebo defaultStdDev=4. */
  monthlyStdDev?: number[];
  /** 9.4-I — Köppen zóna pro Markov persistence + std dev. Optional, default odvozený z tempů. */
  climateZone?:
    | 'Af'
    | 'Am'
    | 'Aw'
    | 'BWh'
    | 'BWk'
    | 'BSh'
    | 'BSk'
    | 'Csa'
    | 'Csb'
    | 'Cfa'
    | 'Cfb'
    | 'Dfa'
    | 'Dfb'
    | 'Dfc'
    | 'ET'
    | 'EF'
    | 'EXTRATERRESTRIAL'
    | 'CONTROLLED';
}

export interface WeatherExtra {
  label: string;
  value: string;
  description?: string;
}

export interface WeatherResult {
  generatedAt: Date;
  isManual: boolean;
  temperature: number;
  tempUnit: string;
  weatherType: string;
  weatherIcon: string;
  cloudiness: { value: string; description: string };
  precipitation: { value: string; description: string };
  wind: { speed: number; gusts: number; unit: 'kmh' };
  pressure: { value: number; trend: string };
  humidity: number;
  extras: WeatherExtra[];
  narrativeText?: string | null;
  /** 9.4-I — variance metadata pro UI (anomaly chip + expected vs actual). */
  isAnomaly?: boolean;
  anomalyType?: 'heat_wave' | 'cold_snap' | 'severe_storm' | null;
  expectedAvg?: number | null;
  /** 9.4-I — calendar context (custom world calendar or Gregorian fallback). */
  calendarMonth?: { name: string; index: number; total: number } | null;
  /**
   * 9.4 — In-game datum/čas s kterým bylo počasí vygenerováno.
   * UI Card zobrazuje hour:minute místo real-world generatedAt.
   * `null` pokud svět nemá nastavený `worldSettings.currentInGameDate`.
   */
  inGameDate?: Date | string | null;
  /**
   * 9.4-J — `true` když config neměl `monthlyTemps` a BE musel použít synth
   * fallback `(tempMin+tempMax)/2 × 12` + `defaultStdDev`. Signál pro FE,
   * že generátor potřebuje repair (Aplikovat klimat).
   */
  climateModelMissing?: boolean;
}

export interface WeatherGenerator {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  config: WeatherGeneratorConfig;
  currentWeather?: WeatherResult;
  createdAt: Date;
  updatedAt: Date;
  /** 9.4-I — sdílené pořadí v gridu generátorů. Default 0 = nezařazené (end of list). */
  displayOrder: number;
}
