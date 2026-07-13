import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateMapDto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() imageUrl: string;
  /** D-19.2 — velikost blobu `imageUrl` (FE přeposílá `bytes` z uploadu). */
  @IsOptional() @IsInt() @Min(0) @Max(104_857_600) imageBytes?: number;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleToPlayerIds?: string[];

  /** Složka, do které mapa patří; `null`/vynecháno = kořen. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  folderId?: string | null;
}
