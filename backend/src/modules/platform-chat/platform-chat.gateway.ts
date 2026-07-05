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

  /** Smazaná zpráva → broadcast do room kanálu (FE tombstone / odstranění). */
  @OnEvent('platform-chat.message.deleted')
  onMessageDeleted(payload: { channelId: string; messageId: string }): void {
    this.server
      .to(`platform-chat:${payload.channelId}`)
      .emit('platform-chat:message:deleted', {
        messageId: payload.messageId,
        channelId: payload.channelId,
      });
  }

  /**
   * Typing indikátor — broadcast ostatním v room kanálu (ne sobě). Jméno
   * dohledáme přes service (identitu bere z `client.data.userId`, ne z payloadu).
   */
  @SubscribeMessage('platform-chat:typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId?: string; isTyping?: boolean },
  ): Promise<void> {
    const userId = (client.data as { userId?: string })?.userId;
    const channelId = data?.channelId;
    if (!userId || !channelId) return;
    const username = await this.service.getUsername(userId);
    if (!username) return;
    client.to(`platform-chat:${channelId}`).emit('platform-chat:typing', {
      channelId,
      username,
      isTyping: data?.isTyping === true,
    });
  }

  /** Změna zprávy (reakce / edit) → broadcast celé zprávy do room kanálu. */
  @OnEvent('platform-chat.message.updated')
  onMessageUpdated(payload: { channelId: string; message: ChatMessage }): void {
    this.server
      .to(`platform-chat:${payload.channelId}`)
      .emit('platform-chat:message:updated', payload.message);
  }

  /**
   * In-app signál o nové zprávě do per-uživatelských roomů příjemců (adminů) —
   * badge/notifikace i bez otevřené konverzace. `platform-chat:message` (výše)
   * míří jen do room kanálu, takže mimo `/admin/chat` by nedorazil.
   */
  @OnEvent('platform-chat.activity')
  onActivity(payload: { recipientIds: string[]; channelId: string }): void {
    for (const userId of payload.recipientIds) {
      this.server
        .to(`user:${userId}`)
        .emit('platform-chat:activity', { channelId: payload.channelId });
    }
  }
}
