import {
  Equals,
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsInt,
  ArrayMinSize,
} from 'class-validator';

/**
 * 10.2-prep-1 — combat operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § Combat operace.
 * Plná semantika viz spec `combat` komponenty (10.2f).
 */

export class CombatStartOpDto {
  @Equals('combat.start') type!: 'combat.start';
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderTokenIds!: string[];
}

export class CombatTurnOpDto {
  @Equals('combat.turn') type!: 'combat.turn';
  /** Když undefined → next (legacy auto dle order); když set → na konkrétní
   *  token (FE řídí pořadí při živém sortu 10.2f). */
  @IsOptional() @IsString() tokenId?: string;
  /** 10.2f — explicitní číslo kola (FE počítá wrap → round+1). */
  @IsOptional() @IsInt() round?: number;
}

export class CombatEndOpDto {
  @Equals('combat.end') type!: 'combat.end';
}

/**
 * 10.2f-2 — přeřazení pořadí tahů ZA běžícího boje (ruční edit iniciativy nebo
 * hod). Na rozdíl od `combat.start` ZACHOVÁVÁ `round` i `currentTokenId`,
 * mění jen `order`. `orderTokenIds` musí být permutace stávajícího `order`.
 */
export class CombatReorderOpDto {
  @Equals('combat.reorder') type!: 'combat.reorder';
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderTokenIds!: string[];
}

export class CombatEffectAddOpDto {
  @Equals('combat.effect.add') type!: 'combat.effect.add';
  @IsString() @IsNotEmpty() tokenId!: string;
  @IsObject() effect!: Record<string, unknown>;
}

export class CombatEffectRemoveOpDto {
  @Equals('combat.effect.remove') type!: 'combat.effect.remove';
  @IsString() @IsNotEmpty() effectId!: string;
}
