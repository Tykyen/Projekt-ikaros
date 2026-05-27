import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MapOperationDocument = HydratedDocument<MapOperationSchemaClass>;

/**
 * 10.2-prep-1 — append-only event log per scéna.
 *
 * Každá mutace `MapScene` (token.move, effect.add, fog.brush, ...) se zapisuje
 * jako jeden záznam. `seqNumber` je monotonic per scéna (alokovaný atomic přes
 * `$inc` na `MapScene.lastSeqNumber`), klient drží `lastSeqNumber` a po
 * reconnect žádá `GET /maps/:id/operations?since=N` pro catch-up.
 *
 * `inverse` je serializovaný inverzní op pro undo. `null` = operaci nelze undo
 * (např. interní `combat.effect.tick`).
 *
 * TTL 30 dní — long-term retention defer post-MVP (snapshot+compact).
 */
@Schema({ timestamps: false, collection: 'mapOperations' })
export class MapOperationSchemaClass {
  @Prop({ required: true, index: true }) sceneId: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) seqNumber: number;
  @Prop({ type: Object, required: true }) op: Record<string, unknown>;
  @Prop({ type: Object, default: null }) inverse: Record<
    string,
    unknown
  > | null;
  @Prop({ required: true }) byUserId: string;
  @Prop({ type: Number, required: true }) byUserRole: number;
  @Prop({ required: true, expires: 60 * 60 * 24 * 30 }) appliedAt: Date;
}

export const MapOperationSchema = SchemaFactory.createForClass(
  MapOperationSchemaClass,
);
// Primární — catch-up query `?since=N` (ascending seqNumber per scéna).
MapOperationSchema.index({ sceneId: 1, seqNumber: 1 }, { unique: true });
// Per-user undo lookup ("moje poslední ops na této scéně").
MapOperationSchema.index({ sceneId: 1, byUserId: 1, seqNumber: -1 });
