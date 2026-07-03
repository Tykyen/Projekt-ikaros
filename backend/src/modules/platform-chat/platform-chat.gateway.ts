import { OnEvent } from '@nestjs/event-emitter';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PlatformChatService } from './platform-chat.service';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';

/**
 * 20.5 — real-time pro admin chat. Sdílí socket s ostatními gateway (identitu
 * `client.data.userId` nastavuje `ChatGateway.handleConnection` z JWT).
 * Room konvence `platform-chat:{channelId}`; join je gated přes service
 * (uživatel musí být admin a mít do kanálu přístup).
 */
@WebSocketGateway({})
export class PlatformChatGateway {
  @WebSocketServer() server!: Server;

  constructor(private readonly service: PlatformChatService) {}

  @SubscribeMessage('platform-chat:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId?: string },
  ): Promise<void> {
    const userId = (client.data as { userId?: string })?.userId;
    const channelId = data?.channelId;
    if (!userId || !channelId) return;
    const ok = await this.service.canUserAccessChannel(channelId, userId);
    if (ok) await client.join(`platform-chat:${channelId}`);
  }

  @SubscribeMessage('platform-chat:leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId?: string },
  ): void {
    if (data?.channelId) void client.leave(`platform-chat:${data.channelId}`);
  }

  @OnEvent('platform-chat.message.created')
  onMessage(payload: { channelId: string; message: ChatMessage }): void {
    this.server
      .to(`platform-chat:${payload.channelId}`)
      .emit('platform-chat:message', payload.message);
  }
}
