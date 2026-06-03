import { Injectable } from '@nestjs/common';
import { SubscribeMessage, ConnectedSocket } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { BaseGateway } from '../../gateways/base.gateway';

interface PresenceSocketData {
  presenceUserId?: string;
}

/**
 * N-5 — presence přes Socket.IO (spec 1.5). Dřív neexistoval žádný gateway,
 * takže FE `usePresence` poslouchal `presence:snapshot`/`presence:update`,
 * které nikdy nepřišly → `OnlineDot` se přes WS nikdy nerozsvítil.
 *
 * In-memory registry (single-instance). Multi-instance = Redis adapter
 * (sledováno jako dluh „chat-presence-scale" / D-051).
 */
@Injectable()
export class PresenceGateway extends BaseGateway {
  /** userId → set aktivních socketů (multi-tab/zařízení). */
  private readonly sockets = new Map<string, Set<string>>();
  /** userId v idle stavu. */
  private readonly idle = new Set<string>();

  constructor(private readonly jwtService: JwtService) {
    super();
  }

  override handleConnection(client: Socket): void {
    super.handleConnection(client);
    const userId = this.authUser(client);
    if (!userId) return;
    (client.data as PresenceSocketData).presenceUserId = userId;

    const wasOffline = !this.sockets.has(userId);
    if (wasOffline) this.sockets.set(userId, new Set());
    this.sockets.get(userId)!.add(client.id);

    // Snapshot aktuálního stavu novému klientovi.
    const entries = [...this.sockets.keys()].map((uid) => ({
      userId: uid,
      status: this.idle.has(uid) ? 'idle' : 'online',
    }));
    client.emit('presence:snapshot', { entries });

    // Ostatním oznam nově příchozího (jen při prvním socketu uživatele).
    if (wasOffline) {
      client.broadcast.emit('presence:update', { userId, status: 'online' });
    }
  }

  override handleDisconnect(client: Socket): void {
    super.handleDisconnect(client);
    const userId = (client.data as PresenceSocketData).presenceUserId;
    if (!userId) return;
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(client.id);
    if (set.size === 0) {
      this.sockets.delete(userId);
      this.idle.delete(userId);
      this.server.emit('presence:update', { userId, status: 'offline' });
    }
  }

  @SubscribeMessage('presence:idle')
  onIdle(@ConnectedSocket() client: Socket): void {
    const userId = (client.data as PresenceSocketData).presenceUserId;
    if (!userId || this.idle.has(userId)) return;
    this.idle.add(userId);
    this.server.emit('presence:update', { userId, status: 'idle' });
  }

  @SubscribeMessage('presence:active')
  onActive(@ConnectedSocket() client: Socket): void {
    const userId = (client.data as PresenceSocketData).presenceUserId;
    if (!userId || !this.idle.has(userId)) return;
    this.idle.delete(userId);
    this.server.emit('presence:update', { userId, status: 'online' });
  }

  private authUser(client: Socket): string | null {
    try {
      const auth = client.handshake.auth as { token?: string } | undefined;
      if (!auth?.token) return null;
      const payload = this.jwtService.verify<{ sub?: string }>(auth.token);
      return payload?.sub ?? null;
    } catch {
      return null;
    }
  }
}
