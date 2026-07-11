import type { Connection } from 'mongoose';
import type { Redis } from 'ioredis';

/**
 * Sdílené readiness checky (monitoring 3. noha) — používá je JAK `/health`
 * endpoint (AppController), TAK periodický `HealthMonitorService` (cron alert).
 * Jeden zdroj pravdy, aby se probe a alert nerozešly.
 */
export interface CheckResult {
  ok: boolean;
  detail?: string;
}

/** Race promise proti timeoutu (health-ping nesmí sám viset na mrtvé závislosti). */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), timeout]);
}

export function checkMongo(conn: Connection | undefined): CheckResult {
  // readyState je ConnectionStates enum; 1 = connected. Number() → čisté porovnání.
  const state = conn?.readyState;
  return {
    ok: Number(state) === 1,
    detail: `readyState=${state ?? 'unknown'}`,
  };
}

/** Redis: bez připojení (status) neblokuj; při ready ověř pingem s timeoutem. */
export async function checkRedis(redis: Redis): Promise<CheckResult> {
  if (redis.status !== 'ready') {
    return { ok: false, detail: `status=${redis.status}` };
  }
  try {
    const pong = await withTimeout(redis.ping(), 1000);
    return {
      ok: pong === 'PONG',
      detail: pong === 'PONG' ? undefined : 'no PONG',
    };
  } catch {
    return { ok: false, detail: 'ping timeout' };
  }
}

/** MeiliSearch: HTTP GET /health s timeoutem (neblokovat health-ping). */
export async function checkMeili(host: string): Promise<CheckResult> {
  try {
    const res = await fetch(`${host}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
  } catch {
    return { ok: false, detail: 'nedostupné' };
  }
}
