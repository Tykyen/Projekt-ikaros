import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CalendarDisplaySettingsDto {
  @IsOptional()
  @IsIn(['month', 'week', 'day'])
  defaultView?: 'month' | 'week' | 'day';

  @IsOptional()
  @IsBoolean()
  isHiddenInAggregate?: boolean;
}

export class UpdateCalendarSettingsDto {
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CalendarDisplaySettingsDto)
  displaySettings?: CalendarDisplaySettingsDto;
}
