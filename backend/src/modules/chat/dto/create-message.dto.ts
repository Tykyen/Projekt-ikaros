import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsArray,
  Matches,
  IsUrl,
  IsHexColor,
  IsUUID,
  ValidateNested,
  ArrayMaxSize,
  IsIn,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from './chat-attachment.dto';
import { CHAT_FONT_KEYS, CHAT_FONT_SIZE_KEYS } from '../constants/chat-fonts';

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'rpDate musí být ve formátu YYYY-MM-DD',
  })
  rpDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleTo?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  overrideName?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  overrideAvatarUrl?: string;

  // 6.2-followup — vazba masky na kartu (Page slug NPC/postavy). Když je
  // vyplněn, FE udělá jméno odesílatele klikací → karta. Free-text (BE
  // neověřuje existenci, stejně jako overrideName); platí jen s overrideName.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  overridePageSlug?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(10)
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];

  @IsOptional()
  @IsIn(CHAT_FONT_KEYS)
  customFont?: string;

  // Krok 6.2f — velikost písma zprávy. Whitelist z `CHAT_FONT_SIZE_KEYS`,
  // FE překládá klíč na rem hodnotu (`chatFonts.ts`).
  @IsOptional()
  @IsIn(CHAT_FONT_SIZE_KEYS)
  customFontSize?: string;

  // Per-svět barva textu zprávy. Hex z `WorldMembership.chatColor` (6.2f) nebo
  // z FE composeru. Pokud DTO nedorazí, BE doplní z membershipu.
  @IsOptional()
  @IsHexColor()
  color?: string;

  // Klientský nonce pro idempotentní retry (6.2h). FE generuje UUID v4;
  // BE drží sparse unique index (channelId, clientNonce).
  @IsOptional()
  @IsUUID()
  clientNonce?: string;

  /**
   * Krok 6.3d — strukturovaná data hodu kostkou (faces, total, type, ...).
   * Pokud DTO obsahuje `dicePayload`, BE označí zprávu `isDiceRoll: true`
   * bez ohledu na regex z `content`. Volný objekt — různé typy hodů mají
   * různý tvar.
   */
  @IsOptional()
  @IsObject()
  dicePayload?: Record<string, unknown>;

  /**
   * Krok 6.3e — skin použitý odesílatelem v okamžiku hodu (`core-obsidian`,
   * `elemental-flame`, ...). BE neověřuje validitu konkrétního ID — jen
   * uloží, FE řeší fallback při neznámém skinu.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  diceSkin?: string;
}
