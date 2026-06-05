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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Prvek `abilities[]` — label/value pár (zrcadlí bestie.schema.ts). */
export class AbilityDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsString()
  @MaxLength(2000)
  value!: string;
}

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

  @IsObject()
  systemStats!: Record<string, unknown>;
}
