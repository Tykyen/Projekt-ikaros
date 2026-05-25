import {
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
  IsString,
  IsNumber,
  IsIn,
  ArrayMaxSize,
  Min,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Whitelist tab IDs povolených v characterTabVisibility (Profil je vždy implicitně viditelný). */
export const CHARACTER_TAB_WHITELIST = [
  'soukrome',
  'denik',
  'finance',
  'vybava',
  'kalendar',
  'poznamky',
] as const;

export class WorldCurrencyItemDto {
  @IsString() id: string;
  @IsString() code: string;
  @IsString() name: string;
  @IsString() symbol: string;
  @IsNumber() @Min(0) rate: number;
}

export class AkjTypeDto {
  @IsString() key: string;
  @IsString() name: string;
  @IsNumber() @Min(0) level: number;
}

export class MenuTemplateItemDto {
  @IsString() label: string;
  @IsString() href: string;
  @IsOptional() @IsNumber() order?: number;
}

export class MenuTemplateDto {
  @IsString() name: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuTemplateItemDto)
  items: MenuTemplateItemDto[];
}

export class SchemaBlockDto {
  @IsString() key: string;
  @IsString() label: string;
  @IsString() type: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsNumber() order: number;
}

export class CharacterTabVisibilityDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(CHARACTER_TAB_WHITELIST, { each: true })
  PostavaHrace?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(CHARACTER_TAB_WHITELIST, { each: true })
  NPC?: string[];
}

export class UpdateWorldSettingsDto {
  @IsOptional() @IsArray() hiddenNavItems?: string[];
  @IsOptional() @IsArray() customGroups?: string[];
  @IsOptional() @IsObject() groupColors?: Record<string, string>;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorldCurrencyItemDto)
  currencies?: WorldCurrencyItemDto[];
  @IsOptional() @IsBoolean() hideDefaultWeather?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AkjTypeDto)
  akjTypes?: AkjTypeDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuTemplateDto)
  menuTemplates?: MenuTemplateDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaBlockDto)
  diarySchema?: SchemaBlockDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CharacterTabVisibilityDto)
  characterTabVisibility?: CharacterTabVisibilityDto;

  // 9.3 — slug calendar configu pro timeline. `null` = fallback na první config.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null, {
    message: 'timelineCalendarSlug musí být string nebo null',
  })
  @IsString()
  @MaxLength(64)
  timelineCalendarSlug?: string | null;
}
