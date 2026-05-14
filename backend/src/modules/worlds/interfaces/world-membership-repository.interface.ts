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
  save(membership: Partial<WorldMembership>): Promise<WorldMembership>;
  update(
    id: string,
    data: Partial<WorldMembership>,
  ): Promise<WorldMembership | null>;
  delete(id: string): Promise<boolean>;
}
