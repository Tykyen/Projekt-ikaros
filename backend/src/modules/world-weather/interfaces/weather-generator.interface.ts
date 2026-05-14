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
}
