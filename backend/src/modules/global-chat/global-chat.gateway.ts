import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import { GlobalChatService } from './global-chat.service';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class GlobalChatGateway {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GlobalChatGateway.name);

  private readonly connectedUsers = new Map<
    string,
    { lastSeen: Date; username: string; userId: string }
  >();

  constructor(private readonly globalChatService: GlobalChatService) {}

  getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  cleanupInactive(thresholdMs: number): number {
    const cutoff = new Date(Date.now() - thresholdMs);
    let removed = 0;
    for (const [socketId, info] of this.connectedUsers.entries()) {
      if (info.lastSeen < cutoff) {
        const socket = this.server.sockets.sockets.get(socketId);
        socket?.disconnect(true);
        this.connectedUsers.delete(socketId);
        removed++;
      }
    }
    return removed;
  }

  // Clients join room chat:{channelId} via the existing room:join Socket.IO event (AppGateway).
  // This handler only broadcasts the presence event to already-joined clients.
  getPresence(): { userId: string; username: string }[] {
    return Array.from(this.connectedUsers.values()).map(
      ({ userId, username }) => ({ userId, username }),
    );
  }

  @SubscribeMessage('chat:hospoda:join')
  handleHospodaJoin(
    @MessageBody() payload: { username: string; userId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    this.connectedUsers.set(client.id, {
      lastSeen: new Date(),
      username: payload.username,
      userId: payload.userId,
    });
    void client.join(`user:${payload.userId}`);
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;
    client.to(`chat:${channelId}`).emit('chat:presence', {
      username: payload.username,
      action: 'join',
    });
  }

  @SubscribeMessage('chat:hospoda:leave')
  handleHospodaLeave(
    @MessageBody() payload: { username: string },
    @ConnectedSocket() client: Socket,
  ): void {
    this.connectedUsers.delete(client.id);
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;
    client.to(`chat:${channelId}`).emit('chat:presence', {
      username: payload.username,
      action: 'leave',
    });
  }

  @SubscribeMessage('ikaros:whisper')
  handleWhisper(
    @MessageBody() payload: { toUserId: string; content: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const sender = this.connectedUsers.get(client.id);
    if (!sender || !payload.toUserId || !payload.content) return;
    void this.globalChatService
      .sendWhisper(
        { id: sender.userId, username: sender.username },
        payload.toUserId,
        payload.content,
      )
      .catch((err: unknown) =>
        this.logger.warn(
          `sendWhisper selhal (from=${sender.userId} to=${payload.toUserId})`,
          err,
        ),
      );
  }

  @OnEvent('chat.global.message.created')
  handleGlobalMessageCreated(payload: {
    channelId: string;
    message: ChatMessage;
  }): void {
    if (payload.message.visibleTo && payload.message.visibleTo.length > 0) {
      for (const userId of payload.message.visibleTo) {
        this.server.to(`user:${userId}`).emit('chat:message', payload.message);
      }
    } else {
      this.server
        .to(`chat:${payload.channelId}`)
        .emit('chat:message', payload.message);
    }
  }

  @OnEvent('chat.global.message.deleted')
  handleGlobalMessageDeleted(payload: {
    channelId: string;
    messageId: string;
  }): void {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message:deleted', {
      messageId: payload.messageId,
      channelId: payload.channelId,
    });
  }
}
