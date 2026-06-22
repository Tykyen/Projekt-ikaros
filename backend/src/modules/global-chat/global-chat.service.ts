import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  OnModuleInit,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { logWarn } from '../../common/logging/log-error.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IChatChannelRepository } from '../chat/interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import type { ChatAttachment } from '../chat/interfaces/chat-attachment.interface';
import type { RequestUser } from '../worlds/worlds.service';
import type { CreateGlobalMessageDto } from './dto/create-global-message.dto';
import type { ChatAttachmentDto } from './dto/chat-attachment.dto';
import { PushService } from '../push/push.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import { AnonBanService } from './anon-ban.service';
import { HOUR_MS } from '../../common/constants/time.constants';

/** Klíč globální chat místnosti — Hospoda + tři Rozcestí (krok 4.2a). */
export type RoomKey = 'hospoda' | 'rozcesti-1' | 'rozcesti-2' | 'rozcesti-3';

/** Pořadí a názvy globálních kanálů. `type` v `chatchannels` = RoomKey. */
const ROOM_DEFS: { key: RoomKey; name: string }[] = [
  { key: 'hospoda', name: 'Interdimenzionální hospoda' },
  { key: 'rozcesti-1', name: 'Rozcestí I.' },
  { key: 'rozcesti-2', name: 'Rozcestí II.' },
  { key: 'rozcesti-3', name: 'Rozcestí III.' },
];

export const ROOM_KEYS: RoomKey[] = ROOM_DEFS.map((r) => r.key);

export function isRoomKey(value: unknown): value is RoomKey {
  return typeof value === 'string' && ROOM_KEYS.includes(value as RoomKey);
}

@Injectable()
export class GlobalChatService implements OnModuleInit {
  private static readonly MESSAGE_TTL_MS = HOUR_MS;
  /** Limit příloh na zprávu — zvlášť pro obrázky a dokumenty (spec 4.3b). */
  private static readonly MAX_IMAGE_ATTACHMENTS = 10;
  private static readonly MAX_DOC_ATTACHMENTS = 4;
  private readonly logger = new Logger(GlobalChatService.name);
  /** RoomKey → channelId v `chatchannels`. */
  private readonly channels = new Map<RoomKey, string>();

  // 15.8 — rate-limit psaní hosta, JEN guest, per anon-id (in-memory; member
  // píše bez limitu). In-memory stačí na anti-flood; nepřežije restart /
  // multi-instance (vědomý kompromis MVP). `anonId → timestampy zpráv`.
  private static readonly ANON_RATE_LIMIT = 10; // zpráv / okno
  private static readonly ANON_RATE_WINDOW_MS = 60_000; // 1 min
  private readonly anonRate = new Map<string, number[]>();

  /** 15.8 — vyhodí 429, když host překročí ANON_RATE_LIMIT zpráv za okno. */
  private assertAnonRate(anonId: string): void {
    const now = Date.now();
    const recent = (this.anonRate.get(anonId) ?? []).filter(
      (t) => now - t < GlobalChatService.ANON_RATE_WINDOW_MS,
    );
    if (recent.length >= GlobalChatService.ANON_RATE_LIMIT) {
      throw new HttpException(
        { code: 'ANON_RATE_LIMIT', message: 'Příliš mnoho zpráv. Zpomal.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.anonRate.set(anonId, recent);
  }

  constructor(
    @Inject('IChatChannelRepository')
    private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository')
    private readonly messageRepo: IChatMessageRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly pushService: PushService,
    private readonly uploadService: UploadService,
    private readonly usersService: UsersService,
    private readonly anonBan: AnonBanService,
  ) {}

  /**
   * Identita autora zprávy (4.2e §1) — snapshot v okamžiku odeslání. Hospoda
   * vystupuje účtem, Rozcestí postavou z profilu (fallback účet, když postavu
   * nevyplnil). Zdroj je autoritativní profil z DB — klient nic neposílá, aby
   * nemohl lhát o cizí identitě. Snapshot (ne render-time): roleplay zpráva si
   * natrvalo pamatuje, za koho byla psána, i když autor postavu později změní.
   */
  private async resolveSenderIdentity(
    room: RoomKey,
    userId: string,
    username: string,
    isGuest?: boolean,
  ): Promise<{ senderName: string; senderAvatarUrl?: string }> {
    // 15.8 — host (anonym): žádný DB profil, jen jméno anonym{N} a bez avataru.
    if (isGuest) {
      return { senderName: username, senderAvatarUrl: undefined };
    }
    let avatarUrl: string | undefined;
    let characterName: string | undefined;
    let characterAvatarUrl: string | undefined;
    try {
      const profile = await this.usersService.findById(userId);
      avatarUrl = profile.avatarUrl;
      characterName = profile.characterName;
      characterAvatarUrl = profile.characterAvatarUrl;
    } catch (err: unknown) {
      // Profil nenačten → padáme na účet/iniciálu, zprávu kvůli avataru neztratíme.
      logWarn(
        this.logger,
        `Identita odesílatele (userId=${userId}) nenačtena`,
        err,
      );
    }
    if (room === 'hospoda') {
      return { senderName: username, senderAvatarUrl: avatarUrl };
    }
    return {
      senderName: characterName || username,
      senderAvatarUrl: characterAvatarUrl || avatarUrl,
    };
  }

  /**
   * Ověří přílohy zprávy (krok 4.3b). Klient posílá v DTO celý `ChatAttachment`
   * objekt — BE proto nevěří `url` a potvrdí, že příloha pochází z našeho
   * uploadu: doména Cloudinary účtu + folder `global-chat/`. Hlídá i počet
   * (max 10 obrázků, 4 dokumenty). Nevyhovující vstup → `BadRequestException`.
   */
  private validateAttachments(
    attachments?: ChatAttachmentDto[],
  ): ChatAttachment[] {
    if (!attachments || attachments.length === 0) return [];
    const base = this.uploadService.getCloudinaryBaseUrl();
    let images = 0;
    let docs = 0;
    for (const att of attachments) {
      const validType = att.type === 'image' || att.type === 'document';
      if (
        !validType ||
        !att.url.startsWith(base) ||
        !att.publicId.startsWith('global-chat/')
      ) {
        throw new BadRequestException({
          code: 'GLOBAL_CHAT_INVALID_ATTACHMENT',
          message:
            'Neplatná příloha — soubor musí být nahrán přes upload chatu',
        });
      }
      if (att.type === 'image') images++;
      else docs++;
    }
    if (
      images > GlobalChatService.MAX_IMAGE_ATTACHMENTS ||
      docs > GlobalChatService.MAX_DOC_ATTACHMENTS
    ) {
      throw new BadRequestException({
        code: 'GLOBAL_CHAT_TOO_MANY_ATTACHMENTS',
        message: 'Příliš mnoho příloh (max 10 obrázků a 4 dokumenty)',
      });
    }
    return attachments;
  }

  async onModuleInit(): Promise<void> {
    for (const { key, name } of ROOM_DEFS) {
      let channel = await this.channelRepo.findGlobalByType(key);

      // Zpětná kompatibilita: Hospoda mohla vzniknout dřív s type 'all'
      // (krok 4.1). Najdeme ji přes findGlobal() a doplníme type.
      if (!channel && key === 'hospoda') {
        const legacy = await this.channelRepo.findGlobal();
        if (legacy) {
          channel =
            (await this.channelRepo.update(legacy.id, { type: key })) ?? legacy;
        }
      }

      if (!channel) {
        channel = await this.channelRepo.save({
          name,
          worldId: null,
          groupId: null,
          isGlobal: true,
          accessMode: 'all',
          allowedRoles: [],
          allowedMemberIds: [],
          order: 0,
          isDeleted: false,
          type: key,
        });
      }

      this.channels.set(key, channel.id);
    }
  }

  /** channelId všech globálních místností — pro úklidové joby. */
  getAllChannelIds(): string[] {
    return Array.from(this.channels.values());
  }

  /** channelId dané místnosti; vyhodí 404 pro neznámý `room`. */
  getChannelId(room: RoomKey): string {
    const id = this.channels.get(room);
    if (!id) {
      throw new InternalServerErrorException(
        `Global channel '${room}' not initialized`,
      );
    }
    return id;
  }

  async getMessages(
    room: RoomKey,
    userId: string,
    opts: { before?: string; limit?: number },
  ): Promise<ChatMessage[]> {
    const channelId = this.getChannelId(room);
    const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : 50, 100);
    const messages = await this.messageRepo.findByChannelId(channelId, {
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

  /**
   * Ověří cílovou zprávu reply a vrátí pole `replyTo*` k uložení (krok 4.3a).
   * Tichý fallback (`{}`) když cíl chybí / je v jiném kanálu / smazaný /
   * systémový — cíl mohl expirovat za 1 h TTL, reply degraduje na běžnou zprávu.
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
   * Zpráva musí mít neprázdný text NEBO aspoň jednu přílohu (spec 4.3b).
   * Volá se po `validateAttachments`.
   */
  private assertNotEmpty(
    content: string | undefined,
    attachments: ChatAttachment[],
  ): void {
    if (!content?.trim() && attachments.length === 0) {
      throw new BadRequestException({
        code: 'GLOBAL_CHAT_EMPTY_MESSAGE',
        message: 'Zpráva musí mít text nebo přílohu',
      });
    }
  }

  async sendMessage(
    room: RoomKey,
    dto: CreateGlobalMessageDto,
    user: RequestUser,
  ): Promise<ChatMessage> {
    // 15.8 — zabanovaný host neprojde (ban váže na anon-id z guest tokenu).
    if (user.isGuest && (await this.anonBan.isBanned(user.id))) {
      throw new ForbiddenException({
        code: 'ANON_BANNED',
        message: 'Host (anonym) byl v Hospodě zablokován.',
      });
    }
    // 15.8 — anti-flood: jen host, per anon-id (člen píše bez limitu).
    if (user.isGuest) {
      this.assertAnonRate(user.id);
    }
    const channelId = this.getChannelId(room);
    const attachments = this.validateAttachments(dto.attachments);
    this.assertNotEmpty(dto.content, attachments);
    const reply = await this.resolveReply(channelId, dto.replyToId);
    const identity = await this.resolveSenderIdentity(
      room,
      user.id,
      user.username,
      user.isGuest,
    );
    const message = await this.messageRepo.save({
      channelId,
      worldId: null,
      senderId: user.id,
      senderName: identity.senderName,
      senderAvatarUrl: identity.senderAvatarUrl,
      isAnonymous: user.isGuest ?? false,
      content: dto.content ?? null,
      color: dto.color ?? null,
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments,
      visibleTo: dto.visibleTo ?? [],
      ...reply,
      expiresAt: new Date(Date.now() + GlobalChatService.MESSAGE_TTL_MS),
    });

    this.eventEmitter.emit('chat.global.message.created', {
      channelId,
      message,
    });

    // fire-and-forget push — nečekáme na výsledek
    void this.pushService
      .notifyAll({
        title: user.username,
        body:
          (dto.content ?? '').slice(0, 100) ||
          (attachments.length > 0 ? '📎 Příloha' : ''),
      })
      .catch((err: unknown) =>
        logWarn(this.logger, 'notifyAll selhal pro global message', err),
      );

    return message;
  }

  async sendWhisper(
    room: RoomKey,
    from: { id: string; username: string },
    toUserId: string,
    content: string,
    color?: string,
    replyToId?: string,
    attachmentsDto?: ChatAttachmentDto[],
  ): Promise<ChatMessage> {
    const channelId = this.getChannelId(room);
    const attachments = this.validateAttachments(attachmentsDto);
    this.assertNotEmpty(content, attachments);
    const reply = await this.resolveReply(channelId, replyToId);
    const identity = await this.resolveSenderIdentity(
      room,
      from.id,
      from.username,
    );
    const message = await this.messageRepo.save({
      channelId,
      worldId: null,
      senderId: from.id,
      senderName: identity.senderName,
      senderAvatarUrl: identity.senderAvatarUrl,
      content: content || null,
      color: color ?? null,
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments,
      visibleTo: [from.id, toUserId],
      ...reply,
      expiresAt: new Date(Date.now() + GlobalChatService.MESSAGE_TTL_MS),
    });
    this.eventEmitter.emit('chat.global.message.created', {
      channelId,
      message,
    });
    return message;
  }

  /**
   * Uloží systémovou zprávu (příchod/odchod uživatele) do kanálu místnosti
   * a odbroadcastne ji jako `chat:message` (krok 4.2d §2). TTL stejný jako
   * běžné zprávy — hláška vydrží v historii hodinu.
   */
  async saveSystemMessage(room: RoomKey, text: string): Promise<ChatMessage> {
    const channelId = this.getChannelId(room);
    const message = await this.messageRepo.save({
      channelId,
      worldId: null,
      senderId: 'system',
      // senderName nesmí být prázdný — schema má `required: true` a prázdný
      // string projde jako chybějící hodnota (FE u `isSystem` jméno nezobrazuje).
      senderName: 'system',
      content: text,
      color: null,
      isEdited: false,
      isDeleted: false,
      isSystem: true,
      reactions: {},
      attachments: [],
      visibleTo: [],
      expiresAt: new Date(Date.now() + GlobalChatService.MESSAGE_TTL_MS),
    });
    this.eventEmitter.emit('chat.global.message.created', {
      channelId,
      message,
    });
    return message;
  }

  // Auth enforced by AdminGuard at controller level
  async deleteMessage(room: RoomKey, messageId: string): Promise<void> {
    const channelId = this.getChannelId(room);
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.channelId !== channelId) {
      throw new NotFoundException({
        code: 'GLOBAL_CHAT_MESSAGE_NOT_FOUND',
        message: 'Zpráva nenalezena',
      });
    }
    await this.messageRepo.update(messageId, {
      isDeleted: true,
      content: null,
      attachments: [],
    });
    // `attachments` v eventu → `UploadService` smaže Cloudinary assety (4.3b).
    this.eventEmitter.emit('chat.global.message.deleted', {
      channelId,
      messageId,
      attachments: message.attachments ?? [],
    });
  }

  /**
   * Přepne emoji reakci uživatele na zprávě (krok 4.3a). Reaguje-li uživatel
   * podruhé stejným emoji, reakce se odebere; vyprázdněný emoji se z objektu
   * smaže. U whisperu smí reagovat jen účastník (`visibleTo`). Po uložení
   * emituje `chat.global.message.reaction` — gateway ho odbroadcastne.
   */
  async toggleReaction(
    room: RoomKey,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    const channelId = this.getChannelId(room);
    const message = await this.messageRepo.findById(messageId);
    if (
      !message ||
      message.channelId !== channelId ||
      message.isDeleted ||
      message.isSystem
    ) {
      return;
    }
    // Reagovat na whisper smí jen ten, komu je viditelný.
    const visibleTo = message.visibleTo ?? [];
    if (visibleTo.length > 0 && !visibleTo.includes(userId)) return;

    const reactions: Record<string, string[]> = { ...message.reactions };
    const current = reactions[emoji] ?? [];
    if (current.includes(userId)) {
      const next = current.filter((id) => id !== userId);
      if (next.length > 0) reactions[emoji] = next;
      else delete reactions[emoji];
    } else {
      reactions[emoji] = [...current, userId];
    }

    await this.messageRepo.update(messageId, { reactions });
    this.eventEmitter.emit('chat.global.message.reaction', {
      channelId,
      messageId,
      reactions,
      visibleTo,
    });
  }
}
