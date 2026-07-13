/**
 * 21.5d — CreateRiddleCommentDto pro `POST /api/riddles/community/:id/comments`.
 * Jedna úroveň diskuse (spec R1) — jen obsah.
 */
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRiddleCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
