import {
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from './chat-attachment.dto';

/**
 * 11.2-ext F — vstup pro naplánování zprávy. `ownerId/Name/Role` se neposílají
 * (server z auth user). `sendAt` ISO string (budoucnost — ověřeno v controlleru).
 */
export class CreateScheduledMessageDto {
  @IsString() channelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(10)
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];

  @IsDateString() sendAt!: string;
}
