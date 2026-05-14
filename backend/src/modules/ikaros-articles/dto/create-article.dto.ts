import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  content: string;

  @IsIn(['Povidky', 'Poezie', 'Uvahy', 'Recenze', 'Postavy', 'Ostatni'])
  @IsOptional()
  category?: string;

  @IsBoolean()
  @IsOptional()
  submit?: boolean;
}
