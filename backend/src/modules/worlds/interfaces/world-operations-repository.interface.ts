import type { WorldOperationRecord } from './world-operation.interface';

/**
 * 10.2-prep-1 — repository pro cross-scene event log `worldOperations`.
 *
 * Paralelní k `IMapOperationsRepository`, ale per-world (nepočítá per-scene).
 * Použito pro `member.*` ops (assignment hráčů na scény).
 *
 * Spec: docs/arch/maps/operations/data-models.md, api.md `POST/GET /worlds/:id/operations`.
 */
export interface IWorldOperationsRepository {
  /**
   * Atomic increment `World.lastSeqNumber`. Throws když svět neexistuje.
   */
  allocateSeqNumber(worldId: string): Promise<number>;

  /**
   * Insert do `worldOperations`. `seqNumber` musí být předem allocated.
   * Returns persisted record vč. `id` a `appliedAt`.
   */
  appendOperation(
    record: Omit<WorldOperationRecord, 'id'>,
  ): Promise<WorldOperationRecord>;

  /**
   * Vrací operace s `seqNumber > since`, ascending, max `limit`. PJ orchestrator
   * catch-up. Hráč nemá read access (privacy — viz security.md).
   */
  findSince(
    worldId: string,
    since: number,
    limit: number,
  ): Promise<WorldOperationRecord[]>;

  /**
   * Posledních `limit` cross-scene operací daného uživatele ve světě
   * (descending). Undo stack lookup.
   */
  findLastByUser(
    worldId: string,
    userId: string,
    limit: number,
  ): Promise<WorldOperationRecord[]>;
}
