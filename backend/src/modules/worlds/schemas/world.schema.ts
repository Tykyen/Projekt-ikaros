import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldDocument = HydratedDocument<WorldSchemaClass>;

@Schema({ timestamps: true, collection: 'worlds' })
export class WorldSchemaClass {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, unique: true, lowercase: true }) slug: string;
  @Prop() description?: string;
  @Prop() imageUrl?: string;
  @Prop() genre?: string;
  @Prop({ type: [String], default: [] }) tones: string[];
  @Prop() playersWanted?: string;
  @Prop({ default: 0 }) playerCount: number;
  @Prop({ type: [String], default: [] }) dice: string[];
  @Prop({ default: 'matrix' }) system: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 'private' }) accessMode: string;
  @Prop({ type: [{ slug: String, name: String }], default: [] }) offeredCharacters: { slug: string; name: string }[];
  @Prop({ type: Object }) calendarConfig?: Record<string, unknown>;
}

export const WorldSchema = SchemaFactory.createForClass(WorldSchemaClass);
WorldSchema.index({ ownerId: 1 });
WorldSchema.index({ isActive: 1 });
