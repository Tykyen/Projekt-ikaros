import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class UpdateArticleDto {
  @IsString() @IsOptional() @MaxLength(300)
  title?: string;

  @IsString() @IsOptional() @MaxLength(50000)
  content?: string;

  @IsIn(['Povidky', 'Poezie', 'Uvahy', 'Recenze', 'Postavy', 'Ostatni'])
  @IsOptional()
  category?: string;
}
