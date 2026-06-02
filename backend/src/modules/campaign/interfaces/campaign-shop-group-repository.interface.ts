import type { CampaignShopGroup } from './campaign-shop-group.interface';

export interface ICampaignShopGroupRepository {
  findMany(
    filter: Record<string, unknown>,
    sort?: Record<string, unknown>,
  ): Promise<CampaignShopGroup[]>;
  findById(id: string): Promise<CampaignShopGroup | null>;
  create(data: Partial<CampaignShopGroup>): Promise<CampaignShopGroup>;
  update(
    id: string,
    data: Partial<CampaignShopGroup>,
  ): Promise<CampaignShopGroup | null>;
  delete(id: string): Promise<boolean>;
  countChildren(worldId: string, parentId: string): Promise<number>;
}
