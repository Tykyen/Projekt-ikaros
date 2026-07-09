/**
 * 16.2b-2 — CreateBestieCommentDto pro `POST /api/bestiae/community/:id/comments`.
 * Dvě úrovně: `targetType='beast'` (o bytosti/lore) nebo `'statblock'` (ke statům
 * systému `systemId`). U 'statblock' je `systemId` povinné (ověřuje service).
 */
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBestieCommentDto {
  @IsIn(['beast', 'statblock'])
  targetType!: 'beast' | 'statblock';

  @IsOptional()
  @IsString()
  systemId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
