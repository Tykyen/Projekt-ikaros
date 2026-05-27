import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldOperationDocument =
  HydratedDocument<WorldOperationSchemaClass>;

/**
 * 10.2-prep-1 — append-only event log per svět pro cross-scene operace.
 *
 * Paralelní k `mapOperations` (per-scene), ale logované per-world. Drží
 * `member.assignToScene`, `member.unassign`, `member.bulkAssignToScene` —
 * operace, které nemají primary scope na jedné scéně, ale mění
 * `WorldMembership.currentSceneId`.
 *
 * `cascadeMapOpIds` referencuje IDs `MapOperation` dokumentů, které server
 * vyrobil jako side-effect (typicky `token.remove` na staré scéně, když hráč
 * přechází jinam). Audit + cross-log undo (post-MVP).
 *
 * TTL 30 dní stejně jako `mapOperations`.
 */
@Schema({ timestamps: false, collection: 'worldOperations' })
export class WorldOperationSchemaClass {
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
  @Prop({ type: [String], default: [] }) cascadeMapOpIds: string[];
}

export const WorldOperationSchema = SchemaFactory.createForClass(
  WorldOperationSchemaClass,
);
// Primární — catch-up query pro PJ orchestrator panel.
WorldOperationSchema.index({ worldId: 1, seqNumber: 1 }, { unique: true });
// Per-user undo lookup ("moje poslední cross-scene ops v tomto světě").
WorldOperationSchema.index({ worldId: 1, byUserId: 1, seqNumber: -1 });
