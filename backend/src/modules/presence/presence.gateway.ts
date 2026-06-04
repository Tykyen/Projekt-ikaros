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
 *
 * W-11 — idle se trackuje **per-socket**: uživatel je idle ⟺ jsou idle
 * VŠECHNY jeho sockety. Dřív byl `idle` per-userId flag přepsaný posledním
 * eventem → tab, který zahálel, označil idle i uživatele aktivně pracujícího
 * v jiném tabu.
 */
@Injectable()
export class PresenceGateway extends BaseGateway {
  /** userId → set aktivních socketů (multi-tab/zařízení). */
  private readonly sockets = new Map<string, Set<string>>();
  /** userId → set socketů hlásících idle. User je idle ⟺ všechny jeho sockety idle. */
  private readonly idleSockets = new Map<string, Set<string>>();
  /** userId aktuálně VYHLÁŠENÝ jako idle (poslední broadcastnutý stav). */
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

    if (wasOffline) {
      // Ostatním oznam nově příchozího (jen při prvním socketu uživatele).
      client.broadcast.emit('presence:update', { userId, status: 'online' });
    } else {
      // Další tab/zařízení = aktivní socket → pokud byl uživatel vyhlášen idle,
      // přejde zpět na online (nový socket není v idleSockets).
      this.recomputeIdle(userId);
    }
  }

  override handleDisconnect(client: Socket): void {
    super.handleDisconnect(client);
    const userId = (client.data as PresenceSocketData).presenceUserId;
    if (!userId) return;
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(client.id);
    this.idleSockets.get(userId)?.delete(client.id);
    if (set.size === 0) {
      this.sockets.delete(userId);
      this.idleSockets.delete(userId);
      this.idle.delete(userId);
      this.server.emit('presence:update', { userId, status: 'offline' });
    } else {
      // Odpojil se aktivní socket → zbývající mohou být všechny idle.
      this.recomputeIdle(userId);
    }
  }

  @SubscribeMessage('presence:idle')
  onIdle(@ConnectedSocket() client: Socket): void {
    const userId = (client.data as PresenceSocketData).presenceUserId;
    if (!userId) return;
    let set = this.idleSockets.get(userId);
    if (!set) {
      set = new Set();
      this.idleSockets.set(userId, set);
    }
    set.add(client.id);
    this.recomputeIdle(userId);
  }

  @SubscribeMessage('presence:active')
  onActive(@ConnectedSocket() client: Socket): void {
    const userId = (client.data as PresenceSocketData).presenceUserId;
    if (!userId) return;
    this.idleSockets.get(userId)?.delete(client.id);
    this.recomputeIdle(userId);
  }

  /**
   * Sladí vyhlášený idle stav uživatele s realitou: idle ⟺ všechny aktivní
   * sockety hlásí idle. Broadcastne `presence:update` jen při reálné změně.
   */
  private recomputeIdle(userId: string): void {
    const all = this.sockets.get(userId);
    if (!all || all.size === 0) return;
    const idleSet = this.idleSockets.get(userId);
    const allIdle = !!idleSet && idleSet.size >= all.size;
    const wasIdle = this.idle.has(userId);
    if (allIdle && !wasIdle) {
      this.idle.add(userId);
      this.server.emit('presence:update', { userId, status: 'idle' });
    } else if (!allIdle && wasIdle) {
      this.idle.delete(userId);
      this.server.emit('presence:update', { userId, status: 'online' });
    }
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
