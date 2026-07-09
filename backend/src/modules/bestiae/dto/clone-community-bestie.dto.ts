/**
 * 16.2b-2 — CloneCommunityBestieDto pro `POST /api/bestiae/community/:id/clone`.
 * „Vlož do mého bestiáře": vezme JEDNU pravidlovou verzi (`systemId`) globální
 * bytosti a vytvoří z ní běžnou single-system bestii ve světě / osobní
 * (snapshot, `clonedFromId`). Funguje i pro neschválený statblok.
 */
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CloneCommunityBestieDto {
  @IsIn(['user', 'world'])
  scope!: 'user' | 'world';

  /** Kterou pravidlovou verzi (statblok) vzít. */
  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsOptional()
  @IsString()
  worldId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  newName?: string;
}
