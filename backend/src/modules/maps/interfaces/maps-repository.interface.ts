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
   * 10.2-prep-1 — list scén ve světě s filtrem `isActive=true`. PJ orchestrator.
   */
  findActiveScenesByWorld(worldId: string): Promise<MapScene[]>;
}
