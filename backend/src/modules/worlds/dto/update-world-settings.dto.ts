import { IsOptional, IsArray, IsBoolean, IsObject, IsString, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsArray() @ValidateNested({ each: true }) @Type(() => MenuTemplateItemDto) items: MenuTemplateItemDto[];
}

export class UpdateWorldSettingsDto {
  @IsOptional() @IsArray() hiddenNavItems?: string[];
  @IsOptional() @IsArray() customGroups?: string[];
  @IsOptional() @IsObject() groupColors?: Record<string, string>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorldCurrencyItemDto) currencies?: WorldCurrencyItemDto[];
  @IsOptional() @IsBoolean() hideDefaultWeather?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AkjTypeDto) akjTypes?: AkjTypeDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MenuTemplateDto) menuTemplates?: MenuTemplateDto[];
}
