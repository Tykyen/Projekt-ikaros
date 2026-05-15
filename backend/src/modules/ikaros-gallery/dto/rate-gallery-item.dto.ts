import {
  IsInt,
  Min,
  Max,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class RateGalleryItemDto {
  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;

  /** 3.4f — volitelný recenzní text. */
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  text?: string;
}
