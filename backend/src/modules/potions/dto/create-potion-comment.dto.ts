/**
 * 21.5b — CreatePotionCommentDto pro `POST /api/potions/community/:id/comments`.
 * Dvě úrovně: `targetType='potion'` (o lektvaru/lore) nebo `'statblock'`
 * (ke statům systému `systemId` — povinné, ověřuje service).
 */
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePotionCommentDto {
  @IsIn(['potion', 'statblock'])
  targetType!: 'potion' | 'statblock';

  @IsOptional()
  @IsString()
  systemId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
