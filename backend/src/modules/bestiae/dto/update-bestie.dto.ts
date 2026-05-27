/**
 * 10.2d-prep-B — UpdateBestieDto pro `PATCH /api/bestiae/:id`.
 * scope/systemId/ownerUserId/worldId jsou immutable (po create se nemění).
 */
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateBestieDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  abilities?: Array<{ label: string; value: string }>;

  @IsOptional()
  @IsObject()
  systemStats?: Record<string, unknown>;
}
