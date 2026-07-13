/**
 * 21.5f — CreatePriceListCommentDto pro
 * `POST /api/price-lists/community/:id/comments`. Jedna úroveň (celý ceník).
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePriceListCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
