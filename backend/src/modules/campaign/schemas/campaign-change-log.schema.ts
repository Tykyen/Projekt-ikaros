import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignChangeLogDocument = HydratedDocument<CampaignChangeLogSchemaClass>;

@Schema({ collection: 'campaignChangeLogs' })
export class CampaignChangeLogSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) entityType: string;
  @Prop({ required: true }) entityId: string;
  @Prop({ required: true }) entityName: string;
  @Prop({ required: true }) changeType: string;
  @Prop({ required: true }) changedByUserId: string;
  @Prop({ required: true }) changedByName: string;
  @Prop({ default: () => new Date() }) changedAt: Date;
}

export const CampaignChangeLogSchema = SchemaFactory.createForClass(CampaignChangeLogSchemaClass);
CampaignChangeLogSchema.index({ worldId: 1, changedAt: -1 });
CampaignChangeLogSchema.index({ worldId: 1, isShared: 1, changedAt: -1 });
CampaignChangeLogSchema.index({ changedAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 dní TTL
