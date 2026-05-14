/* eslint-disable no-console */
/**
 * Orchestrátor pro smoke test bez závislosti na lokálním MongoDB.
 *
 * Postup:
 *   1) Spustí MongoMemoryServer (in-memory Mongo).
 *   2) Spawnuje backend (`npm run start`) s MONGODB_URI nasměrovaným tam.
 *      Vyžaduje, aby v env byly i VAPID/JWT secrets — pokud nejsou, doplní default.
 *   3) Pollne /api/health, počká až je `mongo.ok=true`.
 *   4) Spustí smoke test (./backend-smoke-test.ts) jako child process.
 *   5) Backend zabije, MongoMemoryServer zastaví. Vrátí exit code smoke testu.
 *
 * Spuštění: cd backend && npm run smoke:be:full
 */

import { spawn, ChildProcess } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { createServer } from 'net';
import * as path from 'path';
import { createRequire } from 'module';

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr && 'port' in addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('cannot read port')));
      }
    });
  });
}

const REPO_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');

// mongodb-memory-server a web-push jsou v backend/node_modules, ne v root.
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const { MongoMemoryServer } = backendRequire('mongodb-memory-server') as {
  MongoMemoryServer: {
    create: () => Promise<{
      getUri: () => string;
      stop: () => Promise<void>;
    }>;
  };
};
type MongoMemoryServer = Awaited<ReturnType<typeof MongoMemoryServer.create>>;

const webpush = backendRequire('web-push') as {
  generateVAPIDKeys: () => { publicKey: string; privateKey: string };
};
const SMOKE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'backend-smoke-test.ts');
const STARTUP_TIMEOUT_MS = 90_000;

let mongo: MongoMemoryServer | undefined;
let backend: ChildProcess | undefined;

async function waitForHealth(url: string, deadline: number): Promise<void> {
  let lastErr = 'unknown';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = (await res.json()) as {
          data?: {
            status: string;
            checks?: { mongo?: { ok: boolean; detail?: string } };
          };
        };
        const data = body?.data;
        const mongoOk = data?.checks?.mongo?.ok;
        console.log(
          `  /api/health: status=${data?.status} mongo.ok=${mongoOk} (${data?.checks?.mongo?.detail ?? '?'})`,
        );
        if (mongoOk) return;
        lastErr = data?.checks?.mongo?.detail ?? 'mongo not ok';
      } else {
        lastErr = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastErr = (err as Error).message;
    }
    await sleep(1500);
  }
  throw new Error(`Backend nedosáhl health=ok do timeoutu (${lastErr})`);
}

async function shutdown(): Promise<void> {
  if (backend && !backend.killed) {
    console.log('  zastavuji backend...');
    // Tree kill — npm spawnuje subprocess (nest start → node dist/main).
    if (process.platform === 'win32') {
      // taskkill /T zabije celý strom
      try {
        spawn('taskkill', ['/PID', String(backend.pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      } catch {
        backend.kill('SIGTERM');
      }
    } else {
      backend.kill('SIGTERM');
    }
    await sleep(500);
  }
  if (mongo) {
    console.log('  zastavuji MongoMemoryServer...');
    await mongo.stop();
  }
}

async function main(): Promise<void> {
  console.log('Smoke test orchestrátor (in-memory Mongo + backend + smoke)');
  console.log('───────────────────────────────────────────────');

  // 0) Volný port
  const port = process.env.SMOKE_PORT
    ? parseInt(process.env.SMOKE_PORT, 10)
    : await findFreePort();
  const BASE_URL = `http://localhost:${port}`;
  const HEALTH_URL = `${BASE_URL}/api/health`;
  console.log(`  smoke port: ${port}`);

  // 1) Mongo
  console.log('  spouštím MongoMemoryServer...');
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  console.log(`  mongo URI: ${uri}`);

  // 2) Backend — VAPID klíče musí být validní ECDSA pár, jinak push.service
  // crashuje při bootstrapu. Generujeme na lehko per-run.
  const vapid = webpush.generateVAPIDKeys();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    MONGODB_URI: uri,
    JWT_SECRET: process.env.JWT_SECRET ?? 'smoke-jwt-secret-access',
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET ?? 'smoke-jwt-secret-refresh',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '1h',
    JWT_REFRESH_TTL_DAYS: process.env.JWT_REFRESH_TTL_DAYS ?? '7',
    FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? 'mailto:smoke@test.local',
    // Fake Cloudinary klíče — pouze pro health check. Skutečné uploads
    // pochopitelně selžou, ale smoke test je netestuje.
    CLOUDINARY_CLOUD_NAME:
      process.env.CLOUDINARY_CLOUD_NAME ?? 'smoke-test-cloud',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? 'smoke-test-key',
    CLOUDINARY_API_SECRET:
      process.env.CLOUDINARY_API_SECRET ?? 'smoke-test-secret',
  };

  console.log(`  spouštím backend na portu ${port}...`);
  backend = spawn('npm', ['run', 'start'], {
    cwd: BACKEND_DIR,
    env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backend.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`  [backend] ${line.split('\n')[0]}`);
  });
  backend.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.error(`  [backend.err] ${line.split('\n')[0]}`);
  });

  // 3) Wait for health
  await waitForHealth(HEALTH_URL, Date.now() + STARTUP_TIMEOUT_MS);
  console.log('  backend ready ✓');
  console.log('───────────────────────────────────────────────');

  // 4) Smoke test — quoting JSON přes shell:true je nespolehlivé
  // (Windows cmd.exe shell ořeže uvozovky), proto předáváme přes ts-node
  // env vars TS_NODE_TRANSPILE_ONLY a TS_NODE_COMPILER_OPTIONS.
  const smokeExit = await new Promise<number>((resolve) => {
    const child = spawn('npx', ['ts-node', SMOKE_SCRIPT], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        BASE_URL,
        TS_NODE_TRANSPILE_ONLY: 'true',
        TS_NODE_COMPILER_OPTIONS:
          '{"module":"commonjs","moduleResolution":"node"}',
      },
      shell: true,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });

  console.log('───────────────────────────────────────────────');
  await shutdown();
  process.exit(smokeExit);
}

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(130);
});
process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(143);
});

main().catch(async (err: unknown) => {
  console.error('[fatal]', err);
  await shutdown();
  process.exit(1);
});
