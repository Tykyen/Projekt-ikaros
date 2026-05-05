import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import { GlobalChatService } from './global-chat.service';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class GlobalChatGateway {
  @WebSocketServer() server: Server;

  private readonly connectedUsers = new Map<string, { lastSeen: Date; username: string }>();

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

  @SubscribeMessage('chat:hospoda:join')
  async handleHospodaJoin(
    @MessageBody() payload: { username: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.connectedUsers.set(client.id, { lastSeen: new Date(), username: payload.username });
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;

    // Send recent history to the joining client
    const history = await this.globalChatService.getRecentMessages(50);
    client.emit('ikaros:load-history', history);

    // Broadcast updated user list to all in the channel
    const userList = [...this.connectedUsers.values()].map((u) => u.username);
    this.server.to(`chat:${channelId}`).emit('ikaros:user-list', userList);

    // Announce join
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

    // Broadcast updated user list
    const userList = [...this.connectedUsers.values()].map((u) => u.username);
    this.server.to(`chat:${channelId}`).emit('ikaros:user-list', userList);

    // Announce leave
    client.to(`chat:${channelId}`).emit('chat:presence', {
      username: payload.username,
      action: 'leave',
    });
  }

  @SubscribeMessage('ikaros:set-room-style')
  handleSetRoomStyle(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { style: string },
  ): void {
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;
    this.server.to(`chat:${channelId}`).emit('ikaros:room-style-changed', { style: payload.style });
  }

  handleDisconnect(client: Socket): void {
    const userInfo = this.connectedUsers.get(client.id);
    this.connectedUsers.delete(client.id);
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId || !userInfo) return;
    const userList = [...this.connectedUsers.values()].map((u) => u.username);
    this.server.to(`chat:${channelId}`).emit('ikaros:user-list', userList);
  }

  @OnEvent('chat.global.message.created')
  handleGlobalMessageCreated(payload: { channelId: string; message: ChatMessage }): void {
    if (payload.message.visibleTo && payload.message.visibleTo.length > 0) {
      for (const userId of payload.message.visibleTo) {
        this.server.to(`user:${userId}`).emit('chat:message', payload.message);
      }
    } else {
      this.server.to(`chat:${payload.channelId}`).emit('chat:message', payload.message);
    }
  }

  @OnEvent('chat.global.message.deleted')
  handleGlobalMessageDeleted(payload: { channelId: string; messageId: string }): void {
    this.server
      .to(`chat:${payload.channelId}`)
      .emit('chat:message:deleted', { messageId: payload.messageId, channelId: payload.channelId });
  }
}
