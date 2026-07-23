import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

/**
 * Vypravěč v2 — cross-device sync onboardingu. PATCH z jednoho zařízení →
 * signál `onboarding:updated` do `user:{id}` roomu (vzor bestiae.gateway):
 * BEZ dat (leak-safe + LWW konflikty řeší merge), klient si refetchne GET.
 */
@WebSocketGateway({})
export class UserOnboardingGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(private readonly jwtService: JwtService) {}

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

  @OnEvent('onboarding.updated')
  handleOnboardingUpdated(p: { userId: string }): void {
    this.server.to(`user:${p.userId}`).emit('onboarding:updated', {});
  }
}
