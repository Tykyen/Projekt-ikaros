import {
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  IsHexColor,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from './chat-attachment.dto';

export class CreateGlobalMessageDto {
  /**
   * Text zprávy. Volitelný (4.3b) — zpráva smí být jen příloha. Že není
   * zároveň prázdný text i prázdné `attachments` hlídá `GlobalChatService`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleTo?: string[];

  /** Barva textu zprávy (hex) — odpovídá `chatColor` z profilu odesílatele. */
  @IsOptional()
  @IsHexColor()
  color?: string;

  /** ID zprávy, na kterou se odpovídá (krok 4.3a — reply). */
  @IsOptional()
  @IsString()
  replyToId?: string;

  /** Přílohy — obrázky / dokumenty nahrané přes `POST /global-chat/upload` (4.3b). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
