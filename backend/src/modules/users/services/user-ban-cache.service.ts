import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { IUsersRepository } from '../interfaces/users-repository.interface';

export interface BanState {
  bannedAt: Date;
  bannedUntil?: Date;
  banReason?: string;
}

const REDIS_INVALIDATE_CHANNEL = 'user-ban-invalidate';

/**
 * D-028 — Lokální in-memory cache + Redis pub/sub invalidation pro multi-instance.
 *
 * Hot path (`get`/`set`/`invalidate`) zůstává synchronní pro nulovou latency
 * v request handleru. Set/invalidate publikuje na Redis channel, kterému
 * naslouchají všechny BE instance — udržuje konzistenci napříč clusterem.
 *
 * Pokud Redis není dostupný (dev bez `docker compose up`), service funguje
 * jako čistá in-memory cache (graceful degradation, log warning).
 *
 * Volání:
 *   - `set(userId, ban)` při ban admin akci (SP4)
 *   - `invalidate(userId)` při unban / reset hesla (D-037 reaktivace, AuthService.resetPasswordByToken)
 *   - `get(userId)` z AuthService.login (SP4) pro rychlý reject
 */
@Injectable()
export class UserBanCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserBanCacheService.name);
  private readonly cache = new Map<string, BanState>();
  private redisSubscriber: Redis | null = null;

  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
  ) {}

  /**
   * Uvolní dedicated subscriber spojení při shutdownu (app.close / hot-reload /
   * e2e teardown) — jinak ioredis socket zůstane otevřený (висící handle, jest
   * nedoběhne; v prod leak při restartu modulu).
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.redisSubscriber?.quit();
    } catch {
      /* už odpojeno / nikdy nepřipojeno */
    }
  }

  async onModuleInit(): Promise<void> {
    // Duplicate connection pro subscribe (ioredis vyžaduje dedicated subscriber).
    try {
      this.redisSubscriber = this.redis.duplicate();
      // Dedicated subscriber NEdědí 'error' listener z původního klienta (duplicate
      // kopíruje jen options). Bez něj unhandled 'error' event při selhání spojení
      // SHODÍ celý proces (Node abort, SIGABRT) — typicky v dev/e2e bez živého Redisu.
      this.redisSubscriber.on('error', (err) => {
        this.logger.warn(`Redis subscriber error: ${err.message}`);
      });
      await this.redisSubscriber.subscribe(REDIS_INVALIDATE_CHANNEL);
      this.redisSubscriber.on('message', (channel, message) => {
        if (channel === REDIS_INVALIDATE_CHANNEL) {
          // Cross-instance invalidate — smaž lokální cache entry.
          this.cache.delete(message);
        }
      });
    } catch (err) {
      this.logger.warn(
        `Redis subscribe failed (D-028 cluster sync disabled): ${(err as Error).message}`,
      );
    }
  }

  get(userId: string): BanState | null {
    const ban = this.cache.get(userId);
    if (!ban) return null;
    if (ban.bannedUntil && ban.bannedUntil.getTime() < Date.now()) {
      this.cache.delete(userId);
      return null;
    }
    return ban;
  }

  set(userId: string, ban: BanState): void {
    this.cache.set(userId, ban);
    // Publish na Redis aby ostatní instance invalidovali svou kopii
    // (jejich příští `get` přijde s plnými daty z DB).
    void this.publishInvalidate(userId);
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
    void this.publishInvalidate(userId);
  }

  size(): number {
    return this.cache.size;
  }

  /**
   * FIX-A (WS reconnect-gate, 2026-07) — jediný entry point pro „musí být
   * socket odmítnut" (banned NEBO hard-deleted). Cache-first (`get()`, sync,
   * nulová latency pro opakované connecty stejného banned usera); na miss
   * dotáhne DB a cachuje jen POZITIVNÍ (banned) nález — shodné se stávající
   * `set`/`get` sémantikou (pozitivní cache, viz D-028). „Not banned" se
   * nekešuje — connecty jsou řádově vzácnější než requesty, DB dotaz při
   * miss je přijatelný (stejný trade-off jako `JwtAuthGuard`).
   *
   * Fail-open při DB výpadku — WS handshake nesmí spadnout kvůli dočasné
   * nedostupnosti Monga (stejná konvence jako `PresenceGateway.handleConnection`
   * hiddenPresence fallback).
   */
  async isBlocked(userId: string): Promise<boolean> {
    if (this.get(userId)) return true;
    let user: Awaited<ReturnType<IUsersRepository['findById']>>;
    try {
      user = await this.usersRepo.findById(userId);
    } catch (err) {
      this.logger.warn(
        `isBlocked DB fallback selhal pro ${userId}: ${(err as Error).message}`,
      );
      return false;
    }
    if (!user || user.isDeleted) return true;
    if (user.bannedAt) {
      this.set(userId, {
        bannedAt: user.bannedAt,
        bannedUntil: user.bannedUntil,
        banReason: user.banReason,
      });
      return true;
    }
    return false;
  }

  private async publishInvalidate(userId: string): Promise<void> {
    try {
      await this.redis.publish(REDIS_INVALIDATE_CHANNEL, userId);
    } catch (err) {
      this.logger.warn(
        `Redis publish failed for ${userId}: ${(err as Error).message}`,
      );
    }
  }
}
