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
      get: () => 'http://localhost:7700',
    } as never;
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: opts.meiliOk ?? true }) as never;
    const svc = new HealthMonitorService(mongo, redis, config, alert as never);
    return { svc, alert };
  }

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
});
