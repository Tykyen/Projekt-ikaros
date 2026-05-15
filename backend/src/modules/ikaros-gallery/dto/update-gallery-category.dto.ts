import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateGalleryCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color musí být ve formátu #RRGGBB',
  })
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
