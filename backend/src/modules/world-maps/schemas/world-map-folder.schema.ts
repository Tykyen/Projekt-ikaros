import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldMapFolderDocument =
  HydratedDocument<WorldMapFolderSchemaClass>;

/**
 * 13.4b F2 — Složka atlasu map (kolekce `worldMapFolders`). Vnořený strom přes
 * `parentId` (`null` = kořen). `createdAt/updatedAt` drží service jako ISO string
 * (konzistentně s `worldMapEntries`).
 */
@Schema({ collection: 'worldMapFolders' })
export class WorldMapFolderSchemaClass {
  @Prop({ required: true }) id: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ type: String, default: null }) parentId: string | null;
  @Prop({ required: true }) name: string;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: false }) isPublic: boolean;
  @Prop({ type: [String], default: [] }) visibleToPlayerIds: string[];
  @Prop({ required: true }) createdAt: string;
  @Prop({ required: true }) updatedAt: string;
}

export const WorldMapFolderSchema = SchemaFactory.createForClass(
  WorldMapFolderSchemaClass,
);
WorldMapFolderSchema.index({ worldId: 1, parentId: 1, order: 1 });
WorldMapFolderSchema.index({ worldId: 1, id: 1 }, { unique: true });
