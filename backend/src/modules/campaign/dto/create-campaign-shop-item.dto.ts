import { IsString, IsOptional, IsArray, IsBoolean, IsNumber, Min } from 'class-validator';

export class CreateCampaignShopItemDto {
  @IsString() name: string;
  @IsString() group: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() subgroup?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsArray() linkedItemIds?: string[];
  @IsOptional() @IsString() referenceLink?: string;
  @IsOptional() @IsBoolean() isRecommended?: boolean;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
