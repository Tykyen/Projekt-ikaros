import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

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
  @Prop({ default: false }) isSystem: boolean;
  @Prop({ type: String }) rpDate?: string;
  @Prop({ type: String }) replyToId?: string;
  @Prop({ type: String }) replyToPreview?: string;
  @Prop({ type: String }) replyToSenderName?: string;
  @Prop({ type: [String] }) visibleTo?: string[];
  @Prop({ type: Object, default: {} }) reactions: Record<string, string[]>;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  attachments: Record<string, unknown>[];
  @Prop({ type: Date }) expiresAt?: Date;

  @Prop({ type: String, default: null }) customFont: string | null;
  // Krok 6.2f — klíč CHAT_FONT_SIZE_KEYS; null = standardní (1×).
  @Prop({ type: String, default: null }) customFontSize: string | null;

  // Volný řetězec — world chat posílá pojmenované barvy (validuje vlastní DTO
  // přes @IsIn), globální chat posílá hex barvu z profilu (@IsHexColor).
  // Schéma proto nesmí omezovat enumem, jinak hex spadne na validaci.
  @Prop({ type: String, default: null }) color: string | null;

  @Prop({ default: false }) isDiceRoll: boolean;

  /** Krok 6.2h — idempotentní retry: FE UUID v4, sparse unique per channel. */
  @Prop({ type: String, default: null }) clientNonce: string | null;

  /** Krok 6.2i — userIds mentionovaných v textu (`@username`). */
  @Prop({ type: [String], default: [] }) mentions: string[];

  /**
   * Krok 6.3d — strukturovaná data hodu kostkou pro 3D render (faces, total,
   * type, modifier, ...). Volný objekt — různé typy hodů mají různý tvar
   * payloadu (Fate / generic / pool / mixed / d100). `null` u nediceových zpráv.
   */
  @Prop({ type: Object, default: null })
  dicePayload: Record<string, unknown> | null;

  /**
   * Krok 6.3e — skin použitý odesílatelem v okamžiku hodu (zafixované, aby
   * ostatní hráči viděli stejnou kostku bez ohledu na svou volbu).
   * `null` u nediceových zpráv nebo když odesílatel nevybral skin (= default).
   */
  @Prop({ type: String, default: null })
  diceSkin: string | null;
}

export const ChatMessageSchema = SchemaFactory.createForClass(
  ChatMessageSchemaClass,
);
ChatMessageSchema.index({ channelId: 1, createdAt: -1 });
ChatMessageSchema.index({ worldId: 1 });
ChatMessageSchema.index({ senderId: 1 });
ChatMessageSchema.index({ channelId: 1, visibleTo: 1 });
ChatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// 6.2h — idempotentní retry: dva sendy se stejným nonce jsou jedna zpráva.
ChatMessageSchema.index(
  { channelId: 1, clientNonce: 1 },
  { unique: true, sparse: true },
);
