import {
  Equals,
  IsString,
  IsNotEmpty,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 10.2-prep-1 — effect operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § Effect operace.
 */

/** Holder pro `effect` payload v `effect.add`. Hluboká validace odložená. */
export class EffectPayloadDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() type!: string; // 'color' | 'barrier' | 'explosion'
  // hexes, color, rings, variant, excludedHexes, barrierDC — accept arbitrary
  [key: string]: unknown;
}

export class EffectAddOpDto {
  @Equals('effect.add') type!: 'effect.add';
  @IsObject()
  @ValidateNested()
  @Type(() => EffectPayloadDto)
  effect!: EffectPayloadDto;
}

export class EffectRemoveOpDto {
  @Equals('effect.remove') type!: 'effect.remove';
  @IsString() @IsNotEmpty() effectId!: string;
}

export class EffectUpdateOpDto {
  @Equals('effect.update') type!: 'effect.update';
  @IsString() @IsNotEmpty() effectId!: string;
  @IsObject() patch!: Record<string, unknown>;
}
