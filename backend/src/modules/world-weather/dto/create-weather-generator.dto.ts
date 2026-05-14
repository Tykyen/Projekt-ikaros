// backend/src/modules/world-weather/dto/create-weather-generator.dto.ts

import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsIn,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
  IsNotEmpty,
} from 'class-validator';

export class WeatherTypeEntryDto {
  @IsIn(['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'custom'])
  type: string;

  @IsString() @IsNotEmpty() label: string;
  @IsString() @IsNotEmpty() icon: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  probability: number;

  @IsArray()
  @ArrayMinSize(2)
  cloudRange: [number, number];

  @IsArray()
  @ArrayMinSize(2)
  precipRange: [number, number];
}

export class CustomFieldConfigDto {
  @IsString() @IsNotEmpty() label: string;
  @IsArray() @ArrayMinSize(1) possibleValues: string[];
  @IsNumber() @Min(0) @Max(100) probability: number;
}

export class WeatherGeneratorConfigDto {
  @IsNumber() tempMin: number;
  @IsNumber() tempMax: number;
  @IsIn(['C', 'F']) @IsOptional() tempUnit?: 'C' | 'F';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeatherTypeEntryDto)
  weatherTypes: WeatherTypeEntryDto[];

  @IsNumber() @Min(0) windMin: number;
  @IsNumber() @Min(0) windMax: number;
  @IsNumber() @Min(1) windGustMultiplier: number;

  @IsNumber() pressureMin: number;
  @IsNumber() pressureMax: number;
  @IsNumber() @Min(0) @Max(100) humidityMin: number;
  @IsNumber() @Min(0) @Max(100) humidityMax: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldConfigDto)
  @IsOptional()
  customFields?: CustomFieldConfigDto[];
}

export class CreateWeatherGeneratorDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  @ValidateNested()
  @Type(() => WeatherGeneratorConfigDto)
  config: WeatherGeneratorConfigDto;
}
