import { IsObject } from 'class-validator';

export class UpdateCalendarConfigDto {
  @IsObject()
  calendarConfig: Record<string, unknown>;
}
