import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatChannelDocument = HydratedDocument<ChatChannelSchemaClass>;

@Schema({ timestamps: true, collection: 'chatchannels' })
export class ChatChannelSchemaClass {
  @Prop({ type: String, default: null }) groupId: string | null;
  @Prop({ type: String, default: null }) worldId: string | null;
  @Prop({ required: true }) name: string;
  @Prop({ default: false }) isGlobal: boolean;
  @Prop({ default: 'all' }) accessMode: string;
  @Prop({ type: [Number], default: [] }) allowedRoles: number[];
  @Prop({ type: [String], default: [] }) allowedMemberIds: string[];
  @Prop() lastMessageAt?: Date;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: false }) isDeleted: boolean;
  @Prop({ enum: ['team_ic', 'team_ooc', 'team_pj', 'dm', 'inter', 'general'], default: 'general' })
  type: string;
}

export const ChatChannelSchema = SchemaFactory.createForClass(ChatChannelSchemaClass);
ChatChannelSchema.index({ worldId: 1, groupId: 1 });
ChatChannelSchema.index({ worldId: 1, lastMessageAt: -1 });
ChatChannelSchema.index({ isGlobal: 1 });
