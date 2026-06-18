/**
 * 10.2d-prep-B — UpdateBestieDto pro `PATCH /api/bestiae/:id`.
 * scope/systemId/ownerUserId/worldId jsou immutable (po create se nemění).
 */
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateBestieDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  // Výřez obrázku — viz CreateBestieDto. null projde přes @IsOptional.
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

  // Schopnosti jsou součást `systemStats.abilities` — top-level pole zrušeno
  // (D-NEW-BESTIE-ABILITIES-DUP).
  @IsOptional()
  @IsObject()
  systemStats?: Record<string, unknown>;
}
