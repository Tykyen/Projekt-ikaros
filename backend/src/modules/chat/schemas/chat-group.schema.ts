import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatGroupDocument = HydratedDocument<ChatGroupSchemaClass>;

@Schema({ timestamps: true, collection: 'chatgroups' })
export class ChatGroupSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: 0 }) order: number;
  /** Obrázek kanálu (Cloudinary URL) — zobrazí se v hlavičce kanálu v sidebaru. */
  @Prop({ type: String }) imageUrl?: string;
  /** Krok 6.5c — PJ explicit volba barvy kanálu. String slot `'0'..'11'`.
   *  `undefined` = auto (deterministický hash z `id` → `groupColorSlot`). */
  @Prop({ type: String }) color?: string;
  /** Krok 6.5c — PJ ikona kanálu, klíč z curated mapy `GROUP_ICONS` (FE).
   *  `undefined` = bez ikony (fallback na barevný hřbet `.spine`). */
  @Prop({ type: String }) iconKey?: string;
  /** Krok 6.1g — název světové družiny, pro kterou byl kanál auto-založen.
   *  Vyplněno jen u auto-kanálů družin; ručně vytvořené kanály ho nemají. */
  @Prop({ type: String }) linkedWorldGroup?: string;
}

export const ChatGroupSchema =
  SchemaFactory.createForClass(ChatGroupSchemaClass);
ChatGroupSchema.index({ worldId: 1, order: 1 });
