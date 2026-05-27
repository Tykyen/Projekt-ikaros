import type { ClientSession } from 'mongoose';
import { WorldMembership } from './world-membership.interface';

export interface IWorldMembershipRepository {
  findById(id: string): Promise<WorldMembership | null>;
  findByWorldId(
    worldId: string,
    filters?: { role?: number; group?: string },
  ): Promise<WorldMembership[]>;
  findByUserId(userId: string): Promise<WorldMembership[]>;
  findByUserAndWorld(
    userId: string,
    worldId: string,
  ): Promise<WorldMembership | null>;
  /** D-NEW-chat-mention-character — lookup pro `@<character-slug>` mentions v chatu. */
  findByCharacterPathAndWorld(
    worldId: string,
    characterPath: string,
  ): Promise<WorldMembership | null>;
  findByCharacterPathsAndWorld(
    worldId: string,
    characterPaths: string[],
  ): Promise<WorldMembership[]>;
  countByWorldId(worldId: string): Promise<number>;
  countByUserId(userId: string): Promise<number>;
  /** Spec 1.4 — pro paginated public listing: hromadně vrátí counts pro N userIds. */
  countsByUserIds(userIds: string[]): Promise<Map<string, number>>;

  /**
   * Spec 2.4 — počet members napříč N světy s danou rolí.
   * Pokud `worldIds` undefined → global scope (jen pro Admin/Superadmin).
   * Pokud prázdné pole → 0.
   */
  countByRoleAcrossWorlds(
    role: number,
    worldIds: string[] | undefined,
  ): Promise<number>;

  /**
   * Spec 2.4 — paginated list members napříč N světy s danou rolí.
   * Sort: joinedAt DESC (nejnovější žádosti nahoře).
   */
  findPaginatedByRoleAcrossWorlds(
    role: number,
    worldIds: string[] | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: WorldMembership[]; total: number }>;
  /**
   * D-061 — optional `session` umožňuje zařadit save do `withTransaction()`
   * scope. Bez session = standardní flow.
   */
  save(
    membership: Partial<WorldMembership>,
    session?: ClientSession,
  ): Promise<WorldMembership>;
  update(
    id: string,
    data: Partial<WorldMembership>,
  ): Promise<WorldMembership | null>;
  delete(id: string): Promise<boolean>;

  /**
   * 10.2-prep-1 — atomic `$set currentSceneId` přes `{userId, worldId}` query.
   * Vrací aktualizovaný membership, NEBO null pokud neexistuje.
   *
   * Použito v `WorldOperationsService` při `member.assignToScene/.unassign` ops.
   */
  setCurrentScene(
    userId: string,
    worldId: string,
    sceneId: string | null,
  ): Promise<WorldMembership | null>;

  /**
   * 10.2-prep-1 — bulk verze pro `member.bulkAssignToScene`. Jedním
   * Mongo `bulkWrite` updatuje N memberships ve stejném světě na stejnou scénu.
   * Vrací počet updatovaných.
   */
  setCurrentSceneForMany(
    userIds: string[],
    worldId: string,
    sceneId: string | null,
  ): Promise<number>;
}
