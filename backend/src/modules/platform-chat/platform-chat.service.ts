import {
  Injectable,
  Inject,
  OnModuleInit,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { logWarn } from '../../common/logging/log-error.util';
import type { IChatChannelRepository } from '../chat/interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import type { ChatChannel } from '../chat/interfaces/chat-channel.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import type { CreatePlatformMessageDto } from './dto/create-platform-message.dto';
import type { CreatePlatformChannelDto } from './dto/create-platform-channel.dto';
import type { UpdatePlatformChannelDto } from './dto/update-platform-channel.dto';

/**
 * 20.5 — interní chat správy platformy. Reusuje sdílená chat schémata
 * (`ChatChannel`/`ChatMessage`) jako `global-chat`. Konverzace admin chatu
 * poznáme podle `groupId === STAFF_GROUP_ID` (marker, ne skutečná ChatGroup).
 * Seed konverzace (Hlavní/Vedení) mají `accessMode:'all'` (viditelné všem
 * adminům) a nelze je smazat; custom mají `accessMode:'members'`.
 */
const STAFF_GROUP_ID = '__platform_staff__';

const SEED_CHANNELS: { type: string; name: string }[] = [
  { type: 'staff-main', name: 'Hlavní' },
  { type: 'staff-vedeni', name: 'Vedení' },
];
const SEED_TYPES = new Set(SEED_CHANNELS.map((c) => c.type));

@Injectable()
export class PlatformChatService implements OnModuleInit {
  private readonly logger = new Logger(PlatformChatService.name);

  constructor(
    @Inject('IChatChannelRepository')
    private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository')
    private readonly messageRepo: IChatMessageRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    let order = 0;
    for (const { type, name } of SEED_CHANNELS) {
      const existing = await this.channelRepo.findGlobalByType(type);
      if (!existing) {
        await this.channelRepo.save({
          name,
          worldId: null,
          groupId: STAFF_GROUP_ID,
          isGlobal: true,
          accessMode: 'all',
          allowedRoles: [],
          allowedMemberIds: [],
          order: order,
          isDeleted: false,
          type,
        });
      }
      order += 1;
    }
  }

  private isSeed(channel: ChatChannel): boolean {
    return SEED_TYPES.has(channel.type);
  }

  private isStaffRole(role: UserRole): boolean {
    return role === UserRole.Superadmin || role === UserRole.Admin;
  }

  /** Kdo smí danou konverzaci vidět/číst. Seed = všichni admini; custom = členové (+ Superadmin). */
  private canAccess(channel: ChatChannel, user: RequestUser): boolean {
    if (!this.isStaffRole(user.role)) return false;
    if (channel.accessMode === 'all') return true;
    return (
      user.role === UserRole.Superadmin ||
      channel.allowedMemberIds.includes(user.id)
    );
  }

  private async loadStaffChannel(channelId: string): Promise<ChatChannel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted || channel.groupId !== STAFF_GROUP_ID) {
      throw new NotFoundException({
        code: 'PLATFORM_CHAT_CHANNEL_NOT_FOUND',
        message: 'Konverzace neexistuje',
      });
    }
    return channel;
  }

  private async assertAccess(
    channelId: string,
    user: RequestUser,
  ): Promise<ChatChannel> {
    const channel = await this.loadStaffChannel(channelId);
    if (!this.canAccess(channel, user)) {
      throw new ForbiddenException({
        code: 'PLATFORM_CHAT_FORBIDDEN',
        message: 'Do této konverzace nemáš přístup',
      });
    }
    return channel;
  }

  async listChannels(user: RequestUser): Promise<ChatChannel[]> {
    const all = await this.channelRepo.findByGroupId(STAFF_GROUP_ID);
    return all.filter((ch) => this.canAccess(ch, user));
  }

  async getMessages(
    channelId: string,
    user: RequestUser,
    opts: { before?: string; limit?: number },
  ): Promise<ChatMessage[]> {
    await this.assertAccess(channelId, user);
    const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : 50, 100);
    const messages = await this.messageRepo.findByChannelId(channelId, {
      before: opts.before,
      limit,
    });
    return messages.filter((m) => !m.isDeleted);
  }

  async sendMessage(
    channelId: string,
    dto: CreatePlatformMessageDto,
    user: RequestUser,
  ): Promise<ChatMessage> {
    await this.assertAccess(channelId, user);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException({
        code: 'PLATFORM_CHAT_EMPTY',
        message: 'Zpráva nesmí být prázdná',
      });
    }
    let senderAvatarUrl: string | undefined;
    try {
      const profile = await this.usersService.findById(user.id);
      senderAvatarUrl = profile.avatarUrl;
    } catch (err: unknown) {
      logWarn(
        this.logger,
        `Avatar odesílatele (userId=${user.id}) nenačten`,
        err,
      );
    }
    const message = await this.messageRepo.save({
      channelId,
      worldId: null,
      senderId: user.id,
      senderName: user.username,
      senderAvatarUrl,
      content,
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments: [],
      visibleTo: [],
      // Bez `expiresAt` = perzistentní (admin chat není TTL jako Hospoda).
    });
    await this.channelRepo.update(channelId, {
      lastMessageAt: new Date(),
      lastMessagePreview: content.slice(0, 80),
    });
    this.eventEmitter.emit('platform-chat.message.created', {
      channelId,
      message,
    });
    return message;
  }

  // ── Správa konverzací (gate na Superadmin je na controlleru) ────────────

  async createChannel(
    dto: CreatePlatformChannelDto,
    user: RequestUser,
  ): Promise<ChatChannel> {
    const members = Array.from(new Set([user.id, ...(dto.memberIds ?? [])]));
    const channel = await this.channelRepo.save({
      name: dto.name.trim(),
      worldId: null,
      groupId: STAFF_GROUP_ID,
      isGlobal: true,
      accessMode: 'members',
      allowedRoles: [],
      allowedMemberIds: members,
      order: Date.now(),
      isDeleted: false,
      type: 'staff-custom',
    });
    this.eventEmitter.emit('platform-chat.channel.changed', {});
    return channel;
  }

  async updateChannel(
    channelId: string,
    dto: UpdatePlatformChannelDto,
  ): Promise<ChatChannel> {
    const channel = await this.loadStaffChannel(channelId);
    const patch: Partial<ChatChannel> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    // Seed konverzace jsou `accessMode:'all'` (viditelné všem) → členství se nemění.
    if (dto.memberIds !== undefined && !this.isSeed(channel)) {
      patch.allowedMemberIds = Array.from(new Set(dto.memberIds));
    }
    const updated = await this.channelRepo.update(channelId, patch);
    this.eventEmitter.emit('platform-chat.channel.changed', {});
    return updated ?? channel;
  }

  async deleteChannel(channelId: string): Promise<void> {
    const channel = await this.loadStaffChannel(channelId);
    if (this.isSeed(channel)) {
      throw new ForbiddenException({
        code: 'PLATFORM_CHAT_SEED_LOCKED',
        message: 'Výchozí konverzace nelze smazat',
      });
    }
    await this.channelRepo.update(channelId, { isDeleted: true });
    this.eventEmitter.emit('platform-chat.channel.changed', {});
  }

  /** WS join gate — ověří, že uživatel je admin a má do kanálu přístup. */
  async canUserAccessChannel(
    channelId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const channel = await this.channelRepo.findById(channelId);
      if (!channel || channel.isDeleted || channel.groupId !== STAFF_GROUP_ID) {
        return false;
      }
      const profile = await this.usersService.findById(userId);
      if (!this.isStaffRole(profile.role)) return false;
      if (channel.accessMode === 'all') return true;
      return (
        profile.role === UserRole.Superadmin ||
        channel.allowedMemberIds.includes(userId)
      );
    } catch {
      return false;
    }
  }
}
