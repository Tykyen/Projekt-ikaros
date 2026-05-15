import {
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  ValidateIf,
} from 'class-validator';
import type { IkarosNewsType } from '../interfaces/ikaros-news.interface';

/**
 * Spec 3.1 — PATCH /IkarosNews/:id. Alespoň jedno pole musí být přítomné;
 * tuto cross-field kontrolu řeší service (vyhodí BadRequestException),
 * aby šlo vrátit clearer message než generic class-validator error.
 */
export class UpdateIkarosNewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;

  /** Spec 3.1b — změna typu novinky. */
  @IsOptional()
  @IsIn(['info', 'warning', 'system'])
  type?: IkarosNewsType;

  /** Spec 3.1b — `null` = odebrat obrázek, string = nastavit URL. */
  @IsOptional()
  @ValidateIf((o: UpdateIkarosNewsDto) => o.imageUrl !== null)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;
}
