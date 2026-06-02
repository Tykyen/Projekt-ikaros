export interface CampaignShopGroup {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  name: string;
  parentId?: string;
  order: number;
  discountPercent: number;
  createdAt: Date;
  updatedAt: Date;
}
