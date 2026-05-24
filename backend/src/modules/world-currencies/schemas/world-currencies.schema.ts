import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type WorldCurrenciesDocument =
  HydratedDocument<WorldCurrenciesSchemaClass>;

@Schema({ collection: 'world_currencies' })
export class WorldCurrenciesSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  items: Record<string, unknown>[];
  @Prop({ default: Date.now }) updatedAt: Date;
}

export const WorldCurrenciesSchema = SchemaFactory.createForClass(
  WorldCurrenciesSchemaClass,
);
