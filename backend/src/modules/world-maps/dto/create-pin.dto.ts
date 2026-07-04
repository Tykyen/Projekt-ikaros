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
 * 16.5 — nová vlaječka nad mapou. `x/y` v 0..1 (poloha nad obrázkem). `label`
 * volitelný (default „Bez názvu" řeší service). Cíl dle `targetType`.
 */
export class CreatePinDto {
  @IsNumber() @Min(0) @Max(1) x: number;
  @IsNumber() @Min(0) @Max(1) y: number;
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
