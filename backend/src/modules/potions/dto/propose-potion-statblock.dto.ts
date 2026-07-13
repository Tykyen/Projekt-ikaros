/**
 * 21.5b — ProposePotionStatblockDto pro `POST /api/potions/community/:id/statblock`.
 * Návrh (nebo kurátorská úprava) pravidlové verze lektvaru pro daný systém.
 * Vzor: propose-spell-statblock (21.5c).
 */
import { IsObject, IsString, MinLength } from 'class-validator';

export class ProposePotionStatblockDto {
  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsObject()
  systemStats!: Record<string, unknown>;
}
