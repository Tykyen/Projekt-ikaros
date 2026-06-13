import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsUrl,
  IsInt,
  IsObject,
  MaxLength,
  Min,
  Max,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DiceVisibilityDto {
  @IsBoolean() showPjRolls!: boolean;
  @IsBoolean() showNpcBestieRolls!: boolean;
  @IsBoolean() showTeammateRolls!: boolean;
}

export class UpdateWorldDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  /**
   * F-07 — smazání titulky FE posílá `''`. `@IsUrl()` by prázdný řetězec odmítl
   * (400), proto stejný vzor jako `themeBackgroundUrl`: prázdný/nullový vstup
   * přeskočí validaci (= clear), neprázdná hodnota se validuje jako URL.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl()
  imageUrl?: string | null;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @IsArray() tones?: string[];
  @IsOptional() @IsString() @MaxLength(500) playersWanted?: string;
  // DI-05 (db-integrity audit) — playerCount je AUTOMATICKÝ počet Hráčů, ne ručně nastavitelné pole.
  @IsOptional() @IsInt() @Min(1) @Max(999) maxPlayers?: number | null;
  @IsOptional() @IsArray() dice?: string[];
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsString()
  @IsIn(['public', 'open', 'private', 'closed'])
  accessMode?: string;

  // ── Krok 5.0 — světový theme ──
  /** Id sdíleného základu světového motivu. */
  @IsOptional() @IsString() @MaxLength(40) themeId?: string;
  /** Custom theme — mapa CSS token → hodnota. Klíče sanitizovány v service (jen `--theme-*`). */
  @IsOptional() @IsObject() themeOverrides?: Record<string, string>;
  /**
   * Custom theme — URL vlastního pozadí. `null` = výslovně žádné pozadí (smaž field).
   * Workaround D-NEW-theme-bg-empty (2026-05-21): historicky FE posílal `''` místo null;
   * service teď přijímá obě hodnoty a uloží `null` jako $unset.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  themeBackgroundUrl?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => DiceVisibilityDto)
  diceVisibility?: DiceVisibilityDto;
}
