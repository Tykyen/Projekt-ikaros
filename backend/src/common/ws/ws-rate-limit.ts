import { Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';

/**
 * D-LAUNCH-GAP (2026-07-11) — lehký WS anti-flood: in-memory sliding-window
 * rate-limit per socket × event pro klientské `@SubscribeMessage` handlery.
 *
 * Návrh:
 *  - Stav žije v `client.data[STATE_KEY]` (per-socket) → zaniká s GC socketu,
 *    žádná globální Map, žádný cleanup hook v `handleDisconnect`.
 *  - Překročení limitu = TICHÉ zahození eventu + jeden warn log na okno
 *    (žádný error klientovi — flooder nedostane zpětnou vazbu, legitimní
 *    klient s bugem se pozná z logu).
 *  - Extrémní flood (≥ `disconnectFactor`× limit v jednom okně) = disconnect.
 *    Paměť per socket × event je tím stropovaná na `limit × disconnectFactor`
 *    timestampů.
 *  - Identita do logu z OVĚŘENÉHO `client.data.userId` (chat/presence vzor)
 *    nebo `client.data.user.id` (maps vzor) — NIKDY z payloadu.
 *
 * Použití na začátku handleru:
 *   if (!allowWsEvent(client, 'typing:start')) return;
 */
export interface WsRateLimitOptions {
  /** Max událostí v okně (default 20). */
  limit?: number;
  /** Délka klouzavého okna v ms (default 10 000). */
  windowMs?: number;
  /**
   * Násobek limitu, při jehož dosažení v jednom okně se socket odpojí
   * (default 10 → při defaultech 200 událostí / 10 s).
   */
  disconnectFactor?: number;
}

export const WS_RATE_DEFAULT_LIMIT = 20;
export const WS_RATE_DEFAULT_WINDOW_MS = 10_000;
export const WS_RATE_DEFAULT_DISCONNECT_FACTOR = 10;

/** Klíč per-socket stavu v `client.data` (prefix `__` — nekoliduje s userId ap.). */
const STATE_KEY = '__wsRateBuckets';

type Buckets = Map<string, number[]>;

const logger = new Logger('WsRateLimit');

/** Ověřená identita pro log — `client.data.userId` (chat) / `.user.id` (maps). */
function logIdentity(client: Socket): string {
  const data = client.data as {
    userId?: string;
    user?: { id?: string };
  };
  return data.userId ?? data.user?.id ?? 'anon';
}

/**
 * Vrátí `true`, když event smí projít. Při překročení limitu vrací `false`
 * (handler má okamžitě `return`) a při extrémním floodu socket odpojí.
 */
export function allowWsEvent(
  client: Socket,
  event: string,
  opts: WsRateLimitOptions = {},
  now: number = Date.now(),
): boolean {
  const limit = opts.limit ?? WS_RATE_DEFAULT_LIMIT;
  const windowMs = opts.windowMs ?? WS_RATE_DEFAULT_WINDOW_MS;
  const disconnectAt =
    limit * (opts.disconnectFactor ?? WS_RATE_DEFAULT_DISCONNECT_FACTOR);

  const data = client.data as Record<string, unknown>;
  let buckets = data[STATE_KEY] as Buckets | undefined;
  if (!buckets) {
    buckets = new Map();
    data[STATE_KEY] = buckets;
  }
  let stamps = buckets.get(event);
  if (!stamps) {
    stamps = [];
    buckets.set(event, stamps);
  }

  // Klouzavé okno — zahodit timestampy starší než windowMs.
  const cutoff = now - windowMs;
  while (stamps.length > 0 && stamps[0] <= cutoff) stamps.shift();

  stamps.push(now);
  if (stamps.length <= limit) return true;

  if (stamps.length >= disconnectAt) {
    logger.warn(
      `WS flood → disconnect: socket=${client.id} user=${logIdentity(client)} event=${event} (${stamps.length} událostí / ${windowMs} ms, limit ${limit})`,
    );
    client.disconnect(true);
    return false;
  }
  // Jeden warn na okno (při prvním překročení), ne za každý zahozený event.
  if (stamps.length === limit + 1) {
    logger.warn(
      `WS rate-limit → drop: socket=${client.id} user=${logIdentity(client)} event=${event} (> ${limit} / ${windowMs} ms)`,
    );
  }
  return false;
}
