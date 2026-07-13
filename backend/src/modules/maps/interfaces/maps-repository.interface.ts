import type { MapScene } from './map-scene.interface';

export interface IMapsRepository {
  findByWorld(worldId: string): Promise<MapScene[]>;
  findActiveByWorld(worldId: string): Promise<MapScene | null>;
  findById(id: string): Promise<MapScene | null>;
  create(data: Partial<MapScene>): Promise<MapScene>;
  setActive(id: string, worldId: string): Promise<void>;
  replace(id: string, data: Partial<MapScene>): Promise<MapScene | null>;
  delete(id: string): Promise<boolean>;

  /**
   * 10.2-prep-1 — atomic Mongo update (positional / $push / $pull / $addToSet / ...).
   * Vrací `{ matchedCount, modifiedCount }` pro detekci edge cases (token zmizel
   * mezi load a update → matchedCount === 0).
   *
   * Použito v `MapOperationsService.applyAtomic` per op typ. Filter i update
   * jsou raw Mongo objekty — typy `Record<string, unknown>` aby interface
   * neleakoval mongoose-specific typy.
   */
  atomicUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount: number; modifiedCount: number }>;

  /**
   * D-LAUNCH-GAP — atomic update + atomické vrácení POST-update dokumentu
   * (`findOneAndUpdate { new: true }`). Pro server-side delta operace
   * (token.update hpDelta): update může být aggregation pipeline (pole) a
   * volající potřebuje FINÁLNÍ zapsanou hodnotu (clamp počítá Mongo) pro
   * normalizaci broadcastu/logu — read-after-write by pod souběhem vrátil
   * cizí novější stav. `null` = filter nematchoval (scéna/token zmizel).
   */
  atomicUpdateAndFetch(
    filter: Record<string, unknown>,
    update: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<MapScene | null>;

  /**
   * 10.2-prep-1 — list scén ve světě s filtrem `isActive=true`. PJ orchestrator.
   */
  findActiveScenesByWorld(worldId: string): Promise<MapScene[]>;
}
