/**
 * 21.5a — položka karty v pending frontě „rostliny ke schválení" (Zpracovat
 * tab). Analogie CommunityBestieReviewListItem.
 */
import type { PlantRarity } from './plant.interface';

export interface CommunityPlantReviewListItem {
  plantId: string;
  name: string;
  aliases?: string;
  rarity?: PlantRarity;
  authorId: string;
  submittedAt: string;
}
