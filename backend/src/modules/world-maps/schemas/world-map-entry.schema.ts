import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldMapEntryDocument = HydratedDocument<WorldMapEntrySchemaClass>;

/**
 * 16.5 — vlaječka (pin) nad obrázkem mapy. Souřadnice `x/y` v 0..1 (podíl
 * šířky/výšky obrázku) → responzivní, přežije výměnu obrázku. Vzhled (`icon`,
 * `color`) volí PJ; `targetType` nese roli (page/map/none). Viditelnost per pin
 * jako u mapy (tajné vlaječky). `_id: false` = sub-doc bez vlastního Mongo id
 * (app-level `id` uuid).
 */
@Schema({ _id: false })
export class WorldMapPinSchemaClass {
  @Prop({ required: true }) id: string;
  @Prop({ default: 0 }) x: number;
  @Prop({ default: 0 }) y: number;
  @Prop({ default: '' }) label: string;
  @Prop({ default: '' }) info: string;
  /** 'page' | 'map' | 'none' */
  @Prop({ default: 'none' }) targetType: string;
  @Prop({ type: String, default: null }) targetSlug: string | null;
  @Prop({ type: String, default: null }) targetMapId: string | null;
  @Prop({ default: 'marker' }) icon: string;
  @Prop({ default: 'cyan' }) color: string;
  @Prop({ default: true }) isPublic: boolean;
  @Prop({ type: [String], default: [] }) visibleToPlayerIds: string[];
}

export const WorldMapPinSchema = SchemaFactory.createForClass(
  WorldMapPinSchemaClass,
);

/**
 * 13.4b — Mapy 2.0: jedna mapa = jeden dokument (refaktor z embedded `worldMaps`
 * kvůli škále 500+; umožní lazy-load per složka). `folderId` připraven pro
 * vnořené složky (F2; `null` = kořen atlasu). `id` je app-level UUID (stabilní
 * napříč migrací). `createdAt/updatedAt` drží service jako ISO string (jako
 * původní embedded model — bez Mongoose `timestamps`).
 *
 * 16.5 — `pins[]` = klikací vlaječky; `linkedSceneId` = 1:1 propojení s taktickou
 * scénou (příběhová mapa).
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
  @Prop({ type: [WorldMapPinSchema], default: [] })
  pins: WorldMapPinSchemaClass[];
  /** 16.5b — id propojené taktické scény (1:1); `null` = nepropojeno. */
  @Prop({ type: String, default: null }) linkedSceneId: string | null;
  @Prop({ required: true }) createdAt: string;
  @Prop({ required: true }) updatedAt: string;
}

export const WorldMapEntrySchema = SchemaFactory.createForClass(
  WorldMapEntrySchemaClass,
);
WorldMapEntrySchema.index({ worldId: 1, folderId: 1, order: 1 });
WorldMapEntrySchema.index({ worldId: 1, id: 1 }, { unique: true });
