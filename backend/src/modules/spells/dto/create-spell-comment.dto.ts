/**
 * 21.5c — CreateSpellCommentDto pro `POST /api/spells/community/:id/comments`.
 * Dvě úrovně: `targetType='spell'` (o kouzle/lore) nebo `'statblock'` (ke
 * statům systému `systemId`). U 'statblock' je `systemId` povinné (service).
 */
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSpellCommentDto {
  @IsIn(['spell', 'statblock'])
  targetType!: 'spell' | 'statblock';

  @IsOptional()
  @IsString()
  systemId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
