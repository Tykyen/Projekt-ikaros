import { Injectable, Inject, NotFoundException, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IChatChannelRepository } from '../chat/interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import type { RequestUser } from '../worlds/worlds.service';
import type { CreateGlobalMessageDto } from './dto/create-global-message.dto';
import { PushService } from '../push/push.service';

@Injectable()
export class GlobalChatService implements OnModuleInit {
  private static readonly MESSAGE_TTL_MS = 60 * 60 * 1000;
  private globalChannelId!: string;

  constructor(
    @Inject('IChatChannelRepository') private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository') private readonly messageRepo: IChatMessageRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly pushService: PushService,
  ) {}

  async onModuleInit(): Promise<void> {
    let channel = await this.channelRepo.findGlobal();
    if (!channel) {
      channel = await this.channelRepo.save({
        name: 'Interdimenzionální hospoda',
        worldId: null,
        groupId: null,
        isGlobal: true,
        accessMode: 'all',
        allowedRoles: [],
        allowedMemberIds: [],
        order: 0,
        isDeleted: false,
      });
    }
    this.globalChannelId = channel.id;
  }

  getGlobalChannelId(): string | undefined {
    return this.globalChannelId;
  }

  async getMessages(userId: string, opts: { before?: string; limit?: number }): Promise<ChatMessage[]> {
    if (!this.globalChannelId) throw new InternalServerErrorException('Global channel not initialized');
    const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : 50, 100);
    const messages = await this.messageRepo.findByChannelId(this.globalChannelId, {
      before: opts.before,
      limit,
    });
    return messages
      .filter((m) => !m.isDeleted)
      .filter((m) => {
        if (!m.visibleTo || m.visibleTo.length === 0) return true;
        return m.visibleTo.includes(userId) || m.senderId === userId;
      });
  }

  async sendMessage(dto: CreateGlobalMessageDto, user: RequestUser): Promise<ChatMessage> {
    if (!this.globalChannelId) throw new InternalServerErrorException('Global channel not initialized');
    const message = await this.messageRepo.save({
      channelId: this.globalChannelId,
      worldId: null,
      senderId: user.id,
      senderName: user.username,
      content: dto.content,
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments: [],
      visibleTo: dto.visibleTo ?? [],
      expiresAt: new Date(Date.now() + GlobalChatService.MESSAGE_TTL_MS),
      color: dto.color ?? null,
    });

    this.eventEmitter.emit('chat.global.message.created', { channelId: this.globalChannelId, message });

    // fire-and-forget push — nečekáme na výsledek
    void this.pushService.notifyAll({
      title: user.username,
      body: (dto.content ?? '').slice(0, 100),
    }).catch(() => undefined);

    return message;
  }

  async getRecentMessages(limit: number): Promise<ChatMessage[]> {
    if (!this.globalChannelId) return [];
    const messages = await this.messageRepo.findByChannelId(this.globalChannelId, { limit });
    return messages
      .filter((m) => !m.isDeleted)
      .filter((m) => !m.visibleTo || m.visibleTo.length === 0);
  }

  // Auth enforced by AdminGuard at controller level
  async deleteMessage(messageId: string): Promise<void> {
    if (!this.globalChannelId) throw new InternalServerErrorException('Global channel not initialized');
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.channelId !== this.globalChannelId) {
      throw new NotFoundException('Zpráva nenalezena');
    }
    await this.messageRepo.update(messageId, { isDeleted: true, content: null });
    this.eventEmitter.emit('chat.global.message.deleted', { channelId: this.globalChannelId, messageId });
  }
}
