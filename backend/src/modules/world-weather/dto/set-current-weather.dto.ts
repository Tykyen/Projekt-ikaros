// backend/src/modules/world-weather/dto/set-current-weather.dto.ts

import { Type } from 'class-transformer';
import {
  IsNumber,
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

class CloudinessDto {
  @IsString() value: string;
  @IsString() description: string;
}

class PrecipitationDto {
  @IsString() value: string;
  @IsString() description: string;
}

class WindDto {
  @IsNumber() speed: number;
  @IsNumber() gusts: number;
  @IsString() unit: string;
}

class PressureDto {
  @IsNumber() value: number;
  @IsString() trend: string;
}

class WeatherExtraDto {
  @IsString() label: string;
  @IsString() value: string;
  @IsString() @IsOptional() description?: string;
}

export class SetCurrentWeatherDto {
  @IsNumber() temperature: number;
  @IsIn(['C', 'F']) tempUnit: string;
  @IsString() @IsNotEmpty() weatherType: string;
  @IsString() @IsNotEmpty() weatherIcon: string;
  @ValidateNested() @Type(() => CloudinessDto) cloudiness: CloudinessDto;
  @ValidateNested()
  @Type(() => PrecipitationDto)
  precipitation: PrecipitationDto;
  @ValidateNested() @Type(() => WindDto) wind: WindDto;
  @ValidateNested() @Type(() => PressureDto) pressure: PressureDto;
  @IsNumber() humidity: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeatherExtraDto)
  extras: WeatherExtraDto[];
  @IsString() @IsOptional() narrativeText?: string;
}
