/**
 * 21.5e — CreateItemCommentDto pro `POST /api/items/community/:id/comments`.
 * Dvě úrovně: `targetType='item'` (o předmětu/lore) nebo `'statblock'`
 * (ke statům systému `systemId` — povinné, ověřuje service).
 */
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateItemCommentDto {
  @IsIn(['item', 'statblock'])
  targetType!: 'item' | 'statblock';

  @IsOptional()
  @IsString()
  systemId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
