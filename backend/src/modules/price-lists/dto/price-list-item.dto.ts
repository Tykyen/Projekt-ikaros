/**
 * 21.5f — vnořené DTO jedné položky ceníku (sdílí create i update přes
 * `@ValidateNested`). `id` volitelné — chybějící doplní service (uuid).
 * Cena = celá čísla ≥ 0 (zlaté/stříbrné/měďáky, poměr pevně 1:10:100).
 */
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PriceListItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  section?: string;

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

  // Výřez obrázku — parity s bestiae (focal 0–100, zoom 100–400).
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

  /** R6 — atribuce převzatého obrázku (autor · zdroj · licence). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageCredit?: string;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  gold!: number;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  silver!: number;

  @IsInt()
  @Min(0)
  @Max(100_000_000)
  copper!: number;

  /** R4 — link na komunitní předmět (`community_items`). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  linkedItemId?: string;
}
