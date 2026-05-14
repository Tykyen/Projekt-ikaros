import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CalendarMonthDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(1)
  daysCount: number;
}

class CelestialBodyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0.0001)
  orbitalPeriodDays: number;

  @IsString()
  @MinLength(1)
  color: string;
}

export class UpdateCalendarConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  daysOfWeek: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => CalendarMonthDto)
  months: CalendarMonthDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CelestialBodyDto)
  celestialBodies: CelestialBodyDto[];
}
