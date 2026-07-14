import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type DungeonMapDocument = HydratedDocument<DungeonMapSchemaClass>;

@Schema({ timestamps: false, collection: 'dungeonMaps' })
export class DungeonMapSchemaClass {
  @Prop({ required: true }) worldId: string;
  // 21.3a — tvůrce (server-enforced z requestera); legacy bez ownerId = PJ-owned.
  @Prop() ownerId?: string;
  @Prop({ default: '' }) name: string;
  @Prop({ default: 'square' }) gridType: string;
  @Prop({ default: 20 }) gridWidth: number;
  @Prop({ default: 20 }) gridHeight: number;
  @Prop({ default: 40 }) cellSize: number;
  @Prop({ default: 'dyson' }) theme: string;
  @Prop({
    type: [[MixedArraySubSchema]],
    default: (): Record<string, unknown>[][] => [],
  })
  cells: Record<string, unknown>[][];
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  decorations: Record<string, unknown>[];
  @Prop() lastModified?: Date;
}

export const DungeonMapSchema = SchemaFactory.createForClass(
  DungeonMapSchemaClass,
);
DungeonMapSchema.index({ worldId: 1 });
// 21.3a — seznam „moje podzemí ve světě" (hráč-podporovatel vidí jen svoje).
DungeonMapSchema.index({ worldId: 1, ownerId: 1 });
