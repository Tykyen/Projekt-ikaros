/**
 * 21.5a — CreatePlantDto pro `POST /api/plants/community`. Zakládá rostlinu
 * jako NÁVRH (`status:'draft'`). Staty (`statblocks`) se zatím needítují —
 * herbář nemá boj/statblok logiku. Vzor: create-community-bestie.dto.ts.
 */
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PLANT_RARITIES,
  type PlantRarity,
} from '../interfaces/plant.interface';

export class CreatePlantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  aliases?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  habitat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  usage?: string;

  @IsOptional()
  @IsIn(PLANT_RARITIES)
  rarity?: PlantRarity;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  rarityNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  suggestedPrice?: number | null;
}
