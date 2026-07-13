/**
 * 21.5e — UpdateItemLoreDto pro `PATCH /api/items/community/:id/lore`.
 * Jádro (název/druh/oznámení/obrázek/štítky/cena) — STATY tudy NEjdou
 * (jen přes /statblock). Vzor: update-potion-lore.
 */
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateItemLoreDto {
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

  /** Druh předmětu — když se posílá, nesmí být prázdný (spec R1/R2). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  kind?: string;

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
