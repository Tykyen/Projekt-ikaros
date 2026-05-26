// backend/src/modules/world-weather/dto/weather-generator-set.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

/**
 * 9.4 Weather Generator Set — Set/Item DTOs.
 *
 * Item drží jen string `presetId` (resolving FE) + default jméno generátoru.
 */
export class WeatherGeneratorSetItemDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) presetId!: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  generatorName!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateWeatherGeneratorSetDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;
  @ApiProperty({ type: [WeatherGeneratorSetItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeatherGeneratorSetItemDto)
  items!: WeatherGeneratorSetItemDto[];
}

export class UpdateWeatherGeneratorSetDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;
  @ApiProperty({ type: [WeatherGeneratorSetItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeatherGeneratorSetItemDto)
  items?: WeatherGeneratorSetItemDto[];
}

/**
 * Apply set — FE rozresolvuje presetId → config (catalog je FE-side) a pošle
 * BE už hotové configy. BE jen vytvoří generators a inkrementuje appliedCount.
 *
 * Protokol:
 *  - `resolvedItems` musí mít ArrayMinSize 1
 *  - každý item má: jméno, optional description, config (Record<string,unknown>)
 *  - BE validuje config přes WorldWeatherService.create() (range checks)
 */
export class ApplySetItemDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiProperty({
    description:
      'WeatherGeneratorConfig — FE rozresolvuje presetId z catalog (archetype/city/extreme/custom).',
  })
  @IsObject()
  config!: Record<string, unknown>;
}

export class ApplySetDto {
  @ApiProperty({ type: [ApplySetItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApplySetItemDto)
  resolvedItems!: ApplySetItemDto[];
}
