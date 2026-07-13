import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  IsNumber,
  ValidateNested,
  ValidateIf,
  IsIn,
  IsObject,
  MaxLength,
  Min,
  Max,
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

  /** D-19.2 — velikost blobu `url` (FE přeposílá `bytes` z uploadu). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(104_857_600)
  bytes?: number;

  @IsString()
  caption: string = '';

  @IsNumber()
  order: number = 0;
}

// 17.7 — vizuální rodokmen.
export class FamilyPersonDto {
  @IsString()
  id: string;

  @IsString()
  name: string = '';

  @IsOptional()
  @IsString()
  sub?: string;

  @IsOptional()
  @IsString()
  born?: string;

  @IsOptional()
  @IsString()
  died?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  pageSlug?: string;

  @IsNumber()
  x: number = 0;

  @IsNumber()
  y: number = 0;
}

export class FamilyUnionDto {
  @IsString()
  id: string;

  @IsString()
  aId: string;

  @IsOptional()
  @IsString()
  bId?: string;

  @IsArray()
  @IsString({ each: true })
  childIds: string[] = [];
}

export class FamilyTreeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FamilyPersonDto)
  people: FamilyPersonDto[] = [];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FamilyUnionDto)
  unions: FamilyUnionDto[] = [];
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

  // Skryje záložku i vlastníkovi postavy. Default false = vlastník PC vidí.
  @IsOptional()
  @IsBoolean()
  ownerHidden?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => AkjTabContentOverrideDto)
  contentOverride?: AkjTabContentOverrideDto;

  // `locked` je READ-TIME enrich (server-počítaný zámek pro hráče bez přístupu,
  // viz pages.service findBySlug). Klient ho dostane v GET a editor ho posílá zpět.
  // Přijmeme ho (jinak forbidNonWhitelisted shodí celý PATCH — error-contract EC),
  // ale do DB se NEUKLÁDÁ — `sanitizeAkjTabs` ho zahodí (GET ho vždy přepočítá).
  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}

export class CreatePageDto {
  @IsString()
  slug: string;

  @IsIn(Object.values(PAGE_TYPES))
  type: PageType;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  /** D-19.2 — velikost blobu `imageUrl` (FE přeposílá `bytes` z uploadu). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(104_857_600)
  imageBytes?: number;

  @IsOptional()
  @IsBoolean()
  bigImage?: boolean;

  // Parita s GameEvent — výřez hlavního obrázku. `ValidateIf` povolí `null`
  // (clear při odebrání obrázku); PartialType ho propaguje do UpdatePageDto.
  @IsOptional()
  @ValidateIf((o: CreatePageDto) => o.imageFocalX !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number | null;

  @IsOptional()
  @ValidateIf((o: CreatePageDto) => o.imageFocalY !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number | null;

  @IsOptional()
  @ValidateIf((o: CreatePageDto) => o.imageZoom !== null)
  @IsNumber()
  @Min(100)
  @Max(400)
  imageZoom?: number | null;

  @IsOptional()
  @ValidateIf((o: CreatePageDto) => o.imageFit !== null)
  @IsIn(['cover', 'contain'])
  imageFit?: 'cover' | 'contain' | null;

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

  // 17.7 — vizuální rodokmen (jen typ Rodokmen; pro ostatní undefined).
  @IsOptional()
  @ValidateNested()
  @Type(() => FamilyTreeDto)
  familyTree?: FamilyTreeDto;

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
