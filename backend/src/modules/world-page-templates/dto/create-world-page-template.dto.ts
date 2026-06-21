import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  WORLD_PAGE_TEMPLATE_ICONS,
  type WorldPageTemplateIcon,
} from '../interfaces/world-page-template.interface';

export class CreateWorldPageTemplateDto {
  /** URL-safe key, unique per world (jen ASCII písmena, čísla, pomlčka). */
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Key musí obsahovat jen malá písmena, čísla a pomlčky',
  })
  @MinLength(1)
  @MaxLength(64)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;

  @IsArray()
  @IsString({ each: true })
  headers: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultTitle?: string;

  /** 15.5 — obsahová osnova (TipTap HTML). Sanitizuje se v service. */
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  contentOutline?: string;

  @IsOptional()
  @IsIn(WORLD_PAGE_TEMPLATE_ICONS)
  icon?: WorldPageTemplateIcon;

  @IsOptional()
  @IsNumber()
  order?: number;
}
