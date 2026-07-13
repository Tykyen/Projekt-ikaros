import {
  IsString,
  IsNotEmpty,
  Matches,
  IsUrl,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class CreateEmoteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^[a-z0-9_]{2,32}$/, {
    message: 'Shortcode musí obsahovat jen a-z, 0-9, _ a mít 2–32 znaků',
  })
  shortcode: string;

  @IsString()
  @IsNotEmpty()
  imageId: string;

  /** Krok 6.4 — Cloudinary URL z `useUploadImage` (FE pošle, BE uloží). */
  @IsUrl({ require_protocol: true })
  imageUrl: string;

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
