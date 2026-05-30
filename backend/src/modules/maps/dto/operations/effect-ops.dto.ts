import {
  Equals,
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 10.2-prep-1 — effect operations DTOs.
 * Spec: docs/arch/maps/operations/data-models.md § Effect operace.
 */

/**
 * Holder pro `effect` payload v `effect.add`. Hluboká validace odložená.
 *
 * 10.2g fix — `hexes`/`color`/`rings`/`variant`/`excludedHexes`/`barrierDC`
 * MUSÍ mít explicitní (volitelné) dekorátory. Globální `ValidationPipe`
 * (`whitelist: true`, main.ts) jinak tato pole tiše zahodí (index signature
 * `[key: string]` whitelist nerespektuje) → efekt se uložil jen s `id`+`type`,
 * bez geometrie → po refreshi „zmizel". (Mirror `TokenPayloadDto` q/r/id.)
 */
export class EffectPayloadDto {
  @IsString() @IsNotEmpty() id!: string;
  @IsString() type!: string; // 'color' | 'barrier' | 'explosion'
  @IsOptional() @IsArray() hexes?: { q: number; r: number }[];
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsArray() rings?: { radius: number; damage: number }[];
  @IsOptional() @IsString() variant?: string;
  @IsOptional() @IsArray() excludedHexes?: { q: number; r: number }[];
  @IsOptional() @IsNumber() barrierDC?: number;
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
