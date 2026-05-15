import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

export class UpdateGalleryItemDto {
  @IsString()
  @IsOptional()
  @MaxLength(300)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  // 3.3a — změna kategorie obrázku
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'category musí být platný slug (malá písmena, čísla, pomlčky)',
  })
  @MaxLength(40)
  category?: string;
}
