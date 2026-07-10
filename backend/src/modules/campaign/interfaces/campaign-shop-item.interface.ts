export interface CampaignShopItem {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  name: string;
  description?: string;
  groupId: string;
  subgroupId?: string;
  price: number;
  currencyCode: string;
  discountPercent: number;
  linkedItemIds: string[];
  referenceLink?: string;
  isRecommended: boolean;
  // 21.5a-B — obrázek položky + výřez (parity s Plant/Bestie).
  imageUrl?: string;
  imageFocalX?: number | null;
  imageFocalY?: number | null;
  imageZoom?: number | null;
  imageFit?: 'cover' | 'contain' | null;
  createdAt: Date;
  updatedAt: Date;
}
