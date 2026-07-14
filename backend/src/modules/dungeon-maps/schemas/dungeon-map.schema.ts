import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MixedArraySubSchema } from '../../../common/utils/mixed-array.schema';

export type DungeonMapDocument = HydratedDocument<DungeonMapSchemaClass>;

@Schema({ timestamps: false, collection: 'dungeonMaps' })
export class DungeonMapSchemaClass {
  // 21.3c — volitelné: dokument bez worldId (null) = položka OSOBNÍ KNIHOVNY
  // vlastníka (cross-world, vzor MapTemplate). Ve světě = worldId vyplněné.
  @Prop() worldId?: string;
  // 21.3a — tvůrce (server-enforced z requestera); legacy bez ownerId = PJ-owned.
  @Prop() ownerId?: string;
  @Prop({ default: '' }) name: string;
  // 21.3e — druh mapy (dungeon/city); legacy bez pole = dungeon.
  @Prop() mapKind?: string;
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
  // 21.3f — klíč mapy (popisy k číslům místností/budov).
  @Prop({
    type: [MixedArraySubSchema],
    default: (): Record<string, unknown>[] => [],
  })
  notes: Record<string, unknown>[];
  @Prop() lastModified?: Date;
}

export const DungeonMapSchema = SchemaFactory.createForClass(
  DungeonMapSchemaClass,
);
DungeonMapSchema.index({ worldId: 1 });
// 21.3a — seznam „moje podzemí ve světě" (hráč-podporovatel vidí jen svoje).
DungeonMapSchema.index({ worldId: 1, ownerId: 1 });
// 21.3c — osobní knihovna (worldId null): dotaz jede přes ownerId.
DungeonMapSchema.index({ ownerId: 1, worldId: 1 });
