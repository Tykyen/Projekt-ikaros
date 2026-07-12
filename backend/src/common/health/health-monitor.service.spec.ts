import { HealthMonitorService } from './health-monitor.service';
import * as checks from './health-checks';

/**
 * Health-cron: alertuje jen PŘI PŘECHODU down/obnoveno, ne opakovaně.
 */
describe('HealthMonitorService (monitoring 3. noha)', () => {
  // checkDisk čte reálný FS → mockovat, ať test nezávisí na disku CI stroje.
  beforeEach(() => {
    jest
      .spyOn(checks, 'checkDisk')
      .mockResolvedValue({ ok: true, detail: 'volné 80%' });
  });
  afterEach(() => jest.restoreAllMocks());

  function make(opts: {
    mongoState?: number;
    redisStatus?: string;
    meiliOk?: boolean;
  }) {
    const alert = { alert: jest.fn().mockResolvedValue(undefined) };
    const mongo = { readyState: opts.mongoState ?? 1 } as never;
    const redis = {
      status: opts.redisStatus ?? 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
    } as never;
    const config = {
      get: (key: string) => {
        if (key === 'MEILI_HOST') return 'http://localhost:7700';
        if (key === 'RSS_WINDOW') return '3'; // malé okno pro deterministický test
        if (key === 'RSS_LEAK_GROWTH_MB') return '384';
        if (key === 'RSS_HARD_MB') return '3500';
        return undefined;
      },
    } as never;
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: opts.meiliOk ?? true }) as never;
    const svc = new HealthMonitorService(mongo, redis, config, alert as never);
    return { svc, alert };
  }

  /** Zafixuje `process.memoryUsage().rss` na danou hodnotu MB (deterministický RSS). */
  function mockRss(mb: number) {
    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: mb * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
  }
  const rssCalls = (alert: { alert: jest.Mock }) =>
    alert.alert.mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].includes('paměť (RSS'),
    );

  it('vše zdravé → žádný alert', async () => {
    const { svc, alert } = make({});
    await svc.check();
    expect(alert.alert).not.toHaveBeenCalled();
  });

  it('disk skoro plný → warn alert', async () => {
    jest
      .spyOn(checks, 'checkDisk')
      .mockResolvedValue({ ok: false, detail: 'volné 5%' });
    const { svc, alert } = make({});
    await svc.check();
    expect(alert.alert).toHaveBeenCalledWith(
      'warn',
      'Disk skoro plný',
      expect.any(String),
      expect.objectContaining({ dedupeKey: 'disk-low' }),
    );
  });

  it('heartbeat → info alert (dead-man switch ze strany appky)', () => {
    const { svc, alert } = make({});
    svc.heartbeat();
    expect(alert.alert).toHaveBeenCalledWith(
      'info',
      '✅ Monitoring žije',
      expect.any(String),
      expect.objectContaining({ dedupeKey: 'heartbeat' }),
    );
  });

  it('Mongo down → 1× critical alert (DOWN)', async () => {
    const { svc, alert } = make({ mongoState: 0 });
    await svc.check();
    expect(alert.alert).toHaveBeenCalledWith(
      'critical',
      'Závislost DOWN: mongo',
      expect.any(String),
      expect.objectContaining({ dedupeKey: 'dep-down:mongo' }),
    );
  });

  it('opakovaně down → NEalertuje podruhé (jen přechod)', async () => {
    const { svc, alert } = make({ redisStatus: 'end' });
    await svc.check();
    await svc.check();
    // 1× DOWN alert, ne 2× (drží stav)
    const downCalls = alert.alert.mock.calls.filter((c) => c[0] === 'critical');
    expect(downCalls).toHaveLength(1);
  });

  it('down → obnoveno → info alert (recovery)', async () => {
    const alert = { alert: jest.fn().mockResolvedValue(undefined) };
    const mongo = { readyState: 1 } as never;
    const redis = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
    } as never;
    const config = { get: () => 'http://localhost:7700' } as never;
    // 1. běh: meili down
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as never;
    const svc = new HealthMonitorService(mongo, redis, config, alert as never);
    await svc.check();
    // 2. běh: meili zpět
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
    await svc.check();
    expect(alert.alert).toHaveBeenCalledWith(
      'info',
      'Závislost OBNOVENA: meili',
      expect.any(String),
      expect.objectContaining({ dedupeKey: 'dep-up:meili' }),
    );
  });

  // ── RSS: trend místo absolutního prahu (2026-07-12) ──────────────────────

  // KLÍČOVÝ pin: vysoká, ale PLOCHÁ baseline (např. ~2,46 GB ONNX embedding)
  // už NESMÍ spamovat „možný leak" à 30 min. Dřív `rss > 1536` = alert pořád.
  it('RSS: plochá vysoká baseline (2460 MB) → ŽÁDNÝ RSS alert (ne spam)', async () => {
    const { svc, alert } = make({});
    mockRss(2460);
    for (let i = 0; i < 4; i += 1) await svc.check(); // okno se naplní, RSS neroste
    expect(rssCalls(alert)).toHaveLength(0);
  });

  // Reálný leak = RSS trvale nad minimem okna → warn trend alert.
  it('RSS: trvalý růst nad minimum okna → warn „Rostoucí paměť (RSS trend)"', async () => {
    const { svc, alert } = make({});
    mockRss(500);
    await svc.check();
    await svc.check();
    mockRss(1000); // lo=500, +500 ≥ 384 a ≥ 20 % → leak signatura
    await svc.check();
    const rss = rssCalls(alert);
    expect(rss).toHaveLength(1);
    expect(rss[0][0]).toBe('warn');
    expect(rss[0][1]).toBe('Rostoucí paměť (RSS trend)');
    expect(rss[0][3]).toEqual(
      expect.objectContaining({ dedupeKey: 'rss-leak-trend' }),
    );
  });

  // Skutečná blízkost OOM → critical bez ohledu na trend.
  it('RSS: nad tvrdým stropem (3600 > 3500) → critical „Kritická paměť (RSS)"', async () => {
    const { svc, alert } = make({});
    mockRss(3600);
    await svc.check();
    const rss = rssCalls(alert);
    expect(rss).toHaveLength(1);
    expect(rss[0][0]).toBe('critical');
    expect(rss[0][1]).toBe('Kritická paměť (RSS)');
    expect(rss[0][3]).toEqual(
      expect.objectContaining({ dedupeKey: 'rss-critical' }),
    );
  });
});
