/**
 * 21.5b — CreateCommunityPotionDto pro `POST /api/potions/community`. Zakládá
 * lektvar jako NÁVRH (jádro vč. druhu + surovin s množstvím) + první
 * pravidlovou verzí (`systemId` + `systemStats`). Vzor: create-community-spell.
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Surovina receptu (spec R3) — co a volitelně kolik. */
export class PotionIngredientDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  amount?: string;
}

export class CreateCommunityPotionDto {
  /** Primární systém = pravidlová verze zakládaná spolu s lektvarem. */
  @IsString()
  @MinLength(1)
  systemId!: string;

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

  /** Druh lektvaru (léčivý/jed/…) — povinný (spec R2). */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  kind!: string;

  /** Suroviny — min. 1 (spec R3, zadání uživatele). */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PotionIngredientDto)
  ingredients!: PotionIngredientDto[];

  /** „Oznámení" — popis účinku / lore. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  /** Navrhovaná cena (bez měny). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  suggestedPrice?: number | null;

  /** První pravidlová verze statů (pro `systemId`) — pole dle FE šablony. */
  @IsObject()
  systemStats!: Record<string, unknown>;
}
