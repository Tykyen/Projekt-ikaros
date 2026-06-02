import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateCampaignShopItemDto {
  @IsString() name: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() subgroupId?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsArray() linkedItemIds?: string[];
  @IsOptional() @IsString() referenceLink?: string;
  @IsOptional() @IsBoolean() isRecommended?: boolean;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
