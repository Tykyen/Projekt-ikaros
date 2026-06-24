import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * 16.1e — operace nad stavem boje konverzace (R6). Vzor mapový `combat.*`:
 *  - `start`: zahájí boj v pořadí `orderCombatantIds` → round 1, na tahu první.
 *  - `turn`:  nastaví `currentCombatantId` + `round` (FE řídí pořadí + wrap).
 *  - `end`:   ukončí boj (active=false).
 */
export class CombatOpDto {
  @IsIn(['start', 'turn', 'end']) op: 'start' | 'turn' | 'end';
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderCombatantIds?: string[];
  @IsOptional() @IsString() combatantId?: string;
  @IsOptional() @IsNumber() @Min(1) round?: number;
}

/** 16.1e — per-konverzace viditelnost HP hráčům per typ (R3 override). */
export class CombatConfigDto {
  @IsOptional() @IsBoolean() showHpPc?: boolean;
  @IsOptional() @IsBoolean() showHpNpc?: boolean;
  @IsOptional() @IsBoolean() showHpBestie?: boolean;
}
