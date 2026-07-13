import {
  Equals,
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 10.2-prep-1 — token operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § Token operace.
 */

/** Holder pro nested `token` payload v `token.add`. Jen základní pole povinná. */
export class TokenPayloadDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() characterId!: string;
  @IsString() characterSlug!: string;
  @IsInt() @Min(-10000) @Max(10000) q!: number;
  @IsInt() @Min(-10000) @Max(10000) r!: number;
  // Ostatní pole (currentHp, maxHp, ...) jsou volitelné — validátor v MVP NEpenetruje
  // patch hluboko (akceptujeme arbitrary), per `data-models.md` § Token operace.
  [key: string]: unknown;
}

export class TokenAddOpDto {
  @Equals('token.add') type!: 'token.add';
  @IsObject()
  @ValidateNested()
  @Type(() => TokenPayloadDto)
  token!: TokenPayloadDto;
}

export class TokenMoveOpDto {
  @Equals('token.move') type!: 'token.move';
  @IsString() @IsNotEmpty() tokenId!: string;
  @IsInt() @Min(-10000) @Max(10000) q!: number;
  @IsInt() @Min(-10000) @Max(10000) r!: number;
}

export class TokenRemoveOpDto {
  @Equals('token.remove') type!: 'token.remove';
  @IsString() @IsNotEmpty() tokenId!: string;
}

export class TokenUpdateOpDto {
  @Equals('token.update') type!: 'token.update';
  @IsString() @IsNotEmpty() tokenId!: string;
  @IsObject() patch!: Record<string, unknown>;
  /**
   * D-LAUNCH-GAP — relativní změna HP (damage/heal) místo absolutního
   * `patch.currentHp`. Server ji aplikuje ATOMICKY proti aktuální DB hodnotě
   * (aggregation pipeline s clampem 0..maxHp) → dva souběžné zásahy se
   * NEztratí (absolutní set = last-write-wins na stale klientské bázi).
   * Jen bestie tokeny (PC/NPC HP žije v deníku postavy). Nesmí se kombinovat
   * s ne-prázdným `patch` (server vrací 400). `@IsInt` bez implicit convert
   * → string "5" spadne na 400 (CH-122: žádná tichá koerce na vstupu).
   */
  @IsOptional() @IsInt() @Min(-100000) @Max(100000) hpDelta?: number;
  /** D-LAUNCH-GAP — relativní změna `injury` (vzor hpDelta, clamp ≥ 0). */
  @IsOptional() @IsInt() @Min(-100000) @Max(100000) injuryDelta?: number;
}
