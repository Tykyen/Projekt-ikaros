import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsNumber,
  ValidateIf,
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

  // 9.3 — focal point (0–100). null clearing povolen.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\//, { message: 'link musí začínat http(s)://' })
  link?: string | null;

  // 9.3 — slug wiki stránky (null clearing povolen).
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'pageSlug musí být lowercase kebab-case (a-z, 0-9, pomlčka)',
  })
  pageSlug?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CelestialOverrideDto)
  celestialOverrides?: CelestialOverrideDto[];
}
