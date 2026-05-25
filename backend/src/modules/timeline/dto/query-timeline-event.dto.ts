import {
  IsOptional,
  IsString,
  IsInt,
  IsIn,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTimelineEventDto {
  @IsString()
  @IsNotEmpty()
  worldId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fromYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  toYear?: number;

  /** 9.3 — case-insensitive substring search v title+text (regex escaped). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** 9.3 — opaque base64url cursor z předchozí stránky. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  /** 9.3 — pořadí: `desc` (default — nejnovější rok nahoře) nebo `asc`. */
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';
}
