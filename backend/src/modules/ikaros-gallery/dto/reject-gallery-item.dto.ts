import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class RejectGalleryItemDto {
  // 3.3a — důvod zamítnutí povinný, min 10 znaků (shodně s články)
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Důvod zamítnutí musí mít alespoň 10 znaků' })
  @MaxLength(1000)
  reason: string;
}
