import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignShopGroupDocument =
  HydratedDocument<CampaignShopGroupSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignShopGroups' })
export class CampaignShopGroupSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) name: string;
  // null/undefined = top skupina; jinak slug podskupiny (2 úrovně, ne víc)
  @Prop() parentId?: string;
  @Prop({ default: 0 }) order: number;
  // sleva na celou skupinu, 0–100 %
  @Prop({ default: 0 }) discountPercent: number;
}

export const CampaignShopGroupSchema = SchemaFactory.createForClass(
  CampaignShopGroupSchemaClass,
);
CampaignShopGroupSchema.index({ worldId: 1, ownerId: 1 });
CampaignShopGroupSchema.index({ worldId: 1, parentId: 1 });
