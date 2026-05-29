/**
 * 10.2d-prep-B — CreateBestieDto pro `POST /api/bestiae`.
 */
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBestieDto {
  @IsIn(['user', 'world', 'system'])
  scope!: 'user' | 'world' | 'system';

  @IsString()
  @MinLength(1)
  systemId!: string;

  @IsOptional()
  @IsString()
  worldId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

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

  @IsObject()
  systemStats!: Record<string, unknown>;
}
