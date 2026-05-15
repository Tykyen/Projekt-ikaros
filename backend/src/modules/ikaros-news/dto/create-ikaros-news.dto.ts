import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';
import type { IkarosNewsType } from '../interfaces/ikaros-news.interface';

export class CreateIkarosNewsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  /** Spec 3.1b — typ novinky. Default `'info'` (řeší service). */
  @IsOptional()
  @IsIn(['info', 'warning', 'system'])
  type?: IkarosNewsType;

  /** Spec 3.1b — URL obrázku z `POST /upload/image`. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;
}
