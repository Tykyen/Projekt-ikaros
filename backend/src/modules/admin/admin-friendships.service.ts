import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { IFriendshipsRepository } from '../friendships/interfaces/friendships-repository.interface';
import type { IFriendBlocksRepository } from '../friendships/interfaces/friend-blocks-repository.interface';
import type { Friendship } from '../friendships/interfaces/friendship.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

/** D-056 (N-6b) — admin pohled na friendship; mapuje BE entitu na FE shape. */
export interface AdminFriendshipView {
  id: string;
  userAId: string;
  userBId: string;
  userAUsername: string | null;
  userBUsername: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  requestedById: string;
  blockedById: string | null;
  lastDeclinedAt: string | null;
  lastDeclinedById: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * D-056 (N-6b) — admin nástroj pro friendship lookup + reset cool-downu.
 *
 * BE `Friendship` (requesterId/recipientId, pending/accepted/rejected) se mapuje
 * na bohatší FE `AdminFriendshipView`: rejected→`declined`, blok z oddělené
 * `FriendBlock` entity → `blocked`. requester = userA, recipient = userB.
 */
@Injectable()
export class AdminFriendshipsService {
  constructor(
    @Inject('IFriendshipsRepository')
    private readonly friendsRepo: IFriendshipsRepository,
    @Inject('IFriendBlocksRepository')
    private readonly blocksRepo: IFriendBlocksRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
  ) {}

  /** Seznam všech friendship daného usera (admin). */
  async listByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: AdminFriendshipView[]; total: number }> {
    const { items, total } = await this.friendsRepo.findAllForUser(
      userId,
      page,
      limit,
    );
    const views = await this.toViews(items);
    return { items: views, total };
  }

  /** Friendship mezi dvojicí (active, jinak poslední rejected), nebo null. */
  async byPair(
    userA: string,
    userB: string,
  ): Promise<{ friendship: AdminFriendshipView | null }> {
    const active = await this.friendsRepo.findActiveBetween(userA, userB);
    const friendship =
      active ?? (await this.friendsRepo.findLatestRejected(userA, userB));
    if (!friendship) return { friendship: null };
    const [view] = await this.toViews([friendship]);
    return { friendship: view };
  }

  /** Reset cool-downu = odstraní rejected friendship (umožní novou žádost). */
  async resetCooldown(
    friendshipId: string,
  ): Promise<{ friendship: AdminFriendshipView }> {
    const friendship = await this.friendsRepo.findById(friendshipId);
    if (!friendship)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Friendship neexistuje',
      });
    if (friendship.status !== 'rejected')
      throw new ConflictException({
        code: 'NO_COOLDOWN',
        message: 'Tento friendship nemá aktivní cooldown.',
      });
    // Stav před smazáním pro odpověď (admin vidí, co resetoval).
    const [view] = await this.toViews([friendship]);
    await this.friendsRepo.remove(friendshipId);
    return { friendship: view };
  }

  /** Mapper BE Friendship[] → AdminFriendshipView[] (batch username + block lookup). */
  private async toViews(items: Friendship[]): Promise<AdminFriendshipView[]> {
    if (items.length === 0) return [];
    const ids = Array.from(
      new Set(items.flatMap((f) => [f.requesterId, f.recipientId])),
    );
    const users = await this.usersRepo.findByIds(ids);
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    return Promise.all(
      items.map(async (f) => {
        const block = await this.blocksRepo.findActive(
          f.requesterId,
          f.recipientId,
        );
        const reverseBlock = block
          ? null
          : await this.blocksRepo.findActive(f.recipientId, f.requesterId);
        const effBlock = block ?? reverseBlock;

        const status: AdminFriendshipView['status'] = effBlock
          ? 'blocked'
          : f.status === 'rejected'
            ? 'declined'
            : f.status;

        return {
          id: f.id,
          userAId: f.requesterId,
          userBId: f.recipientId,
          userAUsername: usernameById.get(f.requesterId) ?? null,
          userBUsername: usernameById.get(f.recipientId) ?? null,
          status,
          requestedById: f.requesterId,
          blockedById: effBlock ? effBlock.blockerId : null,
          lastDeclinedAt: f.rejectedAt ? f.rejectedAt.toISOString() : null,
          // rejected = příjemce odmítl pending žádost (viz friendships.service).
          lastDeclinedById: f.status === 'rejected' ? f.recipientId : null,
          acceptedAt: f.acceptedAt ? f.acceptedAt.toISOString() : null,
          createdAt: f.requestedAt.toISOString(),
          updatedAt: (
            f.acceptedAt ??
            f.rejectedAt ??
            f.requestedAt
          ).toISOString(),
        };
      }),
    );
  }
}
