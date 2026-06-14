import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

/**
 * C-34 — Bestiář real-time signál. 3-scope routing:
 * - `system`  → broadcast všem (read-only globální katalog)
 * - `world`   → jen `world:{worldId}` room (členové světa)
 * - `user`    → jen `user:{ownerUserId}` room (vlastník)
 *
 * Leak-safe: payload nese jen `systemId`, klient si refetchne filtrovaný
 * `GET /bestiae` (server-side scope filter zabrání úniku cizích bestií).
 */
// PC-13: WS CORS řeší CustomIoAdapter (server-level); dekorátorový cors byl mrtvý.
@WebSocketGateway({})
export class BestiaeGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Připoj socket k `user:<id>` roomu pro per-user scope signál. Vzor z
   * `worlds.gateway.ts`.
   */
  handleConnection(client: Socket): void {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) return;
      const payload = this.jwtService.verify<{ sub?: string }>(token);
      if (!payload?.sub) return;
      void client.join(`user:${payload.sub}`);
    } catch {
      // neplatný token — socket připojen bez user roomu
    }
  }

  @OnEvent('bestiae.changed')
  handleBestiaeChanged(p: {
    scope: string;
    worldId?: string | null;
    ownerUserId?: string | null;
    systemId: string;
  }) {
    const data = { systemId: p.systemId };
    if (p.scope === 'world' && p.worldId) {
      this.server.to(`world:${p.worldId}`).emit('bestiar:changed', data);
    } else if (p.scope === 'user' && p.ownerUserId) {
      this.server.to(`user:${p.ownerUserId}`).emit('bestiar:changed', data);
    } else {
      // system scope = všem
      this.server.emit('bestiar:changed', data);
    }
  }
}
