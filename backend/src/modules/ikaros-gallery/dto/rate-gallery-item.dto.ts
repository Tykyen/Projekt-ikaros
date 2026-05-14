import { IsInt, Min, Max } from 'class-validator';

export class RateGalleryItemDto {
  @IsInt()
  @Min(1)
  @Max(5)
  stars: number;
}
