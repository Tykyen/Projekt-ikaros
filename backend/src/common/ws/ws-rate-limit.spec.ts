import type { Socket } from 'socket.io';
import {
  allowWsEvent,
  WS_RATE_DEFAULT_LIMIT,
  WS_RATE_DEFAULT_WINDOW_MS,
} from './ws-rate-limit';

/** Minimální fake socket — util sahá jen na `id`, `data` a `disconnect`. */
function makeClient(dataExtra: Record<string, unknown> = {}): Socket & {
  disconnect: jest.Mock;
} {
  return {
    id: 'sock-1',
    data: { ...dataExtra },
    disconnect: jest.fn(),
  } as unknown as Socket & { disconnect: jest.Mock };
}

describe('allowWsEvent (WS rate-limit, D-LAUNCH-GAP)', () => {
  it('propustí events do limitu (default 20/10 s)', () => {
    const client = makeClient();
    for (let i = 0; i < WS_RATE_DEFAULT_LIMIT; i++) {
      expect(allowWsEvent(client, 'typing:start', {}, 1_000 + i)).toBe(true);
    }
  });

  it('event nad limit tiše zahodí (false), bez disconnectu', () => {
    const client = makeClient();
    for (let i = 0; i < WS_RATE_DEFAULT_LIMIT; i++) {
      allowWsEvent(client, 'typing:start', {}, 1_000 + i);
    }
    expect(allowWsEvent(client, 'typing:start', {}, 1_030)).toBe(false);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('klouzavé okno — po uplynutí windowMs se limit uvolní', () => {
    const client = makeClient();
    const t0 = 10_000;
    for (let i = 0; i < WS_RATE_DEFAULT_LIMIT; i++) {
      allowWsEvent(client, 'e', {}, t0 + i);
    }
    expect(allowWsEvent(client, 'e', {}, t0 + 100)).toBe(false);
    // Posun za okno → staré timestampy vypadnou.
    expect(
      allowWsEvent(client, 'e', {}, t0 + WS_RATE_DEFAULT_WINDOW_MS + 200),
    ).toBe(true);
  });

  it('limity jsou per-event — flood jednoho eventu neblokuje jiný', () => {
    const client = makeClient();
    for (let i = 0; i < WS_RATE_DEFAULT_LIMIT + 5; i++) {
      allowWsEvent(client, 'flooded', {}, 1_000 + i);
    }
    expect(allowWsEvent(client, 'flooded', {}, 1_100)).toBe(false);
    expect(allowWsEvent(client, 'other', {}, 1_100)).toBe(true);
  });

  it('limity jsou per-socket — stav žije v client.data, druhý socket nezávislý', () => {
    const a = makeClient();
    const b = makeClient();
    for (let i = 0; i < WS_RATE_DEFAULT_LIMIT + 1; i++) {
      allowWsEvent(a, 'e', {}, 1_000 + i);
    }
    expect(allowWsEvent(a, 'e', {}, 1_100)).toBe(false);
    expect(allowWsEvent(b, 'e', {}, 1_100)).toBe(true);
  });

  it('respektuje per-event options (limit/windowMs)', () => {
    const client = makeClient();
    const opts = { limit: 3, windowMs: 1_000 };
    expect(allowWsEvent(client, 'e', opts, 100)).toBe(true);
    expect(allowWsEvent(client, 'e', opts, 110)).toBe(true);
    expect(allowWsEvent(client, 'e', opts, 120)).toBe(true);
    expect(allowWsEvent(client, 'e', opts, 130)).toBe(false);
    // Po okně znovu propustí.
    expect(allowWsEvent(client, 'e', opts, 1_200)).toBe(true);
  });

  it('extrémní flood (10× limit v okně) → disconnect socketu', () => {
    const client = makeClient();
    const opts = { limit: 3, windowMs: 10_000 }; // disconnect při 30
    for (let i = 0; i < 29; i++) {
      allowWsEvent(client, 'e', opts, 1_000 + i);
    }
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(allowWsEvent(client, 'e', opts, 1_050)).toBe(false);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnectFactor je konfigurovatelný', () => {
    const client = makeClient();
    const opts = { limit: 2, windowMs: 10_000, disconnectFactor: 3 }; // disconnect při 6
    for (let i = 0; i < 6; i++) {
      allowWsEvent(client, 'e', opts, 1_000 + i);
    }
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('nepadá na socketu bez identity (anon) i s maps identitou (data.user.id)', () => {
    const anon = makeClient();
    const maps = makeClient({ user: { id: 'u-42' } });
    for (let i = 0; i < WS_RATE_DEFAULT_LIMIT + 1; i++) {
      allowWsEvent(anon, 'e', {}, 1_000 + i);
      allowWsEvent(maps, 'e', {}, 1_000 + i);
    }
    // Jen ověření, že log-cesta s oběma tvary identity nespadla.
    expect(allowWsEvent(anon, 'e', {}, 1_100)).toBe(false);
    expect(allowWsEvent(maps, 'e', {}, 1_100)).toBe(false);
  });
});
