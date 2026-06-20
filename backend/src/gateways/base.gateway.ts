import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// PC-13: žádný cors zde — CustomIoAdapter (main.ts) nastavuje WS CORS na
// server-level a per-gateway cors v dekorátoru přebíjí (byl mrtvý). Origin: origins.ts.
@WebSocketGateway({
  namespace: '/',
})
export abstract class BaseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  protected readonly logger = new Logger(this.constructor.name);

  // Návratový typ `void | Promise<void>` — NestJS await-uje async override
  // (PresenceGateway načítá `hiddenPresence` z DB, W-RUN-01).
  handleConnection(client: Socket): void | Promise<void> {
    // D-070 (2026-05-21) — Default Node max listeners limit je 10. Víc gateways
    // se registruje na jeden socket `disconnect` (AppGateway + GlobalChatGateway +
    // ChatGateway + WorldsGateway + IkarosMessagesGateway + presence/friendships).
    // Při connection nastavíme limit explicitně, aby Node nehlásil warning.
    client.setMaxListeners(32);
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  protected joinRoom(client: Socket, room: string) {
    void client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
  }

  protected leaveRoom(client: Socket, room: string) {
    void client.leave(room);
  }

  protected broadcastToRoom(room: string, event: string, data: unknown) {
    this.server.to(room).emit(event, data);
  }
}
