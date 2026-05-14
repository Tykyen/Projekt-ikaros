import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignRelationshipDocument =
  HydratedDocument<CampaignRelationshipSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignRelationships' })
export class CampaignRelationshipSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) subjectAId: string;
  @Prop({ required: true }) subjectBId: string;
  @Prop({ type: Object, default: {} }) shared: Record<string, unknown>;
  @Prop({ type: Object, default: { strength: 5 } }) sideA: Record<
    string,
    unknown
  >;
  @Prop({ type: Object, default: { strength: 5 } }) sideB: Record<
    string,
    unknown
  >;
  @Prop({ default: 'active' }) status: string;
  @Prop({ default: 3 }) priority: number;
  @Prop({ type: [String], default: [] }) storylineIds: string[];
  @Prop() lastChangeNote?: string;
}

export const CampaignRelationshipSchema = SchemaFactory.createForClass(
  CampaignRelationshipSchemaClass,
);
CampaignRelationshipSchema.index({ worldId: 1, ownerId: 1 });
CampaignRelationshipSchema.index({ worldId: 1, isShared: 1 });
CampaignRelationshipSchema.index({ worldId: 1, updatedAt: -1 });
CampaignRelationshipSchema.index({ worldId: 1, subjectAId: 1 });
CampaignRelationshipSchema.index({ worldId: 1, subjectBId: 1 });
