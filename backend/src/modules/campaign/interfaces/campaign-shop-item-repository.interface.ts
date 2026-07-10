import type { CampaignShopItem } from './campaign-shop-item.interface';

export interface ICampaignShopItemRepository {
  findMany(
    filter: Record<string, unknown>,
    sort?: Record<string, unknown>,
  ): Promise<CampaignShopItem[]>;
  findById(id: string): Promise<CampaignShopItem | null>;
  create(data: Partial<CampaignShopItem>): Promise<CampaignShopItem>;
  // 21.5a-B — hromadné vložení položek (bulk).
  createMany(docs: Partial<CampaignShopItem>[]): Promise<CampaignShopItem[]>;
  update(
    id: string,
    data: Partial<CampaignShopItem>,
  ): Promise<CampaignShopItem | null>;
  delete(id: string): Promise<boolean>;
  pullLinkedItem(worldId: string, deletedId: string): Promise<void>;
  countByGroup(worldId: string, groupId: string): Promise<number>;
}
