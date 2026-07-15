import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  LicenseAiOrigin,
  LicenseMode,
} from '../../content-licenses/interfaces/content-license.interface';

/**
 * 22.5 — vstup pro publikaci šablony scény do veřejného katalogu.
 * Autor volí licenční režim + AI původ; `attributionRequired` = musí se
 * uvádět autor. Ostatní licenční pole se odvodí (viz SceneTemplateSharingService).
 */
export class PublishSceneTemplateDto {
  /** Výchozí `clone` (povolena kopie do světa). `read` = jen k prohlížení. */
  @IsOptional()
  @IsIn(['private', 'read', 'clone', 'remix', 'open'])
  licenseMode?: LicenseMode;

  @IsOptional()
  @IsBoolean()
  attributionRequired?: boolean;

  @IsOptional()
  @IsIn(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'])
  aiOrigin?: LicenseAiOrigin;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
