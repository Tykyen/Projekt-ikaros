import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CelestialOverrideDto } from './celestial-override.dto';

/**
 * worldId zde NENÍ — je immutable (defense-in-depth check v service).
 */
export class UpdateTimelineEventDto {
  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  month?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  text?: string;

  // imageUrl: null = "zachovat stávající" (per parity); jinak nahradit
  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|data:)/, {
    message: 'imageUrl musí být http(s):// URL nebo data: URI',
  })
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\//, { message: 'link musí začínat http(s)://' })
  link?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CelestialOverrideDto)
  celestialOverrides?: CelestialOverrideDto[];
}
