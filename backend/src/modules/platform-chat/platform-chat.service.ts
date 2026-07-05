import {
  Injectable,
  Inject,
  Optional,
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
import type { IChannelReadStatusRepository } from '../chat/interfaces/channel-read-status-repository.interface';
import type { ChatChannel } from '../chat/interfaces/chat-channel.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import type { ChatAttachment } from '../chat/interfaces/chat-attachment.interface';
import { UsersService } from '../users/users.service';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { PushService } from '../push/push.service';
import { UploadService } from '../upload/upload.service';
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
    @Inject('IChannelReadStatusRepository')
    private readonly readRepo: IChannelReadStatusRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly usersService: UsersService,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
    private readonly uploadService: UploadService,
    @Optional()
    private readonly pushService?: PushService,
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
    const channel = await this.assertAccess(channelId, user);
    const content = dto.content?.trim() ?? '';
    const attachments = dto.attachments ?? [];
    // Zpráva musí mít text NEBO aspoň jednu přílohu.
    if (!content && attachments.length === 0) {
      throw new BadRequestException({
        code: 'PLATFORM_CHAT_EMPTY',
        message: 'Zpráva nesmí být prázdná',
      });
    }
    // UM-08 — ověř, že přílohy pocházejí z našeho uploadu (ne cizí URL).
    this.uploadService.assertAttachmentsOrigin(attachments, ['platform-chat/']);
    // Reply — dohledej cíl (tichý fallback když chybí / jiný kanál / smazaný).
    const replyFields = await this.resolveReply(channelId, dto.replyToId);
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
      content: content || null,
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments,
      visibleTo: [],
      ...replyFields,
      // Bez `expiresAt` = perzistentní (admin chat není TTL jako Hospoda).
    });
    await this.channelRepo.update(channelId, {
      lastMessageAt: new Date(),
      lastMessagePreview: (content || '📎 Příloha').slice(0, 80),
    });
    // 20.5b — odesílatel má vlastní zprávu rovnou přečtenou (jinak by si ji po
    // reloadu viděl jako nepřečtenou v unread badge).
    await this.readRepo.upsert(user.id, channelId, message.id);
    this.eventEmitter.emit('platform-chat.message.created', {
      channelId,
      message,
    });
    // Notifikace ostatních adminů (push + in-app badge) — fire-and-forget,
    // aby chyba doručení neshodila odeslání zprávy.
    void this.notifyRecipients(channelId, channel, message, user).catch(
      (err: unknown) =>
        logWarn(this.logger, 'Notifikace admin chatu selhala', err),
    );
    return message;
  }

  /**
   * Ověří cíl reply (stejný kanál, nesmazaný, nesystémový) a vrátí pole
   * `replyTo*` k uložení. Tichý fallback `{}` když cíl chybí — reply degraduje
   * na běžnou zprávu (vzor `global-chat.service.resolveReply`).
   */
  private async resolveReply(
    channelId: string,
    replyToId?: string,
  ): Promise<Partial<ChatMessage>> {
    if (!replyToId) return {};
    const target = await this.messageRepo.findById(replyToId);
    if (
      !target ||
      target.channelId !== channelId ||
      target.isDeleted ||
      target.isSystem
    ) {
      return {};
    }
    return {
      replyToId: target.id,
      replyToPreview: (target.content ?? '').slice(0, 120),
      replyToSenderName: target.senderName,
    };
  }

  /**
   * Přepne emoji reakci uživatele na zprávě. Reagovat smí kdokoli s přístupem
   * do kanálu (admin + membership). Broadcast celé aktualizované zprávy přes
   * `platform-chat.message.updated` (WS `platform-chat:message:updated`).
   */
  async toggleReaction(
    channelId: string,
    messageId: string,
    emoji: string,
    user: RequestUser,
  ): Promise<ChatMessage> {
    await this.assertAccess(channelId, user);
    if (!emoji || emoji.length > 16) {
      throw new BadRequestException({
        code: 'PLATFORM_CHAT_BAD_EMOJI',
        message: 'Neplatná reakce',
      });
    }
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.channelId !== channelId || message.isDeleted) {
      throw new NotFoundException({
        code: 'PLATFORM_CHAT_MSG_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    }
    const has = (message.reactions[emoji] ?? []).includes(user.id);
    const updated = has
      ? await this.messageRepo.removeReaction(messageId, emoji, user.id)
      : await this.messageRepo.addReaction(messageId, emoji, user.id);
    if (!updated) {
      throw new NotFoundException({
        code: 'PLATFORM_CHAT_MSG_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    }
    this.eventEmitter.emit('platform-chat.message.updated', {
      channelId,
      message: updated,
    });
    return updated;
  }

  /**
   * Soft-delete zprávy. Smí ji smazat Superadmin NEBO její odesílatel. Emituje
   * `platform-chat.message.deleted` (WS broadcast smazání + úklid příloh na
   * Cloudinary v `UploadService`).
   */
  async deleteMessage(
    channelId: string,
    messageId: string,
    user: RequestUser,
  ): Promise<void> {
    await this.assertAccess(channelId, user);
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.channelId !== channelId || message.isDeleted) {
      throw new NotFoundException({
        code: 'PLATFORM_CHAT_MSG_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    }
    const isOwner = message.senderId === user.id;
    const isSuperadmin = user.role === UserRole.Superadmin;
    if (!isOwner && !isSuperadmin) {
      throw new ForbiddenException({
        code: 'PLATFORM_CHAT_MSG_FORBIDDEN',
        message: 'Zprávu smí smazat jen její autor nebo Superadmin',
      });
    }
    await this.messageRepo.update(messageId, {
      isDeleted: true,
      content: null,
      attachments: [],
    });
    // `attachments` v eventu → `UploadService` smaže Cloudinary assety.
    this.eventEmitter.emit('platform-chat.message.deleted', {
      channelId,
      messageId,
      attachments: message.attachments ?? [],
    });
  }

  /**
   * Upload přílohy admin chatu — ověří přístup do kanálu (admin + membership),
   * pak nahraje soubor do `platform-chat/<channelId>`. Vrací `ChatAttachment`.
   */
  async uploadFile(
    channelId: string,
    file: Express.Multer.File,
    user: RequestUser,
  ): Promise<ChatAttachment> {
    await this.assertAccess(channelId, user);
    return this.uploadService.uploadPlatformChatFile(file, channelId);
  }

  // ── Read status (20.5b — persistentní unread badge) ──────────────────────

  /**
   * Nepřečtené per přístupný admin kanál — reuse `channelreadstatus` kolekce
   * (vzor `chat.service.getUnreadCounts`). Kanál bez read statusu = 0 (staré
   * zprávy nezaplaví nováčka „vše nepřečteno"). Součet dělá FE (badge číslo).
   */
  async getUnreadCounts(
    user: RequestUser,
  ): Promise<{ channelId: string; count: number }[]> {
    const channels = await this.listChannels(user);
    const channelIds = channels.map((c) => c.id);
    const readStatuses = await this.readRepo.findByUserAndChannels(
      user.id,
      channelIds,
    );
    const readMap = new Map(
      readStatuses.map((r) => [r.channelId, r.lastReadMessageId]),
    );
    return Promise.all(
      channels.map(async (channel) => {
        const lastReadId = readMap.get(channel.id);
        if (!lastReadId) return { channelId: channel.id, count: 0 };
        const count = await this.messageRepo.countAfter(channel.id, lastReadId);
        return { channelId: channel.id, count };
      }),
    );
  }

  /**
   * Označí konverzaci přečtenou po poslední zprávu (vzor `chat.service.markAsRead`).
   * Prázdný kanál = no-op.
   */
  async markChannelRead(channelId: string, user: RequestUser): Promise<void> {
    await this.assertAccess(channelId, user);
    const messages = await this.messageRepo.findByChannelId(channelId, {
      limit: 1,
    });
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    await this.readRepo.upsert(user.id, channelId, lastMessage.id);
  }

  /** Příjemci notifikace kanálu (admini/členové mimo odesílatele). */
  private async resolveRecipients(
    channel: ChatChannel,
    senderId: string,
  ): Promise<string[]> {
    let ids: string[];
    if (channel.accessMode === 'all') {
      const admins = await this.usersRepo.findByRoles([
        UserRole.Superadmin,
        UserRole.Admin,
      ]);
      ids = admins.map((u) => u.id);
    } else {
      // members: uvedení členové + všichni Superadmini (mají přístup vždy).
      const supers = await this.usersRepo.findByRoles([UserRole.Superadmin]);
      ids = [...channel.allowedMemberIds, ...supers.map((u) => u.id)];
    }
    return Array.from(new Set(ids)).filter((id) => id !== senderId);
  }

  /**
   * Web push (PWA, kategorie `adminChat`) + WS signál `platform-chat.activity`
   * (in-app badge i bez otevřeného chatu) ostatním adminům. Fire-and-forget.
   */
  private async notifyRecipients(
    channelId: string,
    channel: ChatChannel,
    message: ChatMessage,
    sender: RequestUser,
  ): Promise<void> {
    const recipientIds = await this.resolveRecipients(channel, sender.id);
    if (recipientIds.length === 0) return;
    this.eventEmitter.emit('platform-chat.activity', {
      recipientIds,
      channelId,
    });
    await this.pushService?.notifyUsers(
      recipientIds,
      {
        title: channel.name,
        body: `${sender.username}: ${message.content || '📎 Příloha'}`.slice(
          0,
          120,
        ),
        url: '/admin/chat',
        tag: `admin-chat-${channelId}`,
      },
      'adminChat',
    );
  }

  // ── Správa konverzací (gate na Superadmin je na controlleru) ────────────

  async createChannel(
    dto: CreatePlatformChannelDto,
    user: RequestUser,
  ): Promise<ChatChannel> {
    const all = dto.allMembers === true;
    const members = all
      ? []
      : Array.from(new Set([user.id, ...(dto.memberIds ?? [])]));
    const channel = await this.channelRepo.save({
      name: dto.name.trim(),
      worldId: null,
      groupId: STAFF_GROUP_ID,
      isGlobal: true,
      accessMode: all ? 'all' : 'members',
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
    // Seed konverzace (Hlavní/Vedení) mají zamčené členství = všichni admini.
    if (!this.isSeed(channel)) {
      if (dto.allMembers === true) {
        patch.accessMode = 'all';
        patch.allowedMemberIds = [];
      } else if (dto.memberIds !== undefined) {
        patch.accessMode = 'members';
        patch.allowedMemberIds = Array.from(new Set(dto.memberIds));
      }
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

  /** WS typing — dohledá zobrazované jméno uživatele pro broadcast. */
  async getUsername(userId: string): Promise<string | null> {
    try {
      const profile = await this.usersService.findById(userId);
      return profile.displayName ?? profile.username ?? null;
    } catch {
      return null;
    }
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
