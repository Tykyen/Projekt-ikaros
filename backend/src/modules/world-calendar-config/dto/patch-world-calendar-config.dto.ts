import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CelestialBodyDto,
  LeapYearRuleDto,
  LunisolarRuleDto,
  MonthDefDto,
  SeasonDto,
} from './create-world-calendar-config.dto';

/**
 * 9.2b — PATCH delta merge (per feedback_persist_across_variants).
 * Pouze poslané fields se přepíší; ostatní zůstanou.
 *
 * `slug` se nemění (URL identifikátor) — pro rename smaž + create.
 */
export class PatchWorldCalendarConfigDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;

  @IsOptional() @IsInt() @Min(1) @Max(48) hoursPerDay?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  daysOfWeek?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => MonthDefDto)
  months?: MonthDefDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CelestialBodyDto)
  celestialBodies?: CelestialBodyDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SeasonDto)
  seasons?: SeasonDto[];

  // 9.3-F-I — opt-in leap pravidlo (PATCH: null = clear).
  @IsOptional()
  @ValidateNested()
  @Type(() => LeapYearRuleDto)
  leapYearRule?: LeapYearRuleDto | null;

  // 9.3-F-II — opt-in lunisolar pravidlo (PATCH: null = clear).
  @IsOptional()
  @ValidateNested()
  @Type(() => LunisolarRuleDto)
  lunisolar?: LunisolarRuleDto | null;

  @IsOptional() @IsNumber() epochOffset?: number;
}
