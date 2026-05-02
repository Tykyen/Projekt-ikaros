import { IsString, IsOptional, IsNumber, IsArray, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TagValueDto } from './create-npc-template.dto';

export class UpdateNpcTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Min(0) maxHp?: number;
  @IsOptional() @IsNumber() @Min(0) armor?: number;
  @IsOptional() @IsNumber() @Min(0) injury?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TagValueDto) abilities?: TagValueDto[];
  @IsOptional() @IsArray() diarySchema?: Record<string, unknown>[];
  @IsOptional() @IsObject() diaryData?: Record<string, unknown>;
}
