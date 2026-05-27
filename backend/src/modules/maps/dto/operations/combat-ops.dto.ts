import {
  Equals,
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
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
  /** Když undefined → next; když set → jump na konkrétní token. */
  @IsOptional() @IsString() tokenId?: string;
}

export class CombatEndOpDto {
  @Equals('combat.end') type!: 'combat.end';
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
