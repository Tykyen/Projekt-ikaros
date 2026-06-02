import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  ValidateNested,
  IsIn,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PAGE_TYPES, type PageType } from '../interfaces/page.interface';

export class AccessRequirementDto {
  @IsIn(['UserId', 'AKJ', 'Role', 'AKJType'])
  type: 'UserId' | 'AKJ' | 'Role' | 'AKJType';

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

/**
 * Krok 8.4 — `table` doplněn do DTO (bez něj ho `ValidationPipe` zahazoval).
 * Krok 8.5 — buňky (`headers`/`values`) jsou rich-text HTML stringy s
 * inline odkazy; sanitizaci řeší service vrstva.
 */
export class PageTableDto {
  @IsBoolean()
  hasTable: boolean;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];
}

/** Krok 9.1 — strukturovaný label/value pár (rasa, povolání, …). */
export class InfoBlockDto {
  @IsString()
  label: string;

  @IsString()
  value: string;
}

/** Krok 9.1 — odkaz na Character entity pro 5 subdokumentů. */
export class CharacterRefDto {
  @IsString()
  characterId: string;
}

/**
 * AKJ záložka — sparse override obsahu (vyplněné pole přepíše základ stránky).
 * HTML pole (`content`, `table`, `sections`) sanitizuje service vrstva.
 */
export class AkjTabContentOverrideDto {
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PageTableDto)
  table?: PageTableDto;
}

export class AkjTabDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsNumber()
  order: number = 0;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessRequirementDto)
  access: AccessRequirementDto[] = [];

  @IsOptional()
  @ValidateNested()
  @Type(() => AkjTabContentOverrideDto)
  contentOverride?: AkjTabContentOverrideDto;
}

export class CreatePageDto {
  @IsString()
  slug: string;

  @IsIn(Object.values(PAGE_TYPES))
  type: PageType;

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

  // Krok 8.4 — `table` (atributová tabulka) + `customData` (typ Noviny)
  // doplněny do DTO. Bez nich je `ValidationPipe({ whitelist: true })`
  // zahazoval → tato data se z editoru nikdy neuložila.
  @IsOptional()
  @ValidateNested()
  @Type(() => PageTableDto)
  table?: PageTableDto;

  @IsOptional()
  @IsObject()
  customData?: Record<string, string>;

  // Krok 9.1 — pole pro PostavaHrace / NPC.
  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CharacterRefDto)
  characterRef?: CharacterRefDto;

  // AKJ chráněné záložky (spec-akj-protected-tabs). ValidationPipe whitelist by
  // je bez deklarace odřízl. Sanitace HTML obsahu v service vrstvě.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AkjTabDto)
  akjTabs?: AkjTabDto[];
}
