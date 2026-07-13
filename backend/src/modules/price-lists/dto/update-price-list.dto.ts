/**
 * 21.5f — UpdatePriceListDto pro `PATCH /api/price-lists/community/:id`.
 * Partial — jen odeslaná pole; `items` = plná náhrada pole (editor posílá
 * celé pole položek). `status`/`authorId` se přes update NEmění.
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreatePriceListDto } from './create-price-list.dto';

export class UpdatePriceListDto extends PartialType(CreatePriceListDto) {}
