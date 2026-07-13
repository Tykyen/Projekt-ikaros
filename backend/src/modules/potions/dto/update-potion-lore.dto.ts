/**
 * 21.5b — UpdatePotionLoreDto pro `PATCH /api/potions/community/:id/lore`.
 * Jádro (název/druh/suroviny/oznámení/obrázek/štítky/cena) — STATY tudy
 * NEjdou (jen přes /statblock). Vzor: update-spell-lore.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PotionIngredientDto } from './create-community-potion.dto';

export class UpdatePotionLoreDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

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

  /** Druh lektvaru — když se posílá, nesmí být prázdný (spec R2). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  kind?: string;

  /** Suroviny — když se posílají, min. 1 (spec R3). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PotionIngredientDto)
  ingredients?: PotionIngredientDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  /** Navrhovaná cena (bez měny). `null` = vymazat na neuvedeno. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  suggestedPrice?: number | null;
}
