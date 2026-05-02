import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosMessageDocument = HydratedDocument<IkarosMessageSchemaClass>;

@Schema({ timestamps: true, collection: 'ikarosmessages' })
export class IkarosMessageSchemaClass {
  @Prop({ required: true }) senderId: string;
  @Prop({ required: true }) senderName: string;
  @Prop({ required: true }) recipientId: string;
  @Prop({ required: true }) recipientName: string;
  @Prop({ required: true, maxlength: 200 }) subject: string;
  @Prop({ required: true, maxlength: 5000 }) body: string;
  @Prop({ default: Date.now }) sentAtUtc: Date;
  @Prop({ default: false }) isRead: boolean;
  @Prop({ default: false }) deletedBySender: boolean;
  @Prop({ default: false }) deletedByRecipient: boolean;
  @Prop({ default: '' }) actionType: string;
  @Prop() actionWorldId?: string;
  @Prop() actionUserId?: string;
  @Prop({ default: false }) actionResolved: boolean;
}

export const IkarosMessageSchema = SchemaFactory.createForClass(IkarosMessageSchemaClass);
IkarosMessageSchema.index({ sentAtUtc: 1 });
IkarosMessageSchema.index({ recipientId: 1, isRead: 1 });
