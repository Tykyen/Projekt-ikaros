import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Spec 8.x-prep §4.4 — in-game datum transakce jako JSON.
 * BE neprovádí calendar-engine validaci (out of scope) — důvěřuje FE
 * picker že clampuje day dle config. Tato DTO jen typovou validuje shape.
 */
export class FantasyDateDto {
  @IsInt() year!: number;
  @IsInt() @Min(0) monthIndex!: number;
  @IsInt() @Min(1) day!: number;
  @IsOptional() @IsInt() @Min(0) @Max(23) hour?: number;
  @IsOptional() @IsInt() @Min(0) @Max(59) minute?: number;
}

/**
 * Spec 8.x-prep §4.3 (B3) — manuální vklad / výběr peněz na účet postavy.
 *
 * `amount` může být kladné (vklad) nebo záporné (výběr). FE typically posílá
 * absolutní hodnotu × sign podle vybraného módu.
 * `reason` povinný (audit) — zobrazí se v historii jako `description`.
 * `inGameDate` volitelné (B4) — herní datum, default = `currentInGameDate`
 * světa (FE přebírá, BE neřeší default).
 */
export class AdjustBalanceDto {
  @IsNumber() amount!: number;

  @IsString()
  @MinLength(1, { message: 'Důvod je povinný.' })
  @MaxLength(200, { message: 'Důvod max 200 znaků.' })
  reason!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FantasyDateDto)
  inGameDate?: FantasyDateDto | null;
}
