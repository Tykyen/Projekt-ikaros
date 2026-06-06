import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type WorldMapsDocument = HydratedDocument<WorldMapsSchemaClass>;

/**
 * 13.4 — Atlas map světa. Jeden doc per svět, `maps[]` = libovolný počet
 * obrázkových map. Vzor: `universeMaps` (Mixed array sub-schema kvůli
 * Mongoose 9.6 cast regresi — viz MixedArraySubSchema).
 */
@Schema({ timestamps: true, collection: 'worldMaps' })
export class WorldMapsSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  maps: Record<string, unknown>[];
}

export const WorldMapsSchema =
  SchemaFactory.createForClass(WorldMapsSchemaClass);
WorldMapsSchema.index({ worldId: 1 }, { unique: true });
