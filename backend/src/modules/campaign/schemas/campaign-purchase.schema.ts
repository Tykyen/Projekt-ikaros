import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignPurchaseDocument =
  HydratedDocument<CampaignPurchaseSchemaClass>;

/**
 * Krok 11.3 §5.1 — purchase log. Kotva pro storno + audit. Drží reference do
 * účtu (transakce) i inventáře (sekce+položka) a `itemSnapshot` (přežije
 * smazání položky/skupiny z katalogu).
 */
@Schema({ timestamps: true, collection: 'campaignPurchases' })
export class CampaignPurchaseSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) characterId: string;
  @Prop({ required: true }) buyerUserId: string;
  @Prop({ required: true }) shopItemId: string;
  @Prop({ type: Object, default: {} }) itemSnapshot: Record<string, unknown>;
  @Prop({ default: 1 }) quantity: number;
  @Prop({ default: 0 }) unitPriceOriginal: number;
  @Prop({ default: 0 }) discountPercent: number;
  @Prop({ required: true }) accountId: string;
  @Prop({ default: '' }) accountTransactionId: string;
  @Prop({ default: 0 }) paidAmount: number;
  @Prop({ default: '' }) paidCurrency: string;
  @Prop({ default: '' }) inventorySectionId: string;
  @Prop({ default: '' }) inventoryItemId: string;
  @Prop({ default: 'active' }) status: string; // 'active' | 'refunded'
  @Prop() refundedAt?: Date;
}

export const CampaignPurchaseSchema = SchemaFactory.createForClass(
  CampaignPurchaseSchemaClass,
);
CampaignPurchaseSchema.index({ worldId: 1, characterId: 1, status: 1 });
CampaignPurchaseSchema.index({ worldId: 1, createdAt: -1 });
