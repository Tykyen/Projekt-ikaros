/**
 * 10.2d-prep-B — CreateBestieDto pro `POST /api/bestiae`.
 */
import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBestieDto {
  @IsIn(['user', 'world', 'system'])
  scope!: 'user' | 'world' | 'system';

  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsOptional()
  @IsString()
  worldId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  /** D-19.2 — velikost blobu `imageUrl` (FE přeposílá `bytes` z uploadu). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(104_857_600)
  imageBytes?: number;

  // Výřez obrázku — focal 0–100 %, zoom 100–400 %, fit cover/contain.
  // null (FE bez obrázku) projde přes @IsOptional. MUSÍ být v DTO, jinak
  // forbidNonWhitelisted ValidationPipe celý request 400ne.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(400)
  imageZoom?: number | null;

  @IsOptional()
  @IsIn(['cover', 'contain'])
  imageFit?: 'cover' | 'contain' | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // Veřejný popis bytosti (16.2h) — oddělený od GM `notes`.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  // Schopnosti jsou součást `systemStats.abilities` (per-system schéma) —
  // top-level pole `abilities` zrušeno (D-NEW-BESTIE-ABILITIES-DUP).
  @IsObject()
  systemStats!: Record<string, unknown>;
}
