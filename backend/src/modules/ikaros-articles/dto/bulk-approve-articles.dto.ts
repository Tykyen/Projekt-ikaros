import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** D-NEW-bulk-pending-articles — FIX-55: inline `{ids: string[]}` obcházel ValidationPipe. */
export class BulkApproveArticlesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
