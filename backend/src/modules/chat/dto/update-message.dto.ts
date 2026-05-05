import { IsString, MinLength, MaxLength, IsOptional, IsArray, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from './chat-attachment.dto';

export class UpdateMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(10)
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
