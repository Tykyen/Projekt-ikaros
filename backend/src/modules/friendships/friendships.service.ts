import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IFriendshipsRepository } from './interfaces/friendships-repository.interface';
import type { IFriendBlocksRepository } from './interfaces/friend-blocks-repository.interface';
import type {
  Friendship,
  FriendStatusKind,
} from './interfaces/friendship.interface';
import { DAY_MS } from '../../common/constants/time.constants';

@Injectable()
export class FriendshipsService {
  static readonly COOLDOWN_DAYS = 7;
  static readonly COOLDOWN_MS = FriendshipsService.COOLDOWN_DAYS * DAY_MS;

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IFriendshipsRepository')
    private readonly friendsRepo: IFriendshipsRepository,
    @Inject('IFriendBlocksRepository')
    private readonly blocksRepo: IFriendBlocksRepository,
    private readonly events: EventEmitter2,
  ) {}

  async sendRequest(
    requesterId: string,
    recipientUserId: string,
  ): Promise<{ friendship: Friendship }> {
    if (requesterId === recipientUserId) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'SELF_FRIEND',
        message: 'Nemůžeš poslat žádost sám sobě',
      });
    }

    // Anti-stalk: blok ze strany cíle = 404 (user vůbec neexistuje pro mě).
    const peerBlocked = await this.blocksRepo.findActive(
      recipientUserId,
      requesterId,
    );
    if (peerBlocked) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    }

    const recipient = await this.usersRepo.findById(recipientUserId);
    if (!recipient || recipient.isDeleted) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    }

    // Blok z mojí strany = ALREADY_BLOCKED (info pro mě, ne anti-stalk).
    const myBlock = await this.blocksRepo.findActive(
      requesterId,
      recipientUserId,
    );
    if (myBlock) {
      throw new ConflictException({
        statusCode: 409,
        code: 'ALREADY_BLOCKED',
        message: 'Uživatele máš zablokovaného',
      });
    }

    const existing = await this.friendsRepo.findActiveBetween(
      requesterId,
      recipientUserId,
    );
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'REQUEST_EXISTS',
        message: 'Žádost už existuje',
      });
    }

    // Cool-down: pokud sám requester nedávno dostal reject od recipient
    // (tj. recipient odmítl jeho žádost), nesmí znovu odeslat. Asymetric:
    // recipient sám si může poslat zpět kdykoli.
    const recentReject = await this.friendsRepo.findLatestRejected(
      requesterId,
      recipientUserId,
    );
    if (
      recentReject?.rejectedAt &&
      Date.now() - recentReject.rejectedAt.getTime() <
        FriendshipsService.COOLDOWN_MS
    ) {
      throw new HttpException(
        {
          statusCode: 429,
          code: 'REJECTED_RECENTLY',
          message: 'Žádost byla nedávno odmítnuta',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const friendship = await this.friendsRepo.create(
      requesterId,
      recipientUserId,
    );
    this.events.emit('friendship.requested', {
      friendshipId: friendship.id,
      requesterId,
      recipientId: recipientUserId,
    });
    return { friendship };
  }

  async accept(
    actorId: string,
    friendshipId: string,
  ): Promise<{ friendship: Friendship }> {
    const friendship = await this.friendsRepo.findById(friendshipId);
    if (!friendship) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Žádost neexistuje',
      });
    }
    if (friendship.recipientId !== actorId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NOT_RECIPIENT',
        message: 'Jen příjemce může akceptovat',
      });
    }
    if (friendship.status !== 'pending') {
      throw new ConflictException({
        statusCode: 409,
        code: 'NOT_PENDING',
        message: 'Žádost už není pending',
      });
    }
    const updated = await this.friendsRepo.accept(friendshipId, new Date());
    if (!updated) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Žádost neexistuje',
      });
    }
    this.events.emit('friendship.accepted', {
      friendshipId: updated.id,
      requesterId: updated.requesterId,
      recipientId: updated.recipientId,
    });
    return { friendship: updated };
  }

  async removeOrDecline(actorId: string, friendshipId: string): Promise<void> {
    const friendship = await this.friendsRepo.findById(friendshipId);
    if (!friendship) {
      // Idempotent — neexistuje = už smazáno
      return;
    }
    if (
      friendship.requesterId !== actorId &&
      friendship.recipientId !== actorId
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NOT_PARTICIPANT',
        message: 'Nemůžeš odebrat cizí žádost',
      });
    }
    if (friendship.status === 'pending' && friendship.recipientId === actorId) {
      // Recipient odmítá pending → mark rejected (cool-down).
      await this.friendsRepo.markRejected(friendshipId, new Date());
      this.events.emit('friendship.rejected', {
        friendshipId,
        requesterId: friendship.requesterId,
        recipientId: friendship.recipientId,
      });
      return;
    }
    // Sender cancels pending nebo unfriend accepted → hard delete.
    await this.friendsRepo.remove(friendshipId);
    this.events.emit('friendship.removed', {
      friendshipId,
      requesterId: friendship.requesterId,
      recipientId: friendship.recipientId,
    });
  }

  async removeByUser(actorId: string, partnerUserId: string): Promise<void> {
    const friendship = await this.friendsRepo.findActiveBetween(
      actorId,
      partnerUserId,
    );
    if (!friendship) return; // idempotent
    await this.removeOrDecline(actorId, friendship.id);
  }

  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Friendship[]; total: number }> {
    return this.friendsRepo.listAcceptedForUser(userId, page, limit);
  }

  async getStatus(
    actorId: string,
    otherUserId: string,
  ): Promise<{ kind: FriendStatusKind }> {
    if (actorId === otherUserId) return { kind: 'self' };

    const myBlock = await this.blocksRepo.findActive(actorId, otherUserId);
    if (myBlock) return { kind: 'blocked_by_me' };

    // Anti-stalk: pokud mě peer zablokoval, vrátím 'none' (nesmím poznat).
    const peerBlock = await this.blocksRepo.findActive(otherUserId, actorId);
    if (peerBlock) return { kind: 'none' };

    const friendship = await this.friendsRepo.findActiveBetween(
      actorId,
      otherUserId,
    );
    if (!friendship) return { kind: 'none' };
    if (friendship.status === 'accepted') return { kind: 'accepted' };
    if (friendship.status === 'pending') {
      return friendship.requesterId === actorId
        ? { kind: 'pending_outgoing' }
        : { kind: 'pending_incoming' };
    }
    return { kind: 'none' };
  }

  async listOutgoing(userId: string): Promise<{
    items: Array<{
      direction: 'outgoing';
      friendshipId: string;
      counterpart: { id: string; username: string; avatarUrl?: string };
      requestedAt: Date;
    }>;
    total: number;
  }> {
    const raw = await this.friendsRepo.listOutgoingPendingForUser(userId);
    const items = await Promise.all(
      raw.map(async (f) => {
        const recipient = await this.usersRepo.findById(f.recipientId);
        return {
          direction: 'outgoing' as const,
          friendshipId: f.id,
          counterpart: {
            id: f.recipientId,
            username: recipient?.username ?? 'neznámý',
            avatarUrl: recipient?.avatarUrl,
          },
          requestedAt: f.requestedAt,
        };
      }),
    );
    return { items, total: items.length };
  }

  async block(
    blockerId: string,
    blockedId: string,
  ): Promise<{ friendship: { id: string; status: 'blocked' } }> {
    if (blockerId === blockedId) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'SELF_BLOCK',
        message: 'Nelze zablokovat sám sebe',
      });
    }
    // Peer block check: pokud target už blokuje mě, vrátím 403 BLOCKED_BY_PEER
    // (info-leak akceptován per spec 1.8 test 501).
    const peerBlock = await this.blocksRepo.findActive(blockedId, blockerId);
    if (peerBlock) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'BLOCKED_BY_PEER',
        message: 'Druhá strana tě zablokovala',
      });
    }
    const existing = await this.blocksRepo.findActive(blockerId, blockedId);
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'ALREADY_BLOCKED',
        message: 'Uživatel je už zablokovaný',
      });
    }
    const block = await this.blocksRepo.create(blockerId, blockedId);
    // Side effect: smaže všechny aktivní friendship records (anti-stalk).
    await this.friendsRepo.removeAllActiveBetween(blockerId, blockedId);
    this.events.emit('friendship.blocked', { blockerId, blockedId });
    return { friendship: { id: block.id, status: 'blocked' as const } };
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.blocksRepo.remove(blockerId, blockedId);
  }

  async listBlocks(blockerId: string): Promise<{
    items: Array<{
      id: string;
      user: { id: string; username: string; avatarUrl?: string };
      blockedAt: Date;
    }>;
    total: number;
  }> {
    const raw = await this.blocksRepo.listByBlocker(blockerId);
    const items = await Promise.all(
      raw.map(async (b) => {
        const user = await this.usersRepo.findById(b.blockedId);
        return {
          id: b.id,
          user: {
            id: b.blockedId,
            username: user?.username ?? 'neznámý',
            avatarUrl: user?.avatarUrl,
          },
          blockedAt: b.blockedAt,
        };
      }),
    );
    return { items, total: items.length };
  }
}
