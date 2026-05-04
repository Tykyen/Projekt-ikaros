import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignScenarioDocument = HydratedDocument<CampaignScenarioSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignScenarios' })
export class CampaignScenarioSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) title: string;
  @Prop({ type: Object }) contentData?: Record<string, unknown>;
  @Prop({ default: 0 }) order: number;
  @Prop() linkedPageSlug?: string;
  @Prop({ type: [String], default: [] }) subjectIds: string[];
  @Prop({ type: [String], default: [] }) storylineIds: string[];
  @Prop({ type: [String], default: [] }) images: string[];
}

export const CampaignScenarioSchema = SchemaFactory.createForClass(CampaignScenarioSchemaClass);
CampaignScenarioSchema.index({ worldId: 1, ownerId: 1 });
CampaignScenarioSchema.index({ worldId: 1, isShared: 1 });
CampaignScenarioSchema.index({ worldId: 1, order: 1 });
CampaignScenarioSchema.index({ worldId: 1, updatedAt: -1 });
