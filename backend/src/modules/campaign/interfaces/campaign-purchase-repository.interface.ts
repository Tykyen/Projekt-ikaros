import type { CampaignPurchase } from './campaign-purchase.interface';

export interface ICampaignPurchaseRepository {
  findMany(
    filter: Record<string, unknown>,
    sort?: Record<string, unknown>,
  ): Promise<CampaignPurchase[]>;
  findById(id: string): Promise<CampaignPurchase | null>;
  create(data: Partial<CampaignPurchase>): Promise<CampaignPurchase>;
  update(
    id: string,
    data: Partial<CampaignPurchase>,
  ): Promise<CampaignPurchase | null>;
}
