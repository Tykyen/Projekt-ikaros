import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAGE_TYPES } from '../interfaces/page.interface';

export class AccessRequirementDto {
  @IsIn(['UserId', 'AKJ', 'Role'])
  type: 'UserId' | 'AKJ' | 'Role';

  @IsString()
  value: string;
}

export class PageSectionItemDto {
  @IsString()
  id: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PageSectionDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  content: string = '';

  @IsNumber()
  order: number = 0;

  @IsBoolean()
  isCollapsed: boolean = false;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageSectionItemDto)
  items: PageSectionItemDto[] = [];
}

export class GalleryImageDto {
  @IsString()
  id: string;

  @IsString()
  url: string;

  @IsString()
  caption: string = '';

  @IsNumber()
  order: number = 0;
}

export class InstructionalVideoDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  youtubeUrl: string;

  @IsString()
  youtubeVideoId: string;
}

export class MenuItemDto {
  @IsString()
  label: string;

  @IsString()
  href: string;

  @IsOptional()
  @IsNumber()
  order?: number;
}

export class CreatePageDto {
  @IsString()
  slug: string;

  @IsIn(Object.values(PAGE_TYPES))
  type: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  bigImage?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageSectionDto)
  sections?: PageSectionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GalleryImageDto)
  galleryImages?: GalleryImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstructionalVideoDto)
  videos?: InstructionalVideoDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  menu?: MenuItemDto[];

  @IsOptional()
  @IsBoolean()
  isWoodWide?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessRequirementDto)
  accessRequirements?: AccessRequirementDto[];

  @IsOptional()
  @IsNumber()
  order?: number;
}
