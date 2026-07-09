import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { GalleryAiOrigin } from '../interfaces/ikaros-gallery.interface';

export class CreateGalleryItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  // 3.3a — slug kategorie; pokud chybí, service použije 'ostatni'
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'category musí být platný slug (malá písmena, čísla, pomlčky)',
  })
  @MaxLength(40)
  category?: string;

  // multipart/form-data posílá vše jako string — `submit` přijde jako
  // "true"/"false". Transformace na boolean musí proběhnout před @IsBoolean.
  // `undefined` se zachová, aby @IsOptional fungoval a service viděla "chybí".
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  submit?: boolean;

  // Spec 20D (D1) — povinné prohlášení práv k obsahu. Multipart posílá string,
  // proto stejná boolean-transformace jako `submit`. Service vyžaduje `true`.
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  rightsDeclared?: boolean;

  // Spec 20D (D1) — dobrovolný self-declare AI původu. Chybí → 'none'.
  @IsOptional()
  @IsIn(['none', 'ai_image'])
  aiOrigin?: GalleryAiOrigin;
}
