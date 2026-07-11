import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

interface CheckResult {
  ok: boolean;
  detail?: string;
}

interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  timestamp: string;
  checks: Record<string, CheckResult>;
}

const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN'];
const VAPID_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];

/** Race promise proti timeoutu (health-ping nesmí sám viset na mrtvé závislosti). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), timeout]);
}

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly config: ConfigService,
    @InjectConnection() private readonly mongo: Connection,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  /**
   * Readiness probe (monitoring 3. noha). Aktivně ověřuje runtime závislosti:
   * Mongo (readyState), Redis (ping s timeoutem), MeiliSearch (HTTP /health),
   * + konfiguraci (env/Cloudinary/VAPID/SMTP) a paměť (RSS, informativně).
   *
   * KRITICKÉ pro `status` (ok/degraded): backend, mongo, redis, meili, env,
   * cloudinary, vapid. SMTP + memory = informativní (neflipují status). V PRODUKCI
   * (PC-08) vrací jen `ok` bez detailů (veřejný endpoint = neleakovat interní stav).
   */
  @Get('health')
  @ApiOperation({
    summary:
      'Readiness — backend/mongo/redis/meili/env/cloudinary/vapid/smtp/mem',
  })
  @ApiResponse({ status: 200, description: 'status=ok nebo status=degraded' })
  async health(): Promise<HealthReport> {
    const backend: CheckResult = { ok: true };

    const mongoState = this.mongo?.readyState as number | undefined;
    const mongo: CheckResult = {
      ok: mongoState === 1,
      detail: `readyState=${mongoState ?? 'unknown'}`,
    };

    const redis = await this.checkRedis();
    const meili = await this.checkMeili();

    const missingEnv = REQUIRED_ENV.filter((k) => !this.config.get<string>(k));
    const env: CheckResult & { missing?: string[] } = {
      ok: missingEnv.length === 0,
      missing: missingEnv.length ? missingEnv : undefined,
      detail: missingEnv.length
        ? `chybí: ${missingEnv.join(', ')}`
        : 'všechny povinné env proměnné OK',
    };

    // PC-11: upload čte JEN CLOUDINARY_URL → healthcheck ověřuje totéž.
    const cloudinaryConfigured = !!this.config.get<string>('CLOUDINARY_URL');
    const cloudinary: CheckResult = {
      ok: cloudinaryConfigured,
      detail: cloudinaryConfigured
        ? 'Cloudinary config OK'
        : 'CLOUDINARY_URL chybí (disk fallback aktivní)',
    };

    const missingVapid = VAPID_KEYS.filter((k) => !this.config.get<string>(k));
    const vapid: CheckResult & { missing?: string[]; pushModule: boolean } = {
      pushModule: true,
      ok: missingVapid.length === 0,
      missing: missingVapid.length ? missingVapid : undefined,
      detail: missingVapid.length
        ? `chybí: ${missingVapid.join(', ')}`
        : 'VAPID config OK',
    };

    // SMTP — jen konfig-presence (aktivní verify by držel slot/latenci). Informativní.
    const smtpConfigured =
      !!this.config.get<string>('SMTP_HOST') &&
      !!this.config.get<string>('SMTP_USER');
    const smtp: CheckResult = {
      ok: smtpConfigured,
      detail: smtpConfigured
        ? 'SMTP config OK'
        : 'SMTP nenakonfigurováno (maily stub)',
    };

    // Paměť — informativní (neflipuje status; alert na RSS řeší monitoring cron).
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const memory: CheckResult = { ok: true, detail: `RSS ${rssMb} MB` };

    // KRITICKÉ pro readiness (route traffic sem, jen když jsou zdravé).
    const allOk =
      backend.ok &&
      mongo.ok &&
      redis.ok &&
      meili.ok &&
      env.ok &&
      cloudinary.ok &&
      vapid.ok;

    // PC-08: detaily jsou neautentizovaný info-leak → jen mimo produkci.
    const expose = process.env.NODE_ENV !== 'production';

    const full: HealthReport['checks'] = {
      backend,
      mongo,
      redis,
      meili,
      env,
      cloudinary,
      vapid,
      smtp,
      memory,
    };
    const stripped: HealthReport['checks'] = Object.fromEntries(
      Object.entries(full).map(([k, v]) => [
        k,
        (k === 'vapid'
          ? { ok: v.ok, pushModule: (v as { pushModule?: boolean }).pushModule }
          : { ok: v.ok }) as CheckResult,
      ]),
    );

    return {
      status: allOk ? 'ok' : 'degraded',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: expose ? full : stripped,
    };
  }

  /** Redis: bez připojení (status) neblokuj; při ready ověř pingem s timeoutem. */
  private async checkRedis(): Promise<CheckResult> {
    if (this.redis.status !== 'ready') {
      return { ok: false, detail: `status=${this.redis.status}` };
    }
    try {
      const pong = await withTimeout(this.redis.ping(), 1000);
      return {
        ok: pong === 'PONG',
        detail: pong === 'PONG' ? undefined : 'no PONG',
      };
    } catch {
      return { ok: false, detail: 'ping timeout' };
    }
  }

  /** MeiliSearch: HTTP GET /health s timeoutem (neblokovat health-ping). */
  private async checkMeili(): Promise<CheckResult> {
    const host = this.config.get<string>('MEILI_HOST', 'http://localhost:7700');
    try {
      const res = await fetch(`${host}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
    } catch {
      return { ok: false, detail: 'nedostupné' };
    }
  }
}
