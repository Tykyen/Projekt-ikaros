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

  @Prop({ type: Types.ObjectId, required: true })
  createdBy: Types.ObjectId;

  createdAt: Date;
}

export const CustomEmoteSchema =
  SchemaFactory.createForClass(CustomEmoteDocument);
CustomEmoteSchema.index({ worldId: 1, shortcode: 1 }, { unique: true });
