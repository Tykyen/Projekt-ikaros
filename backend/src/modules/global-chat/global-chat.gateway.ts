import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import type { ChatAttachmentDto } from './dto/chat-attachment.dto';
import { UsersService } from '../users/users.service';
import {
  GlobalChatService,
  isRoomKey,
  ROOM_KEYS,
  type RoomKey,
} from './global-chat.service';
import { presenceLine } from './presence-messages';

/** Presence záznam jednoho socketu — drží všechny místnosti, kde socket je. */
interface PresenceRecord {
  lastSeen: Date;
  username: string;
  userId: string;
  /** Avatar účtu — pro zobrazení v Hospodě. */
  avatarUrl?: string;
  /** Postava z profilu — pro zobrazení v Rozcestí (§8). */
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

/** Styl prostředí Rozcestí. */
export type RoomStyle = 'fantasy' | 'scifi' | 'mystic';

/** Sdílené prostředí místnosti Rozcestí — viz spec 4.2a §4.3. */
export interface RoomEnvironment {
  style: RoomStyle;
  placeId: string;
}

const DEFAULT_ENVIRONMENT: RoomEnvironment = {
  style: 'fantasy',
  placeId: '1',
};

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class GlobalChatGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GlobalChatGateway.name);

  /** socketId → presence záznam (multi-room, 4.2d §1). */
  private readonly connectedUsers = new Map<string, PresenceRecord>();

  /** Sdílené prostředí jednotlivých Rozcestí (in-memory, reset při restartu). */
  private readonly environments = new Map<RoomKey, RoomEnvironment>();

  constructor(
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
              this.logger.warn('saveSystemMessage (cleanup) selhal', err),
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

  /** Aktuální prostředí místnosti; default fantasy/1. */
  getEnvironment(room: RoomKey): RoomEnvironment {
    return this.environments.get(room) ?? { ...DEFAULT_ENVIRONMENT };
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

  // ── Presence — Hospoda (krok 4.1) ──────────────────────────────────────
  @SubscribeMessage('chat:hospoda:join')
  handleHospodaJoin(
    @MessageBody() payload: { username: string; userId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    void this.registerPresence(
      client,
      'hospoda',
      payload.username,
      payload.userId,
    );
  }

  @SubscribeMessage('chat:hospoda:leave')
  handleHospodaLeave(@ConnectedSocket() client: Socket): void {
    void this.unregisterPresence(client, 'hospoda');
  }

  // ── Presence — kanál-agnostické (Rozcestí, krok 4.2a) ──────────────────
  @SubscribeMessage('chat:room:join')
  handleRoomJoin(
    @MessageBody()
    payload: { room: string; username: string; userId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!isRoomKey(payload.room)) return;
    void this.registerPresence(
      client,
      payload.room,
      payload.username,
      payload.userId,
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

  /**
   * Přidá socket do místnosti (4.2d §1 — multi-room). Při prvním joinu
   * socketu dotáhne z profilu data postavy (pro zobrazení v Rozcestí, §8).
   */
  private async registerPresence(
    client: Socket,
    room: RoomKey,
    username: string,
    userId: string,
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

    // Data profilu (avatar účtu + postava) dotáhneme jen při prvním joinu socketu.
    if (isNew) {
      try {
        const profile = await this.usersService.findById(userId);
        record.avatarUrl = profile.avatarUrl;
        record.characterName = profile.characterName;
        record.characterAvatarUrl = profile.characterAvatarUrl;
      } catch (err: unknown) {
        this.logger.warn(`Profil (userId=${userId}) nenačten`, err);
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
    void this.globalChatService
      .saveSystemMessage(room, presenceLine(room, 'join', username))
      .catch((err: unknown) =>
        this.logger.warn('saveSystemMessage (join) selhal', err),
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
      this.logger.warn('saveSystemMessage (leave) selhal', err);
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
        this.logger.warn(
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
        this.logger.warn(
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
