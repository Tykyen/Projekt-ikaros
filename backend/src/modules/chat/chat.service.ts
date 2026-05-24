import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  forwardRef,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { IChatGroupRepository } from './interfaces/chat-group-repository.interface';
import type { IChatChannelRepository } from './interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from './interfaces/chat-message-repository.interface';
import type { IChannelReadStatusRepository } from './interfaces/channel-read-status-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { ChatGroup } from './interfaces/chat-group.interface';
import type { ChatChannel } from './interfaces/chat-channel.interface';
import type {
  ChatMessage,
  ChatSearchResult,
} from './interfaces/chat-message.interface';
import type { RequestUser } from '../worlds/worlds.service';
import {
  WorldRole,
  type WorldMembership,
} from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';
import type { CreateChannelDto } from './dto/create-channel.dto';
import type { UpdateChannelDto } from './dto/update-channel.dto';
import type { CreateMessageDto } from './dto/create-message.dto';
import type { UpdateMessageDto } from './dto/update-message.dto';
import type { UpdateAppearanceDto } from './dto/update-appearance.dto';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import { UsersService } from '../users/users.service';
import type { World } from '../worlds/interfaces/world.interface';
import type { WorldSettings } from '../worlds/interfaces/world-settings.interface';
import { WorldsService } from '../worlds/worlds.service';
import { PushService } from '../push/push.service';
import {
  ChatPresenceService,
  type PresenceUser,
} from './chat-presence.service';

@Injectable()
export class ChatService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject('IChatGroupRepository')
    private readonly groupRepo: IChatGroupRepository,
    @Inject('IChatChannelRepository')
    private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository')
    private readonly messageRepo: IChatMessageRepository,
    @Inject('IChannelReadStatusRepository')
    private readonly readRepo: IChannelReadStatusRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IUsersRepository')
    private readonly usersRepo: IUsersRepository,
    // D-040 — tombstone batch enrichment pro chat messages a search results.
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pushService: PushService,
    private readonly presence: ChatPresenceService,
    @Inject(forwardRef(() => WorldsService))
    private readonly worldsService: WorldsService,
  ) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private assertWorldChannel(
    channel: ChatChannel,
  ): asserts channel is ChatChannel & { worldId: string } {
    if (!channel.worldId)
      throw new BadRequestException({
        code: 'CHAT_GLOBAL_NOT_SUPPORTED',
        message: 'Operace není podporována pro globální kanál',
      });
  }

  private async canManageChat(
    requester: RequestUser,
    worldId: string,
  ): Promise<boolean> {
    if (requester.role <= UserRole.Admin) return true;
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) return false;
    return membership.role >= WorldRole.PomocnyPJ;
  }

  async hasChannelAccess(
    channel: ChatChannel,
    userId: string,
  ): Promise<boolean> {
    if (channel.accessMode === 'members') {
      return channel.allowedMemberIds.includes(userId);
    }
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      channel.worldId!,
    );
    return this.hasAccessGivenMembership(channel, userId, membership);
  }

  private hasAccessGivenMembership(
    channel: ChatChannel,
    userId: string,
    membership: { role: WorldRole } | null | undefined,
  ): boolean {
    if (channel.accessMode === 'members') {
      return channel.allowedMemberIds.includes(userId);
    }
    if (!membership || membership.role === WorldRole.Zadatel) return false;
    // Globální (`all`) konverzace — až od role Hráč; Čtenář/Žadatel nevidí.
    if (channel.accessMode === 'all') return membership.role >= WorldRole.Hrac;
    return channel.allowedRoles.includes(membership.role);
  }

  private async resolveChannelRecipients(
    channel: ChatChannel,
    senderUserId: string,
  ): Promise<string[]> {
    if (channel.accessMode === 'members') {
      return channel.allowedMemberIds.filter((id) => id !== senderUserId);
    }

    const members = await this.membershipRepo.findByWorldId(channel.worldId!);
    return members
      .filter(
        (m) =>
          m.userId !== senderUserId &&
          this.hasAccessGivenMembership(channel, m.userId, m),
      )
      .map((m) => m.userId);
  }

  // ─── Groups ───────────────────────────────────────────────────────────────

  async getGroupsWithChannels(
    worldId: string,
    requester: RequestUser,
  ): Promise<{ group: ChatGroup; channels: ChatChannel[] }[]> {
    let groups = await this.groupRepo.findByWorldId(worldId);
    // Lazy seed (krok 6.1g) — svět bez chat kanálů (vytvořený před modulem
    // chat) je dostane při prvním otevření chatu, nezávisle na boot backfillu.
    if (groups.length === 0) {
      await this.ensureWorldChat(worldId);
      groups = await this.groupRepo.findByWorldId(worldId);
    }
    const [channels, isManager] = await Promise.all([
      this.channelRepo.findByWorldId(worldId),
      this.canManageChat(requester, worldId),
    ]);
    // PJ+ (a Admin) vidí všechny konverzace včetně soukromých 1:1; ostatní jen
    // ty, kam mají přístup dle `accessMode`.
    const membership = isManager
      ? null
      : await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
    const channelsByGroup = new Map<string, ChatChannel[]>();
    for (const c of channels) {
      if (!c.groupId) continue;
      if (
        !isManager &&
        !this.hasAccessGivenMembership(c, requester.id, membership)
      )
        continue;
      const list = channelsByGroup.get(c.groupId) ?? [];
      list.push(c);
      channelsByGroup.set(c.groupId, list);
    }
    return groups.map((group) => ({
      group,
      channels: channelsByGroup.get(group.id) ?? [],
    }));
  }

  async createGroup(
    worldId: string,
    dto: CreateGroupDto,
    requester: RequestUser,
  ): Promise<ChatGroup> {
    if (!(await this.canManageChat(requester, worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const count = await this.groupRepo.countByWorldId(worldId);
    const group = await this.groupRepo.save({
      worldId,
      name: dto.name,
      order: dto.order ?? count,
      imageUrl: dto.imageUrl,
    });
    this.eventEmitter.emit('chat.group.created', { worldId, group });
    return group;
  }

  async updateGroup(
    groupId: string,
    dto: UpdateGroupDto,
    requester: RequestUser,
  ): Promise<ChatGroup> {
    const group = await this.groupRepo.findById(groupId);
    if (!group)
      throw new NotFoundException({
        code: 'CHAT_GROUP_NOT_FOUND',
        message: 'Skupina nenalezena',
      });
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const updated = await this.groupRepo.update(groupId, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CHAT_GROUP_NOT_FOUND',
        message: 'Skupina nenalezena',
      });
    this.eventEmitter.emit('chat.group.updated', {
      worldId: group.worldId,
      group: updated,
    });
    return updated;
  }

  async deleteGroup(
    groupId: string,
    requester: RequestUser,
  ): Promise<{ message: string }> {
    const group = await this.groupRepo.findById(groupId);
    if (!group)
      throw new NotFoundException({
        code: 'CHAT_GROUP_NOT_FOUND',
        message: 'Skupina nenalezena',
      });
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const channels = await this.channelRepo.findByGroupId(groupId);
    for (const ch of channels) {
      await this.messageRepo.softDeleteByChannelId(ch.id);
      await this.channelRepo.delete(ch.id);
      this.eventEmitter.emit('chat.channel.deleted', {
        worldId: group.worldId,
        channelId: ch.id,
        groupId,
      });
    }
    await this.groupRepo.delete(groupId);
    this.eventEmitter.emit('chat.group.deleted', {
      worldId: group.worldId,
      groupId,
    });
    return { message: 'Skupina smazána' };
  }

  /**
   * Krok 6.5a — bulk reorder kanálů. PJ/Pomocný PJ může změnit pořadí
   * všech kanálů světa jedním requestem. Validuje, že každý ID patří do
   * `worldId` (jinak `INVALID_GROUP_ID`); použije `bulkWrite` v repo.
   */
  async reorderGroups(
    worldId: string,
    items: { id: string; order: number }[],
    requester: RequestUser,
  ): Promise<void> {
    if (!(await this.canManageChat(requester, worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    if (items.length === 0) return;
    const ids = items.map((i) => i.id);
    const groups = await this.groupRepo.findByWorldId(worldId);
    const groupIds = new Set(groups.map((g) => g.id));
    for (const id of ids) {
      if (!groupIds.has(id)) {
        throw new BadRequestException({
          code: 'INVALID_GROUP_ID',
          message: `Kanál ${id} nepatří do tohoto světa`,
        });
      }
    }
    await this.groupRepo.bulkUpdateOrders(items);
    this.eventEmitter.emit('chat.groups.reordered', { worldId, items });
  }

  // ─── Channels ─────────────────────────────────────────────────────────────

  async createChannel(
    groupId: string,
    dto: CreateChannelDto,
    requester: RequestUser,
  ): Promise<ChatChannel> {
    const group = await this.groupRepo.findById(groupId);
    if (!group)
      throw new NotFoundException({
        code: 'CHAT_GROUP_NOT_FOUND',
        message: 'Skupina nenalezena',
      });
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
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
      type: dto.type ?? 'all',
      ...(dto.imageUrl ? { imageUrl: dto.imageUrl } : {}),
    });
    this.eventEmitter.emit('chat.channel.created', {
      worldId: group.worldId,
      channel,
    });
    return channel;
  }

  async updateChannel(
    channelId: string,
    dto: UpdateChannelDto,
    requester: RequestUser,
  ): Promise<ChatChannel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    this.assertWorldChannel(channel);
    if (!(await this.canManageChat(requester, channel.worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    // Přesun konverzace mezi kanály — target group musí být ve stejném světě.
    if (dto.groupId && dto.groupId !== channel.groupId) {
      const target = await this.groupRepo.findById(dto.groupId);
      if (!target)
        throw new NotFoundException({
          code: 'CHAT_GROUP_NOT_FOUND',
          message: 'Cílový kanál nenalezen',
        });
      if (target.worldId !== channel.worldId)
        throw new ForbiddenException({
          code: 'CHAT_FORBIDDEN',
          message: 'Cílový kanál patří do jiného světa',
        });
    }
    const updated = await this.channelRepo.update(channelId, dto);
    if (!updated)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    this.eventEmitter.emit('chat.channel.updated', {
      worldId: channel.worldId,
      channel: updated,
    });
    return updated;
  }

  async deleteChannel(
    channelId: string,
    requester: RequestUser,
  ): Promise<{ message: string }> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    this.assertWorldChannel(channel);
    if (!(await this.canManageChat(requester, channel.worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    await this.messageRepo.softDeleteByChannelId(channelId);
    await this.channelRepo.delete(channelId);
    this.eventEmitter.emit('chat.channel.deleted', {
      worldId: channel.worldId,
      channelId,
      groupId: channel.groupId!,
    });
    return { message: 'Kanál smazán' };
  }

  /**
   * Krok 6.5b — bulk reorder konverzací **v rámci jednoho kanálu**.
   * Drag mezi kanály je vyloučený (přesun má `updateChannel` přes `groupId`),
   * proto všechny posílané `channelId` musí mít stejný `groupId` (`MIXED_GROUPS`).
   */
  async reorderChannels(
    worldId: string,
    items: { id: string; order: number }[],
    requester: RequestUser,
  ): Promise<void> {
    if (!(await this.canManageChat(requester, worldId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    if (items.length === 0) return;
    const ids = items.map((i) => i.id);
    const all = await this.channelRepo.findByWorldId(worldId);
    const byId = new Map(all.map((c) => [c.id, c]));
    const groupIds = new Set<string | null>();
    for (const id of ids) {
      const ch = byId.get(id);
      if (!ch) {
        throw new BadRequestException({
          code: 'INVALID_CHANNEL_ID',
          message: `Konverzace ${id} nepatří do tohoto světa`,
        });
      }
      groupIds.add(ch.groupId);
    }
    if (groupIds.size > 1) {
      throw new BadRequestException({
        code: 'MIXED_GROUPS',
        message: 'Reorder konverzací je dovolený jen v rámci jednoho kanálu.',
      });
    }
    const groupId = [...groupIds][0]!;
    await this.channelRepo.bulkUpdateOrders(items);
    this.eventEmitter.emit('chat.channels.reordered', {
      worldId,
      groupId,
      items,
    });
  }

  // ─── Presence (krok 6.1d) ─────────────────────────────────────────────────

  /**
   * World role uživatele pro presence záznam dané konverzace. `null` =
   * konverzace neexistuje / je smazaná, nebo uživatel není člen světa.
   */
  async resolveChannelPresenceRole(
    channelId: string,
    userId: string,
  ): Promise<WorldRole | null> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted || !channel.worldId) return null;
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      channel.worldId,
    );
    return membership ? membership.role : null;
  }

  /** Seznam přítomných v konverzaci — REST seed presence panelu (jen PJ+ FE). */
  async getChannelPresence(
    channelId: string,
    userId: string,
  ): Promise<PresenceUser[]> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Konverzace nenalezena',
      });
    if (!(await this.hasChannelAccess(channel, userId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    return this.presence.list(channelId);
  }

  // ─── Hledání (krok 6.6) ───────────────────────────────────────────────────

  /**
   * Hledání ve zprávách světa — substring v `content` napříč konverzacemi,
   * kam uživatel vidí. Volitelně zúženo na jednu konverzaci. Šepoty vidí jen
   * jejich účastníci (a PJ+); smazané zprávy vynechány.
   */
  async searchMessages(
    worldId: string,
    requester: RequestUser,
    opts: { q: string; channelId?: string; limit?: number },
  ): Promise<ChatSearchResult[]> {
    const q = (opts.q ?? '').trim();
    if (q.length < 2) return [];

    // Konverzace, kam uživatel vidí (reuse access filtru).
    const groups = await this.getGroupsWithChannels(worldId, requester);
    let channels = groups.flatMap((g) => g.channels);
    if (opts.channelId) {
      channels = channels.filter((c) => c.id === opts.channelId);
      if (channels.length === 0) {
        throw new ForbiddenException({
          code: 'CHAT_FORBIDDEN',
          message: 'Ke konverzaci nemáš přístup',
        });
      }
    }
    if (channels.length === 0) return [];

    const nameById = new Map(channels.map((c) => [c.id, c.name]));
    const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : 30, 50);
    // Overfetch — část výsledků může odpadnout na whisper filtru.
    const messages = await this.messageRepo.searchInChannels(
      channels.map((c) => c.id),
      q,
      limit * 2,
    );

    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    const canSeeAllWhispers =
      membership !== null && membership.role >= WorldRole.PomocnyPJ;

    const filtered = messages
      .filter((m) => {
        if (!m.visibleTo || m.visibleTo.length === 0) return true;
        if (canSeeAllWhispers) return true;
        return m.visibleTo.includes(requester.id);
      })
      .slice(0, limit);

    // D-040 — tombstone info pro autory; override (PJ persona) si tombstone nezaslouží.
    const info = await this.usersService.findManyTombstoneInfo(
      Array.from(new Set(filtered.map((m) => m.senderId))),
    );

    return filtered.map((m) => ({
      messageId: m.id,
      channelId: m.channelId,
      channelName: nameById.get(m.channelId) ?? '',
      senderName: m.overrideName ?? m.senderName,
      senderIsDeleted: m.overrideName
        ? false
        : (info.get(m.senderId)?.isDeleted ?? false),
      content: m.content ?? '',
      createdAt: m.createdAt,
    }));
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async getMessages(
    channelId: string,
    userId: string,
    opts: { before?: string; limit?: number },
  ): Promise<ChatMessage[]> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    this.assertWorldChannel(channel);
    if (!(await this.hasChannelAccess(channel, userId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const messages = await this.messageRepo.findByChannelId(channelId, {
      before: opts.before,
      limit: Math.min(
        Number.isFinite(opts.limit) && opts.limit! > 0 ? opts.limit! : 50,
        100,
      ),
    });

    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      channel.worldId,
    );
    const canSeeAllWhispers =
      membership !== null && membership.role >= WorldRole.PomocnyPJ;

    const visible = messages.filter((m) => {
      if (!m.visibleTo || m.visibleTo.length === 0) return true;
      if (canSeeAllWhispers) return true;
      return m.visibleTo.includes(userId);
    });
    // D-040 — batch tombstone enrichment (1 lookup pro 50 zpráv, 60s cache).
    return this.enrichTombstoneSenders(visible);
  }

  /**
   * D-040 — batch enrich `senderIsDeleted` na pole ChatMessage.
   * Cache 60s v UsersService minimalizuje DB lookupy pro hot chat.
   */
  private async enrichTombstoneSenders(
    messages: ChatMessage[],
  ): Promise<ChatMessage[]> {
    if (messages.length === 0) return messages;
    const ids = Array.from(new Set(messages.map((m) => m.senderId)));
    const info = await this.usersService.findManyTombstoneInfo(ids);
    return messages.map((m) => ({
      ...m,
      senderIsDeleted: info.get(m.senderId)?.isDeleted ?? false,
    }));
  }

  async sendMessage(
    channelId: string,
    dto: CreateMessageDto,
    requester: RequestUser,
  ): Promise<ChatMessage> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    this.assertWorldChannel(channel);
    if (!(await this.hasChannelAccess(channel, requester.id))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }

    if (!dto.content && (!dto.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException({
        code: 'CHAT_MESSAGE_EMPTY',
        message: 'Zpráva musí obsahovat text nebo přílohu',
      });
    }

    if (dto.overrideName !== undefined || dto.overrideAvatarUrl !== undefined) {
      if (!(await this.canManageChat(requester, channel.worldId))) {
        throw new ForbiddenException({
          code: 'CHAT_NPC_FORBIDDEN',
          message: 'Nedostatečná oprávnění pro NPC mód',
        });
      }
    }

    // 6.2h — idempotentní retry: pokud už zpráva s tímto nonce existuje (FE
    // znovu odeslal po WS dropu / timeoutu), vrátíme tu stávající.
    if (dto.clientNonce) {
      const existing = await this.messageRepo.findByNonce(
        channelId,
        dto.clientNonce,
      );
      if (existing) return existing;
    }

    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      channel.worldId,
    );
    // Hierarchie pro zobrazené jméno:
    //   1. `characterPath` (jméno postavy v daném světě),
    //   2. `requester.username` (login účtu — viditelný fallback),
    //   3. `requester.id` jen pro úplnou jistotu (MongoDB ObjectID, neměl by
    //      nastat — uživatel bez username v BE neexistuje).
    const senderName =
      membership?.characterPath || requester.username || requester.id;
    const senderAvatarUrl = membership?.avatarUrl;

    // 6.2f — server-side fill barvy/fontu/velikosti z membershipu, pokud FE nepošle.
    const color = dto.color ?? membership?.chatColor ?? null;
    const customFont = dto.customFont ?? membership?.chatFont ?? null;
    const customFontSize =
      dto.customFontSize ?? membership?.chatFontSize ?? null;

    // 6.2i — extrakce @username mentions z textu (case-insensitive).
    // D-NEW-chat-mention-all (2026-05-21) — speciální tokeny `@all` (všichni
    // s přístupem) a `@here` (všichni s přístupem; FE notifikace rozšíří jen
    // pokud user je teď připojený, BE jen označí mentions).
    // D-NEW-chat-mention-character (2026-05-23) — tokeny mohou být i character
    // slugy (`@frantikuv-synek`). Resolvujeme dvoukrokově: nejdřív username,
    // pak unresolved tokeny zkusíme jako `characterPath` v daném světě.
    const MENTION_REGEX = /(?:^|\s)@(\w[\w.-]{0,31})/g;
    const allTokens = dto.content
      ? Array.from(
          new Set([...dto.content.matchAll(MENTION_REGEX)].map((m) => m[1])),
        )
      : [];
    const specialAll = allTokens.includes('all') || allTokens.includes('here');
    const candidateTokens = allTokens.filter(
      (u) => u !== 'all' && u !== 'here',
    );
    const mentionedUsers = candidateTokens.length
      ? await this.usersRepo.findByUsernames(candidateTokens)
      : [];
    const resolvedUsernames = new Set(
      mentionedUsers.map((u) => u.username.toLowerCase()),
    );
    // Tokeny, které neodpovídají žádnému username — zkus character slug.
    const unresolvedTokens = candidateTokens.filter(
      (t) => !resolvedUsernames.has(t.toLowerCase()),
    );
    const characterMemberships = unresolvedTokens.length
      ? await this.membershipRepo.findByCharacterPathsAndWorld(
          channel.worldId,
          unresolvedTokens,
        )
      : [];
    const explicitMentions = [
      ...mentionedUsers.map((u) => u.id),
      ...characterMemberships.map((m) => m.userId),
    ];
    // Pro @all/@here doplníme všechny recipients (kromě senderId).
    const broadcastMentions = specialAll
      ? await this.resolveChannelRecipients(channel, requester.id)
      : [];
    const mentions = Array.from(
      new Set([...explicitMentions, ...broadcastMentions]),
    );

    let replyToPreview: string | undefined;
    let replyToSenderName: string | undefined;
    if (dto.replyToId) {
      const cited = await this.messageRepo.findById(dto.replyToId);
      if (cited && !cited.isDeleted) {
        replyToPreview = cited.content?.slice(0, 200) ?? undefined;
        // Priorita: NPC override → reálné jméno odesílatele. Recovery: pokud
        // `cited.senderName` vypadá jako MongoDB ObjectID (historický bug,
        // 6.2 fix), fetch user a vezmi username — ať reply card neukazuje
        // hex string. Ve fázi 8 sem přibyde fallback i na postavu.
        if (cited.overrideName) {
          replyToSenderName = cited.overrideName;
        } else if (/^[0-9a-f]{24}$/i.test(cited.senderName)) {
          const u = await this.usersRepo.findById(cited.senderId);
          replyToSenderName = u?.username ?? cited.senderName;
        } else {
          replyToSenderName = cited.senderName;
        }
      }
    }

    let visibleTo: string[] | undefined;
    if (dto.visibleTo && dto.visibleTo.length > 0) {
      const recipients = dto.visibleTo.filter((id) => id !== requester.id);
      visibleTo = [requester.id, ...recipients];
    }

    // Krok 6.3d — `dicePayload` v DTO je primární signál „toto je hod
    // kostkou". Regex zůstává jako fallback pro legacy / kompatibilitu
    // (zprávy bez payloadu, např. ručně psané `Hod Kostkou`).
    const DICE_REGEX = /^(🎲\s*HOD\s+FATE:|Hod\s+Kostkou)/i;
    const isDiceRoll =
      !!dto.dicePayload ||
      (dto.content ? DICE_REGEX.test(dto.content.trim()) : false);

    const message = await this.messageRepo.save({
      channelId,
      worldId: channel.worldId,
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
      customFont,
      customFontSize,
      color,
      isDiceRoll,
      clientNonce: dto.clientNonce ?? null,
      mentions,
      // Krok 6.3d/e — strukturovaná data hodu + skin zafixovaný odesílatelem.
      dicePayload: dto.dicePayload ?? null,
      diceSkin: dto.diceSkin ?? null,
    });

    // Náhled poslední zprávy pro sidebar (krok 6.1b).
    const lastMessagePreview = message.content?.trim()
      ? message.content.trim().slice(0, 80)
      : (message.attachments?.length ?? 0) > 0
        ? '📎 Příloha'
        : '';
    await this.channelRepo.update(channelId, {
      lastMessageAt: message.createdAt,
      lastMessagePreview,
    });
    this.eventEmitter.emit('chat.message.created', {
      channelId,
      worldId: channel.worldId,
      message,
    });
    // Odesílatel si vlastní zprávu automaticky označuje jako přečtenou —
    // jinak by `countAfter(lastReadId)` v `getUnreadCounts` započítal vlastní
    // zprávy do unread countu pro samotného odesílatele (badge na vlastní
    // konverzaci po reloadu).
    await this.readRepo.upsert(requester.id, channelId, message.id);
    await this.broadcastUnreadUpdate(channel, requester.id);

    // Push notifikace — fire-and-forget. Discord-like: mentions mají prioritu
    // a omezují recipient set jen na zmíněné.
    void (async () => {
      try {
        let recipientIds: string[];
        if (message.visibleTo && message.visibleTo.length > 0) {
          // whisper: push jen příjemcům (bez odesílatele)
          recipientIds = message.visibleTo.filter((id) => id !== requester.id);
        } else if ((message.mentions ?? []).length > 0) {
          // 6.2i — mention-only push: kanálový push pošlou jen mentionovaným.
          recipientIds = (message.mentions ?? []).filter(
            (id) => id !== requester.id,
          );
        } else {
          recipientIds = await this.resolveChannelRecipients(
            channel,
            requester.id,
          );
        }
        if (recipientIds.length > 0) {
          await this.pushService.notifyUsers(recipientIds, {
            title: message.overrideName ?? message.senderName,
            body: (message.content ?? '').slice(0, 100),
          });
        }
      } catch {
        // push je best-effort
      }
    })();

    return message;
  }

  async toggleReaction(
    messageId: string,
    emoji: string,
    requester: RequestUser,
  ): Promise<ChatMessage> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });

    const channel = await this.channelRepo.findById(message.channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    if (!(await this.hasChannelAccess(channel, requester.id))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }

    const currentReactions = message.reactions[emoji] ?? [];
    const hasReacted = currentReactions.includes(requester.id);

    const updated = hasReacted
      ? await this.messageRepo.removeReaction(messageId, emoji, requester.id)
      : await this.messageRepo.addReaction(messageId, emoji, requester.id);

    if (!updated)
      throw new NotFoundException({
        code: 'CHAT_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    this.eventEmitter.emit('chat.message.updated', {
      channelId: message.channelId,
      message: updated,
    });
    return updated;
  }

  async editMessage(
    messageId: string,
    dto: UpdateMessageDto,
    requester: RequestUser,
  ): Promise<ChatMessage> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });

    // 6.2c — hody kostkou jsou auditovatelná data, needitovatelné.
    if (message.isDiceRoll) {
      throw new ForbiddenException({
        code: 'CHAT_DICE_NOT_EDITABLE',
        message: 'Hod kostkou nelze upravovat',
      });
    }

    const canEdit =
      message.senderId === requester.id ||
      (message.worldId &&
        (await this.canManageChat(requester, message.worldId)));
    if (!canEdit)
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });

    // Diff attachments
    let nextAttachments = message.attachments ?? [];
    const willMutateAttachments = !!(
      dto.attachmentsToAdd?.length || dto.attachmentsToRemove?.length
    );

    if (dto.attachmentsToRemove?.length) {
      const removeSet = new Set(dto.attachmentsToRemove);
      nextAttachments = nextAttachments.filter(
        (a) => !removeSet.has(a.publicId),
      );
    }
    if (dto.attachmentsToAdd?.length) {
      nextAttachments = [...nextAttachments, ...dto.attachmentsToAdd];
    }

    if (willMutateAttachments && nextAttachments.length > 10) {
      throw new BadRequestException({
        code: 'CHAT_MAX_ATTACHMENTS',
        message: 'Maximum 10 attachmentů na zprávu',
      });
    }

    // Sestavit patch — minimum 1 změna
    const patch: {
      content?: string;
      attachments?: typeof nextAttachments;
      isEdited: boolean;
    } = { isEdited: true };
    if (dto.content !== undefined) patch.content = dto.content;
    if (willMutateAttachments) patch.attachments = nextAttachments;

    if (patch.content === undefined && patch.attachments === undefined) {
      throw new BadRequestException({
        code: 'CHAT_NO_CHANGES',
        message: 'Nutné upravit alespoň jedno pole',
      });
    }

    const updated = await this.messageRepo.update(messageId, patch);
    if (!updated)
      throw new NotFoundException({
        code: 'CHAT_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    this.eventEmitter.emit('chat.message.updated', {
      channelId: message.channelId,
      message: updated,
    });
    return updated;
  }

  async deleteMessage(
    messageId: string,
    requester: RequestUser,
  ): Promise<{ message: string }> {
    const msg = await this.messageRepo.findById(messageId);
    if (!msg || msg.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });

    if (msg.isDiceRoll) {
      // Dice guard — kostky může mazat jen PJ/PomocnýPJ světa nebo globální Admin/Superadmin
      // canManageChat sám dělá Admin bypass pro non-null worldId; pro global chat (worldId=null)
      // ho dělám zvlášť přes role <= UserRole.Admin
      const allowed = msg.worldId
        ? await this.canManageChat(requester, msg.worldId)
        : requester.role <= UserRole.Admin;
      if (!allowed) {
        throw new ForbiddenException({
          code: 'CHAT_DICE_FORBIDDEN',
          message: 'Kostky může mazat jen PJ nebo Admin',
        });
      }
    } else {
      // Standardní ownership check pro běžné zprávy
      const canDelete =
        msg.senderId === requester.id ||
        (msg.worldId && (await this.canManageChat(requester, msg.worldId)));
      if (!canDelete)
        throw new ForbiddenException({
          code: 'CHAT_FORBIDDEN',
          message: 'Nedostatečná oprávnění',
        });
    }

    await this.messageRepo.update(messageId, {
      isDeleted: true,
      content: '*Zpráva byla smazána autorem*',
    });
    this.eventEmitter.emit('chat.message.deleted', {
      channelId: msg.channelId,
      messageId,
      attachments: msg.attachments,
    });
    return { message: 'Zpráva smazána' };
  }

  // ─── Read status ─────────────────────────────────────────────────────────

  async markAsRead(channelId: string, userId: string): Promise<void> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    if (!(await this.hasChannelAccess(channel, userId))) {
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    }
    const messages = await this.messageRepo.findByChannelId(channelId, {
      limit: 1,
    });
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    await this.readRepo.upsert(userId, channelId, lastMessage.id);
    this.eventEmitter.emit('chat.unread.updated', {
      userId,
      channelId,
      count: 0,
    });
  }

  async getUnreadCounts(
    worldId: string,
    userId: string,
  ): Promise<{ channelId: string; count: number; mentionCount: number }[]> {
    const [channels, membership] = await Promise.all([
      this.channelRepo.findByWorldId(worldId),
      this.membershipRepo.findByUserAndWorld(userId, worldId),
    ]);

    if (!membership || membership.role === WorldRole.Zadatel) return [];

    // Stejný access filtr jako `getGroupsWithChannels` (B1) — vč. role floor
    // `all` konverzací; nepočítat unread konverzace, kam uživatel nevidí.
    const accessibleChannels = channels.filter((c) =>
      this.hasAccessGivenMembership(c, userId, membership),
    );

    const channelIds = accessibleChannels.map((c) => c.id);
    const readStatuses = await this.readRepo.findByUserAndChannels(
      userId,
      channelIds,
    );
    const readMap = new Map(
      readStatuses.map((r) => [r.channelId, r.lastReadMessageId]),
    );

    // D-NEW-chat-mention-sidebar-dot (2026-05-21) — vrácí navíc `mentionCount`
    // pro červený dot v sidebaru u konverzace s @me. Bez last-read = 0.
    return Promise.all(
      accessibleChannels.map(async (channel) => {
        const lastReadId = readMap.get(channel.id);
        if (!lastReadId) {
          return { channelId: channel.id, count: 0, mentionCount: 0 };
        }
        const [count, mentionCount] = await Promise.all([
          this.messageRepo.countAfter(channel.id, lastReadId),
          this.messageRepo.countMentionsAfter(channel.id, lastReadId, userId),
        ]);
        return { channelId: channel.id, count, mentionCount };
      }),
    );
  }

  private async broadcastUnreadUpdate(
    channel: ChatChannel,
    senderId: string,
  ): Promise<void> {
    const memberships = await this.membershipRepo.findByWorldId(
      channel.worldId!,
    );
    for (const m of memberships) {
      if (m.userId === senderId) continue;
      if (m.role === WorldRole.Zadatel) continue;
      if (
        channel.accessMode === 'members' &&
        !channel.allowedMemberIds.includes(m.userId)
      )
        continue;
      if (
        channel.accessMode === 'roles' &&
        !channel.allowedRoles.includes(m.role)
      )
        continue;
      this.eventEmitter.emit('chat.unread.updated', {
        userId: m.userId,
        channelId: channel.id,
        count: -1,
      });
    }
  }

  // ─── Auto-zakládání kanálů (krok 6.1g) ────────────────────────────────────

  /** Výchozí kanály světa — Globální a PJ + Hráči. Idempotentní volá backfill. */
  private async seedDefaultGroups(worldId: string): Promise<void> {
    const globalGroup = await this.groupRepo.save({
      worldId,
      name: 'Globální',
      order: 0,
    });
    await this.channelRepo.save({
      groupId: globalGroup.id,
      worldId,
      name: 'globální',
      accessMode: 'all',
      allowedRoles: [],
      allowedMemberIds: [],
      order: 0,
      isDeleted: false,
      type: 'all',
    });
    const playersGroup = await this.groupRepo.save({
      worldId,
      name: 'Postavy',
      order: 1,
    });
    await this.channelRepo.save({
      groupId: playersGroup.id,
      worldId,
      name: 'hráči',
      accessMode: 'all',
      allowedRoles: [],
      allowedMemberIds: [],
      order: 0,
      isDeleted: false,
      type: 'all',
    });
  }

  /**
   * Vytvoří kanál + konverzaci pro světovou družinu (krok 6.1g). Konverzace je
   * `members` — přístup mají členové družiny a vedení (PomocnyPJ+).
   */
  private async createWorldGroupChannel(
    worldId: string,
    worldGroupName: string,
    order: number,
  ): Promise<void> {
    const members = await this.membershipRepo.findByWorldId(worldId);
    const allowedMemberIds = members
      .filter(
        (m) => m.group === worldGroupName || m.role >= WorldRole.PomocnyPJ,
      )
      .map((m) => m.userId);
    const group = await this.groupRepo.save({
      worldId,
      name: worldGroupName,
      order,
      linkedWorldGroup: worldGroupName,
    });
    const channel = await this.channelRepo.save({
      groupId: group.id,
      worldId,
      name: worldGroupName,
      accessMode: 'members',
      allowedRoles: [],
      allowedMemberIds,
      order: 0,
      isDeleted: false,
      type: 'all',
    });
    this.eventEmitter.emit('chat.group.created', { worldId, group });
    this.eventEmitter.emit('chat.channel.created', { worldId, channel });
  }

  /**
   * Dorovná chat kanály světa s jeho družinami (`settings.customGroups`) —
   * za každou družinu bez kanálu jeden založí. Družiny se neodebírají
   * (mazání kanálu je ruční — neničíme historii kvůli změně nastavení).
   */
  private async syncWorldGroupChannels(
    worldId: string,
    customGroups: string[],
  ): Promise<void> {
    const existing = await this.groupRepo.findByWorldId(worldId);
    const linked = new Set(
      existing.map((g) => g.linkedWorldGroup).filter((n): n is string => !!n),
    );
    let order = existing.length;
    for (const name of customGroups) {
      if (linked.has(name)) continue;
      await this.createWorldGroupChannel(worldId, name, order);
      linked.add(name);
      order += 1;
    }
  }

  /**
   * Zajistí, že svět má chat — výchozí kanály + kanály za jeho družiny.
   * Idempotentní. Volá ji lazy seed (`getGroupsWithChannels`) i boot backfill.
   */
  private async ensureWorldChat(worldId: string): Promise<void> {
    const groups = await this.groupRepo.findByWorldId(worldId);
    if (groups.length === 0) await this.seedDefaultGroups(worldId);
    const settings = await this.worldsService.getSettings(worldId);
    await this.syncWorldGroupChannels(worldId, settings?.customGroups ?? []);
  }

  /**
   * Backfill při startu BE (krok 6.1g) — všechny světy dostanou výchozí sadu
   * kanálů + kanály za družiny. Idempotentní; lazy seed v `getGroupsWithChannels`
   * tohle navíc dorovná i bez restartu BE.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const worlds = await this.worldsService.findAll();
      for (const world of worlds) {
        await this.ensureWorldChat(world.id);
      }
      this.logger.log(`Chat backfill dokončen (${worlds.length} světů)`);
    } catch (err) {
      this.logger.error('Chat backfill při startu selhal', err);
    }
  }

  // ─── World event listeners ────────────────────────────────────────────────

  @OnEvent('world.created')
  async handleWorldCreated(world: World): Promise<void> {
    try {
      await this.seedDefaultGroups(world.id);
    } catch (err) {
      this.logger.error(`handleWorldCreated failed for world ${world.id}`, err);
    }
  }

  /** Krok 6.1g — nová družina ve `customGroups` → nový chat kanál. */
  @OnEvent('world.settings.updated')
  async handleWorldSettingsUpdated(payload: {
    worldId: string;
    settings: WorldSettings;
  }): Promise<void> {
    try {
      await this.syncWorldGroupChannels(
        payload.worldId,
        payload.settings.customGroups ?? [],
      );
    } catch (err) {
      this.logger.error(
        `handleWorldSettingsUpdated failed for world ${payload.worldId}`,
        err,
      );
    }
  }

  /**
   * D-NEW-channel-group-sync (2026-05-21) — Při změně členství světa (přidělení
   * do družiny, změna group, odebrání) automaticky aktualizuje `allowedMemberIds`
   * u všech `linkedWorldGroup` konverzací typu `members`. Bez tohoto by PJ musel
   * dorovnávat ručně přes nastavení konverzace.
   */
  @OnEvent('world.membership.changed')
  async handleMembershipChangedSync(payload: {
    worldId: string;
    membership: WorldMembership;
  }): Promise<void> {
    try {
      await this.syncLinkedChannelMembers(
        payload.worldId,
        payload.membership.userId,
        payload.membership.group ?? null,
      );
    } catch (err) {
      this.logger.error(
        `handleMembershipChangedSync failed for user ${payload.membership.userId}`,
        err,
      );
    }
  }

  /** D-NEW-channel-group-sync — odebrání membera ze všech linked channels. */
  @OnEvent('world.membership.removed')
  async handleMembershipRemovedSync(payload: {
    worldId: string;
    userId?: string;
    membershipId: string;
  }): Promise<void> {
    if (!payload.userId) return;
    try {
      await this.syncLinkedChannelMembers(
        payload.worldId,
        payload.userId,
        null,
      );
    } catch (err) {
      this.logger.error(
        `handleMembershipRemovedSync failed for user ${payload.userId}`,
        err,
      );
    }
  }

  /**
   * Najde všechny linkedWorldGroup konverzace ve světě a updatuje
   * `allowedMemberIds` podle aktuální group člena:
   *   - linkedWorldGroup === currentGroup → přidat userId pokud chybí
   *   - linkedWorldGroup !== currentGroup → odebrat userId pokud tam je
   *
   * Jen pro `accessMode === 'members'` konverzace (jediné, které explicitní
   * allowlist používají).
   */
  private async syncLinkedChannelMembers(
    worldId: string,
    userId: string,
    currentGroup: string | null,
  ): Promise<void> {
    const groups = await this.groupRepo.findByWorldId(worldId);
    const linkedGroups = groups.filter((g) => g.linkedWorldGroup);
    for (const group of linkedGroups) {
      const channels = await this.channelRepo.findByGroupId(group.id);
      for (const channel of channels) {
        if (channel.accessMode !== 'members') continue;
        const shouldHave = group.linkedWorldGroup === currentGroup;
        const hasIt = channel.allowedMemberIds.includes(userId);
        if (shouldHave && !hasIt) {
          await this.channelRepo.update(channel.id, {
            allowedMemberIds: [...channel.allowedMemberIds, userId],
          });
        } else if (!shouldHave && hasIt) {
          await this.channelRepo.update(channel.id, {
            allowedMemberIds: channel.allowedMemberIds.filter(
              (id) => id !== userId,
            ),
          });
        }
      }
    }
  }

  async findChannelForUpload(
    channelId: string,
    userId: string,
  ): Promise<ChatChannel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted)
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    if (!(await this.hasChannelAccess(channel, userId)))
      throw new ForbiddenException({
        code: 'CHAT_FORBIDDEN',
        message: 'Nedostatečná oprávnění',
      });
    return channel;
  }

  @OnEvent('world.deleted')
  async handleWorldDeleted(payload: { worldId: string }): Promise<void> {
    try {
      await this.channelRepo.softDeleteByWorldId(payload.worldId);
      await this.messageRepo.softDeleteByWorldId(payload.worldId);
    } catch (err) {
      this.logger.error(
        `handleWorldDeleted failed for world ${payload.worldId}`,
        err,
      );
    }
  }

  // ─── System messages (weather broadcast, etc.) ────────────────────────────

  async createSystemMessage(
    channelId: string,
    worldId: string,
    content: string,
    senderName: string,
  ): Promise<void> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.worldId !== worldId) {
      throw new NotFoundException({
        code: 'CHAT_CHANNEL_NOT_FOUND',
        message: 'Kanál nenalezen',
      });
    }

    const message = await this.messageRepo.save({
      channelId,
      worldId,
      senderId: 'system',
      senderName: 'Systém',
      overrideName: senderName,
      content,
      isEdited: false,
      isDeleted: false,
      visibleTo: [],
      reactions: {},
      attachments: [],
    });
    this.eventEmitter.emit('chat.message.created', {
      channelId,
      worldId,
      message,
    });
  }

  // ─── 6.2f — per-svět vzhled mé zprávy ────────────────────────────────────

  async getMembershipAppearance(
    worldId: string,
    userId: string,
  ): Promise<{
    chatColor: string | null;
    chatFont: string | null;
    chatFontSize: string | null;
    diceSkinMapping: Record<string, string> | null;
    jailedDiceSkins: string[];
  }> {
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (!membership) {
      throw new ForbiddenException({
        code: 'CHAT_NOT_MEMBER',
        message: 'Nejste členem světa',
      });
    }
    return {
      chatColor: membership.chatColor ?? null,
      chatFont: membership.chatFont ?? null,
      chatFontSize: membership.chatFontSize ?? null,
      diceSkinMapping: membership.diceSkinMapping ?? null,
      jailedDiceSkins: membership.jailedDiceSkins ?? [],
    };
  }

  async updateMembershipAppearance(
    worldId: string,
    userId: string,
    dto: UpdateAppearanceDto,
  ): Promise<{
    chatColor: string | null;
    chatFont: string | null;
    chatFontSize: string | null;
    diceSkinMapping: Record<string, string> | null;
    jailedDiceSkins: string[];
  }> {
    const membership = await this.membershipRepo.findByUserAndWorld(
      userId,
      worldId,
    );
    if (!membership) {
      throw new ForbiddenException({
        code: 'CHAT_NOT_MEMBER',
        message: 'Nejste členem světa',
      });
    }
    const patch: Partial<typeof membership> = {};
    if (dto.chatColor !== undefined) patch.chatColor = dto.chatColor;
    if (dto.chatFont !== undefined) patch.chatFont = dto.chatFont;
    if (dto.chatFontSize !== undefined) patch.chatFontSize = dto.chatFontSize;
    if (dto.diceSkinMapping !== undefined)
      patch.diceSkinMapping = dto.diceSkinMapping;
    if (dto.jailedDiceSkins !== undefined)
      patch.jailedDiceSkins = dto.jailedDiceSkins;
    const updated = await this.membershipRepo.update(membership.id, patch);
    return {
      chatColor: updated?.chatColor ?? null,
      chatFont: updated?.chatFont ?? null,
      chatFontSize: updated?.chatFontSize ?? null,
      diceSkinMapping: updated?.diceSkinMapping ?? null,
      jailedDiceSkins: updated?.jailedDiceSkins ?? [],
    };
  }
}
