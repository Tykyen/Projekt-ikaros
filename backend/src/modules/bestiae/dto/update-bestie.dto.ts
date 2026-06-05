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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AbilityDto } from './create-bestie.dto';

export class UpdateBestieDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbilityDto)
  abilities?: AbilityDto[];

  @IsOptional()
  @IsObject()
  systemStats?: Record<string, unknown>;
}
