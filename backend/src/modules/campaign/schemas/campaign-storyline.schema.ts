import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignStorylineDocument =
  HydratedDocument<CampaignStorylineSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignStorylines' })
export class CampaignStorylineSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ default: 'mid' }) level: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: 'active' }) status: string;
  @Prop() phase?: string;
  @Prop() summary?: string;
  @Prop() whatHappened?: string;
  @Prop() truth?: string;
  @Prop() playersBelief?: string;
  @Prop() gmIntent?: string;
  @Prop() nextStep?: string;
  @Prop({ type: [String], default: [] }) subjectIds: string[];
  @Prop({ type: [String], default: [] }) relationshipIds: string[];
}

export const CampaignStorylineSchema = SchemaFactory.createForClass(
  CampaignStorylineSchemaClass,
);
CampaignStorylineSchema.index({ worldId: 1, ownerId: 1 });
CampaignStorylineSchema.index({ worldId: 1, isShared: 1 });
CampaignStorylineSchema.index({ worldId: 1, status: 1 });
CampaignStorylineSchema.index({ worldId: 1, updatedAt: -1 });
