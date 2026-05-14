import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateGalleryItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(300)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;
}
