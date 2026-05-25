import { Global, Module } from '@nestjs/common';
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
        const client = new Redis(url, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });
        client.on('error', (err) => {
          console.error('[Redis] connection error:', err.message);
        });
        return client;
      },
    },
  ],
  exports: ['REDIS'],
})
export class RedisModule {}
