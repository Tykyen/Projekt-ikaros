import {
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Max velikost přílohy chatu — 10 MB (spec 4.3b). */
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * 4.3b — příloha zprávy globálního chatu v `CreateGlobalMessageDto`. Zrcadlí
 * `ChatAttachment`. Strukturu validuje class-validator; původ (Cloudinary
 * doména + folder) ověřuje `GlobalChatService.validateAttachments` — klient
 * by jinak mohl podstrčit libovolnou URL.
 */
export class ChatAttachmentDto {
  @IsUrl()
  url: string;

  @IsString()
  @MaxLength(500)
  publicId: string;

  @IsIn(['image', 'document'])
  type: 'image' | 'document';

  @IsString()
  @MaxLength(150)
  mimeType: string;

  @IsString()
  @MaxLength(255)
  filename: string;

  @IsInt()
  @Min(0)
  @Max(ATTACHMENT_MAX_BYTES)
  size: number;
}
