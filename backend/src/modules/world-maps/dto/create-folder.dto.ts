import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateFolderDto {
  @IsString() @MaxLength(200) name: string;

  /** Rodičovská složka; `null`/vynecháno = kořen. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  parentId?: string | null;

  @IsOptional() @IsBoolean() isPublic?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleToPlayerIds?: string[];
}
