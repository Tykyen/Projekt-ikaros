import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  IsNumber,
  ValidateIf,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CelestialOverrideDto } from './celestial-override.dto';

const URL_OR_DATA = /^(https?:\/\/|data:)/;

export class CreateTimelineEventDto {
  @IsString()
  @IsNotEmpty()
  worldId: string;

  @IsInt()
  year: number;

  @IsInt()
  @Min(1)
  month: number;

  @IsInt()
  @Min(1)
  day: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  text: string;

  @IsOptional()
  @IsString()
  @Matches(URL_OR_DATA, {
    message: 'imageUrl musí být http(s):// URL nebo data: URI',
  })
  imageUrl?: string | null;

  // 9.3 — focal point (0–100). null = center 50/50.
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
  link?: string;

  // 9.3 — slug wiki stránky světa (lowercase kebab-case).
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
