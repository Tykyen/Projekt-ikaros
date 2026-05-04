import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RejectGalleryItemDto {
  @IsString() @IsOptional() @MaxLength(1000)
  reason?: string;
}
