import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type DiarySchemaVersionDocument =
  HydratedDocument<DiarySchemaVersionSchemaClass>;

@Schema({ timestamps: false, collection: 'diary_schema_versions' })
export class DiarySchemaVersionSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true, min: 1 }) version: number;
  @Prop({ required: true }) system: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  schema: Record<string, unknown>[];
  @Prop({ type: Date, default: null }) archivedAt: Date | null;
}

export const DiarySchemaVersionSchema = SchemaFactory.createForClass(
  DiarySchemaVersionSchemaClass,
);
DiarySchemaVersionSchema.index({ worldId: 1, version: 1 }, { unique: true });
DiarySchemaVersionSchema.index({ worldId: 1, version: -1 });
