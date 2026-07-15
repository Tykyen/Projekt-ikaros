import { Inject, Injectable } from '@nestjs/common';
import type { IWorldsRepository } from './interfaces/worlds-repository.interface';
import type { IWorldAccessRequestRepository } from './interfaces/world-access-request-repository.interface';
import type { IWorldMembershipRepository } from './interfaces/world-membership-repository.interface';
import type { WorldAccessRequestListItem } from './interfaces/world-access-request.interface';
import { WorldRole } from './interfaces/world-membership.interface';
import { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { UsersService } from '../users/users.service';

/**
 * Spec 2.4 — provider pro pending akce typu `world_access_request`.
 *
 * Scope:
 * - Admin/Superadmin → vidí všechny pending AR napříč všemi světy.
 * - Vlastník světa NEBO co-PJ (člen role ≥ PJ) → vidí pending AR v těchto
 *   světech. (Sjednoceno s `assertCanModerateAccessRequests` — dřív jen
 *   `findByOwnerId`, takže co-PJ měl právo schválit, ale frontu neviděl.)
 * - Ostatní → prázdná queue (canHandle vždy true, list/count vrátí 0).
 *
 * Resolve flow (approve/reject) řeší `WorldsService.approveAccessRequest` /
 * `rejectAccessRequest`, ne provider. Po approve se AR smaže a vytvoří
 * `WorldMembership` s rolí `Ctenar`.
 */
@Injectable()
export class WorldAccessRequestProvider implements IPendingActionProvider<WorldAccessRequestListItem> {
  readonly type = PendingActionType.WorldAccessRequest;

  constructor(
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldAccessRequestRepository')
    private readonly accessRequestRepo: IWorldAccessRequestRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    private readonly usersService: UsersService,
  ) {}

  canHandle(_userId: string, _role: UserRole): boolean {
    // Queue je per-svět-vlastník. Každý logged-in user může vlastnit svět,
    // takže canHandle = true; filtrace přes scopeForUser.
    return true;
  }

  async countForUser(userId: string, role: UserRole): Promise<number> {
    const scope = await this.scopeForUser(userId, role);
    return this.accessRequestRepo.countAcrossWorlds(scope);
  }

  async listForUser(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: WorldAccessRequestListItem[]; total: number }> {
    const scope = await this.scopeForUser(userId, role);
    const { items: requests, total } =
      await this.accessRequestRepo.findPaginatedAcrossWorlds(
        scope,
        page,
        limit,
      );
    if (requests.length === 0) return { items: [], total };

    const uniqueWorldIds = Array.from(new Set(requests.map((r) => r.worldId)));
    const worlds = await this.worldsRepo.findByIds(uniqueWorldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));

    const uniqueUserIds = Array.from(new Set(requests.map((r) => r.userId)));
    const userSummaries = await Promise.all(
      uniqueUserIds.map((uid) =>
        this.usersService.publicProfile(uid).catch(() => null),
      ),
    );
    const userMap = new Map(
      userSummaries
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u.id, u]),
    );

    const items = requests.map((r) => {
      const world = worldMap.get(r.worldId);
      const user = userMap.get(r.userId);
      return {
        accessRequestId: r.id,
        worldId: r.worldId,
        worldName: world?.name ?? '?',
        worldSlug: world?.slug ?? '',
        requestedAt: (r.requestedAt instanceof Date
          ? r.requestedAt
          : new Date(r.requestedAt)
        ).toISOString(),
        requester: {
          id: r.userId,
          username: user?.username ?? '?',
          avatarUrl: user?.avatarUrl,
        },
        characterName: r.characterDraft?.name,
      };
    });

    return { items, total };
  }

  /**
   * Admin/Superadmin → undefined (global scope, vidí všechny AR).
   * Jinak → IDs světů kde je user vlastník NEBO co-PJ (member role ≥ PJ);
   * může být prázdné = 0 AR.
   */
  private async scopeForUser(
    userId: string,
    role: UserRole,
  ): Promise<string[] | undefined> {
    if (role === UserRole.Superadmin || role === UserRole.Admin) {
      return undefined;
    }
    const [ownedWorlds, memberships] = await Promise.all([
      this.worldsRepo.findByOwnerId(userId),
      this.membershipRepo.findByUserId(userId),
    ]);
    const ids = new Set(ownedWorlds.map((w) => w.id));
    for (const m of memberships) {
      if (m.role >= WorldRole.PJ) ids.add(m.worldId);
    }
    return Array.from(ids);
  }
}
