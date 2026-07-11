import { AlertService } from './alert.service';

describe('AlertService (monitoring 3. noha)', () => {
  function make(webhook?: string) {
    const config = { get: () => webhook } as never;
    return new AlertService(config);
  }

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
  });

  it('bez DISCORD_ALERT_WEBHOOK → no-op (žádný fetch)', async () => {
    await make(undefined).alert('critical', 'X', 'detail');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('s webhookem → POST embed na webhook', async () => {
    await make('https://discord.com/api/webhooks/1/tok').alert(
      'critical',
      'Mongo down',
      'readyState=0',
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain('/api/webhooks/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as {
      embeds: { title: string }[];
    };
    expect(body.embeds[0].title).toContain('Mongo down');
  });

  it('rate-limit: 2. stejný alert v cooldownu se NEpošle', async () => {
    const svc = make('https://discord.com/api/webhooks/1/tok');
    await svc.alert('warn', 'Disk', 'plný');
    await svc.alert('warn', 'Disk', 'plný');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('různé alerty (jiný klíč) se pošlou oba', async () => {
    const svc = make('https://discord.com/api/webhooks/1/tok');
    await svc.alert('warn', 'Disk', 'plný');
    await svc.alert('critical', 'Mongo', 'down');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('selhání fetch NEshodí (alerting nesmí crashnout app)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('net')) as never;
    await expect(
      make('https://discord.com/api/webhooks/1/tok').alert('info', 'X', 'y'),
    ).resolves.toBeUndefined();
  });
});
