import { IsString, IsOptional, IsBoolean, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccessRequirementDto } from '../../pages/dto/create-page.dto';
import { InfoBlockDto } from './create-character.dto';

export class UpdateCharacterDto {
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsBoolean() isNpc?: boolean;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() publicBio?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InfoBlockDto) publicInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsString() privateBio?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InfoBlockDto) privateInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsObject() diaryData?: Record<string, unknown>;
  @IsOptional() @IsArray() extraBlocks?: Record<string, unknown>[];
  @IsOptional() @IsString() campaignSubjectId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccessRequirementDto) accessRequirements?: AccessRequirementDto[];
}
