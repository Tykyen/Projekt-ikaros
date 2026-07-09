/**
 * 16.2b-2 — UpdateBestieLoreDto pro `PATCH /api/bestiae/community/:id/lore`.
 *
 * ⚠️ TVRDÉ PRAVIDLO (spec §2a): lore (text/obrázek) se mění volně, ale STATY
 * NE — proto tohle DTO záměrně NEobsahuje `systemStats`. Staty jdou jen přes
 * návrh statbloku + schválení kurátorem.
 */
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateBestieLoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  latin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  kind?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

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
  @IsString()
  imageFit?: 'cover' | 'contain' | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
