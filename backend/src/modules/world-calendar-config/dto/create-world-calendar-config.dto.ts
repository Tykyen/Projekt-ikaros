import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 9.3-F-I — leap pravidlo pro non-Gregorian kalendáře. */
export class LeapYearRuleDto {
  @IsIn(['every-4', 'solar-hijri-33', 'islamic-30'])
  type: 'every-4' | 'solar-hijri-33' | 'islamic-30';

  @IsInt() @Min(0) @Max(35) leapMonthIndex: number;
}

/** 9.3-F-II — lunisolární pravidlo (Metonic 19). */
export class LunisolarRuleDto {
  @IsIn(['metonic-19'])
  type: 'metonic-19';

  @IsArray()
  @ArrayMaxSize(19)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(19, { each: true })
  leapYearsInCycle: number[];
}

export class MonthDefDto {
  @IsString() @MinLength(1) @MaxLength(50) name: string;
  @IsInt() @Min(0) @Max(100) daysCount: number; // 9.3-F-II: 0 povoleno (intercalary placeholder)
  /** 9.3-F-II — intercalary měsíc (aktivní jen v lunisolar leap roce). */
  @IsOptional() @IsBoolean() isIntercalary?: boolean;
}

export class CelestialBodyDto {
  @IsString() @MinLength(1) @MaxLength(50) id: string;
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsNumber() @Min(0.0001) orbitalPeriodDays: number;
  @IsString() @IsHexColor() color: string;
  @IsNumber() epochOffset: number;
  @IsOptional() @IsString() @MaxLength(10) icon?: string;
}

export class SeasonDto {
  @IsString() @MinLength(1) @MaxLength(50) id: string;
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsInt() @Min(0) startMonthIndex: number;
  @IsInt() @Min(1) startDay: number;
  @IsString() @IsHexColor() color: string;
  @IsOptional() @IsString() @MaxLength(10) icon?: string;
}

export class CreateWorldCalendarConfigDto {
  /** URL-friendly identifier, unique per svět. */
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug musí obsahovat jen malá písmena, čísla a pomlčky.',
  })
  slug: string;

  @IsString() @MinLength(1) @MaxLength(100) name: string;

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

  // 9.3-F-I — opt-in leap pravidlo.
  @IsOptional()
  @ValidateNested()
  @Type(() => LeapYearRuleDto)
  leapYearRule?: LeapYearRuleDto;

  // 9.3-F-II — opt-in lunisolar pravidlo (Metonic 19-letý cyklus).
  @IsOptional()
  @ValidateNested()
  @Type(() => LunisolarRuleDto)
  lunisolar?: LunisolarRuleDto;

  @IsOptional() @IsNumber() epochOffset?: number;
}
