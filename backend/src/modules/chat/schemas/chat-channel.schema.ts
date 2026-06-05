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
  /** Zkrácený text poslední zprávy — náhled v sidebaru (krok 6.1b). */
  @Prop({ type: String }) lastMessagePreview?: string;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: false }) isDeleted: boolean;
  @Prop({ type: String, default: 'all' }) type: string;
  /** Obrázek konverzace (Cloudinary URL) — thumbnail v sidebaru. */
  @Prop({ type: String }) imageUrl?: string;
  /**
   * 6.7a — soukromá konverzace postavy je vázaná na HRÁČE (ne postavu).
   * `userId` člena, jehož je to soukromá linka s vedením. `type === 'character'`.
   * Idempotence auto-zakládání hledá konverzaci podle tohoto pole v kanálu „Postavy".
   */
  @Prop({ type: String }) linkedMemberUserId?: string;
}

export const ChatChannelSchema = SchemaFactory.createForClass(
  ChatChannelSchemaClass,
);
ChatChannelSchema.index({ worldId: 1, groupId: 1 });
ChatChannelSchema.index({ worldId: 1, lastMessageAt: -1 });
ChatChannelSchema.index({ isGlobal: 1 });
