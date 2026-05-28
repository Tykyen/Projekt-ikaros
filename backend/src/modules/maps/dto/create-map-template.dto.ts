import {
  IsString,
  IsObject,
  IsOptional,
  IsArray,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * 10.2c-edit-2 — vstup pro POST / PUT `/map-templates`.
 *
 * `ownerId` NENÍ ve DTO — server přepíše z auth user (POST) nebo zachová
 * z existujícího (PUT). Klient `ownerId` v body se IGNORUJE (defense in
 * depth proti převzetí cizí šablony).
 *
 * Spec: docs/arch/maps/library-snapshot/api.md, security.md.
 */
export class CreateMapTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  imageUrl!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  tokens?: unknown[];

  @IsOptional()
  @IsArray()
  npcTemplates?: unknown[];

  @IsOptional()
  @IsArray()
  effects?: unknown[];

  @IsOptional()
  @IsBoolean()
  fogEnabled?: boolean;

  @IsOptional()
  @IsArray()
  revealedHexes?: unknown[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activeSoundIds?: string[];
}
