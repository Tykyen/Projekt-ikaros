import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 15.10 fáze C (var. A) — návrh postavy přiložený k „Chci hrát".
 * Data, ne živá stránka: živá Page vzniká až při approve.
 */
export class CharacterDraftDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * Volitelné tělo `POST /worlds/:id/access-request`. Bez `characterDraft` =
 * prostá žádost o vstup (approve → Čtenář); s ním = „Chci hrát" (approve →
 * živá stránka postavy + role Hráč).
 */
export class RequestAccessDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CharacterDraftDto)
  characterDraft?: CharacterDraftDto;
}
