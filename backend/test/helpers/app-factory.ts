import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Type,
  DynamicModule,
  ForwardReference,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { getConnectionToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
// AppModule se importuje DYNAMICKY uvnitř createTestApp (až PO nastavení
// process.env.MONGODB_URI) — jeho `ConfigModule.forRoot({ validate })` zmrazí
// konfiguraci (vč. MONGODB_URI z .env) SYNCHRONNĚ při importu. Statický import
// na vrchu by proběhl při načtení spec souboru, PŘED beforeAll → zmrazil by
// `.env` localhost a test by se připojoval na localhost:27017 místo na
// in-memory replica set. Dynamický import to posouvá za `process.env` setup.
import { DatabaseModule } from '../../src/database/database.module';
import { RedisModule } from '../../src/common/redis/redis.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { startTestDb, startTestReplDb, TestDb } from './db';

export interface TestApp {
  app: INestApplication;
  db: TestDb;
  connection: mongoose.Connection;
  close: () => Promise<void>;
}

export interface CreateTestAppOptions {
  /**
   * Pokud je uveden, vytvoří app jen z těchto modulů (+ infrastructure: Config,
   * EventEmitter, Schedule, Throttler, Database). Když není uveden, naimportuje
   * plný AppModule. Per-test selektivní import obchází Jest module evaluation
   * issues s circular deps v plném AppModule (viz dluhy.md).
   */
  modules?: Array<
    Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference
  >;
  /** Doplňkové controllers (kromě těch z `modules`). Užitečné pro AppController. */
  controllers?: Array<Type<unknown>>;
  envOverrides?: Record<string, string>;
  /**
   * Když `true`, použije `MongoMemoryReplSet` místo standalone serveru →
   * povolí Mongo transakce (`session.startTransaction()`). Nutné pro testy
   * kaskádních/transakčních cest (seed-scenario FA/RC). Pomalejší start.
   */
  replSet?: boolean;
}

export async function createTestApp(
  opts: CreateTestAppOptions = {},
): Promise<TestApp> {
  const db = opts.replSet ? await startTestReplDb() : await startTestDb();

  process.env.MONGODB_URI = db.uri;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-access';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test-secret-refresh';
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1h';
  process.env.JWT_REFRESH_TTL_DAYS = process.env.JWT_REFRESH_TTL_DAYS ?? '30';
  // Prázdný TURNSTILE_SECRET → captcha DEV bypass (token projde bez Cloudflare callu).
  // Deterministické napříč prostředími (ConfigModule dotenv s override:false ho nepřepíše).
  process.env.TURNSTILE_SECRET = '';
  for (const [k, v] of Object.entries(opts.envOverrides ?? {})) {
    process.env[k] = v;
  }

  // Lazy require AppModule AŽ TEĎ (po `process.env.MONGODB_URI` setupu výše) —
  // viz komentář u importů nahoře (jinak by se .env localhost zmrazil dřív).
  // `require` (ne `await import`) protože ts-jest běží v CJS VM bez
  // `--experimental-vm-modules` → native dynamic import() tam hodí. require je
  // synchronní a vyhodnotí AppModule (a jeho ConfigModule.forRoot) teprve teď.
  const imports: Array<
    Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference
  > = opts.modules
    ? [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }]),
        DatabaseModule,
        // @Global REDIS provider — moduly jako UsersModule (UserBanCacheService)
        // ho vyžadují; bez něj selektivní import padá na „can't resolve REDIS"
        // (D-NEW-e2e-redis). Klient se nepřipojí (ECONNREFUSED, graceful fallback).
        RedisModule,
        ...opts.modules,
      ]
    : [
        // Lazy require ZÁMĚRNĚ: AppModule se importuje až po setupu process.env
        // (jinak ConfigModule.forRoot zmrazí .env localhost při top-level importu
        // → testy se připojí na localhost místo in-memory replSetu).
        ((): Type<unknown> => {
          const appModule =
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require('../../src/app.module') as typeof import('../../src/app.module');
          return appModule.AppModule;
        })(),
      ];

  const moduleBuilder = Test.createTestingModule({
    imports,
    controllers: opts.controllers ?? [],
    // Bez APP_GUARD ThrottlerGuard se @Throttle({...}) decorators v test módu
    // neaplikují (per-route limity register/login by jinak shazovaly testy
    // sdílením in-memory throttler state napříč iteracemi).
    providers: [],
  });

  const moduleFixture: TestingModule = await moduleBuilder.compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const connection = app.get<mongoose.Connection>(getConnectionToken());

  return {
    app,
    db,
    connection,
    close: async () => {
      // ioredis klient (RedisModule) drží otevřený socket + retry → bez quit()
      // loguje po doběhnutí testu („Cannot log after tests are done") a drží handle.
      try {
        const redis = app.get<{ quit?: () => Promise<unknown> }>('REDIS', {
          strict: false,
        });
        await redis?.quit?.();
      } catch {
        /* REDIS provider nemusí být přítomen */
      }
      await app.close();
      await db.stop();
    },
  };
}
