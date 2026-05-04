import { IsInt, Min, Max } from 'class-validator';

export class RateArticleDto {
  @IsInt() @Min(1) @Max(5)
  stars: number;
}
