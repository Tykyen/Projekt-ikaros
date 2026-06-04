import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BaseGateway } from '../../gateways/base.gateway';
import { UsersService } from '../users/users.service';

interface FriendshipEvent {
  friendshipId: string;
  requesterId: string;
  recipientId: string;
}

/**
 * N-4 — most z EventEmitter2 (`friendships.service` emituje interní
 * `friendship.*` eventy) na Socket.IO klientské eventy, které FE
 * `useFriendshipsSocket` poslouchá. Dřív žádný gateway neexistoval →
 * real-time přátelství (toast „nová žádost", auto-invalidace) bylo mrtvé.
 *
 * Emituje na `user:{id}` roomy joinnuté v `ChatGateway.handleConnection`
 * (sdílený namespace '/'); proto nepotřebuje vlastní JWT handshake.
 */
@Injectable()
export class FriendshipsGateway extends BaseGateway {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  private async username(userId: string): Promise<string> {
    try {
      const p = await this.usersService.publicProfile(userId);
      return p.username ?? 'Uživatel';
    } catch {
      return 'Uživatel';
    }
  }

  @OnEvent('friendship.requested')
  async onRequested(e: FriendshipEvent): Promise<void> {
    const from = await this.username(e.requesterId);
    this.server.to(`user:${e.recipientId}`).emit('friend:request:incoming', {
      friendshipId: e.friendshipId,
      from: { username: from },
    });
  }

  @OnEvent('friendship.accepted')
  async onAccepted(e: FriendshipEvent): Promise<void> {
    const by = await this.username(e.recipientId);
    this.server.to(`user:${e.requesterId}`).emit('friend:request:accepted', {
      friendshipId: e.friendshipId,
      by: { username: by },
    });
  }

  @OnEvent('friendship.rejected')
  async onRejected(e: FriendshipEvent): Promise<void> {
    const by = await this.username(e.recipientId);
    this.server.to(`user:${e.requesterId}`).emit('friend:request:declined', {
      friendshipId: e.friendshipId,
      by: { username: by },
    });
  }

  @OnEvent('friendship.removed')
  onRemoved(e: FriendshipEvent & { wasPending?: boolean }): void {
    if (e.wasPending) {
      // Odesílatel zrušil dosud pending žádost → notifikuj příjemce.
      this.server
        .to(`user:${e.recipientId}`)
        .emit('friend:request:canceled', { friendshipId: e.friendshipId });
    } else {
      // Rozpad uzavřeného přátelství → oba účastníci.
      for (const uid of [e.requesterId, e.recipientId]) {
        this.server
          .to(`user:${uid}`)
          .emit('friend:removed', { friendshipId: e.friendshipId });
      }
    }
  }

  /**
   * W-1 — blokace ruší případné přátelství (anti-stalk). Obě strany dostanou
   * signál, aby si refetchly seznam přátel + friendship-status; blokovanému se
   * záměrně nepushuje toast (jen tichá invalidace na FE). `blocked: true`
   * rozlišuje pohled blokujícího (`by === sám`) od blokovaného.
   */
  @OnEvent('friendship.blocked')
  onBlocked(e: { blockerId: string; blockedId: string }): void {
    for (const uid of [e.blockerId, e.blockedId]) {
      this.server.to(`user:${uid}`).emit('friend:blocked', {
        blockerId: e.blockerId,
        blockedId: e.blockedId,
      });
    }
  }
}
