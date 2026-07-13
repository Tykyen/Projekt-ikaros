/**
 * 21.5d — CreateRiddleDto pro `POST /api/riddles/community`. Zakládá hádanku
 * jako NÁVRH (`status:'draft'`). Vzor: create-plant.dto (bez statblocků).
 */
import {
  ArrayMaxSize,
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
  RIDDLE_DIFFICULTIES,
  type RiddleDifficulty,
} from '../interfaces/riddle.interface';

export class CreateRiddleDto {
  /** Zadání hádanky (identita, spec R4). */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question!: string;

  /** Odpověď (FE skrývá za spoiler). */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  answer!: string;

  /** Postupné nápovědy (0–5). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  hints?: string[];

  /** Úroveň obtížnosti — povinná (spec R2). */
  @IsIn(RIDDLE_DIFFICULTIES)
  difficulty!: RiddleDifficulty;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  origin?: string;

  /** Poznámka pro PJ / kontext. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

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
}
