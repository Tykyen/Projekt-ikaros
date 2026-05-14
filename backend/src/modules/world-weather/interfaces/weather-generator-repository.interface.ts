import { WeatherGenerator, WeatherResult } from './weather-generator.interface';

export interface IWeatherGeneratorRepository {
  findById(id: string): Promise<WeatherGenerator | null>;
  findByWorldId(worldId: string): Promise<WeatherGenerator[]>;
  save(data: Partial<WeatherGenerator>): Promise<WeatherGenerator>;
  update(
    id: string,
    data: Partial<WeatherGenerator>,
  ): Promise<WeatherGenerator | null>;
  setCurrentWeather(
    id: string,
    weather: WeatherResult,
  ): Promise<WeatherGenerator | null>;
  delete(id: string): Promise<boolean>;
}
