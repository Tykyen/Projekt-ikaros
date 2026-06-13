import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type Redis from 'ioredis';

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

  constructor(@Inject('REDIS') private readonly redis: Redis) {}

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
