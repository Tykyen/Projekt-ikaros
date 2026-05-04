import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignSubjectDocument = HydratedDocument<CampaignSubjectSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignSubjects' })
export class CampaignSubjectSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ default: 'NPC' }) type: string;
  @Prop({ required: true }) name: string;
  @Prop() avatarUrl?: string;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: 'active' }) status: string;
  @Prop() linkedPageSlug?: string;
  @Prop() linkedCharacterSlug?: string;
  @Prop() notes?: string;
}

export const CampaignSubjectSchema = SchemaFactory.createForClass(CampaignSubjectSchemaClass);
CampaignSubjectSchema.index({ worldId: 1, ownerId: 1 });
CampaignSubjectSchema.index({ worldId: 1, isShared: 1 });
CampaignSubjectSchema.index({ worldId: 1, updatedAt: -1 });
