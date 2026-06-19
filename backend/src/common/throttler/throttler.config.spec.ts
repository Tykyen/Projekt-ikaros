import Redis from 'ioredis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { createThrottlerOptions } from './throttler.config';

// Mock ioredis i storage — testujeme přepínací logiku, ne reálné spojení.
jest.mock('ioredis');
jest.mock('@nest-lab/throttler-storage-redis');

const MockRedis = Redis as unknown as jest.Mock;

describe('createThrottlerOptions (D-028 opt-in Redis throttler)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.THROTTLER_REDIS;
    delete process.env.REDIS_URL;
    // Probe default: dostupný Redis (connect + ping resolve).
    MockRedis.prototype.connect = jest.fn().mockResolvedValue(undefined);
    MockRedis.prototype.ping = jest.fn().mockResolvedValue('PONG');
    MockRedis.prototype.disconnect = jest.fn();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('default (přepínač vypnutý) → in-memory, žádné Redis spojení', async () => {
    const opts = await createThrottlerOptions();
    expect(opts).toEqual({ throttlers: [{ ttl: 60_000, limit: 100 }] });
    expect((opts as { storage?: unknown }).storage).toBeUndefined();
    expect(MockRedis).not.toHaveBeenCalled();
  });

  it('THROTTLER_REDIS=1 bez REDIS_URL → fallback in-memory', async () => {
    process.env.THROTTLER_REDIS = '1';
    const opts = await createThrottlerOptions();
    expect((opts as { storage?: unknown }).storage).toBeUndefined();
    expect(MockRedis).not.toHaveBeenCalled();
  });

  it('THROTTLER_REDIS=1 + dostupný Redis → Redis storage (probe uzavřen)', async () => {
    process.env.THROTTLER_REDIS = '1';
    process.env.REDIS_URL = 'redis://localhost:6379';
    const opts = await createThrottlerOptions();
    expect((opts as { storage?: unknown }).storage).toBeInstanceOf(
      ThrottlerStorageRedisService,
    );
    // Probe je dočasný — po ověření se odpojí (sdílený klient si drží storage).
    expect(MockRedis.prototype.disconnect).toHaveBeenCalled();
  });

  it('THROTTLER_REDIS=1 + Redis nedostupný (ping selže) → fallback in-memory', async () => {
    process.env.THROTTLER_REDIS = '1';
    process.env.REDIS_URL = 'redis://localhost:6379';
    MockRedis.prototype.ping = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const opts = await createThrottlerOptions();
    expect((opts as { storage?: unknown }).storage).toBeUndefined();
    // I při selhání musí probe uvolnit handle.
    expect(MockRedis.prototype.disconnect).toHaveBeenCalled();
  });
});
