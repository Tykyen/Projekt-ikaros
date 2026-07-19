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
 * Scope (R-20 — world-governance, ne platformová moderace):
 * - Vlastník světa NEBO co-PJ (člen role ≥ PJ) → vidí pending AR v těchto
 *   světech. Sjednoceno se schvalovací bránou `assertCanModerateAccessRequests`.
 * - Ostatní VČETNĚ platform Admin/Superadmin → prázdná queue.
 *   Žádost o vstup je věc PJe daného světa, ne platformy. Admin/Superadmin
 *   jen z titulu globální role frontu NEVIDÍ (dřív `undefined` = global scope
 *   napříč VŠEMI světy — porušovalo R-20 a rozešlo se s bránou, která platform
 *   roli bez elevace na approve/reject dává 403). Když admin opravdu musí
 *   zasáhnout, jde přes elevaci `worldAdminBypass` v konkrétním světě.
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

  async countForUser(userId: string, _role: UserRole): Promise<number> {
    const scope = await this.scopeForUser(userId);
    return this.accessRequestRepo.countAcrossWorlds(scope);
  }

  async listForUser(
    userId: string,
    _role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: WorldAccessRequestListItem[]; total: number }> {
    const scope = await this.scopeForUser(userId);
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
   * IDs světů kde je user vlastník NEBO co-PJ (member role ≥ PJ); může být
   * prázdné pole = 0 AR. Platí i pro Admin/Superadmin — žádný globální bypass
   * (viz JSDoc třídy, R-20). Repo interpretuje `[]` jako „žádný svět" (0),
   * `undefined` (sem už nikdy) by bylo „napříč všemi".
   */
  private async scopeForUser(userId: string): Promise<string[]> {
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
