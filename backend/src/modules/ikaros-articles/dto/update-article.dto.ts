import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

/**
 * 3.2a — `category` validovaná v service proti DB collection (ne enum).
 */
export class UpdateArticleDto {
  @IsString()
  @IsOptional()
  @MaxLength(300)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50000)
  content?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'category musí být slug (malá písmena, čísla, pomlčky)',
  })
  @MaxLength(40)
  category?: string;
}
