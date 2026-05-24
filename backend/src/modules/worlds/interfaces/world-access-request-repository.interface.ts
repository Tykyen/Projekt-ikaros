import type { ClientSession } from 'mongoose';
import { WorldAccessRequest } from './world-access-request.interface';

/**
 * Spec 2.4 — repository abstraction pro `world_access_requests` kolekci.
 */
export interface IWorldAccessRequestRepository {
  findById(id: string): Promise<WorldAccessRequest | null>;
  findByUserAndWorld(
    userId: string,
    worldId: string,
  ): Promise<WorldAccessRequest | null>;
  findByUserId(userId: string): Promise<WorldAccessRequest[]>;

  /**
   * Pending AR napříč N světy (scope: PJ vlastník nebo Admin/SA = undefined).
   * Pokud `worldIds` prázdné pole → 0 / [].
   */
  countAcrossWorlds(worldIds: string[] | undefined): Promise<number>;
  findPaginatedAcrossWorlds(
    worldIds: string[] | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: WorldAccessRequest[]; total: number }>;

  create(data: {
    worldId: string;
    userId: string;
  }): Promise<WorldAccessRequest>;
  /**
   * D-061 — optional `session` umožňuje zařadit delete do `withTransaction()`
   * scope. Bez session = standardní flow.
   */
  delete(id: string, session?: ClientSession): Promise<boolean>;
  deleteByUserAndWorld(userId: string, worldId: string): Promise<boolean>;
}
