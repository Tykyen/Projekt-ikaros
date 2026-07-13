/**
 * 21.5c — CreateCommunitySpellDto pro `POST /api/spells/community`. Zakládá
 * kouzlo jako NÁVRH (`status:'draft'`) se sdíleným jádrem (oznámení + obrázek)
 * + první pravidlovou verzí (`systemId` + `systemStats`). Další systémy přes
 * návrh statbloku. Vzor: create-community-bestie.dto.ts.
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

export class CreateCommunitySpellDto {
  /** Primární systém = pravidlová verze zakládaná spolu s kouzlem. */
  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** Alternativní/lidová jména (volný text). */
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

  // Výřez obrázku — parity s bestiae/plants (focal 0–100, zoom 100–400).
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

  /** „Oznámení" — lore/popis účinku. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  /** První pravidlová verze statů (pro `systemId`) — pole dle FE šablony. */
  @IsObject()
  systemStats!: Record<string, unknown>;
}
