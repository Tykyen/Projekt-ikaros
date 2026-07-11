import { BruteForceMonitor } from './brute-force.monitor';

describe('BruteForceMonitor (monitoring 3. noha)', () => {
  function make() {
    const alert = { alert: jest.fn().mockResolvedValue(undefined) };
    return { mon: new BruteForceMonitor(alert as never), alert };
  }

  it('pod prahem (< 20 selhání/min) → žádný alert', () => {
    const { mon, alert } = make();
    for (let i = 0; i < 19; i += 1) mon.recordLoginFailure();
    expect(alert.alert).not.toHaveBeenCalled();
  });

  it('při dosažení prahu (20/min) → critical alert', () => {
    const { mon, alert } = make();
    for (let i = 0; i < 20; i += 1) mon.recordLoginFailure();
    expect(alert.alert).toHaveBeenCalledWith(
      'critical',
      'Brute-force login spike',
      expect.any(String),
      expect.objectContaining({ dedupeKey: 'bruteforce-login' }),
    );
  });

  it('stará selhání mimo okno se nepočítají (posuvné okno)', () => {
    const { mon, alert } = make();
    const realNow = Date.now;
    let t = 1_000_000;
    Date.now = () => t;
    try {
      for (let i = 0; i < 15; i += 1) mon.recordLoginFailure();
      t += 61_000; // posun za okno (1 min)
      for (let i = 0; i < 15; i += 1) mon.recordLoginFailure();
      // stará patnáctka vypadla → 15 < 20 → žádný alert
      expect(alert.alert).not.toHaveBeenCalled();
    } finally {
      Date.now = realNow;
    }
  });
});
