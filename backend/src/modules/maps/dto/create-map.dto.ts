import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 10.2c hotfix — class-validator dekorátory doplněny.
 *
 * Důvod: `ValidationPipe({ whitelist: true })` v `main.ts` dropuje pole BEZ
 * class-validator metadat. Bez decorators DTO končilo prázdné v controlleru
 * (`dto.worldId === undefined` → fallback `?? ''` → Mongoose schema validace
 * `required: true` failnula s 500). Pre-existing dluh z 8.x maps modulu.
 */
export class HexConfigDto {
  @IsOptional() size?: number;
  @IsOptional() originX?: number;
  @IsOptional() originY?: number;
  @IsOptional() @IsBoolean() showGrid?: boolean;
}

export class CreateMapDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() worldId?: string;
  @IsOptional() @IsString() folder?: string;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => HexConfigDto)
  config?: HexConfigDto;
  @IsOptional() @IsArray() tokens?: Record<string, unknown>[];
  @IsOptional() @IsArray() npcTemplates?: Record<string, unknown>[];
  @IsOptional() @IsArray() effects?: Record<string, unknown>[];
  @IsOptional() @IsBoolean() fogEnabled?: boolean;
  @IsOptional() @IsArray() revealedHexes?: { q: number; r: number }[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isHidden?: boolean;
  @IsOptional() @IsBoolean() isLocked?: boolean;
  @IsOptional() @IsArray() activeSoundIds?: string[];
}
