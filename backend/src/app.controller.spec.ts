import { AppController } from './app.controller';

/**
 * Readiness /health (monitoring 3. noha) — unit, bez full-app bootu.
 * Ověřuje agregaci status ok/degraded + PC-08 strip v produkci.
 */
describe('AppController · /health readiness', () => {
  const healthyEnv: Record<string, string> = {
    MONGODB_URI: 'mongodb://x',
    JWT_SECRET: 's',
    JWT_EXPIRES_IN: '3d',
    CLOUDINARY_URL: 'cloudinary://x',
    VAPID_PUBLIC_KEY: 'p',
    VAPID_PRIVATE_KEY: 'k',
    VAPID_SUBJECT: 'mailto:x',
    SMTP_HOST: 'smtp',
    SMTP_USER: 'u',
    MEILI_HOST: 'http://localhost:7700',
  };

  function makeConfig(overrides: Record<string, string | undefined> = {}) {
    const map = { ...healthyEnv, ...overrides };
    return {
      get: (key: string, def?: unknown) => map[key] ?? def,
    } as never;
  }

  function makeController(opts: {
    mongoState?: number;
    redisStatus?: string;
    redisPong?: string;
    meiliOk?: boolean | 'throw';
    config?: ReturnType<typeof makeConfig>;
  }) {
    const mongo = { readyState: opts.mongoState ?? 1 } as never;
    const redis = {
      status: opts.redisStatus ?? 'ready',
      ping: jest.fn().mockResolvedValue(opts.redisPong ?? 'PONG'),
    } as never;
    global.fetch = jest.fn().mockImplementation(() => {
      if (opts.meiliOk === 'throw') return Promise.reject(new Error('down'));
      return Promise.resolve({
        ok: opts.meiliOk ?? true,
        status: opts.meiliOk === false ? 503 : 200,
      });
    }) as never;
    return new AppController(opts.config ?? makeConfig(), mongo, redis);
  }

  it('vše zdravé → status ok, 10 checků', async () => {
    const res = await makeController({}).health();
    expect(res.status).toBe('ok');
    expect(Object.keys(res.checks).sort()).toEqual(
      [
        'backend',
        'cloudinary',
        'disk',
        'env',
        'meili',
        'memory',
        'mongo',
        'redis',
        'smtp',
        'vapid',
      ].sort(),
    );
    expect(res.checks.redis.ok).toBe(true);
    expect(res.checks.meili.ok).toBe(true);
  });

  it('Mongo down (readyState≠1) → degraded', async () => {
    const res = await makeController({ mongoState: 0 }).health();
    expect(res.status).toBe('degraded');
    expect(res.checks.mongo.ok).toBe(false);
  });

  it('Redis neready → degraded, žádný ping (neblokuje)', async () => {
    const res = await makeController({ redisStatus: 'end' }).health();
    expect(res.status).toBe('degraded');
    expect(res.checks.redis.ok).toBe(false);
  });

  it('Meili nedostupné (fetch throw) → degraded', async () => {
    const res = await makeController({ meiliOk: 'throw' }).health();
    expect(res.status).toBe('degraded');
    expect(res.checks.meili.ok).toBe(false);
  });

  it('SMTP nenakonfigurováno NEflipne status (informativní)', async () => {
    const res = await makeController({
      config: makeConfig({ SMTP_HOST: undefined, SMTP_USER: undefined }),
    }).health();
    expect(res.status).toBe('ok');
    expect(res.checks.smtp.ok).toBe(false);
    expect(res.checks.memory.ok).toBe(true);
  });

  // 24.1 — `version` je jediný způsob, jak zvenku poznat, který commit BE běží.
  describe('version (24.1)', () => {
    it('IMAGE_SHA/BUILT_AT nastavené → zkrácený sha (7) + čas deploye', async () => {
      const res = await makeController({
        config: makeConfig({
          IMAGE_SHA: '8b2e3b6fbc90fa4ccb916f3f67e518205e21848c',
          BUILT_AT: '2026-07-20T06:00:00Z',
        }),
      }).health();
      expect(res.version).toEqual({
        sha: '8b2e3b6',
        builtAt: '2026-07-20T06:00:00Z',
      });
    });

    it('chybějící i PRÁZDNÁ var → unknown/null (prázdná GitHub var je "")', async () => {
      const missing = await makeController({}).health();
      expect(missing.version).toEqual({ sha: 'unknown', builtAt: null });

      const empty = await makeController({
        config: makeConfig({ IMAGE_SHA: '', BUILT_AT: '' }),
      }).health();
      expect(empty.version).toEqual({ sha: 'unknown', builtAt: null });
    });

    it('produkce version NEstripuje (smysl je neautentizovaný curl)', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await makeController({
          config: makeConfig({ IMAGE_SHA: 'abcdef1234567890' }),
        }).health();
        expect(res.version.sha).toBe('abcdef1');
      } finally {
        process.env.NODE_ENV = prev;
      }
    });
  });

  it('produkce (PC-08) stripuje detaily — jen ok/pushModule', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await makeController({}).health();
      expect(res.checks.mongo.detail).toBeUndefined();
      expect(res.checks.env).toEqual({ ok: true });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
