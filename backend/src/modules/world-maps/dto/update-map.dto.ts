import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateMapDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleToPlayerIds?: string[];

  /** Přesun mapy do složky; `null` = kořen atlasu. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  folderId?: string | null;

  /** 16.5b — propojení s taktickou scénou (1:1); `null` = odpojit. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  linkedSceneId?: string | null;
}
