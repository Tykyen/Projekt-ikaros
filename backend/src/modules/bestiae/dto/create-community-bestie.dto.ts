/**
 * 16.2b-2 — CreateCommunityBestieDto pro `POST /api/bestiae/community`.
 * Zakládá globální (komunitní) bytost jako NÁVRH (`status:'draft'`) se sdíleným
 * lore + první pravidlovou verzí (`systemId` + `systemStats`). Další systémy se
 * přidávají přes návrh statbloku (spec §2a). Autor bytost hned dostane i do
 * svého osobního bestiáře (spec §5).
 */
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCommunityBestieDto {
  /** Primární systém = pravidlová verze zakládaná spolu s bytostí. */
  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

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

  // Výřez obrázku — parity s CreateBestieDto (focal 0–100, zoom 100–400).
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

  /** První pravidlová verze statů (pro `systemId`). */
  @IsObject()
  systemStats!: Record<string, unknown>;
}
