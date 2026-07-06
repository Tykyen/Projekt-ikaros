import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  OnModuleInit,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { logWarn } from '../../common/logging/log-error.util';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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
import { GlobalChatGateway, type RoomStyle } from './global-chat.gateway';
import {
  CampSavedGameSchemaClass,
  type CampSavedGameDocument,
  type SavedChatLine,
} from './schemas/camp-saved-game.schema';
import {
  CampRoomConfigSchemaClass,
  type CampRoomConfigDocument,
} from './schemas/camp-room-config.schema';

/** Klíč globální chat místnosti — Hospoda + tři Camp (krok 4.2a) + Voice krčma (17.6). */
export type RoomKey =
  | 'hospoda'
  | 'camp-1'
  | 'camp-2'
  | 'camp-3'
  | 'voice-krcma';

/** Camp klíče se zamčeným default žánrem (Hospoda vynechána, spec 16.6a). */
export type CampRoomKey = 'camp-1' | 'camp-2' | 'camp-3';

/** Pořadí a názvy globálních kanálů. `type` v `chatchannels` = RoomKey. */
const ROOM_DEFS: { key: RoomKey; name: string }[] = [
  { key: 'hospoda', name: 'Interdimenzionální hospoda' },
  // 16.6 rename: „Camp I./II./III." → název = žánr Campu.
  { key: 'camp-1', name: 'Fantasy camp' },
  { key: 'camp-2', name: 'Mystery camp' },
  { key: 'camp-3', name: 'Sci-fi camp' },
  // 17.6 — Voice krčma: globální hlasová místnost (Jitsi), jen registrovaní. Není Camp.
  { key: 'voice-krcma', name: 'Voice krčma' },
];

export const ROOM_KEYS: RoomKey[] = ROOM_DEFS.map((r) => r.key);

/** Camp místnosti se zamčeným žánrem (spec 16.6a). */
export const CAMP_ROOM_KEYS: CampRoomKey[] = ['camp-1', 'camp-2', 'camp-3'];

/**
 * Spec 16.6a — default žánr per Camp (jediný zdroj pravdy na BE; FE zrcadlí).
 * Admin smí přepsat perzistentně (`CampRoomConfig`), tady je fallback konstanta.
 */
export const CAMP_DEFAULT_GENRE: Record<CampRoomKey, RoomStyle> = {
  'camp-1': 'fantasy',
  'camp-2': 'mystic',
  'camp-3': 'scifi',
};

export function isRoomKey(value: unknown): value is RoomKey {
  return typeof value === 'string' && ROOM_KEYS.includes(value as RoomKey);
}

export function isCampRoomKey(value: unknown): value is CampRoomKey {
  return value === 'camp-1' || value === 'camp-2' || value === 'camp-3';
}

/**
 * Spec 16.6a — název Campu odvozený z aktuálního žánru (zrcadlo `ROOM_DEFS`).
 * Hlavička místnosti se řídí *aktuálním* žánrem (staff override → přepne se).
 */
export function genreLabel(style: RoomStyle): string {
  switch (style) {
    case 'fantasy':
      return 'Fantasy camp';
    case 'mystic':
      return 'Mystery camp';
    case 'scifi':
      return 'Sci-fi camp';
  }
}

/**
 * Spec 16.6b — zobrazitelný pohled na uloženou hru (API kontrakt pro FE).
 * `savedAt`/`createdAt` serializují do ISO stringu. Bez `_id`/`__v`.
 */
export interface CampSavedGameView {
  room: RoomKey;
  style: RoomStyle;
  placeId: string;
  messages: SavedChatLine[];
  savedAt: Date;
}

@Injectable()
export class GlobalChatService implements OnModuleInit {
  private static readonly MESSAGE_TTL_MS = HOUR_MS;
  /** Limit příloh na zprávu — zvlášť pro obrázky a dokumenty (spec 4.3b). */
  private static readonly MAX_IMAGE_ATTACHMENTS = 10;
  private static readonly MAX_DOC_ATTACHMENTS = 4;
  /** Spec 16.6b — počet veřejných zpráv ve snímku uložené hry (kotva). */
  private static readonly SAVED_GAME_LINES = 20;
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
    // 16.6b — uložené hry (1 slot/hráč) + admin default žánru Campu.
    @InjectModel(CampSavedGameSchemaClass.name)
    private readonly savedGameModel: Model<CampSavedGameDocument>,
    @InjectModel(CampRoomConfigSchemaClass.name)
    private readonly roomConfigModel: Model<CampRoomConfigDocument>,
    // 16.6 — load hry mění sdílené in-memory prostředí + startHere na gateway.
    // Cyklus service↔gateway → forwardRef na obou stranách.
    @Inject(forwardRef(() => GlobalChatGateway))
    private readonly gateway: GlobalChatGateway,
  ) {}

  /**
   * Identita autora zprávy (4.2e §1) — snapshot v okamžiku odeslání. Hospoda
   * vystupuje účtem, Camp postavou z profilu (fallback účet, když postavu
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
    // Hospoda i Voice krčma (17.6) = globální pokec pod účtem (ne postavou).
    if (room === 'hospoda' || room === 'voice-krcma') {
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

      // Rename Rozcestí→Camp: dřívější kanály měly type 'rozcesti-N'. Najdeme je
      // podle starého typu a přeznačíme na 'camp-N' — zachová channelId
      // (a tím i běžící zprávy s 1h TTL) místo osiření + založení duplikátu.
      if (!channel && key.startsWith('camp-')) {
        const legacyType = key.replace('camp-', 'rozcesti-');
        const legacy = await this.channelRepo.findGlobalByType(legacyType);
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

      // 16.6 rename — sladit název existujícího kanálu s aktuálním ROOM_DEFS,
      // ať v DB nezůstane starý „Camp I." (prosakoval by do souhrnů chatů).
      if (channel.name !== name) {
        const renamed = await this.channelRepo.update(channel.id, { name });
        if (renamed) channel = renamed;
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
    replyToId: string | undefined,
    callerId: string,
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
    // FIX-38 — stejná viditelnost jako `getMessages`: whisper cíl smí
    // „přeposlat" jen účastník / autor, jinak by šlo cizí šepot prosáknout
    // do veřejné zprávy přes `replyToPreview`/`replyToSenderName`.
    const visibleTo = target.visibleTo ?? [];
    if (
      visibleTo.length > 0 &&
      !visibleTo.includes(callerId) &&
      target.senderId !== callerId
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
    const reply = await this.resolveReply(channelId, dto.replyToId, user.id);
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
      // FIX-37 — `visibleTo` NENÍ v `CreateGlobalMessageDto` (klient by si tak
      // mohl vyrobit whisper-ekvivalent bez omezení na 2 účastníky a bez
      // anon-ban/rate-limit z `sendWhisper`). Veřejná zpráva vždy `[]`.
      visibleTo: [],
      ...reply,
      expiresAt: new Date(Date.now() + GlobalChatService.MESSAGE_TTL_MS),
    });

    this.eventEmitter.emit('chat.global.message.created', {
      channelId,
      message,
    });

    // 15.9 — push JEN z Hospody, a to opt-in (kategorie `hospoda`, default VYP).
    // Camp push negeneruje vůbec (dřív sdílená notifyAll spamovala všechny
    // i ze zpráv z Campu). fire-and-forget — nečekáme na výsledek.
    if (room === 'hospoda') {
      void this.pushService
        .notifyAll(
          {
            title: user.username,
            body:
              (dto.content ?? '').slice(0, 100) ||
              (attachments.length > 0 ? '📎 Příloha' : ''),
          },
          'hospoda',
        )
        .catch((err: unknown) =>
          logWarn(this.logger, 'notifyAll selhal pro global message', err),
        );
    }

    return message;
  }

  async sendWhisper(
    room: RoomKey,
    from: { id: string; username: string; isGuest?: boolean },
    toUserId: string,
    content: string,
    color?: string,
    replyToId?: string,
    attachmentsDto?: ChatAttachmentDto[],
  ): Promise<ChatMessage> {
    // FIX-36 — mirror `sendMessage`: bez tohoto zabanovaný/flooding host
    // obchází anon-ban i rate-limit cestou přes whisper.
    if (from.isGuest && (await this.anonBan.isBanned(from.id))) {
      throw new ForbiddenException({
        code: 'ANON_BANNED',
        message: 'Host (anonym) byl v Hospodě zablokován.',
      });
    }
    if (from.isGuest) {
      this.assertAnonRate(from.id);
    }
    const channelId = this.getChannelId(room);
    const attachments = this.validateAttachments(attachmentsDto);
    this.assertNotEmpty(content, attachments);
    const reply = await this.resolveReply(channelId, replyToId, from.id);
    const identity = await this.resolveSenderIdentity(
      room,
      from.id,
      from.username,
      from.isGuest,
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

  // ── Camp 16.6 — rotace scény, uložení/načtení hry ──────────────────────

  /** Spec 16.6a — náhodné ID lokace '1'..'20' (rotace scény). */
  randomPlaceId(): string {
    return String(Math.floor(Math.random() * 20) + 1);
  }

  /** Save/load/default jen pro Camp; Hospoda scénu nemá → 400. */
  private assertCampRoom(room: RoomKey): asserts room is CampRoomKey {
    if (!isCampRoomKey(room)) {
      throw new BadRequestException({
        code: 'CAMP_ROOM_ONLY',
        message: 'Tuhle akci lze provést jen v Campu.',
      });
    }
  }

  /**
   * Spec 16.6a — efektivní default žánr Campu: admin override z DB, jinak
   * fallback konstanta `CAMP_DEFAULT_GENRE`. Čte cron rotace i gateway.
   */
  async getRoomDefault(room: CampRoomKey): Promise<RoomStyle> {
    const cfg = await this.roomConfigModel.findOne({ room }).lean().exec();
    return (cfg?.style as RoomStyle | undefined) ?? CAMP_DEFAULT_GENRE[room];
  }

  /** Spec 16.6a — efektivní defaulty všech Campů (GET rooms/defaults). */
  async getRoomDefaults(): Promise<Record<CampRoomKey, RoomStyle>> {
    const configs = await this.roomConfigModel.find().lean().exec();
    const overrides = new Map(
      configs.map((c) => [c.room, c.style as RoomStyle]),
    );
    const result = {} as Record<CampRoomKey, RoomStyle>;
    for (const room of CAMP_ROOM_KEYS) {
      result[room] = overrides.get(room) ?? CAMP_DEFAULT_GENRE[room];
    }
    return result;
  }

  /**
   * Spec 16.6a — admin přepíše default žánr Campu (perzistentní, upsert dle
   * room). Rotace ho respektuje od dalšího okna. Vrací nové efektivní defaulty.
   */
  async setRoomDefault(
    room: RoomKey,
    style: RoomStyle,
  ): Promise<Record<CampRoomKey, RoomStyle>> {
    this.assertCampRoom(room);
    await this.roomConfigModel
      .updateOne({ room }, { $set: { room, style } }, { upsert: true })
      .exec();
    return this.getRoomDefaults();
  }

  /** Snímek doc → zobrazitelný pohled (bez `_id`/`__v`). */
  private toSavedGameView(doc: CampSavedGameDocument): CampSavedGameView {
    return {
      room: doc.room as RoomKey,
      style: doc.style as RoomStyle,
      placeId: doc.placeId,
      messages: doc.messages.map((l) => ({
        senderName: l.senderName,
        content: l.content,
        color: l.color ?? null,
        createdAt: l.createdAt,
      })),
      savedAt: doc.savedAt,
    };
  }

  /**
   * Spec 16.6b — uloží „hru" hráče: snímek scény (z gateway env) + posledních
   * ~20 VEŘEJNÝCH zpráv (bez systémových a bez whisperů). Upsert dle `userId`
   * → 1 slot (druhé uložení přepíše). Načítáme širší okno a teprve pak filtr,
   * ať kotvu tvoří skutečné zprávy, ne join/leave hlášky.
   */
  async saveGame(userId: string, room: RoomKey): Promise<CampSavedGameView> {
    this.assertCampRoom(room);
    const env = this.gateway.getEnvironment(room);
    const recent = await this.getMessages(room, userId, { limit: 100 });
    const messages: SavedChatLine[] = recent
      .filter((m) => !m.isSystem && (!m.visibleTo || m.visibleTo.length === 0))
      .slice(-GlobalChatService.SAVED_GAME_LINES)
      .map((m) => ({
        senderName: m.senderName,
        content: m.content ?? '',
        color: m.color ?? null,
        createdAt: m.createdAt,
      }));
    const doc = await this.savedGameModel
      .findOneAndUpdate(
        { userId },
        {
          $set: {
            room,
            style: env.style,
            placeId: env.placeId,
            messages,
            savedAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!doc) {
      throw new InternalServerErrorException('Uložení hry selhalo');
    }
    return this.toSavedGameView(doc);
  }

  /** Spec 16.6b — uložená hra hráče, nebo `null` (žádný slot). */
  async getSavedGame(userId: string): Promise<CampSavedGameView | null> {
    const doc = await this.savedGameModel.findOne({ userId }).exec();
    return doc ? this.toSavedGameView(doc) : null;
  }

  /**
   * Spec 16.6b — načte hráčovu uloženou hru: přepne sdílené prostředí místnosti
   * na uložené (styl+lokace, dočasný override do dalšího okna rotace) a
   * publikuje `startHere` snímek všem přítomným (WS `chat:room:startHere`).
   * Hráč smí načíst JEN svůj slot → není to obcházení staff gate.
   */
  async loadGame(userId: string, username: string): Promise<CampSavedGameView> {
    const doc = await this.savedGameModel.findOne({ userId }).exec();
    if (!doc) {
      throw new NotFoundException({
        code: 'CAMP_SAVED_GAME_NOT_FOUND',
        message: 'Nemáš uloženou žádnou hru.',
      });
    }
    const view = this.toSavedGameView(doc);
    const room = view.room;
    this.gateway.setEnvironment(room, {
      style: view.style,
      placeId: view.placeId,
    });
    // Kdo hru načetl — v Campu jméno postavy (fallback účet), jako u zpráv.
    const identity = await this.resolveSenderIdentity(room, userId, username);
    this.gateway.setStartHere(room, {
      lines: view.messages,
      byUserName: identity.senderName,
      at: new Date(),
    });
    return view;
  }

  /** Spec 16.6b — smaže hráčův slot (idempotentní). */
  async deleteSavedGame(userId: string): Promise<void> {
    await this.savedGameModel.deleteOne({ userId }).exec();
  }

  /**
   * FIX-34 (GDPR) — hard-delete účtu uklidí i uloženou hru Campu (keyed
   * userId, jinak orphan záznam přežije anonymizaci uživatele). Konzistentní
   * s trusted-devices / world-elevations cleanupem stejného eventu.
   */
  @OnEvent('user.deletion.hardDeleted')
  async handleAccountHardDeleted(payload: { userId: string }): Promise<void> {
    await this.savedGameModel.deleteOne({ userId: payload.userId }).exec();
  }
}
