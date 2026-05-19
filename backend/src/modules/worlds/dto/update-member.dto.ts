import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  Min,
  Max,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { WorldRole } from '../interfaces/world-membership.interface';

export class UpdateMemberRoleDto {
  // D-053 (krok 5.3): platné role 0–5. Staré číslování (-1..3) odstraněno —
  // DTO bylo neaktualizované po migraci, blokovalo nastavení PomocnyPJ i PJ.
  @IsNumber() @IsIn([0, 1, 2, 3, 4, 5]) role: WorldRole;
}

export class UpdateMemberGroupDto {
  @IsOptional() @IsString() group?: string;
}

export class UpdateMemberAkjDto {
  @IsNumber() @Min(0) @Max(999999) akj: number;
}

export class UpdateMemberCharacterDto {
  @IsOptional() @IsString() characterPath?: string;
}

export class UpdateMemberFreeDto {
  @IsBoolean() isFree: boolean;
}

/** Krok 5.9 — vlastní doladění vzhledu světa (přístupnost). */
export class UpdateMemberThemeDto {
  @IsOptional() @IsObject() themeAdjust?: Record<string, number>;
  @IsOptional() @IsObject() themeUserOverrides?: Record<string, string>;
}
