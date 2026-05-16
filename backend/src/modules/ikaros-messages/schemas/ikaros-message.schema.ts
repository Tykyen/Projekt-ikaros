import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosMessageDocument = HydratedDocument<IkarosMessageSchemaClass>;

@Schema({ timestamps: true, collection: 'ikarosmessages' })
export class IkarosMessageSchemaClass {
  @Prop({ required: true }) senderId: string;
  @Prop({ required: true }) senderName: string;
  @Prop({ required: true }) recipientId: string;
  @Prop({ default: '' }) recipientName: string;
  @Prop({ required: true, maxlength: 200 }) subject: string;
  @Prop({ required: true, maxlength: 5000 }) body: string;
  @Prop({ default: Date.now }) sentAtUtc: Date;
  @Prop({ default: false }) isRead: boolean;
  @Prop({ default: false }) deletedBySender: boolean;
  @Prop({ default: false }) deletedByRecipient: boolean;

  // 3.5 — threading: conversationId = _id kořene vlákna; replyToId = přímý rodič.
  @Prop({ default: '' }) conversationId: string;
  @Prop() replyToId?: string;
}

export const IkarosMessageSchema = SchemaFactory.createForClass(
  IkarosMessageSchemaClass,
);
IkarosMessageSchema.index({ recipientId: 1, deletedByRecipient: 1, _id: -1 });
IkarosMessageSchema.index({ senderId: 1, deletedBySender: 1, _id: -1 });
IkarosMessageSchema.index({ recipientId: 1, isRead: 1, deletedByRecipient: 1 });
IkarosMessageSchema.index({ conversationId: 1, sentAtUtc: 1 });
