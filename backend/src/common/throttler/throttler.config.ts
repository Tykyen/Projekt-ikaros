import { Logger } from '@nestjs/common';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * Default rate-limit: 100 req/min/IP. Citlivé endpointy mají vlastní `@Throttle`
 * (login, register, refresh, 2FA, upload…).
 */
const THROTTLERS = [{ ttl: 60_000, limit: 100 }];

/**
 * D-028 — opt-in Redis-backed throttler pro multi-instance BE.
 *
 * Default (`THROTTLER_REDIS` != '1'): in-memory storage. Pro single-instance
 * deploy je to **správné** — nulová Redis latence, žádný runtime overhead.
 * Při 2+ replikách backendu ale každá počítá vlastní bucket → reálné limity
 * jsou N× volnější. Přepínač `THROTTLER_REDIS=1` (+ `REDIS_URL`) přepne counter
 * na sdílený Redis. Vzor: `SOCKET_IO_REDIS=1` v `socket-io.adapter.ts`.
 *
 * Boot-time fallback: když je přepínač zapnutý, ale `REDIS_URL` chybí nebo Redis
 * není dostupný → varování + in-memory. Throttling nesmí shodit start.
 *
 * Pozn.: runtime výpadek Redisu (po úspěšném bootu) řeší ioredis reconnect;
 * tato funkce hlídá jen dostupnost při startu.
 */
export async function createThrottlerOptions(): Promise<ThrottlerModuleOptions> {
  const logger = new Logger('ThrottlerConfig');
  const inMemory: ThrottlerModuleOptions = { throttlers: THROTTLERS };

  if (process.env.THROTTLER_REDIS !== '1') return inMemory;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('THROTTLER_REDIS=1, ale REDIS_URL chybí → fallback in-memory.');
    return inMemory;
  }

  // Probe: rychle ověř dostupnost (bez nekonečného reconnectu) a uzavři.
  // Sdílený throttler klient si pak vytvoří ThrottlerStorageRedisService z URL
  // sám (disconnectRequired=true → uklidí se při onModuleDestroy).
  const probe = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    await probe.ping();
    logger.log('Redis throttler storage aktivní (multi-instance).');
    return {
      throttlers: THROTTLERS,
      storage: new ThrottlerStorageRedisService(url),
    };
  } catch (err) {
    logger.warn(
      `Redis throttler nedostupný (${(err as Error).message}) → fallback in-memory.`,
    );
    return inMemory;
  } finally {
    probe.disconnect();
  }
}
