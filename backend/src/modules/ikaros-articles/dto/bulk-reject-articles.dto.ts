import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** D-NEW-bulk-pending-articles — FIX-55: inline `{ids, reason?}` obcházel ValidationPipe. */
export class BulkRejectArticlesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;
}
