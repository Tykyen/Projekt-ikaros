/**
 * 21.5a — UpdatePlantDto pro `PATCH /api/plants/community/:id`.
 *
 * Herbář NEMÁ oddělené staty jako bestie (žádný `/lore` vs. `/statblock` split),
 * takže update mění VŠECHNA pole rostliny naráz (name/aliases/habitat/usage/
 * rarity/rarityNote/description/tags/suggestedPrice/image). `statblocks` se přes
 * update NEmění (zatím prázdné). `PartialType` = všechna pole Create volitelná.
 */
import { PartialType } from '@nestjs/mapped-types';
import { CreatePlantDto } from './create-plant.dto';

export class UpdatePlantDto extends PartialType(CreatePlantDto) {}
