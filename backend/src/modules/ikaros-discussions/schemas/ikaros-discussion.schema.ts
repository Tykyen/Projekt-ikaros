import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosDiscussionDocument =
  HydratedDocument<IkarosDiscussionSchemaClass>;

@Schema({ collection: 'ikaros_discussions' })
export class IkarosDiscussionSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: '' }) bulletin: string;
  // D-SEC-GAP-2026-07-11 — index pro creation-cap countByCreator.
  @Prop({ required: true, index: true }) creatorId: string;
  @Prop({ required: true }) creatorName: string;
  @Prop({ default: false }) isApproved: boolean;
  @Prop({ default: true }) isOpen: boolean;
  @Prop({ type: [String], default: [] }) managerIds: string[];
  @Prop({ type: [String], default: [] }) invitedUserIds: string[];
  // 3.4a — userId čekající na přijetí do uzamčené diskuze (queue discussion_join_request)
  @Prop({ type: [String], default: [] }) joinRequestIds: string[];
  @Prop({ default: 0 }) postCount: number;
  @Prop({ default: 0 }) likeCount: number;
  @Prop({ default: () => new Date() }) createdAtUtc: Date;
  @Prop({ default: () => new Date() }) lastActivityUtc: Date;
}

export const IkarosDiscussionSchema = SchemaFactory.createForClass(
  IkarosDiscussionSchemaClass,
);
IkarosDiscussionSchema.index({ isApproved: 1, isOpen: 1 });
