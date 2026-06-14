import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

interface CheckResult {
  ok: boolean;
  detail?: string;
}

interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  timestamp: string;
  checks: {
    backend: CheckResult;
    mongo: CheckResult;
    env: CheckResult & { missing?: string[] };
    cloudinary: CheckResult & { missing?: string[] };
    vapid: CheckResult & { missing?: string[]; pushModule: boolean };
  };
}

const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN'];
const VAPID_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly config: ConfigService,
    @InjectConnection() private readonly mongo: Connection,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Healthcheck — backend, MongoDB, env, Cloudinary, VAPID',
  })
  @ApiResponse({ status: 200, description: 'status=ok nebo status=degraded' })
  health(): HealthReport {
    const backend: CheckResult = { ok: true };

    const mongoState = this.mongo?.readyState as number | undefined;
    const mongo: CheckResult = {
      ok: mongoState === 1,
      detail: `readyState=${mongoState ?? 'unknown'}`,
    };

    const missingEnv = REQUIRED_ENV.filter((k) => !this.config.get<string>(k));
    const env: CheckResult & { missing?: string[] } = {
      ok: missingEnv.length === 0,
      missing: missingEnv.length ? missingEnv : undefined,
      detail: missingEnv.length
        ? `chybí: ${missingEnv.join(', ')}`
        : 'všechny povinné env proměnné OK',
    };

    // PC-11: upload čte JEN CLOUDINARY_URL — healthcheck musí ověřovat totéž
    // (dřív kontroloval CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET → vždy „degraded").
    const cloudinaryConfigured = !!this.config.get<string>('CLOUDINARY_URL');
    const cloudinary: CheckResult & { missing?: string[] } = {
      ok: cloudinaryConfigured,
      detail: cloudinaryConfigured
        ? 'Cloudinary config OK'
        : 'CLOUDINARY_URL chybí (disk fallback aktivní)',
    };

    // PushModule je registrovaný v AppModule vždy. Pokud nejsou VAPID klíče,
    // push prakticky nefunguje. Hlásíme to jako degraded.
    const missingVapid = VAPID_KEYS.filter((k) => !this.config.get<string>(k));
    const vapid: CheckResult & { missing?: string[]; pushModule: boolean } = {
      pushModule: true,
      ok: missingVapid.length === 0,
      missing: missingVapid.length ? missingVapid : undefined,
      detail: missingVapid.length
        ? `chybí: ${missingVapid.join(', ')}`
        : 'VAPID config OK',
    };

    const allOk = backend.ok && mongo.ok && env.ok && cloudinary.ok && vapid.ok;

    // PC-08: detaily (které env chybí) jsou neautentizovaný info-leak → jen mimo
    // produkci. V produkci vrací jen ok/degraded bez výčtu chybějících proměnných.
    const expose = process.env.NODE_ENV !== 'production';

    return {
      status: allOk ? 'ok' : 'degraded',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: expose
        ? { backend, mongo, env, cloudinary, vapid }
        : {
            backend: { ok: backend.ok },
            mongo: { ok: mongo.ok },
            env: { ok: env.ok },
            cloudinary: { ok: cloudinary.ok },
            vapid: { ok: vapid.ok, pushModule: vapid.pushModule },
          },
    };
  }
}
