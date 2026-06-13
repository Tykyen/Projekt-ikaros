import { Global, Module, Inject, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * D-028 + D-051 + D-NEW-chat-presence-scale — globální Redis client.
 *
 * Použití:
 *   constructor(@Inject('REDIS') private readonly redis: Redis) {}
 *
 * Pokud Redis není dostupný, ioredis se opakovaně připojuje a logged warning.
 * Konzumenti by měli mít fallback (např. UserBanCacheService při Redis fail
 * spadne na in-memory cache + log).
 */
@Global()
@Module({
  providers: [
    {
      provide: 'REDIS',
      useFactory: () => {
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        // V jestu (e2e bez živého Redisu) klient jinak donekonečna reconnectuje a
        // loguje po doběhnutí testů („Cannot log after tests are done") + drží open
        // handle → rozbitý report. Pod jestem proto lazy + bez retry + tichý.
        // Prod/dev chování beze změny (UserBanCacheService má in-memory fallback).
        const isJest =
          process.env.JEST_WORKER_ID !== undefined ||
          process.env.NODE_ENV === 'test';
        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: isJest,
          ...(isJest ? { retryStrategy: () => null } : {}),
        });
        client.on('error', (err) => {
          if (!isJest) console.error('[Redis] connection error:', err.message);
        });
        return client;
      },
    },
  ],
  exports: ['REDIS'],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  /** Uzavře sdílený Redis klient při shutdownu (висící handle / e2e teardown). */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      /* už odpojeno / nikdy nepřipojeno */
    }
  }
}
