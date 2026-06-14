import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IFriendshipsRepository } from '../friendships/interfaces/friendships-repository.interface';
import type { IFriendBlocksRepository } from '../friendships/interfaces/friend-blocks-repository.interface';
import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-requests-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IAdminAuditLogRepository } from '../admin/interfaces/admin-audit-log.interface';
import type {
  DataExportPayload,
  DataExportFriendship,
} from './interfaces/data-export-payload.interface';

@Injectable()
export class DataExportService {
  constructor(
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
    @Inject('IFriendshipsRepository')
    private readonly friendsRepo: IFriendshipsRepository,
    @Inject('IFriendBlocksRepository')
    private readonly blocksRepo: IFriendBlocksRepository,
    @Inject('IUsernameChangeRequestsRepository')
    private readonly usernameRepo: IUsernameChangeRequestsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IAdminAuditLogRepository')
    private readonly auditRepo: IAdminAuditLogRepository,
  ) {}

  async exportForUser(userId: string): Promise<DataExportPayload> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel nenalezen',
      });
    }

    const [
      memberships,
      acceptedRaw,
      outgoingPending,
      incomingPending,
      blocks,
      usernameRequest,
      audit,
    ] = await Promise.all([
      this.membershipRepo.findByUserId(userId),
      this.friendsRepo.listAcceptedForUser(userId, 1, 1000),
      this.friendsRepo.listOutgoingPendingForUser(userId),
      this.friendsRepo.listIncomingPendingForUser(userId),
      this.blocksRepo.listByBlocker(userId),
      this.usernameRepo.findPendingByUserId(userId),
      this.auditRepo.listPaginated({ targetId: userId, page: 1, limit: 100 }),
    ]);

    const friendships: DataExportFriendship[] = [
      ...acceptedRaw.items.map((f): DataExportFriendship => {
        const isOutgoing = f.requesterId === userId;
        return {
          id: f.id,
          counterpartUserId: isOutgoing ? f.recipientId : f.requesterId,
          direction: isOutgoing ? 'outgoing' : 'incoming',
          status: 'accepted',
          requestedAt: f.requestedAt.toISOString(),
          acceptedAt: f.acceptedAt?.toISOString(),
        };
      }),
      ...outgoingPending.map((f) => ({
        id: f.id,
        counterpartUserId: f.recipientId,
        direction: 'outgoing' as const,
        status: 'pending' as const,
        requestedAt: f.requestedAt.toISOString(),
      })),
      ...incomingPending.map((f) => ({
        id: f.id,
        counterpartUserId: f.requesterId,
        direction: 'incoming' as const,
        status: 'pending' as const,
        requestedAt: f.requestedAt.toISOString(),
      })),
    ];

    return {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        characterPath: user.characterPath,
        role: user.role,
        themeSettings: user.themeSettings,
        chatPreferences: user.chatPreferences,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
        isOnline: user.isOnline,
        lastSeenAt: user.lastSeenAt?.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      worldMemberships: memberships.map((m) => ({
        worldId: m.worldId,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        group: m.group,
        characterPath: m.characterPath,
      })),
      friendships,
      friendBlocks: blocks.map((b) => ({
        blockedUserId: b.blockedId,
        blockedAt: b.blockedAt.toISOString(),
      })),
      pendingUsernameRequest: usernameRequest
        ? {
            requestedUsername: usernameRequest.requestedUsername,
            status: usernameRequest.status,
            requestedAt: usernameRequest.requestedAt.toISOString(),
          }
        : null,
      adminAuditLog: audit.items.map((a) => ({
        action: a.action,
        actorUsername: a.actorUsername,
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
