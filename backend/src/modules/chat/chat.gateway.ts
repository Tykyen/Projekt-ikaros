import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import type { ChatGroup } from './interfaces/chat-group.interface';
import type { ChatChannel } from './interfaces/chat-channel.interface';
import type { ChatMessage } from './interfaces/chat-message.interface';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class ChatGateway {
  @WebSocketServer() server: Server;

  @OnEvent('chat.message.created')
  handleMessageCreated(payload: { channelId: string; worldId: string; message: ChatMessage }) {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message', payload.message);
  }

  @OnEvent('chat.message.updated')
  handleMessageUpdated(payload: { channelId: string; message: ChatMessage }) {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message:updated', payload.message);
  }

  @OnEvent('chat.message.deleted')
  handleMessageDeleted(payload: { channelId: string; messageId: string }) {
    this.server
      .to(`chat:${payload.channelId}`)
      .emit('chat:message:deleted', { messageId: payload.messageId, channelId: payload.channelId });
  }

  @OnEvent('chat.channel.created')
  handleChannelCreated(payload: { worldId: string; channel: ChatChannel }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:channel:created', payload.channel);
  }

  @OnEvent('chat.channel.updated')
  handleChannelUpdated(payload: { worldId: string; channel: ChatChannel }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:channel:updated', payload.channel);
  }

  @OnEvent('chat.channel.deleted')
  handleChannelDeleted(payload: { worldId: string; channelId: string; groupId: string }) {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:channel:deleted', { channelId: payload.channelId, groupId: payload.groupId });
  }

  @OnEvent('chat.group.created')
  handleGroupCreated(payload: { worldId: string; group: ChatGroup }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:created', payload.group);
  }

  @OnEvent('chat.group.updated')
  handleGroupUpdated(payload: { worldId: string; group: ChatGroup }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:updated', payload.group);
  }

  @OnEvent('chat.group.deleted')
  handleGroupDeleted(payload: { worldId: string; groupId: string }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:deleted', payload.groupId);
  }

  @OnEvent('chat.unread.updated')
  handleUnreadUpdated(payload: { userId: string; channelId: string; count: number }) {
    this.server
      .to(`user:${payload.userId}`)
      .emit('chat:unread', { channelId: payload.channelId, count: payload.count });
  }
}
