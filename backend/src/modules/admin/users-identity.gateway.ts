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
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
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
  }

  @OnEvent('username-request.decided')
  handleUsernameDecided(p: { userId: string; status: string }) {
    this.server
      .to(`user:${p.userId}`)
      .emit('user:identity:changed', { kind: 'username' });
  }
}
