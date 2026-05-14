import {
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ChatAttachmentDto {
  @IsUrl() url: string;

  @IsString() @MaxLength(512) publicId: string;

  @IsIn(['image', 'video', 'document']) type: 'image' | 'video' | 'document';

  @IsString() @MaxLength(128) mimeType: string;

  @IsString() @MaxLength(255) filename: string;

  @IsInt() @Min(1) @Max(52428800) size: number;
}
