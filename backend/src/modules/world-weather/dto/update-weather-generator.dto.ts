// backend/src/modules/world-weather/dto/update-weather-generator.dto.ts

import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { WeatherGeneratorConfigDto } from './create-weather-generator.dto';

export class UpdateWeatherGeneratorDto {
  @IsString() @IsNotEmpty() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @ValidateNested()
  @Type(() => WeatherGeneratorConfigDto)
  @IsOptional()
  config?: WeatherGeneratorConfigDto;
}
