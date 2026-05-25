import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * 9.2b — Změna defaultního kalendáře světa + společný timelineEpoch.
 * Endpoint: `PATCH /worlds/:worldId/calendar-defaults` (PomocnyPJ+).
 */
export class PatchCalendarDefaultsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  defaultCalendarConfigSlug?: string;

  @IsOptional() @IsInt() timelineEpoch?: number;
}
