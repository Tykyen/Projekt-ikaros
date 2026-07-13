import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { logWarn } from '../logging/log-error.util';

/**
 * Release jen pokud token sedí — jinak bychom po vypršení TTL smazali lock,
 * který mezitím získala jiná instance.
 */
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Distribuovaný lock pro @Cron handlery — při 2+ replikách BE by jinak každý
 * cron (hard-delete účtů/světů, prune zpráv, push připomínky, …) běžel na
 * každé instanci → duplicitní běhy (dvojí push, dvojí Cloudinary delete).
 *
 * Vzor: `SET key token NX PX ttl`; release = DEL jen při shodě tokenu (Lua).
 *
 * ZÁMĚRNÉ chování při nedostupném Redisu: cron PROBĚHNE normálně (dnes
 * single-instance — výpadek Redisu nesmí zastavit údržbu), jen logWarn.
 * Lock je best-effort pojistka pro multi-replica, ne tvrdá závislost.
 *
 * NEpoužívat na crony s per-instance in-memory stavem (presence cleanup,
 * camp rotace, health monitor) — tam musí běžet KAŽDÁ instance.
 */
@Injectable()
export class CronLockService {
  /** Default TTL — horní odhad běhu údržbového cronu; po pádu instance lock vyprší sám. */
  static readonly DEFAULT_TTL_MS = 10 * 60_000;

  private readonly logger = new Logger(CronLockService.name);

  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  /**
   * Spustí `fn` jen pokud tato instance získá lock `cron-lock:{name}`.
   * Lock drží jiná instance → přeskočí (debug log). Redis nedostupný → spustí
   * bez locku (warn). Chyba z `fn` propaguje ven (release proběhne ve finally).
   */
  async withLock(
    name: string,
    fn: () => Promise<void> | void,
    ttlMs: number = CronLockService.DEFAULT_TTL_MS,
  ): Promise<void> {
    const key = `cron-lock:${name}`;
    const token = randomUUID();
    let locked = false;

    try {
      const res = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      if (res !== 'OK') {
        this.logger.debug(
          `CronLock „${name}“ drží jiná instance — běh přeskočen.`,
        );
        return;
      }
      locked = true;
    } catch (err) {
      logWarn(
        this.logger,
        `CronLock „${name}“: Redis nedostupný — spouštím bez locku`,
        err,
      );
    }

    try {
      await fn();
    } finally {
      if (locked) {
        try {
          await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
        } catch (err) {
          logWarn(
            this.logger,
            `CronLock „${name}“: release selhal — klíč vyprší sám (TTL ${ttlMs} ms)`,
            err,
          );
        }
      }
    }
  }
}
