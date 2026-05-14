import { Inject, Injectable } from '@nestjs/common';
import { WorldRole } from './interfaces/world-membership.interface';
import type { IWorldsRepository } from './interfaces/worlds-repository.interface';
import type { IWorldMembershipRepository } from './interfaces/world-membership-repository.interface';
import type { WorldJoinRequestListItem } from './interfaces/world-join-request.interface';
import { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { UsersService } from '../users/users.service';

/**
 * Spec 2.4 — provider pro pending akce typu `world_join_request`.
 *
 * Scope:
 * - Admin/Superadmin → vidí všechny pending Zadately napříč všemi světy.
 * - PJ vlastník světa → vidí jen pending Zadately ve světech kde je `ownerId`.
 * - Ostatní → prázdná queue (canHandle vždy true, list/count vrátí 0).
 *
 * Resolve flow (accept/reject) řeší `WorldsService.acceptJoinRequest` /
 * `rejectJoinRequest`, ne provider.
 */
@Injectable()
export class WorldJoinRequestProvider implements IPendingActionProvider<WorldJoinRequestListItem> {
  readonly type = PendingActionType.WorldJoinRequest;

  constructor(
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    private readonly usersService: UsersService,
  ) {}

  canHandle(_userId: string, _role: UserRole): boolean {
    // Queue je per-světa-vlastník. Každý logged-in user může mít pending žádosti
    // ve svém světě (i Hrac, který vyrobil svět). Filtr provádí countForUser /
    // listForUser nad ownerId.
    return true;
  }

  async countForUser(userId: string, role: UserRole): Promise<number> {
    const scope = await this.scopeForUser(userId, role);
    return this.membershipRepo.countByRoleAcrossWorlds(
      WorldRole.Zadatel,
      scope,
    );
  }

  async listForUser(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: WorldJoinRequestListItem[]; total: number }> {
    const scope = await this.scopeForUser(userId, role);
    const { items: memberships, total } =
      await this.membershipRepo.findPaginatedByRoleAcrossWorlds(
        WorldRole.Zadatel,
        scope,
        page,
        limit,
      );
    if (memberships.length === 0) return { items: [], total };

    const uniqueWorldIds = Array.from(
      new Set(memberships.map((m) => m.worldId)),
    );
    const worlds = await this.worldsRepo.findByIds(uniqueWorldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));

    const uniqueUserIds = Array.from(new Set(memberships.map((m) => m.userId)));
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

    const items = memberships.map((m) => {
      const world = worldMap.get(m.worldId);
      const user = userMap.get(m.userId);
      return {
        membershipId: m.id,
        worldId: m.worldId,
        worldName: world?.name ?? '?',
        worldSlug: world?.slug ?? '',
        requestedAt: (m.joinedAt instanceof Date
          ? m.joinedAt
          : new Date(m.joinedAt)
        ).toISOString(),
        requester: {
          id: m.userId,
          username: user?.username ?? '?',
          avatarUrl: user?.avatarUrl,
        },
      };
    });

    return { items, total };
  }

  /**
   * Admin/Superadmin → undefined (global scope).
   * Jinak → list IDs světů kde je user vlastník (může být prázdné).
   */
  private async scopeForUser(
    userId: string,
    role: UserRole,
  ): Promise<string[] | undefined> {
    if (role === UserRole.Superadmin || role === UserRole.Admin) {
      return undefined;
    }
    const ownedWorlds = await this.worldsRepo.findByOwnerId(userId);
    return ownedWorlds.map((w) => w.id);
  }
}
