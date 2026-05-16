import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class IkarosMessagesGateway implements OnGatewayConnection {
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

  @OnEvent('ikaros.message.created')
  handleMessageCreated(payload: {
    recipientId: string;
    messageId: string;
    subject: string;
    senderName: string;
  }): void {
    this.server.to(`user:${payload.recipientId}`).emit('ikaros:new-message', {
      messageId: payload.messageId,
      subject: payload.subject,
      senderName: payload.senderName,
    });
  }
}
