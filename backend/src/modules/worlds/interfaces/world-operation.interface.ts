/**
 * 10.2-prep-1 — typové rozhraní pro `WorldOperation` záznam (cross-scene log).
 *
 * Spec: docs/arch/maps/operations/data-models.md § WorldOperation.
 */
export interface WorldOperationRecord {
  id: string;
  worldId: string;
  seqNumber: number;
  op: Record<string, unknown>;
  inverse: Record<string, unknown> | null;
  byUserId: string;
  byUserRole: number;
  appliedAt: Date;
  cascadeMapOpIds: string[];
}
