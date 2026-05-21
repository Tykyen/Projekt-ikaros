import {
  IsOptional,
  IsHexColor,
  IsIn,
  ValidateIf,
  IsObject,
  IsArray,
  IsString,
} from 'class-validator';
import { CHAT_FONT_KEYS, CHAT_FONT_SIZE_KEYS } from '../constants/chat-fonts';

/**
 * Krok 6.2f / 6.3e — per-svět vzhled mé zprávy v chatu + skiny kostek.
 *
 * `null` znamená „resetovat na dědění z globálního profilu" (color) nebo
 * „systémový fallback" (font / fontSize / diceSkinMapping).
 */
export class UpdateAppearanceDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsHexColor()
  chatColor?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(CHAT_FONT_KEYS)
  chatFont?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(CHAT_FONT_SIZE_KEYS)
  chatFontSize?: string | null;

  /**
   * Krok 6.3e — per-svět volba skinu kostek per typ
   * (`{ default: 'core-obsidian', '1d20': 'elemental-flame' }`).
   * `null` = reset na fallback.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  diceSkinMapping?: Record<string, string> | null;

  /**
   * Krok 6.3 D-NEW-dice-jail — uvězněné skiny per uživatel ve světě.
   * Skin v tomto seznamu se nezobrazuje v hlavním gridu skin pickeru.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jailedDiceSkins?: string[];
}
