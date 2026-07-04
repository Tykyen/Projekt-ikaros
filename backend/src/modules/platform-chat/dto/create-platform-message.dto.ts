import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from '../../chat/dto/chat-attachment.dto';

/**
 * 20.5 — zpráva v konverzaci admin chatu. Text i přílohy jsou volitelné, ale
 * aspoň jedno musí být vyplněno (kontrola v service → `PLATFORM_CHAT_EMPTY`).
 */
export class CreatePlatformMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  /** Odpověď na jinou zprávu ve stejném kanálu (tichý fallback když cíl chybí). */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  replyToId?: string;

  /** Nahrané přílohy (obrázek/dokument), max 10 kusů; reuse sdílené DTO chatu. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(10)
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
