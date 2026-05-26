// backend/src/modules/world-weather/interfaces/custom-weather-preset.interface.ts

import type { WeatherGeneratorConfig } from './weather-generator.interface';

/**
 * 9.4-dluh — Custom preset save snapshot per svět.
 */
export interface CustomWeatherPreset {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  emoji?: string;
  config: WeatherGeneratorConfig;
  createdBy: string;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomWeatherPresetRepository {
  findByWorldId(worldId: string): Promise<CustomWeatherPreset[]>;
  findById(id: string): Promise<CustomWeatherPreset | null>;
  save(
    data: Omit<CustomWeatherPreset, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomWeatherPreset>;
  /** Update jen metadata — name/description/emoji. Config je immutable. */
  update(
    id: string,
    data: Partial<Pick<CustomWeatherPreset, 'name' | 'description' | 'emoji'>>,
  ): Promise<CustomWeatherPreset | null>;
  delete(id: string): Promise<boolean>;
  /** Atomic increment usageCount. */
  incrementUsage(id: string): Promise<CustomWeatherPreset | null>;
}
