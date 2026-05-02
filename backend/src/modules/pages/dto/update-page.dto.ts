import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, IsObject, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { AccessRequirementDto, PageSectionDto, GalleryImageDto, InstructionalVideoDto, PageTableDto } from './create-page.dto';

export class UpdatePageDto {
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() bigImage?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PageSectionDto) sections?: PageSectionDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GalleryImageDto) galleryImages?: GalleryImageDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InstructionalVideoDto) videos?: InstructionalVideoDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccessRequirementDto) accessRequirements?: AccessRequirementDto[];
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @ValidateNested() @Type(() => PageTableDto) table?: PageTableDto;
  @IsOptional() @IsObject() customData?: Record<string, string>;
}
