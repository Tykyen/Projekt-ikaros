import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  IsIn,
  IsUrl,
  IsInt,
  IsObject,
  MaxLength,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';

export class UpdateWorldDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @IsArray() tones?: string[];
  @IsOptional() @IsString() playersWanted?: string;
  @IsOptional() @IsNumber() playerCount?: number;
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
}
