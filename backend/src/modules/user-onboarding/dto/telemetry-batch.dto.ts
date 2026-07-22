import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TELEMETRY_EVENTS } from '../schemas/vypravec-telemetry.schema';
import type { TelemetryEvent } from '../schemas/vypravec-telemetry.schema';

export class TelemetryEventDto {
  @IsIn(TELEMETRY_EVENTS as readonly string[])
  event: TelemetryEvent;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  refId?: string;

  /** Fulltext dotaz bez odpovědi — truncate 200 (GDPR-lite, 04 §5.6). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;
}

export class TelemetryBatchDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TelemetryEventDto)
  events: TelemetryEventDto[];
}
