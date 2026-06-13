import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldMapEntryDocument = HydratedDocument<WorldMapEntrySchemaClass>;

/**
 * 13.4b — Mapy 2.0: jedna mapa = jeden dokument (refaktor z embedded `worldMaps`
 * kvůli škále 500+; umožní lazy-load per složka). `folderId` připraven pro
 * vnořené složky (F2; `null` = kořen atlasu). `id` je app-level UUID (stabilní
 * napříč migrací). `createdAt/updatedAt` drží service jako ISO string (jako
 * původní embedded model — bez Mongoose `timestamps`).
 */
@Schema({ collection: 'worldMapEntries' })
export class WorldMapEntrySchemaClass {
  @Prop({ required: true }) id: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ type: String, default: null }) folderId: string | null;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ required: true }) imageUrl: string;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: false }) isPublic: boolean;
  @Prop({ type: [String], default: [] }) visibleToPlayerIds: string[];
  @Prop({ required: true }) createdAt: string;
  @Prop({ required: true }) updatedAt: string;
}

export const WorldMapEntrySchema = SchemaFactory.createForClass(
  WorldMapEntrySchemaClass,
);
WorldMapEntrySchema.index({ worldId: 1, folderId: 1, order: 1 });
WorldMapEntrySchema.index({ worldId: 1, id: 1 }, { unique: true });
