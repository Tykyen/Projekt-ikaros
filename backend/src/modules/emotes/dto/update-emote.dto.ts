import {
  IsString,
  IsOptional,
  Matches,
  IsUrl,
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

/**
 * Krok 6.4 + D-NEW-emote-update — partial update existujícího emote.
 * Všechna pole optional, ale musí být alespoň jedno (kontrola v service).
 */
export class UpdateEmoteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{2,32}$/, {
    message: 'Shortcode musí obsahovat jen a-z, 0-9, _ a mít 2–32 znaků',
  })
  shortcode?: string;

  @IsOptional()
  @IsString()
  imageId?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  imageUrl?: string;

  /** D-19.2 — velikost blobu `imageUrl` (FE přeposílá `bytes` z uploadu). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(104_857_600)
  imageBytes?: number;

  /** D-NEW-emote-categories — volné tagy (max 10, každý do 32 znaků). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];
}
