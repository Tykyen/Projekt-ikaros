import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
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

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\//, { message: 'link musí začínat http(s)://' })
  link?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CelestialOverrideDto)
  celestialOverrides?: CelestialOverrideDto[];
}
