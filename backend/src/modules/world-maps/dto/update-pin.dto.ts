import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * 16.5 — úprava vlaječky (vše volitelné). Přesun = jen `x/y`; změna
 * vzhledu/cíle/viditelnosti = příslušná pole.
 */
export class UpdatePinDto {
  @IsOptional() @IsNumber() @Min(0) @Max(1) x?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) y?: number;
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsString() @MaxLength(2000) info?: string;
  @IsOptional() @IsIn(['page', 'map', 'none']) targetType?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  targetSlug?: string | null;
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  targetMapId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleToPlayerIds?: string[];
}
