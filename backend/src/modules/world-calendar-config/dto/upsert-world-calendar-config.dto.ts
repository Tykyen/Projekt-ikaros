import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CalendarMonthDto {
  @IsString() @IsNotEmpty() @MaxLength(50) name: string;
  @IsInt() @Min(1) daysCount: number;
}

class CelestialBodyDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @IsNotEmpty() @MaxLength(50) name: string;
  @IsIn(['moon', 'sun', 'planet', 'comet', 'other'])
  type: 'moon' | 'sun' | 'planet' | 'comet' | 'other';
  @IsObject() config: Record<string, unknown>;
  @IsString() referenceState: string;
}

class ReferenceDateDto {
  @IsInt() year: number;
  @IsInt() @Min(1) month: number;
  @IsInt() @Min(1) day: number;
  @IsInt() @Min(0) hour: number;
}

export class UpsertWorldCalendarConfigDto {
  @IsOptional() @IsInt() @Min(1) @Max(48) hoursPerDay?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  daysOfWeek?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarMonthDto)
  months?: CalendarMonthDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CelestialBodyDto)
  celestialBodies?: CelestialBodyDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ReferenceDateDto)
  referenceDate?: ReferenceDateDto | null;
}
