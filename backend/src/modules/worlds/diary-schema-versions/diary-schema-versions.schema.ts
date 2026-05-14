import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DiarySchemaVersionDocument =
  HydratedDocument<DiarySchemaVersionSchemaClass>;

@Schema({ timestamps: false, collection: 'diary_schema_versions' })
export class DiarySchemaVersionSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true, min: 1 }) version: number;
  @Prop({ required: true }) system: string;
  @Prop({ type: [Object], default: [] }) schema: Record<string, unknown>[];
  @Prop({ required: true, default: () => new Date() }) archivedAt: Date;
}

export const DiarySchemaVersionSchema = SchemaFactory.createForClass(
  DiarySchemaVersionSchemaClass,
);
DiarySchemaVersionSchema.index({ worldId: 1, version: 1 }, { unique: true });
DiarySchemaVersionSchema.index({ worldId: 1, version: -1 });
