import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterDocument = HydratedDocument<CharacterSchemaClass>;

@Schema({ timestamps: true, collection: 'characters' })
export class CharacterSchemaClass {
  @Prop({ required: true }) slug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) worldId: string;
  @Prop() userId?: string;
  @Prop({ default: false }) isNpc: boolean;
  @Prop() imageUrl?: string;
  @Prop({ default: '' }) publicBio: string;
  @Prop({ type: [Object], default: [] }) publicInfoBlocks: Record<string, unknown>[];
  @Prop({ default: '' }) privateBio: string;
  @Prop({ type: [Object], default: [] }) privateInfoBlocks: Record<string, unknown>[];
  @Prop() campaignSubjectId?: string;
  @Prop({ type: [Object], default: [] }) accessRequirements: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData?: Record<string, unknown>;
}

export const CharacterSchema = SchemaFactory.createForClass(CharacterSchemaClass);
CharacterSchema.index({ worldId: 1, slug: 1 }, { unique: true });
CharacterSchema.index({ worldId: 1, userId: 1 });
