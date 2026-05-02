import {
  Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { IChatGroupRepository } from './interfaces/chat-group-repository.interface';
import type { IChatChannelRepository } from './interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from './interfaces/chat-message-repository.interface';
import type { IChannelReadStatusRepository } from './interfaces/channel-read-status-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { ChatGroup } from './interfaces/chat-group.interface';
import type { ChatChannel } from './interfaces/chat-channel.interface';
import type { ChatMessage } from './interfaces/chat-message.interface';
import type { RequestUser } from '../worlds/worlds.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';
import type { CreateChannelDto } from './dto/create-channel.dto';
import type { UpdateChannelDto } from './dto/update-channel.dto';
import type { CreateMessageDto } from './dto/create-message.dto';
import type { UpdateMessageDto } from './dto/update-message.dto';
import type { World } from '../worlds/interfaces/world.interface';

@Injectable()
export class ChatService {
  constructor(
    @Inject('IChatGroupRepository') private readonly groupRepo: IChatGroupRepository,
    @Inject('IChatChannelRepository') private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository') private readonly messageRepo: IChatMessageRepository,
    @Inject('IChannelReadStatusRepository') private readonly readRepo: IChannelReadStatusRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private async canManageChat(requester: RequestUser, worldId: string): Promise<boolean> {
    if (requester.role <= UserRole.Admin) return true;
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
    if (!membership) return false;
    return membership.role >= WorldRole.PomocnyPJ;
  }

  async hasChannelAccess(channel: ChatChannel, userId: string): Promise<boolean> {
    if (channel.accessMode === 'members') {
      return channel.allowedMemberIds.includes(userId);
    }
    const membership = await this.membershipRepo.findByUserAndWorld(userId, channel.worldId!);
    if (!membership || membership.role === WorldRole.Pending) return false;
    if (channel.accessMode === 'all') return true;
    return channel.allowedRoles.includes(membership.role);
  }

  // ─── Groups ───────────────────────────────────────────────────────────────

  async getGroupsWithChannels(worldId: string): Promise<{ group: ChatGroup; channels: ChatChannel[] }[]> {
    const groups = await this.groupRepo.findByWorldId(worldId);
    const channels = await this.channelRepo.findByWorldId(worldId);
    return groups.map((group) => ({
      group,
      channels: channels.filter((c) => c.groupId === group.id),
    }));
  }

  async createGroup(worldId: string, dto: CreateGroupDto, requester: RequestUser): Promise<ChatGroup> {
    if (!(await this.canManageChat(requester, worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const count = await this.groupRepo.countByWorldId(worldId);
    const group = await this.groupRepo.save({
      worldId,
      name: dto.name,
      order: dto.order ?? count,
    });
    this.eventEmitter.emit('chat.group.created', { worldId, group });
    return group;
  }

  async updateGroup(groupId: string, dto: UpdateGroupDto, requester: RequestUser): Promise<ChatGroup> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new NotFoundException('Skupina nenalezena');
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const updated = await this.groupRepo.update(groupId, dto);
    if (!updated) throw new NotFoundException('Skupina nenalezena');
    this.eventEmitter.emit('chat.group.updated', { worldId: group.worldId, group: updated });
    return updated;
  }

  async deleteGroup(groupId: string, requester: RequestUser): Promise<{ message: string }> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new NotFoundException('Skupina nenalezena');
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const channels = await this.channelRepo.findByGroupId(groupId);
    for (const ch of channels) {
      await this.messageRepo.softDeleteByChannelId(ch.id);
      await this.channelRepo.delete(ch.id);
      this.eventEmitter.emit('chat.channel.deleted', { worldId: group.worldId, channelId: ch.id, groupId });
    }
    await this.groupRepo.delete(groupId);
    this.eventEmitter.emit('chat.group.deleted', { worldId: group.worldId, groupId });
    return { message: 'Skupina smazána' };
  }

  // ─── Channels ─────────────────────────────────────────────────────────────

  async createChannel(groupId: string, dto: CreateChannelDto, requester: RequestUser): Promise<ChatChannel> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new NotFoundException('Skupina nenalezena');
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const existing = await this.channelRepo.findByGroupId(groupId);
    const channel = await this.channelRepo.save({
      groupId,
      worldId: group.worldId,
      name: dto.name,
      accessMode: dto.accessMode ?? 'all',
      allowedRoles: dto.allowedRoles ?? [],
      allowedMemberIds: dto.allowedMemberIds ?? [],
      order: dto.order ?? existing.length,
      isDeleted: false,
    });
    this.eventEmitter.emit('chat.channel.created', { worldId: group.worldId, channel });
    return channel;
  }

  async updateChannel(channelId: string, dto: UpdateChannelDto, requester: RequestUser): Promise<ChatChannel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.canManageChat(requester, channel.worldId!))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const updated = await this.channelRepo.update(channelId, dto);
    if (!updated) throw new NotFoundException('Kanál nenalezen');
    this.eventEmitter.emit('chat.channel.updated', { worldId: channel.worldId!, channel: updated });
    return updated;
  }

  async deleteChannel(channelId: string, requester: RequestUser): Promise<{ message: string }> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.canManageChat(requester, channel.worldId!))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    await this.messageRepo.softDeleteByChannelId(channelId);
    await this.channelRepo.delete(channelId);
    this.eventEmitter.emit('chat.channel.deleted', { worldId: channel.worldId!, channelId, groupId: channel.groupId! });
    return { message: 'Kanál smazán' };
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async getMessages(
    channelId: string,
    userId: string,
    opts: { before?: string; limit?: number },
  ): Promise<ChatMessage[]> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, userId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const messages = await this.messageRepo.findByChannelId(channelId, {
      before: opts.before,
      limit: Math.min(Number.isFinite(opts.limit) && opts.limit! > 0 ? opts.limit! : 50, 100),
    });

    const membership = await this.membershipRepo.findByUserAndWorld(userId, channel.worldId!);
    const canSeeAllWhispers = membership !== null && membership.role >= WorldRole.PomocnyPJ;

    return messages.filter((m) => {
      if (!m.visibleTo || m.visibleTo.length === 0) return true;
      if (canSeeAllWhispers) return true;
      return m.visibleTo.includes(userId);
    });
  }

  async sendMessage(channelId: string, dto: CreateMessageDto, requester: RequestUser): Promise<ChatMessage> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, requester.id))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }

    if (!dto.content && (!dto.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException('Zpráva musí obsahovat text nebo přílohu');
    }

    if (dto.overrideName !== undefined || dto.overrideAvatarUrl !== undefined) {
      if (!(await this.canManageChat(requester, channel.worldId!))) {
        throw new ForbiddenException('Nedostatečná oprávnění pro NPC mód');
      }
    }

    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, channel.worldId!);
    const senderName = membership?.characterPath ?? requester.id;
    const senderAvatarUrl = membership?.avatarUrl;

    let replyToPreview: string | undefined;
    let replyToSenderName: string | undefined;
    if (dto.replyToId) {
      const cited = await this.messageRepo.findById(dto.replyToId);
      if (cited && !cited.isDeleted) {
        replyToPreview = cited.content?.slice(0, 200) ?? undefined;
        replyToSenderName = cited.overrideName ?? cited.senderName;
      }
    }

    let visibleTo: string[] | undefined;
    if (dto.visibleTo && dto.visibleTo.length > 0) {
      const recipients = dto.visibleTo.filter((id) => id !== requester.id);
      visibleTo = [requester.id, ...recipients];
    }

    const message = await this.messageRepo.save({
      channelId,
      worldId: channel.worldId!,
      senderId: requester.id,
      senderName,
      senderAvatarUrl,
      overrideName: dto.overrideName,
      overrideAvatarUrl: dto.overrideAvatarUrl,
      content: dto.content ?? null,
      isEdited: false,
      isDeleted: false,
      rpDate: dto.rpDate,
      replyToId: dto.replyToId,
      replyToPreview,
      replyToSenderName,
      visibleTo,
      reactions: {},
      attachments: dto.attachments ?? [],
    });

    await this.channelRepo.update(channelId, { lastMessageAt: message.createdAt });
    this.eventEmitter.emit('chat.message.created', { channelId, worldId: channel.worldId!, message });
    await this.broadcastUnreadUpdate(channel.worldId!, channelId, requester.id);
    return message;
  }

  async toggleReaction(messageId: string, emoji: string, requester: RequestUser): Promise<ChatMessage> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    const channel = await this.channelRepo.findById(message.channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, requester.id))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }

    const currentReactions = message.reactions[emoji] ?? [];
    const hasReacted = currentReactions.includes(requester.id);

    const updated = hasReacted
      ? await this.messageRepo.removeReaction(messageId, emoji, requester.id)
      : await this.messageRepo.addReaction(messageId, emoji, requester.id);

    if (!updated) throw new NotFoundException('Zpráva nenalezena');
    this.eventEmitter.emit('chat.message.updated', { channelId: message.channelId, message: updated });
    return updated;
  }

  async editMessage(messageId: string, dto: UpdateMessageDto, requester: RequestUser): Promise<ChatMessage> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    const canEdit = message.senderId === requester.id || (await this.canManageChat(requester, message.worldId));
    if (!canEdit) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.messageRepo.update(messageId, { content: dto.content, isEdited: true });
    if (!updated) throw new NotFoundException('Zpráva nenalezena');
    this.eventEmitter.emit('chat.message.updated', { channelId: message.channelId, message: updated });
    return updated;
  }

  async deleteMessage(messageId: string, requester: RequestUser): Promise<{ message: string }> {
    const msg = await this.messageRepo.findById(messageId);
    if (!msg || msg.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    const canDelete = msg.senderId === requester.id || (await this.canManageChat(requester, msg.worldId));
    if (!canDelete) throw new ForbiddenException('Nedostatečná oprávnění');

    await this.messageRepo.update(messageId, { isDeleted: true, content: null });
    this.eventEmitter.emit('chat.message.deleted', { channelId: msg.channelId, messageId, attachments: msg.attachments });
    return { message: 'Zpráva smazána' };
  }

  // ─── Read status ─────────────────────────────────────────────────────────

  async markAsRead(channelId: string, userId: string): Promise<void> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, userId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const messages = await this.messageRepo.findByChannelId(channelId, { limit: 1 });
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    await this.readRepo.upsert(userId, channelId, lastMessage.id);
    this.eventEmitter.emit('chat.unread.updated', { userId, channelId, count: 0 });
  }

  async getUnreadCounts(worldId: string, userId: string): Promise<{ channelId: string; count: number }[]> {
    const channels = await this.channelRepo.findByWorldId(worldId);
    const accessible = await Promise.all(
      channels.map(async (c) => ({ channel: c, access: await this.hasChannelAccess(c, userId) })),
    );
    const accessibleChannels = accessible.filter((a) => a.access).map((a) => a.channel);
    const channelIds = accessibleChannels.map((c) => c.id);
    const readStatuses = await this.readRepo.findByUserAndChannels(userId, channelIds);
    const readMap = new Map(readStatuses.map((r) => [r.channelId, r.lastReadMessageId]));

    return Promise.all(
      accessibleChannels.map(async (channel) => {
        const lastReadId = readMap.get(channel.id);
        const count = lastReadId ? await this.messageRepo.countAfter(channel.id, lastReadId) : 0;
        return { channelId: channel.id, count };
      }),
    );
  }

  private async broadcastUnreadUpdate(worldId: string, channelId: string, senderId: string): Promise<void> {
    const memberships = await this.membershipRepo.findByWorldId(worldId);
    for (const m of memberships) {
      if (m.userId === senderId) continue;
      this.eventEmitter.emit('chat.unread.updated', { userId: m.userId, channelId, count: -1 });
    }
  }

  // ─── World event listeners ────────────────────────────────────────────────

  @OnEvent('world.created')
  async handleWorldCreated(world: World): Promise<void> {
    const group1 = await this.groupRepo.save({ worldId: world.id, name: 'Globální', order: 0 });
    await this.channelRepo.save({
      groupId: group1.id, worldId: world.id, name: 'obecný',
      accessMode: 'all', allowedRoles: [], allowedMemberIds: [], order: 0, isDeleted: false,
    });
    const group2 = await this.groupRepo.save({ worldId: world.id, name: 'Postavy', order: 1 });
    await this.channelRepo.save({
      groupId: group2.id, worldId: world.id, name: 'hráči',
      accessMode: 'all', allowedRoles: [], allowedMemberIds: [], order: 0, isDeleted: false,
    });
  }

  async findChannelForUpload(channelId: string, userId: string): Promise<ChatChannel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, userId))) throw new ForbiddenException('Nedostatečná oprávnění');
    return channel;
  }

  @OnEvent('world.deleted')
  async handleWorldDeleted(payload: { worldId: string }): Promise<void> {
    await this.channelRepo.softDeleteByWorldId(payload.worldId);
    await this.messageRepo.softDeleteByWorldId(payload.worldId);
  }
}
