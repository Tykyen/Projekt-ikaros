// backend/src/modules/world-weather/dto/custom-weather-preset.dto.ts

import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { WeatherGeneratorConfigDto } from './create-weather-generator.dto';

/**
 * 9.4-dluh — Create custom preset.
 */
export class CreateCustomPresetDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() @MaxLength(8) emoji?: string;
  @ValidateNested()
  @Type(() => WeatherGeneratorConfigDto)
  config: WeatherGeneratorConfigDto;
}

/**
 * 9.4-dluh — Update custom preset (jen metadata; config je immutable).
 */
export class UpdateCustomPresetDto {
  @IsString() @IsNotEmpty() @IsOptional() @MaxLength(80) name?: string;
  @IsString() @IsOptional() @MaxLength(500) description?: string;
  @IsString() @IsOptional() @MaxLength(8) emoji?: string;
}
