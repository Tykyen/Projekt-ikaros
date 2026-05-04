import { IsString, IsNotEmpty, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateGalleryItemDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  title: string;

  @IsString() @IsOptional() @MaxLength(2000)
  description?: string;

  @IsBoolean() @IsOptional()
  submit?: boolean;
}
