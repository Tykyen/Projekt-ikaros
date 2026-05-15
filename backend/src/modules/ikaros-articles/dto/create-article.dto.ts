import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * 3.2a — `category` je slug (např. `'povidky'`), validovaný proti DB collection
 * `article_categories.key` v `IkarosArticlesService.assertCategoryExists`.
 * Žádný hardcoded enum.
 */
export class CreateArticleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  content: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'category musí být slug (malá písmena, čísla, pomlčky)',
  })
  @MaxLength(40)
  category?: string;

  @IsBoolean()
  @IsOptional()
  submit?: boolean;
}
