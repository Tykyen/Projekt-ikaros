/**
 * 21.5c — ProposeSpellStatblockDto pro `POST /api/spells/community/:id/statblock`.
 * Návrh (nebo kurátorská úprava) pravidlové verze kouzla pro daný systém.
 * Prázdný systém → smí navrhnout kdokoli (draft); existující verzi upraví jen
 * kurátor. Vzor: bestiae propose-statblock.dto.
 */
import { IsObject, IsString, MinLength } from 'class-validator';

export class ProposeSpellStatblockDto {
  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsObject()
  systemStats!: Record<string, unknown>;
}
