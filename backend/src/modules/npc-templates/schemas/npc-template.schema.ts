import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NpcTemplateDocument = HydratedDocument<NpcTemplateSchemaClass>;

@Schema({ timestamps: true, collection: 'npcTemplates' })
export class NpcTemplateSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop() imageUrl?: string;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: 5 }) maxHp: number;
  @Prop({ default: 0 }) armor: number;
  @Prop({ default: 0 }) injury: number;
  @Prop({ type: [Object], default: [] }) abilities: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) diarySchema: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) diaryData: Record<string, unknown>;
}

export const NpcTemplateSchema = SchemaFactory.createForClass(NpcTemplateSchemaClass);
NpcTemplateSchema.index({ worldId: 1 });
