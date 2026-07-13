/**
 * 21.5e — CreateCommunityItemDto pro `POST /api/items/community`. Zakládá
 * předmět jako NÁVRH (jádro vč. druhu — ten ve FE řídí variantu polí
 * statbloku) + první pravidlovou verzí (`systemId` + `systemStats`).
 * Vzor: create-community-potion.
 */
import {
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
} from 'class-validator';

export class CreateCommunityItemDto {
  /** Primární systém = pravidlová verze zakládaná spolu s předmětem. */
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

  /** Druh předmětu (zbraň/zbroj/…) — povinný (spec R1/R2). */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  kind!: string;

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
