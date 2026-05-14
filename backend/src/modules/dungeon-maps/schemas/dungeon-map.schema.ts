import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DungeonMapDocument = HydratedDocument<DungeonMapSchemaClass>;

@Schema({ timestamps: false, collection: 'dungeonMaps' })
export class DungeonMapSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ default: '' }) name: string;
  @Prop({ default: 'square' }) gridType: string;
  @Prop({ default: 20 }) gridWidth: number;
  @Prop({ default: 20 }) gridHeight: number;
  @Prop({ default: 40 }) cellSize: number;
  @Prop({ default: 'dyson' }) theme: string;
  @Prop({ type: [[Object]], default: [] }) cells: Record<string, unknown>[][];
  @Prop({ type: [Object], default: [] }) decorations: Record<string, unknown>[];
  @Prop() lastModified?: Date;
}

export const DungeonMapSchema = SchemaFactory.createForClass(
  DungeonMapSchemaClass,
);
DungeonMapSchema.index({ worldId: 1 });
