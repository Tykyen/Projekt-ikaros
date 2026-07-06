import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

/**
 * C-31 — real-time signál o změně identity uživatele (role / ban / unban /
 * username). Cíl: dotčený uživatel (`user:{id}` room) → klient refetchne
 * `/auth/me` a aktualizuje UI bez reloadu. Leak-safe — payload nese jen
 * `kind`, ne nová data.
 */
// PC-13: WS CORS řeší CustomIoAdapter (server-level); dekorátorový cors byl mrtvý.
@WebSocketGateway({})
export class UsersIdentityGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(private readonly jwtService: JwtService) {}

  /** Připoj socket k `user:<id>` roomu z JWT. Vzor z `worlds.gateway.ts`. */
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

  @OnEvent('user.identity.changed')
  handleIdentityChanged(p: { userId: string; kind: string }) {
    this.server
      .to(`user:${p.userId}`)
      .emit('user:identity:changed', { kind: p.kind });
    // FIX-A část 2 (2026-07) — ban/smazání musí ukončit i JIŽ otevřený socket,
    // jinak zůstává funkční až do expirace access tokenu (3 dny) i s WS
    // reconnect-gate (ten chytá jen NOVÉ handshaky, ne živé spojení).
    // `disconnectSockets(true)` = zavři low-level transport (klient dostane
    // `disconnect`, ne jen odejde z roomu jako FIX-44 `socketsLeave`).
    if (p.kind === 'ban' || p.kind === 'deletion') {
      this.server.in(`user:${p.userId}`).disconnectSockets(true);
    }
  }

  @OnEvent('username-request.decided')
  handleUsernameDecided(p: { userId: string; status: string }) {
    this.server
      .to(`user:${p.userId}`)
      .emit('user:identity:changed', { kind: 'username' });
  }
}
