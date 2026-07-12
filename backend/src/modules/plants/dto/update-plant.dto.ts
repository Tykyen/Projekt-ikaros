/**
 * 21.5a — UpdatePlantDto pro `PATCH /api/plants/community/:id`.
 *
 * Herbář NEMÁ oddělené staty jako bestie (žádný `/lore` vs. `/statblock` split),
 * takže update mění VŠECHNA pole rostliny naráz (name/aliases/habitat/usage/
 * rarity/rarityNote/description/tags/suggestedPrice/image). `statblocks` se přes
 * update NEmění (zatím prázdné). `PartialType` = všechna pole Create volitelná.
 */
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreatePlantDto } from './create-plant.dto';
import {
  PLANT_RARITIES,
  type PlantRarity,
} from '../interfaces/plant.interface';

export class UpdatePlantDto extends PartialType(
  // D-072 — rarity re-deklarujeme s širším typem (| null), base ji musí vynechat.
  OmitType(CreatePlantDto, ['rarity'] as const),
) {
  /**
   * D-072 — `null` = sentinel „vymazat vzácnost na neurčeno" (service → $unset).
   * `@IsOptional` pouští null i undefined; ne-null hodnota musí být z enum.
   */
  @IsOptional()
  @IsIn(PLANT_RARITIES)
  rarity?: PlantRarity | null;
}
