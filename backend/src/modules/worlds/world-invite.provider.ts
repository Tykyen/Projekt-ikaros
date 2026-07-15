import { Inject, Injectable } from '@nestjs/common';
import type { IWorldsRepository } from './interfaces/worlds-repository.interface';
import type { IWorldInviteRepository } from './interfaces/world-invite-repository.interface';
import type { WorldInvitePendingItem } from './interfaces/world-invite.interface';
import { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import { UserRole } from '../users/interfaces/user.interface';
import { UsersService } from '../users/users.service';

/**
 * 15.10 fáze B — provider pending akce `world_invite` pro POZVANÉHO.
 *
 * Scope: každý přihlášený user vidí své vlastní pending cílené pozvánky
 * (`invitedUserId === já`). Odkazové (`link`) pozvánky sem nepatří — ty se
 * přijímají přes URL, ne z fronty.
 *
 * Resolve flow (accept/decline) řeší `WorldsService`, ne provider.
 */
@Injectable()
export class WorldInviteProvider implements IPendingActionProvider<WorldInvitePendingItem> {
  readonly type = PendingActionType.WorldInvite;

  constructor(
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
    @Inject('IWorldInviteRepository')
    private readonly inviteRepo: IWorldInviteRepository,
    private readonly usersService: UsersService,
  ) {}

  canHandle(_userId: string, _role: UserRole): boolean {
    // Každý může být pozván; filtrace přes invitedUserId v repo dotazech.
    return true;
  }

  async countForUser(userId: string): Promise<number> {
    return this.inviteRepo.countPendingForUser(userId);
  }

  async listForUser(
    userId: string,
    _role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: WorldInvitePendingItem[]; total: number }> {
    const invites = await this.inviteRepo.findPendingForUser(userId);
    const total = invites.length;
    const paged = invites.slice((page - 1) * limit, (page - 1) * limit + limit);
    if (paged.length === 0) return { items: [], total };

    const worldIds = Array.from(new Set(paged.map((i) => i.worldId)));
    const worlds = await this.worldsRepo.findByIds(worldIds);
    const worldMap = new Map(worlds.map((w) => [w.id, w]));

    const inviterIds = Array.from(new Set(paged.map((i) => i.createdBy)));
    const inviterSummaries = await Promise.all(
      inviterIds.map((uid) =>
        this.usersService.publicProfile(uid).catch(() => null),
      ),
    );
    const inviterMap = new Map(
      inviterSummaries
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u.id, u]),
    );

    const items = paged.map((inv) => {
      const world = worldMap.get(inv.worldId);
      const inviter = inviterMap.get(inv.createdBy);
      return {
        inviteId: inv.id,
        worldId: inv.worldId,
        worldName: world?.name ?? '?',
        worldSlug: world?.slug ?? '',
        invitedBy: inviter
          ? {
              id: inviter.id,
              username: inviter.username,
              avatarUrl: inviter.avatarUrl,
            }
          : undefined,
        createdAt: (inv.createdAt instanceof Date
          ? inv.createdAt
          : new Date(inv.createdAt ?? Date.now())
        ).toISOString(),
      };
    });

    return { items, total };
  }
}
