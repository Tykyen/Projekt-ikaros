/**
 * 10.2-prep-1 — typové rozhraní pro `MapOperation` záznam (per-scene log).
 *
 * Spec: docs/arch/maps/operations/data-models.md § MapOperation.
 */
export interface MapOperationRecord {
  id: string;
  sceneId: string;
  worldId: string;
  seqNumber: number;
  op: Record<string, unknown>;
  inverse: Record<string, unknown> | null;
  byUserId: string;
  byUserRole: number;
  appliedAt: Date;
}
