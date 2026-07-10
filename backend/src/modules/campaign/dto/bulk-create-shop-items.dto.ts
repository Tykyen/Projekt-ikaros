import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateCampaignShopItemDto } from './create-campaign-shop-item.dto';

/** 21.5a-B — max položek v jednom bulk requestu (DoS guard + service kontrola). */
export const SHOP_BULK_MAX = 200;

/** 21.5a-B — wrapper pro `POST /campaign/shopitems/bulk` (hromadné vkládání). */
export class BulkCreateShopItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SHOP_BULK_MAX)
  @ValidateNested({ each: true })
  @Type(() => CreateCampaignShopItemDto)
  items!: CreateCampaignShopItemDto[];
}
