import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'custom_emotes',
  timestamps: { createdAt: true, updatedAt: false },
})
export class CustomEmoteDocument extends Document {
  @Prop({ type: Types.ObjectId, default: null })
  worldId: Types.ObjectId | null;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  shortcode: string;

  @Prop({ required: true })
  imageId: string;

  /** Krok 6.4 — plná Cloudinary URL pro FE render bez nutnosti cloud_name v env. */
  @Prop({ required: true })
  imageUrl: string;

  /** D-19.2 — velikost blobu `imageUrl` v bytech (kvóty UM-10); staré docs nemají. */
  @Prop()
  imageBytes?: number;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy: Types.ObjectId;

  /** D-NEW-emote-categories — volné tagy pro filtraci v admin gridu. */
  @Prop({ type: [String], default: [] })
  tags: string[];

  createdAt: Date;
}

export const CustomEmoteSchema =
  SchemaFactory.createForClass(CustomEmoteDocument);
CustomEmoteSchema.index({ worldId: 1, shortcode: 1 }, { unique: true });
