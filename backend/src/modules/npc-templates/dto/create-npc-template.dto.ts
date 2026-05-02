import { IsString, IsOptional, IsNumber, IsArray, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TagValueDto {
  @IsString() label: string;
  @IsString() value: string;
}

export class CreateNpcTemplateDto {
  @IsString() name: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Min(0) maxHp?: number;
  @IsOptional() @IsNumber() @Min(0) armor?: number;
  @IsOptional() @IsNumber() @Min(0) injury?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TagValueDto) abilities?: TagValueDto[];
  @IsOptional() @IsArray() diarySchema?: Record<string, unknown>[];
  @IsOptional() @IsObject() diaryData?: Record<string, unknown>;
}
