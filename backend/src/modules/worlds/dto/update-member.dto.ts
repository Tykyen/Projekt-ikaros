import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  Min,
  Max,
  IsBoolean,
  IsObject,
  MaxLength,
  ValidateIf,
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
  /** `null` = odpojit postavu od člena. */
  @IsOptional() @IsString() characterPath?: string | null;
  /** Obrázek přiřazené postavy → world-scoped avatar člena. */
  @IsOptional() @IsString() avatarUrl?: string | null;
}

export class UpdateMemberFreeDto {
  @IsBoolean() isFree: boolean;
}

/** Krok 5.9 / 5.9b — vlastní doladění vzhledu světa (jen pro mě). */
export class UpdateMemberThemeDto {
  @IsOptional() @IsObject() themeAdjust?: Record<string, number>;
  @IsOptional() @IsObject() themeUserOverrides?: Record<string, string>;
  /**
   * 5.9b — vlastní motiv (override world.themeId). `null`/`''` = zpět na motiv PJ.
   * Validace stejně volná jako world DTO (`@IsString`, ne `@IsIn(THEME_IDS)`) —
   * vyhne se dual-source 400 pasti; FE `getTheme` má fallback na neznámé id.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(40)
  themeId?: string | null;
  /**
   * 5.9b — vlastní pozadí (override world.themeBackgroundUrl). `null`/`''` = bez
   * vlastního pozadí (dědí ze zvoleného motivu). Vzor jako world DTO.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  themeBackgroundUrl?: string | null;
  /**
   * 16.2c — vlastní skin deníku (per uživatel×svět). `null`/`''` = dědí default
   * dle systému světa. Whitelist 7 stylů (fixní sada z FE registru skinů).
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsIn([
    'scifi',
    'fantasy',
    'horror',
    'steampunk',
    'nature',
    'minimal',
    'retro',
  ])
  diarySkin?: string | null;
}

/** 6.8-followup — self-service avatar vedení (PJ/Pomocný PJ). `null` = odebrat. */
export class UpdateMemberPjAvatarDto {
  // @IsOptional() pustí i null (clear) i undefined; string se validuje.
  @IsOptional() @IsString() avatarUrl?: string | null;
}
