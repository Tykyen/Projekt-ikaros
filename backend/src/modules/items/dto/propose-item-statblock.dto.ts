/**
 * 21.5e — ProposeItemStatblockDto pro `POST /api/items/community/:id/statblock`.
 * Návrh (nebo kurátorská úprava) pravidlové verze předmětu pro daný systém.
 * Vzor: propose-spell-statblock (21.5c).
 */
import { IsObject, IsString, MinLength } from 'class-validator';

export class ProposeItemStatblockDto {
  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsObject()
  systemStats!: Record<string, unknown>;
}
