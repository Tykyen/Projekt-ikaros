// 9.4 dluh #2 — historie počasí (snapshot persistence).

import type { WeatherResult } from './weather-generator.interface';

export type WeatherHistoryTrigger = 'generate' | 'manual' | 'advance-day';

export interface WeatherHistoryEntry {
  id: string;
  worldId: string;
  generatorId: string;
  weather: WeatherResult;
  inGameDate: Date | null;
  trigger: WeatherHistoryTrigger;
  recordedAt: Date;
}

export interface IWeatherHistoryRepository {
  appendSnapshot(input: {
    worldId: string;
    generatorId: string;
    weather: WeatherResult;
    trigger: WeatherHistoryTrigger;
    inGameDate?: Date | null;
  }): Promise<WeatherHistoryEntry>;

  /** Sort `recordedAt` desc (nejnovější první). */
  findByGenerator(
    worldId: string,
    generatorId: string,
    limit?: number,
    offset?: number,
  ): Promise<WeatherHistoryEntry[]>;

  count(worldId: string, generatorId: string): Promise<number>;
}
