import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { Inject } from '@nestjs/common';
import type { WeatherResult } from '../world-weather/interfaces/weather-generator.interface';
import type { IMapsRepository } from './interfaces/maps-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

interface AuthedSocketData {
  user?: { id: string; role: UserRole };
}

type AuthedSocket = Socket & { data: AuthedSocketData };

/**
 * 10.2-prep-1 — kompletní přepracování:
 *
 * 1. **JWT auth middleware** — handleConnection validuje token z handshake;
 *    bez něj socket nemá `data.user` a všechny operace selžou. Bug-B z §19.1
 *    fixed.
 * 2. **`map:join`** validuje, že user je member daného světa (přes
 *    `IWorldMembershipRepository`); jinak `error` event.
 * 3. **`map:join-world`** nový handler pro PJ orchestrator panel (PJ-only).
 *    Klient join room `world:{worldId}` → dostává `world:operation` eventy.
 * 4. **Emit helpery** pro `map:operation`, `world:operation`, `map:member-*`,
 *    `map:reassigned`. Volány z `MapOperationsService.apply` a
 *    `WorldOperationsService.apply` po úspěšné DB commit.
 * 5. **Legacy `map:token-moved` etc. handlery** zachovány (paralelní emit pro
 *    přechodové období FE klientů). FE 10.2 je nebude používat.
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class MapsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @Inject('IMapsRepository')
    private readonly mapsRepo: IMapsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  /**
   * 10.2-prep-1 — JWT validation při connection handshake.
   *
   * Bez tokenu → `data.user` zůstane undefined, všechny emit handlery odmítnou.
   * S validním → `data.user = {id, role}` + join `user:{id}` room pro
   * private `map:reassigned` emit.
   */
  handleConnection(client: AuthedSocket): void {
    try {
      const auth = client.handshake.auth as { token?: string } | undefined;
      const token = auth?.token;
      if (!token) {
        client.emit('error', {
          code: 'WS_UNAUTHORIZED',
          message: 'Missing token',
        });
        return;
      }
      const payload = this.jwtService.verify<{
        sub?: string;
        role?: UserRole;
      }>(token);
      if (!payload?.sub) {
        client.emit('error', {
          code: 'WS_UNAUTHORIZED',
          message: 'Invalid token payload',
        });
        return;
      }
      const data = client.data as AuthedSocketData;
      data.user = {
        id: payload.sub,
        role: payload.role ?? UserRole.Hrac,
      };
      void client.join(`user:${payload.sub}`);
    } catch {
      client.emit('error', {
        code: 'WS_UNAUTHORIZED',
        message: 'Token verification failed',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Subscribe handlers — `map:join` / `map:join-world` / legacy relays
  // ───────────────────────────────────────────────────────────────────────

  @SubscribeMessage('map:join')
  async handleJoin(
    @MessageBody() sceneId: string,
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<void> {
    if (!this.requireAuth(client)) return;
    // Validate scene existuje + user je member jejího worldu (kromě Sa/Admin).
    const scene = await this.mapsRepo.findById(sceneId);
    if (!scene) {
      client.emit('error', {
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
      return;
    }
    const data = client.data as AuthedSocketData;
    if (data.user!.role > UserRole.Admin) {
      const membership = await this.membershipRepo.findByUserAndWorld(
        data.user!.id,
        scene.worldId,
      );
      if (!membership) {
        client.emit('error', {
          code: 'MAP_FORBIDDEN',
          message: 'Nejsi member tohoto světa',
        });
        return;
      }
    }
    void client.join(sceneId);
  }

  @SubscribeMessage('map:leave')
  handleLeave(
    @MessageBody() sceneId: string,
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    void client.leave(sceneId);
  }

  /**
   * 10.2-prep-1 — PJ orchestrator join room `world:{worldId}`.
   * Dostává `world:operation` (member.* eventy) + zachovaný `weather:updated`.
   */
  @SubscribeMessage('map:join-world')
  async handleJoinWorld(
    @MessageBody() worldId: string,
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<void> {
    if (!this.requireAuth(client)) return;
    const data = client.data as AuthedSocketData;
    if (data.user!.role > UserRole.Admin) {
      const membership = await this.membershipRepo.findByUserAndWorld(
        data.user!.id,
        worldId,
      );
      if (!membership || membership.role < WorldRole.PJ) {
        client.emit('error', {
          code: 'MAP_FORBIDDEN',
          message: 'Cross-scene log je dostupný jen PJ',
        });
        return;
      }
    }
    void client.join(`world:${worldId}`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Legacy subscribe handlers — paralelně emit pro starý klient.
  // Po stabilizaci 10.2 release → remove.
  // ───────────────────────────────────────────────────────────────────────

  @SubscribeMessage('map:token-moved')
  handleTokenMoved(
    @MessageBody() payload: { sceneId: string; token: unknown },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(payload.sceneId).emit('map:token-moved', payload.token);
  }

  @SubscribeMessage('map:config-updated')
  handleConfigUpdated(
    @MessageBody() payload: { sceneId: string; config: unknown },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(payload.sceneId).emit('map:config-updated', payload.config);
  }

  @SubscribeMessage('map:token-removed')
  handleTokenRemoved(
    @MessageBody() payload: { sceneId: string; tokenId: string },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(payload.sceneId).emit('map:token-removed', payload.tokenId);
  }

  @SubscribeMessage('map:reload-scene')
  handleReloadScene(
    @MessageBody() payload: { sceneId: string; scene: unknown },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(payload.sceneId).emit('map:scene-reloaded', payload.scene);
  }

  @SubscribeMessage('map:scene-cleared')
  handleSceneCleared(
    @MessageBody() sceneId: string,
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(sceneId).emit('map:scene-cleared');
  }

  @SubscribeMessage('map:ping')
  handlePing(
    @MessageBody()
    payload: { sceneId: string; x: number; y: number; userName: string },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client
      .to(payload.sceneId)
      .emit('map:pinged', payload.x, payload.y, payload.userName);
  }

  /**
   * 10.2f-3 — spotlight („ukazováček" PJ z iniciativní lišty). Ephemeral,
   * NEní v operation logu. PJ-only (>= PomocnyPJ / Sa / Admin). Broadcast
   * `map:spotlight` všem na scéně kromě odesílatele (ten si highlight nastaví
   * lokálně). Hráči tak vidí, který token (bestii) PJ ukazuje.
   */
  @SubscribeMessage('map:spotlight')
  async handleSpotlight(
    @MessageBody() payload: { sceneId: string; tokenId: string },
    @ConnectedSocket() client: AuthedSocket,
  ): Promise<void> {
    if (!this.requireAuth(client)) return;
    const data = client.data as AuthedSocketData;
    if (data.user!.role > UserRole.Admin) {
      const scene = await this.mapsRepo.findById(payload.sceneId);
      if (!scene) return;
      const membership = await this.membershipRepo.findByUserAndWorld(
        data.user!.id,
        scene.worldId,
      );
      if (!membership || membership.role < WorldRole.PomocnyPJ) {
        client.emit('error', {
          code: 'MAP_FORBIDDEN',
          message: 'Spotlight může spustit jen PJ',
        });
        return;
      }
    }
    client
      .to(payload.sceneId)
      .emit('map:spotlight', { tokenId: payload.tokenId });
  }

  @SubscribeMessage('map:effect-added')
  handleEffectAdded(
    @MessageBody() payload: { sceneId: string; effect: unknown },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(payload.sceneId).emit('map:effect-added', payload.effect);
  }

  @SubscribeMessage('map:effect-removed')
  handleEffectRemoved(
    @MessageBody() payload: { sceneId: string; effectId: string },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(payload.sceneId).emit('map:effect-removed', payload.effectId);
  }

  @SubscribeMessage('map:fog-updated')
  handleFogUpdated(
    @MessageBody()
    payload: { sceneId: string; fogEnabled: boolean; revealedHexes: unknown[] },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client
      .to(payload.sceneId)
      .emit('map:fog-updated', payload.fogEnabled, payload.revealedHexes);
  }

  @SubscribeMessage('map:dice-rolled')
  handleDiceRolled(
    @MessageBody() payload: { sceneId: string; [key: string]: unknown },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    const { sceneId, ...rest } = payload;
    this.server.to(sceneId).emit('map:dice-rolled', rest);
  }

  @SubscribeMessage('map:scene-state-changed')
  handleSceneStateChanged(
    @MessageBody()
    payload: { sceneId: string; isHidden: boolean; isLocked: boolean },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client
      .to(payload.sceneId)
      .emit('map:scene-state-changed', payload.isHidden, payload.isLocked);
  }

  @SubscribeMessage('map:sound-changed')
  handleSoundChanged(
    @MessageBody() payload: { sceneId: string; soundIds: string[] },
    @ConnectedSocket() client: AuthedSocket,
  ): void {
    if (!this.requireAuth(client)) return;
    client.to(payload.sceneId).emit('map:sound-changed', payload.soundIds);
  }

  @OnEvent('weather.updated')
  handleWeatherUpdated(payload: {
    worldId: string;
    // 10.2i — `null` u clear (PJ vypnul počasí na mapě).
    generatorId: string | null;
    generatorName: string | null;
    weather: WeatherResult | null;
    activeMapWeather?: null;
  }): void {
    this.server.to(`world:${payload.worldId}`).emit('weather:updated', payload);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 10.2-prep-1 — emit helpery volané z services po DB commit
  // ───────────────────────────────────────────────────────────────────────

  /** Broadcast `map:operation` na room sceneId. */
  emitMapOperation(
    sceneId: string,
    payload: {
      sceneId: string;
      seqNumber: number;
      op: unknown;
      byUserId: string;
      appliedAt: Date;
    },
  ): void {
    this.server.to(sceneId).emit('map:operation', payload);
  }

  /** Broadcast `world:operation` na room world:{worldId} (PJ orchestrator). */
  emitWorldOperation(
    worldId: string,
    payload: {
      worldId: string;
      seqNumber: number;
      op: unknown;
      byUserId: string;
      appliedAt: Date;
      cascadeMapOpIds: string[];
    },
  ): void {
    this.server.to(`world:${worldId}`).emit('world:operation', payload);
  }

  /** Broadcast `map:member-joined` na novou scénu (PJ orchestrator vizualizace). */
  emitMemberJoined(
    sceneId: string,
    userId: string,
    characterName: string,
  ): void {
    this.server
      .to(sceneId)
      .emit('map:member-joined', { sceneId, userId, characterName });
  }

  /** Broadcast `map:member-left` na starou scénu. */
  emitMemberLeft(sceneId: string, userId: string): void {
    this.server.to(sceneId).emit('map:member-left', { sceneId, userId });
  }

  /**
   * Private emit `map:reassigned` na konkrétního usera (přes `user:{userId}`
   * room, do které socket joinuje v handleConnection).
   *
   * `newSceneId === null` znamená graceful unassign (user opustil scénu,
   * žádná nová není).
   */
  emitReassigned(userId: string, newSceneId: string | null): void {
    this.server.to(`user:${userId}`).emit('map:reassigned', { newSceneId });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Common guard pro subscribe handlery — pokud socket nemá `data.user`
   * (failed auth v handleConnection), pošle error event a vrátí false.
   */
  private requireAuth(client: AuthedSocket): boolean {
    const data = client.data as AuthedSocketData;
    if (!data.user) {
      client.emit('error', {
        code: 'WS_UNAUTHORIZED',
        message: 'Neauthentikovaný socket',
      });
      return false;
    }
    return true;
  }
}
