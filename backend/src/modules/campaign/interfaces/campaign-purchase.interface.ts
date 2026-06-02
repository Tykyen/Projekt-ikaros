export interface CampaignPurchaseItemSnapshot {
  name: string;
  groupName?: string;
  subgroupName?: string;
  unitPrice: number;
  currencyCode: string;
  discountPercent: number;
  referenceLink?: string;
}

export interface CampaignPurchase {
  id: string;
  worldId: string;
  characterId: string;
  buyerUserId: string;
  shopItemId: string;
  itemSnapshot: CampaignPurchaseItemSnapshot;
  quantity: number;
  unitPriceOriginal: number;
  discountPercent: number;
  accountId: string;
  accountTransactionId: string;
  paidAmount: number;
  paidCurrency: string;
  inventorySectionId: string;
  inventoryItemId: string;
  status: 'active' | 'refunded';
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
