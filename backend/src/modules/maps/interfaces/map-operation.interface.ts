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
  /**
   * D-DROBNE-UNDO — `true` = op je mimo undo stack. Nastavuje se (a) na
   * vrácenou původní op (opakované undo ji už nenabídne) a (b) na záznam
   * undo aplikace samotné (undo-of-undo/redo záměrně neděláme). Default
   * `false`/`undefined` = undoable (má-li non-null `inverse`).
   */
  undone?: boolean;
}
