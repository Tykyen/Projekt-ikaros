import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
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
  // 21.5a-B — obrázek + výřez (parity s CreatePlantDto: focal 0–100, zoom 100–400).
  @IsOptional() @IsString() @MaxLength(2048) imageUrl?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) imageFocalX?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) imageFocalY?: number | null;
  @IsOptional() @IsNumber() @Min(100) @Max(400) imageZoom?: number | null;
  @IsOptional() @IsString() imageFit?: 'cover' | 'contain' | null;
}
