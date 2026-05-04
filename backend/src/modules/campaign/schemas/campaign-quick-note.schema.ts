import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignQuickNoteDocument = HydratedDocument<CampaignQuickNoteSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignQuickNotes' })
export class CampaignQuickNoteSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) title: string;
  @Prop() body?: string;
  @Prop({ default: 'open' }) status: string;
  @Prop({ default: false }) pinned: boolean;
  @Prop({ type: [String], default: [] }) subjectIds: string[];
  @Prop({ type: [String], default: [] }) storylineIds: string[];
}

export const CampaignQuickNoteSchema = SchemaFactory.createForClass(CampaignQuickNoteSchemaClass);
CampaignQuickNoteSchema.index({ worldId: 1, ownerId: 1 });
CampaignQuickNoteSchema.index({ worldId: 1, isShared: 1 });
CampaignQuickNoteSchema.index({ worldId: 1, pinned: 1 });
CampaignQuickNoteSchema.index({ worldId: 1, updatedAt: -1 });
