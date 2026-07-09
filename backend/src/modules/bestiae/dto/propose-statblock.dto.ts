/**
 * 16.2b-2 — ProposeStatblockDto pro `POST /api/bestiae/community/:id/statblock`.
 * Návrh (nebo kurátorská úprava) pravidlové verze statů pro daný systém.
 * Prázdný systém → smí navrhnout kdokoli (draft); existující verzi upraví jen
 * kurátor (spec §2a).
 */
import { IsObject, IsString, MinLength } from 'class-validator';

export class ProposeStatblockDto {
  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsObject()
  systemStats!: Record<string, unknown>;
}
