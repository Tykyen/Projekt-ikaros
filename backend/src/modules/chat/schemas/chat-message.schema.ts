import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatMessageDocument = HydratedDocument<ChatMessageSchemaClass>;

@Schema({ timestamps: true, collection: 'chatmessages' })
export class ChatMessageSchemaClass {
  @Prop({ required: true }) channelId: string;
  @Prop({ type: String, default: null }) worldId: string | null;
  @Prop({ required: true }) senderId: string;
  @Prop({ required: true }) senderName: string;
  @Prop({ type: String }) senderAvatarUrl?: string;
  @Prop({ type: String }) overrideName?: string;
  @Prop({ type: String }) overrideAvatarUrl?: string;
  @Prop({ type: String, default: null }) content: string | null;
  @Prop({ default: false }) isEdited: boolean;
  @Prop({ default: false }) isDeleted: boolean;
  @Prop({ type: String }) rpDate?: string;
  @Prop({ type: String }) replyToId?: string;
  @Prop({ type: String }) replyToPreview?: string;
  @Prop({ type: String }) replyToSenderName?: string;
  @Prop({ type: [String] }) visibleTo?: string[];
  @Prop({ type: Object, default: {} }) reactions: Record<string, string[]>;
  @Prop({ type: [Object], default: [] }) attachments: Record<string, unknown>[];
  @Prop({ type: Date }) expiresAt?: Date;
  @Prop({ type: String, default: null })
  customFont: string | null;
  @Prop({ default: false })
  isDiceRoll: boolean;
  @Prop({ type: String, default: null })
  color: string | null;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageSchemaClass);
ChatMessageSchema.index({ channelId: 1, createdAt: -1 });
ChatMessageSchema.index({ worldId: 1 });
ChatMessageSchema.index({ senderId: 1 });
ChatMessageSchema.index({ channelId: 1, visibleTo: 1 });
ChatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
