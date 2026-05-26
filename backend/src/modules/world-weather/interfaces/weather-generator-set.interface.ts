// backend/src/modules/world-weather/interfaces/weather-generator-set.interface.ts

/**
 * 9.4 Weather Generator Set — domain interface.
 *
 * Set = pojmenovaný balíček itemů, každý item ukazuje na preset (string ID,
 * resolving FE). „Apply" vytvoří N generátorů ve světě naráz.
 */
export interface WeatherGeneratorSetItem {
  presetId: string;
  generatorName: string;
  description?: string;
}

export interface WeatherGeneratorSet {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  emoji?: string;
  items: WeatherGeneratorSetItem[];
  createdBy: string;
  appliedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWeatherGeneratorSetRepository {
  findByWorldId(worldId: string): Promise<WeatherGeneratorSet[]>;
  findById(id: string): Promise<WeatherGeneratorSet | null>;
  save(
    data: Omit<
      WeatherGeneratorSet,
      'id' | 'createdAt' | 'updatedAt' | 'appliedCount'
    >,
  ): Promise<WeatherGeneratorSet>;
  /**
   * Update whitelist — jen name/description/emoji/items.
   * `createdBy`, `appliedCount`, `worldId` jsou immutable.
   */
  update(
    id: string,
    data: Partial<
      Pick<WeatherGeneratorSet, 'name' | 'description' | 'emoji' | 'items'>
    >,
  ): Promise<WeatherGeneratorSet | null>;
  delete(id: string): Promise<boolean>;
  incrementAppliedCount(id: string): Promise<void>;
}
