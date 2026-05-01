import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatChannelDocument = HydratedDocument<ChatChannelSchemaClass>;

@Schema({ timestamps: true, collection: 'chatchannels' })
export class ChatChannelSchemaClass {
  @Prop({ required: true }) groupId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: 'all' }) accessMode: string;
  @Prop({ type: [Number], default: [] }) allowedRoles: number[];
  @Prop({ type: [String], default: [] }) allowedMemberIds: string[];
  @Prop() lastMessageAt?: Date;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: false }) isDeleted: boolean;
}

export const ChatChannelSchema = SchemaFactory.createForClass(ChatChannelSchemaClass);
ChatChannelSchema.index({ worldId: 1, groupId: 1 });
ChatChannelSchema.index({ worldId: 1, lastMessageAt: -1 });
