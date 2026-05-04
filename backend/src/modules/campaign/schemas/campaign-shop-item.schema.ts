import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignShopItemDocument = HydratedDocument<CampaignShopItemSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignShopItems' })
export class CampaignShopItemSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  @Prop({ required: true }) group: string;
  @Prop() subgroup?: string;
  @Prop({ default: 0 }) price: number;
  @Prop({ default: '' }) currencyCode: string;
  @Prop({ type: [String], default: [] }) linkedItemIds: string[];
  @Prop() referenceLink?: string;
  @Prop({ default: false }) isRecommended: boolean;
}

export const CampaignShopItemSchema = SchemaFactory.createForClass(CampaignShopItemSchemaClass);
CampaignShopItemSchema.index({ worldId: 1, ownerId: 1 });
CampaignShopItemSchema.index({ worldId: 1, isShared: 1 });
CampaignShopItemSchema.index({ worldId: 1, group: 1 });
CampaignShopItemSchema.index({ worldId: 1, updatedAt: -1 });
