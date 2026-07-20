import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { Redis } from 'ioredis';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CheckResult,
  checkDisk,
  checkMeili,
  checkMongo,
  checkRedis,
} from './common/health/health-checks';

/**
 * 24.1 — identita běžícího buildu. `sha` je zkrácený commit (7 znaků) z posledního
 * deploye, `builtAt` čas toho deploye. Obojí plní `deploy.yml` do `.env` na serveru.
 */
interface VersionInfo {
  sha: string;
  builtAt: string | null;
}

interface HealthReport {
  status: 'ok' | 'degraded';
  version: VersionInfo;
  uptimeSec: number;
  timestamp: string;
  checks: Record<string, CheckResult>;
}

const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN'];
const VAPID_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];

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
    const mongo = checkMongo(this.mongo);
    const redis = await checkRedis(this.redis);
    const meili = await checkMeili(
      this.config.get<string>('MEILI_HOST', 'http://localhost:7700'),
    );

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

    // Disk — informativní ve /health (volné %); alert na nízké místo řeší health-cron.
    const disk = await checkDisk();

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
      disk,
    };
    const stripped: HealthReport['checks'] = Object.fromEntries(
      Object.entries(full).map(([k, v]) => [
        k,
        (k === 'vapid'
          ? { ok: v.ok, pushModule: (v as { pushModule?: boolean }).pushModule }
          : { ok: v.ok }) as CheckResult,
      ]),
    );

    // 24.1 — jediná cesta, jak zvenku změřit REALITU (co běží), ne záměr (co
    // Actions nasadit chtěl); FE se dá grepnout v bundlu, BE dosud nešel nijak.
    // `uptimeSec` sám nestačí: dává čas posledního RESTARTU, takže restart z jiné
    // příčiny (OOM — RSS baseline je ~2,4 GB) vypadá jako čerstvý deploy. Dvojice
    // sha+builtAt to rozliší — builtAt se mění JEN deployem, uptime i restartem.
    // PC-08: sha se vrací i v produkci (celý smysl je neautentizovaný `curl`) —
    // zkrácený na 7 znaků; u privátního repa neodemyká nic. `||` ne `??` — prázdná
    // GitHub var je '' a to musí spadnout na fallback stejně jako undefined.
    const version: VersionInfo = {
      sha: (this.config.get<string>('IMAGE_SHA') || 'unknown').slice(0, 7),
      builtAt: this.config.get<string>('BUILT_AT') || null,
    };

    return {
      status: allOk ? 'ok' : 'degraded',
      version,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: expose ? full : stripped,
    };
  }
}
