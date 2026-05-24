import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type UniverseMapDocument = HydratedDocument<UniverseMapSchemaClass>;

@Schema({ timestamps: true, collection: 'universeMaps' })
export class UniverseMapSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  nodes: Record<string, unknown>[];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  links: Record<string, unknown>[];
}

export const UniverseMapSchema = SchemaFactory.createForClass(
  UniverseMapSchemaClass,
);
UniverseMapSchema.index({ worldId: 1 }, { unique: true });
