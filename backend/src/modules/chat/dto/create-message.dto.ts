import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsArray,
  Matches,
  IsUrl,
  ValidateNested,
  ArrayMaxSize,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from './chat-attachment.dto';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(10)
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  customFont?: string;

  @IsOptional()
  @IsIn([
    'red',
    'blue',
    'green',
    'yellow',
    'purple',
    'orange',
    'pink',
    'cyan',
    'default',
  ])
  color?: string;
}
