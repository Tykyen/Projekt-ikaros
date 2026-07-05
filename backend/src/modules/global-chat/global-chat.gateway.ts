import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { logWarn } from '../../common/logging/log-error.util';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import type { ChatAttachmentDto } from './dto/chat-attachment.dto';
import { UsersService } from '../users/users.service';
import {
  GlobalChatService,
  isRoomKey,
  CAMP_DEFAULT_GENRE,
  ROOM_KEYS,
  type RoomKey,
  type CampRoomKey,
} from './global-chat.service';
import type { SavedChatLine } from './schemas/camp-saved-game.schema';
import { presenceLine } from './presence-messages';

/** Presence záznam jednoho socketu — drží všechny místnosti, kde socket je. */
interface PresenceRecord {
  lastSeen: Date;
  username: string;
  userId: string;
  /** Avatar účtu — pro zobrazení v Hospodě. */
  avatarUrl?: string;
  /** Postava z profilu — pro zobrazení v Campu (§8). */
  characterName?: string;
  characterAvatarUrl?: string;
  /** Místnosti, ve kterých je socket přítomný (multi-room, 4.2d §1). */
  rooms: Set<RoomKey>;
}

/** Přítomný uživatel ve výpisu — účet i postava (FE si vybere dle místnosti). */
export interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  characterName?: string;
  characterAvatarUrl?: string;
}

/**
 * 17.6 — účastník hlasového hovoru (Voice krčma). Interní záznam s multi-tab
 * sockety: participant mizí až s posledním tabem téhož uživatele.
 */
interface VoiceParticipant {
  userId: string;
  username: string;
  avatarUrl?: string;
  muted: boolean;
  cam: boolean;
  sockets: Set<string>;
}

/** 17.6 — účastník hovoru ve výpisu pro FE (bez interních socketů). */
export interface VoiceParticipantView {
  userId: string;
  username: string;
  avatarUrl?: string;
  muted: boolean;
  cam: boolean;
}

/** Styl prostředí Campu. */
export type RoomStyle = 'fantasy' | 'scifi' | 'mystic';

/** Sdílené prostředí místnosti Camp — viz spec 4.2a §4.3. */
export interface RoomEnvironment {
  style: RoomStyle;
  placeId: string;
}

/**
 * Spec 16.6b — sdílený in-memory stav „Tady jste skončili". Vzniká při načtení
 * uložené hry (broadcast všem přítomným), mizí při dalším okně rotace (cron)
 * nebo dalším load. Nese jen zobrazitelný snímek — žádné PII navíc nad log.
 */
export interface StartHere {
  lines: SavedChatLine[];
  byUserName: string;
  at: Date;
}

// PC-13: WS CORS řeší CustomIoAdapter (server-level); dekorátorový cors byl mrtvý.
@WebSocketGateway({})
export class GlobalChatGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GlobalChatGateway.name);

  /** socketId → presence záznam (multi-room, 4.2d §1). */
  private readonly connectedUsers = new Map<string, PresenceRecord>();

  /** Sdílené prostředí jednotlivých Camp (in-memory, reset při restartu). */
  private readonly environments = new Map<RoomKey, RoomEnvironment>();

  /** 16.6b — sdílený „Tady jste skončili" per místnost (in-memory). */
  private readonly startHere = new Map<RoomKey, StartHere>();

  /**
   * 17.6 — kdo je v hlasovém hovoru (Voice krčma), room → userId → participant.
   * Odděleno od textové presence (connectedUsers): „být v místnosti" ≠ „být
   * v hovoru". In-memory, reset při restartu BE.
   */
  private readonly voicePresence = new Map<
    RoomKey,
    Map<string, VoiceParticipant>
  >();

  constructor(
    // 16.6 — cyklus service↔gateway (load hry) → forwardRef na obou stranách.
    @Inject(forwardRef(() => GlobalChatService))
    private readonly globalChatService: GlobalChatService,
    private readonly usersService: UsersService,
  ) {}

  getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  /** Počet přítomných pro každou místnost — pro REST i WS broadcast. */
  getRoomCounts(): Record<RoomKey, number> {
    const counts = {} as Record<RoomKey, number>;
    for (const room of ROOM_KEYS) {
      counts[room] = this.getPresence(room).length;
    }
    return counts;
  }

  /** Odbroadcastne počty přítomných všem socketům (i mimo místnost — pro nav). */
  private broadcastRoomCounts(): void {
    this.server.emit('chat:rooms:presence', this.getRoomCounts());
  }

  cleanupInactive(thresholdMs: number): number {
    const cutoff = new Date(Date.now() - thresholdMs);
    let removed = 0;
    for (const [socketId, info] of this.connectedUsers.entries()) {
      if (info.lastSeen < cutoff) {
        // Socket je sdílený celou aplikací (mail, online presence,
        // friendships) — NEodpojujeme ho. Jen odebereme z chat presence
        // a oznámíme odchod ze VŠECH jeho místností (server.to → i samotnému
        // odpojenému, aby FE poznal vlastní auto-odhlášení).
        this.connectedUsers.delete(socketId);
        for (const room of info.rooms) {
          const channelId = this.globalChatService.getChannelId(room);
          this.server.to(`chat:${channelId}`).emit('chat:presence', {
            userId: info.userId,
            username: info.username,
            action: 'leave',
            reason: 'timeout',
          });
          void this.globalChatService
            .saveSystemMessage(room, presenceLine(room, 'leave', info.username))
            .catch((err: unknown) =>
              logWarn(this.logger, 'saveSystemMessage (cleanup) selhal', err),
            );
        }
        removed++;
      }
    }
    if (removed > 0) this.broadcastRoomCounts();
    return removed;
  }

  /** Heartbeat z FE — udržuje uživatele „naživu" v presence (krok 4.2c §5). */
  @SubscribeMessage('chat:heartbeat')
  handleHeartbeat(@ConnectedSocket() client: Socket): void {
    const record = this.connectedUsers.get(client.id);
    if (record) record.lastSeen = new Date();
  }

  /**
   * Socket se odpojil (zavření okna, reload, ztráta sítě) — odebere ho ze
   * VŠECH místností. Bez toho by se z každého reloadu hromadily „duch"
   * záznamy a držely počty přítomných (4.2d revize). `reason: 'disconnect'`
   * → FE nezobrazí overlay auto-odhlášení (to je jen pro `'timeout'`).
   */
  handleDisconnect(client: Socket): void {
    // 17.6 — voice cleanup nezávisle na chat presence (socket může být v hovoru
    // i bez textové presence). Kopie klíčů kvůli mutaci mapy během iterace.
    for (const [room, roster] of [...this.voicePresence.entries()]) {
      for (const userId of [...roster.keys()]) {
        if (!roster.get(userId)?.sockets.has(client.id)) continue;
        if (this.removeVoiceParticipant(room, userId, client.id)) {
          this.broadcastVoiceRoster(room);
        }
      }
    }
    const record = this.connectedUsers.get(client.id);
    if (!record) return;
    this.connectedUsers.delete(client.id);
    for (const room of record.rooms) {
      const channelId = this.globalChatService.getChannelId(room);
      this.server.to(`chat:${channelId}`).emit('chat:presence', {
        userId: record.userId,
        username: record.username,
        action: 'leave',
        reason: 'disconnect',
      });
    }
    this.broadcastRoomCounts();
  }

  /** Pošle SVÉMU socketu seznam místností, kde reálně je (FE sebeodečet v nav). */
  private emitMyRooms(client: Socket, record: PresenceRecord): void {
    client.emit('chat:my-rooms', Array.from(record.rooms));
  }

  /** Seznam přítomných v dané místnosti — dedup dle userId (multi-tab). */
  getPresence(room: RoomKey): PresenceUser[] {
    const seen = new Set<string>();
    const result: PresenceUser[] = [];
    for (const rec of this.connectedUsers.values()) {
      if (!rec.rooms.has(room) || seen.has(rec.userId)) continue;
      seen.add(rec.userId);
      result.push({
        userId: rec.userId,
        username: rec.username,
        avatarUrl: rec.avatarUrl,
        characterName: rec.characterName,
        characterAvatarUrl: rec.characterAvatarUrl,
      });
    }
    return result;
  }

  /**
   * Aktuální prostředí místnosti; fallback = default žánr Campu (16.6a) +
   * lokace '1'. Po restartu BE (in-memory ztraceno) nejbližší okno rotace
   * srovná na náhodnou lokaci.
   */
  getEnvironment(room: RoomKey): RoomEnvironment {
    const stored = this.environments.get(room);
    if (stored) return stored;
    const style = CAMP_DEFAULT_GENRE[room as CampRoomKey] ?? 'fantasy';
    return { style, placeId: '1' };
  }

  /** Uloží prostředí a odbroadcastne ho všem v místnosti. Volá controller po REST změně. */
  setEnvironment(room: RoomKey, env: RoomEnvironment): RoomEnvironment {
    this.environments.set(room, env);
    const channelId = this.globalChatService.getChannelId(room);
    this.server
      .to(`chat:${channelId}`)
      .emit('chat:room:environment', { room, ...env });
    return env;
  }

  // ── „Tady jste skončili" + rotace scény (16.6) ─────────────────────────

  /** 16.6b — aktuální „Tady jste skončili" místnosti (nebo null). */
  getStartHere(room: RoomKey): StartHere | null {
    return this.startHere.get(room) ?? null;
  }

  /** 16.6b — nastaví „Tady jste skončili" a odbroadcastne všem v místnosti. */
  setStartHere(room: RoomKey, data: StartHere): StartHere {
    this.startHere.set(room, data);
    this.broadcastStartHere(room, data);
    return data;
  }

  /** 16.6b — smaže „Tady jste skončili" (rotace / nový load) + broadcast null. */
  clearStartHere(room: RoomKey): void {
    if (!this.startHere.delete(room)) return;
    this.broadcastStartHere(room, null);
  }

  private broadcastStartHere(room: RoomKey, data: StartHere | null): void {
    const channelId = this.globalChatService.getChannelId(room);
    this.server
      .to(`chat:${channelId}`)
      .emit('chat:room:startHere', { room, startHere: data });
  }

  /**
   * Spec 16.6a — rotace scény Campu (cron 12:00/00:00): default žánr (admin
   * override → fallback `CAMP_DEFAULT_GENRE`) + náhodná lokace + reset
   * „Tady jste skončili". Ruční staff/load override tím „dojede" do dalšího okna.
   */
  async applyRotation(room: CampRoomKey): Promise<void> {
    const style = await this.globalChatService.getRoomDefault(room);
    this.setEnvironment(room, {
      style,
      placeId: this.globalChatService.randomPlaceId(),
    });
    this.clearStartHere(room);
  }

  // ── Presence — Hospoda (krok 4.1) ──────────────────────────────────────
  @SubscribeMessage('chat:hospoda:join')
  handleHospodaJoin(
    @MessageBody() payload: { username: string; userId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    // W-10 — identita z OVĚŘENÉHO JWT handshake (`client.data.userId` nastavuje
    // ChatGateway na sdíleném socketu), NIKDY z payloadu. Jinak by klient mohl
    // poslat cizí `userId`, joinnout cizí `user:{id}` room a odposlouchávat
    // cizí privátní eventy (whispery, poštu, friend, transfery).
    const data = client.data as {
      userId?: string;
      isGuest?: boolean;
      anonName?: string;
    };
    if (!data.userId) return;
    // 15.8 — host: jméno anonym{N} z OVĚŘENÉHO tokenu, ne z payloadu (anti-spoof).
    const username = data.isGuest
      ? (data.anonName ?? payload.username)
      : payload.username;
    void this.registerPresence(
      client,
      'hospoda',
      username,
      data.userId,
      data.isGuest,
    );
  }

  @SubscribeMessage('chat:hospoda:leave')
  handleHospodaLeave(@ConnectedSocket() client: Socket): void {
    void this.unregisterPresence(client, 'hospoda');
  }

  // ── Presence — kanál-agnostické (Camp, krok 4.2a) ──────────────────
  @SubscribeMessage('chat:room:join')
  handleRoomJoin(
    @MessageBody()
    payload: { room: string; username: string; userId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!isRoomKey(payload.room)) return;
    // W-10 — viz handleHospodaJoin: userId z ověřeného JWT, ne z payloadu.
    const data = client.data as {
      userId?: string;
      isGuest?: boolean;
      anonName?: string;
    };
    if (!data.userId) return;
    // 15.8 — host smí jen Hospodu; join Camp ignorujeme.
    if (data.isGuest && payload.room !== 'hospoda') return;
    const username = data.isGuest
      ? (data.anonName ?? payload.username)
      : payload.username;
    void this.registerPresence(
      client,
      payload.room,
      username,
      data.userId,
      data.isGuest,
    );
  }

  @SubscribeMessage('chat:room:leave')
  handleRoomLeave(
    @MessageBody() payload: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!isRoomKey(payload.room)) return;
    void this.unregisterPresence(client, payload.room);
  }

  // ── Voice presence — kdo je v hlasovém hovoru (17.6, Voice krčma) ──────
  // Kdo je „na mikrofonu" + jeho mute/cam stav. Samotné audio/video řeší Jitsi
  // iframe (mimo náš server) — tady jen roster metadat. Klíč = userId,
  // multi-tab dedup přes Set socketů. Identita VŽDY z ověřeného JWT (W-10).
  @SubscribeMessage('voice:join')
  handleVoiceJoin(
    @MessageBody() payload: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!isRoomKey(payload.room)) return;
    const data = client.data as {
      userId?: string;
      isGuest?: boolean;
      anonName?: string;
    };
    if (!data.userId) return;
    // 15.8 — host smí do hovoru jen v Hospodě; Voice krčma i Camp = registrovaní.
    if (data.isGuest && payload.room !== 'hospoda') return;
    const rec = this.connectedUsers.get(client.id);
    const username = rec?.username ?? data.anonName ?? 'Neznámý';
    this.addVoiceParticipant(
      payload.room,
      data.userId,
      username,
      rec?.avatarUrl,
      client.id,
    );
    this.broadcastVoiceRoster(payload.room);
  }

  @SubscribeMessage('voice:leave')
  handleVoiceLeave(
    @MessageBody() payload: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!isRoomKey(payload.room)) return;
    const data = client.data as { userId?: string };
    if (!data.userId) return;
    if (this.removeVoiceParticipant(payload.room, data.userId, client.id)) {
      this.broadcastVoiceRoster(payload.room);
    }
  }

  @SubscribeMessage('voice:state')
  handleVoiceState(
    @MessageBody() payload: { room: string; muted?: boolean; cam?: boolean },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!isRoomKey(payload.room)) return;
    const data = client.data as { userId?: string };
    if (!data.userId) return;
    const participant = this.voicePresence.get(payload.room)?.get(data.userId);
    if (!participant) return;
    participant.muted = !!payload.muted;
    participant.cam = !!payload.cam;
    const channelId = this.globalChatService.getChannelId(payload.room);
    this.server.to(`chat:${channelId}`).emit('chat:voice:state', {
      room: payload.room,
      userId: data.userId,
      muted: participant.muted,
      cam: participant.cam,
    });
  }

  /** Roster hovoru pro FE (bez interních socketů). */
  getVoiceRoster(room: RoomKey): VoiceParticipantView[] {
    const roster = this.voicePresence.get(room);
    if (!roster) return [];
    return Array.from(roster.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
      avatarUrl: p.avatarUrl,
      muted: p.muted,
      cam: p.cam,
    }));
  }

  private addVoiceParticipant(
    room: RoomKey,
    userId: string,
    username: string,
    avatarUrl: string | undefined,
    socketId: string,
  ): void {
    let roster = this.voicePresence.get(room);
    if (!roster) {
      roster = new Map();
      this.voicePresence.set(room, roster);
    }
    const existing = roster.get(userId);
    if (existing) {
      existing.sockets.add(socketId);
      return;
    }
    roster.set(userId, {
      userId,
      username,
      avatarUrl,
      muted: false,
      cam: false,
      sockets: new Set([socketId]),
    });
  }

  /**
   * Odebere socket; participanta smaže až s posledním tabem téhož uživatele.
   * Vrací true jen při skutečném odchodu (pak volající broadcastne roster).
   */
  private removeVoiceParticipant(
    room: RoomKey,
    userId: string,
    socketId: string,
  ): boolean {
    const roster = this.voicePresence.get(room);
    const participant = roster?.get(userId);
    if (!roster || !participant) return false;
    participant.sockets.delete(socketId);
    if (participant.sockets.size > 0) return false;
    roster.delete(userId);
    if (roster.size === 0) this.voicePresence.delete(room);
    return true;
  }

  private broadcastVoiceRoster(room: RoomKey): void {
    const channelId = this.globalChatService.getChannelId(room);
    this.server
      .to(`chat:${channelId}`)
      .emit('chat:voice:presence', { room, roster: this.getVoiceRoster(room) });
  }

  /**
   * Přidá socket do místnosti (4.2d §1 — multi-room). Při prvním joinu
   * socketu dotáhne z profilu data postavy (pro zobrazení v Campu, §8).
   */
  private async registerPresence(
    client: Socket,
    room: RoomKey,
    username: string,
    userId: string,
    isGuest?: boolean,
  ): Promise<void> {
    // Záznam vytvoříme a uložíme SYNCHRONNĚ (před `await`) — jinak by dva
    // rychlé joiny téhož socketu oba viděly `undefined` a přepsaly se.
    let record = this.connectedUsers.get(client.id);
    const isNew = !record;
    if (!record) {
      record = {
        lastSeen: new Date(),
        username,
        userId,
        rooms: new Set<RoomKey>(),
      };
      this.connectedUsers.set(client.id, record);
    }
    // Re-join (socket už v té místnosti je) → žádná nová hláška „vchází"
    // ani presence broadcast; jen obnovíme lastSeen (4.2d — překlik stránek
    // není nový příchod).
    const alreadyInRoom = record.rooms.has(room);
    record.rooms.add(room);
    record.lastSeen = new Date();
    void client.join(`user:${userId}`);
    // Autoritativní „ve kterých místnostech tento socket je" → FE odečítá sebe
    // z počtů dle reality BE, ne z efemérního klientského stavu (jinak
    // přetrvávající členství v Putyce po navigaci vypadá jako cizí přítomnost).
    this.emitMyRooms(client, record);

    // Data profilu (avatar účtu + postava) dotáhneme jen při prvním joinu
    // socketu. 15.8 — host (anonym) nemá DB účet → žádný lookup, bez avataru.
    if (isNew && !isGuest) {
      try {
        const profile = await this.usersService.findById(userId);
        record.avatarUrl = profile.avatarUrl;
        record.characterName = profile.characterName;
        record.characterAvatarUrl = profile.characterAvatarUrl;
      } catch (err: unknown) {
        logWarn(this.logger, `Profil (userId=${userId}) nenačten`, err);
      }
    }

    this.broadcastRoomCounts();
    if (alreadyInRoom) return;

    const channelId = this.globalChatService.getChannelId(room);
    // server.to → hlášku dostane i joiner sám (4.2d §3).
    this.server.to(`chat:${channelId}`).emit('chat:presence', {
      userId,
      username,
      avatarUrl: record.avatarUrl,
      characterName: record.characterName,
      characterAvatarUrl: record.characterAvatarUrl,
      action: 'join',
    });
    // 16.6b — nový příchozí dostane aktuální „Tady jste skončili" (jen jemu,
    // ne re-broadcast celé místnosti), ať ví, kde parta skončila.
    const startHere = this.startHere.get(room);
    if (startHere) {
      client.emit('chat:room:startHere', { room, startHere });
    }
    void this.globalChatService
      .saveSystemMessage(room, presenceLine(room, 'join', username))
      .catch((err: unknown) =>
        logWarn(this.logger, 'saveSystemMessage (join) selhal', err),
      );
  }

  /** Odebere socket z jedné místnosti; prázdný záznam smaže (4.2d §1). */
  private async unregisterPresence(
    client: Socket,
    room: RoomKey,
  ): Promise<void> {
    const record = this.connectedUsers.get(client.id);
    if (!record || !record.rooms.has(room)) return;
    record.rooms.delete(room);
    this.emitMyRooms(client, record);
    if (record.rooms.size === 0) this.connectedUsers.delete(client.id);
    const channelId = this.globalChatService.getChannelId(room);
    this.server.to(`chat:${channelId}`).emit('chat:presence', {
      userId: record.userId,
      username: record.username,
      action: 'leave',
      reason: 'explicit',
    });
    this.broadcastRoomCounts();
    // Hlášku „opouští" pošleme JEŠTĚ než socket opustí WS kanál — jinak by
    // ji odcházející na své stránce neviděl. `saveSystemMessage` emituje
    // `chat:message` synchronně přes event emitter, takže `await` stačí.
    try {
      await this.globalChatService.saveSystemMessage(
        room,
        presenceLine(room, 'leave', record.username),
      );
    } catch (err: unknown) {
      logWarn(this.logger, 'saveSystemMessage (leave) selhal', err);
    }
    // Až teď socket odebereme z WS kanálu (leave z navigace neposílá
    // `room:leave`, takže channel uklidíme tady).
    void client.leave(`chat:${channelId}`);
  }

  @SubscribeMessage('ikaros:whisper')
  handleWhisper(
    @MessageBody()
    payload: {
      toUserId: string;
      content?: string;
      color?: string;
      room?: string;
      replyToId?: string;
      attachments?: ChatAttachmentDto[];
    },
    @ConnectedSocket() client: Socket,
  ): void {
    const sender = this.connectedUsers.get(client.id);
    // Whisper smí mít prázdný text, má-li přílohu (4.3b) — prázdnost
    // s přílohami řeší `GlobalChatService.assertNotEmpty`.
    const hasAttachments = (payload.attachments?.length ?? 0) > 0;
    if (!sender || !payload.toUserId || (!payload.content && !hasAttachments))
      return;
    // Whisper se uloží do kanálu, který FE udá; fallback = první místnost
    // socketu (FE `room` v praxi vždy posílá).
    const room: RoomKey = isRoomKey(payload.room)
      ? payload.room
      : ([...sender.rooms][0] ?? 'hospoda');
    void this.globalChatService
      .sendWhisper(
        room,
        { id: sender.userId, username: sender.username },
        payload.toUserId,
        payload.content ?? '',
        payload.color,
        payload.replyToId,
        payload.attachments,
      )
      .catch((err: unknown) =>
        logWarn(
          this.logger,
          `sendWhisper selhal (from=${sender.userId} to=${payload.toUserId})`,
          err,
        ),
      );
  }

  /**
   * Přepnutí emoji reakce na zprávě (krok 4.3a). Service ověří viditelnost
   * (whisper) a stav zprávy; broadcast řeší `chat.global.message.reaction`.
   */
  @SubscribeMessage('chat:reaction:toggle')
  handleReaction(
    @MessageBody()
    payload: { room?: string; messageId?: string; emoji?: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const sender = this.connectedUsers.get(client.id);
    if (!sender || !payload.messageId || !payload.emoji) return;
    if (typeof payload.emoji !== 'string' || payload.emoji.length > 16) return;
    const room: RoomKey = isRoomKey(payload.room)
      ? payload.room
      : ([...sender.rooms][0] ?? 'hospoda');
    void this.globalChatService
      .toggleReaction(room, payload.messageId, sender.userId, payload.emoji)
      .catch((err: unknown) =>
        logWarn(
          this.logger,
          `toggleReaction selhal (user=${sender.userId} msg=${payload.messageId})`,
          err,
        ),
      );
  }

  @OnEvent('chat.global.message.created')
  handleGlobalMessageCreated(payload: {
    channelId: string;
    message: ChatMessage;
  }): void {
    if (payload.message.visibleTo && payload.message.visibleTo.length > 0) {
      for (const userId of payload.message.visibleTo) {
        this.server.to(`user:${userId}`).emit('chat:message', payload.message);
      }
    } else {
      this.server
        .to(`chat:${payload.channelId}`)
        .emit('chat:message', payload.message);
    }
  }

  @OnEvent('chat.global.message.deleted')
  handleGlobalMessageDeleted(payload: {
    channelId: string;
    messageId: string;
  }): void {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message:deleted', {
      messageId: payload.messageId,
      channelId: payload.channelId,
    });
  }

  /**
   * Změna reakcí zprávy → `chat:message:reaction`. Veřejná zpráva jde celé
   * místnosti, whisper jen účastníkům (`visibleTo`) — stejný scope jako
   * `chat.global.message.created` (krok 4.3a).
   */
  @OnEvent('chat.global.message.reaction')
  handleGlobalMessageReaction(payload: {
    channelId: string;
    messageId: string;
    reactions: Record<string, string[]>;
    visibleTo: string[];
  }): void {
    const event = {
      messageId: payload.messageId,
      channelId: payload.channelId,
      reactions: payload.reactions,
    };
    if (payload.visibleTo.length > 0) {
      for (const userId of payload.visibleTo) {
        this.server.to(`user:${userId}`).emit('chat:message:reaction', event);
      }
    } else {
      this.server
        .to(`chat:${payload.channelId}`)
        .emit('chat:message:reaction', event);
    }
  }

  /** Pro testy / diagnostiku — povolené místnosti. */
  static get rooms(): RoomKey[] {
    return ROOM_KEYS;
  }
}
