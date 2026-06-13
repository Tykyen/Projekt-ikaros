import { Inject, Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../pending-actions/pending-action-type.enum';
import type { IFriendshipsRepository } from './interfaces/friendships-repository.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { UserRole } from '../users/interfaces/user.interface';

export interface FriendRequestPendingItem {
  type: 'friend_request';
  direction: 'incoming';
  friendshipId: string;
  counterpart: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    defaultAvatarType: string;
    role: UserRole;
  };
  requestedAt: Date;
}

/**
 * Spec 1.4 + 1.8: friend_request pending provider.
 *
 * canHandle: každý přihlášený user vidí svoje incoming friend requesty.
 * Žádné role-gate — žádost si může poslat každý každému.
 */
@Injectable()
export class FriendshipsPendingActionProvider implements IPendingActionProvider<FriendRequestPendingItem> {
  readonly type = PendingActionType.FriendRequest;

  constructor(
    @Inject('IFriendshipsRepository')
    private readonly friendsRepo: IFriendshipsRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
  ) {}

  canHandle(): boolean {
    return true;
  }

  async countForUser(userId: string): Promise<number> {
    return this.friendsRepo.countIncomingPendingForUser(userId);
  }

  async listForUser(
    userId: string,
    _role: unknown,
    page: number,
    limit: number,
  ): Promise<{ items: FriendRequestPendingItem[]; total: number }> {
    void _role;
    const all = await this.friendsRepo.listIncomingPendingForUser(userId);
    const total = all.length;
    const skip = (page - 1) * limit;
    const slice = all.slice(skip, skip + limit);
    const items: FriendRequestPendingItem[] = await Promise.all(
      slice.map(async (f) => {
        const requester = await this.usersRepo.findById(f.requesterId);
        return {
          type: 'friend_request' as const,
          direction: 'incoming' as const,
          friendshipId: f.id,
          // D-NEW-friends-counterpart-drift — plný tvar (displayName/
          // defaultAvatarType/role) pro FE kartu žádosti (avatar + role badge).
          counterpart: {
            id: f.requesterId,
            username: requester?.username ?? 'neznámý',
            displayName: requester?.displayName ?? null,
            avatarUrl: requester?.avatarUrl ?? null,
            defaultAvatarType: requester?.defaultAvatarType ?? 'male',
            role: requester?.role ?? UserRole.Hrac,
          },
          requestedAt: f.requestedAt,
        };
      }),
    );
    return { items, total };
  }
}
