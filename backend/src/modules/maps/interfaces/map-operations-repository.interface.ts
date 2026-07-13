import type { MapOperationRecord } from './map-operation.interface';

/**
 * 10.2-prep-1 — repository pro per-scene event log `mapOperations`.
 *
 * Klíčová operace `allocateSeqNumber` je atomic `$inc` na `MapScene.lastSeqNumber`
 * — paralelní volání garantují monotonic unikátní hodnoty.
 *
 * Spec: docs/arch/maps/operations/data-models.md, api.md `GET /operations`.
 */
export interface IMapOperationsRepository {
  /**
   * Atomic increment `MapScene.lastSeqNumber` a vrátí novou hodnotu jako seqNumber
   * pro chystanou operaci. Throws když scéna neexistuje (volající mapuje na 404).
   */
  allocateSeqNumber(sceneId: string): Promise<number>;

  /**
   * Insert do `mapOperations`. `seqNumber` musí být předem allocated.
   * Returns persisted record vč. `id` a `appliedAt`.
   */
  appendOperation(
    record: Omit<MapOperationRecord, 'id'>,
  ): Promise<MapOperationRecord>;

  /**
   * Vrací operace s `seqNumber > since`, ascending, max `limit`. Pro catch-up
   * po reconnect. Empty array = klient je up-to-date nebo nic nenastalo.
   */
  findSince(
    sceneId: string,
    since: number,
    limit: number,
  ): Promise<MapOperationRecord[]>;

  /**
   * D-DROBNE-UNDO — poslední VRATITELNÁ operace daného uživatele na scéně:
   * non-null `inverse` a `undone !== true`, nejvyšší `seqNumber`. `null` =
   * nic k vrácení. (Nahrazuje dřívější `findLastByUser` bez callerů —
   * undo lookup potřebuje filtr přímo v query, ne bounded lookback.)
   */
  findLastUndoableByUser(
    sceneId: string,
    userId: string,
  ): Promise<MapOperationRecord | null>;

  /**
   * D-DROBNE-UNDO — označí záznam `undone: true` (vyřazení z undo stacku).
   */
  markUndone(recordId: string): Promise<void>;
}
