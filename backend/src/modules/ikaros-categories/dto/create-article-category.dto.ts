import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateArticleCategoryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'key musí obsahovat jen malá písmena, čísla a pomlčky',
  })
  @MaxLength(40)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color musí být ve formátu #RRGGBB',
  })
  color: string;

  @IsInt()
  @Min(0)
  order: number;
}
