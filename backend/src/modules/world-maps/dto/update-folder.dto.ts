import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateFolderDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;

  /** Přesun ve stromu; `null` = do kořene. */
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
