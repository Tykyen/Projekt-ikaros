import { CronLockService } from './cron-lock.service';

/**
 * CronLockService — distribuovaný lock pro @Cron handlery.
 * Klíčová regrese: při nedostupném Redisu MUSÍ cron proběhnout (dnes
 * single-instance; výpadek Redisu nesmí zastavit údržbu).
 */
describe('CronLockService', () => {
  const mockRedis = {
    set: jest.fn(),
    eval: jest.fn(),
  };

  let service: CronLockService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CronLockService(mockRedis as never);
  });

  it('lock získán → fn proběhne a lock se uvolní (token release)', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);
    const fn = jest.fn().mockResolvedValue(undefined);

    await service.withLock('test-job', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    // SET key token PX ttl NX
    expect(mockRedis.set).toHaveBeenCalledWith(
      'cron-lock:test-job',
      expect.any(String),
      'PX',
      CronLockService.DEFAULT_TTL_MS,
      'NX',
    );
    // Release přes Lua se STEJNÝM tokenem, jaký byl při acquire.
    const token = mockRedis.set.mock.calls[0][1] as string;
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("del", KEYS[1])'),
      1,
      'cron-lock:test-job',
      token,
    );
  });

  it('lock drží jiná instance (SET → null) → fn se přeskočí, žádný release', async () => {
    mockRedis.set.mockResolvedValue(null);
    const fn = jest.fn();

    await service.withLock('test-job', fn);

    expect(fn).not.toHaveBeenCalled();
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });

  // REGRESE — Redis výpadek nesmí zastavit údržbu (dnes single-instance).
  it('Redis nedostupný (SET rejectuje) → fn PŘESTO proběhne, bez release', async () => {
    mockRedis.set.mockRejectedValue(new Error('connection refused'));
    const fn = jest.fn().mockResolvedValue(undefined);

    await expect(service.withLock('test-job', fn)).resolves.toBeUndefined();

    expect(fn).toHaveBeenCalledTimes(1);
    // Lock nebyl získán → nesmí se mazat cizí klíč.
    expect(mockRedis.eval).not.toHaveBeenCalled();
  });

  it('chyba z fn propaguje ven, ale lock se přesto uvolní (finally)', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);
    const fn = jest.fn().mockRejectedValue(new Error('job failed'));

    await expect(service.withLock('test-job', fn)).rejects.toThrow(
      'job failed',
    );

    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });

  it('selhaný release (eval rejectuje) chybu spolkne — klíč vyprší TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockRejectedValue(new Error('connection lost'));
    const fn = jest.fn().mockResolvedValue(undefined);

    await expect(service.withLock('test-job', fn)).resolves.toBeUndefined();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('vlastní TTL se propíše do SET PX', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);

    await service.withLock('test-job', jest.fn(), 5 * 60_000);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'cron-lock:test-job',
      expect.any(String),
      'PX',
      5 * 60_000,
      'NX',
    );
  });

  it('každé volání používá nový náhodný token (žádné sdílení mezi běhy)', async () => {
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(1);

    await service.withLock('test-job', jest.fn());
    await service.withLock('test-job', jest.fn());

    const token1 = mockRedis.set.mock.calls[0][1] as string;
    const token2 = mockRedis.set.mock.calls[1][1] as string;
    expect(token1).not.toBe(token2);
  });
});
