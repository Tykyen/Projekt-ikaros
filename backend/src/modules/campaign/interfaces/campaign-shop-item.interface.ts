export interface CampaignShopItem {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  name: string;
  description?: string;
  group: string;
  subgroup?: string;
  price: number;
  currencyCode: string;
  linkedItemIds: string[];
  referenceLink?: string;
  isRecommended: boolean;
  createdAt: Date;
  updatedAt: Date;
}
