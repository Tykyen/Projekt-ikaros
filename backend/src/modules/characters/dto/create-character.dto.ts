import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AccessRequirementDto } from '../../pages/dto/create-page.dto';

export class InfoBlockDto {
  @IsString() label: string;
  @IsString() value: string;
}

export class CreateCharacterDto {
  @IsString() slug: string;
  @IsString() name: string;
  @IsOptional() @IsString() userId?: string;
  @IsBoolean() isNpc: boolean;
  /** Spec 9.2 — viz Character.kind v interface. Default 'persona'. */
  @IsOptional() @IsIn(['persona', 'location']) kind?: 'persona' | 'location';
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() publicBio?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InfoBlockDto)
  publicInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsString() privateBio?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InfoBlockDto)
  privateInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsString() campaignSubjectId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessRequirementDto)
  accessRequirements?: AccessRequirementDto[];
}
