import { Injectable, Inject, NotFoundException, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IChatChannelRepository } from '../chat/interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import type { RequestUser } from '../worlds/worlds.service';
import type { CreateGlobalMessageDto } from './dto/create-global-message.dto';

@Injectable()
export class GlobalChatService implements OnModuleInit {
  private globalChannelId: string;

  constructor(
    @Inject('IChatChannelRepository') private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository') private readonly messageRepo: IChatMessageRepository,
    private readonly eventEmitter: EventEmitter2,
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

  getGlobalChannelId(): string {
    return this.globalChannelId;
  }

  async getMessages(userId: string, opts: { before?: string; limit?: number }): Promise<ChatMessage[]> {
    const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : 50, 100);
    const messages = await this.messageRepo.findByChannelId(this.globalChannelId, {
      before: opts.before,
      limit,
    });
    return messages.filter((m) => {
      if (!m.visibleTo || m.visibleTo.length === 0) return true;
      return m.visibleTo.includes(userId);
    });
  }

  async sendMessage(dto: CreateGlobalMessageDto, user: RequestUser): Promise<ChatMessage> {
    let visibleTo: string[] | undefined;
    if (dto.visibleTo && dto.visibleTo.length > 0) {
      const recipients = dto.visibleTo.filter((id) => id !== user.id);
      visibleTo = [user.id, ...recipients];
    }

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
      visibleTo,
      expiresAt: new Date(Date.now() + 3600000),
    });

    this.eventEmitter.emit('chat.global.message.created', { channelId: this.globalChannelId, message });
    return message;
  }

  async deleteMessage(messageId: string): Promise<void> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.channelId !== this.globalChannelId) {
      throw new NotFoundException('Zpráva nenalezena');
    }
    await this.messageRepo.update(messageId, { isDeleted: true, content: null });
    this.eventEmitter.emit('chat.global.message.deleted', { channelId: this.globalChannelId, messageId });
  }
}
