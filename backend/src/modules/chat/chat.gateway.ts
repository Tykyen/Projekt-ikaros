import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import type { ChatGroup } from './interfaces/chat-group.interface';
import type { ChatChannel } from './interfaces/chat-channel.interface';
import type { ChatMessage } from './interfaces/chat-message.interface';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class ChatGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly typingTimeouts = new Map<string, NodeJS.Timeout>();

  handleDisconnect(client: Socket): void {
    for (const key of this.typingTimeouts.keys()) {
      if (key.startsWith(`${client.id}:`)) {
        clearTimeout(this.typingTimeouts.get(key));
        this.typingTimeouts.delete(key);
      }
    }
  }

  // ─── Typing indicator ────────────────────────────────────────────────────

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @MessageBody() payload: { channelId: string; characterName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const key = `${client.id}:${payload.channelId}`;
    const existing = this.typingTimeouts.get(key);
    if (existing) clearTimeout(existing);

    client.to(`chat:${payload.channelId}`).emit('chat:typing', {
      channelId: payload.channelId,
      characterName: payload.characterName,
      isTyping: true,
    });

    const timeout = setTimeout(() => {
      client.to(`chat:${payload.channelId}`).emit('chat:typing', {
        channelId: payload.channelId,
        characterName: payload.characterName,
        isTyping: false,
      });
      this.typingTimeouts.delete(key);
    }, 5000);

    this.typingTimeouts.set(key, timeout);
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @MessageBody() payload: { channelId: string; characterName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const key = `${client.id}:${payload.channelId}`;
    const existing = this.typingTimeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.typingTimeouts.delete(key);
    }
    client.to(`chat:${payload.channelId}`).emit('chat:typing', {
      channelId: payload.channelId,
      characterName: payload.characterName,
      isTyping: false,
    });
  }

  // ─── Message events ──────────────────────────────────────────────────────

  @OnEvent('chat.message.created')
  handleMessageCreated(payload: {
    channelId: string;
    worldId: string;
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

  @OnEvent('chat.message.updated')
  handleMessageUpdated(payload: {
    channelId: string;
    message: ChatMessage;
  }): void {
    this.server
      .to(`chat:${payload.channelId}`)
      .emit('chat:message:updated', payload.message);
  }

  @OnEvent('chat.message.deleted')
  handleMessageDeleted(payload: {
    channelId: string;
    messageId: string;
  }): void {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message:deleted', {
      messageId: payload.messageId,
      channelId: payload.channelId,
    });
  }

  // ─── Channel events ──────────────────────────────────────────────────────

  @OnEvent('chat.channel.created')
  handleChannelCreated(payload: {
    worldId: string;
    channel: ChatChannel;
  }): void {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:channel:created', payload.channel);
  }

  @OnEvent('chat.channel.updated')
  handleChannelUpdated(payload: {
    worldId: string;
    channel: ChatChannel;
  }): void {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:channel:updated', payload.channel);
  }

  @OnEvent('chat.channel.deleted')
  handleChannelDeleted(payload: {
    worldId: string;
    channelId: string;
    groupId: string;
  }): void {
    this.server.to(`world:${payload.worldId}`).emit('chat:channel:deleted', {
      channelId: payload.channelId,
      groupId: payload.groupId,
    });
  }

  // ─── Group events ────────────────────────────────────────────────────────

  @OnEvent('chat.group.created')
  handleGroupCreated(payload: { worldId: string; group: ChatGroup }): void {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:group:created', payload.group);
  }

  @OnEvent('chat.group.updated')
  handleGroupUpdated(payload: { worldId: string; group: ChatGroup }): void {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:group:updated', payload.group);
  }

  @OnEvent('chat.group.deleted')
  handleGroupDeleted(payload: { worldId: string; groupId: string }): void {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:group:deleted', payload.groupId);
  }

  // ─── Unread events ───────────────────────────────────────────────────────

  @OnEvent('chat.unread.updated')
  handleUnreadUpdated(payload: {
    userId: string;
    channelId: string;
    count: number;
  }): void {
    this.server.to(`user:${payload.userId}`).emit('chat:unread', {
      channelId: payload.channelId,
      count: payload.count,
    });
  }
}
