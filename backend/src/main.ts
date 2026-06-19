import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { resolve } from 'path';
import type { ServerResponse } from 'http';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';
import { CustomIoAdapter } from './socket-io.adapter';
import { getAllowedOrigins, getPrimaryOrigin } from './common/config/origins';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  // LH-06 (log hygiene) — top-level záchyt: bez handleru Node při neodchycené
  // chybě syrově vysype celý objekt na stderr. Logujeme přes Logger jen
  // name+stack (žádný raw dump); uncaughtException nechá proces řízeně spadnout
  // (po ní je stav procesu nejistý).
  const bootLogger = new Logger('Process');
  process.on('unhandledRejection', (reason) => {
    bootLogger.error(
      'Unhandled promise rejection',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });
  process.on('uncaughtException', (err) => {
    bootLogger.error(
      'Uncaught exception',
      err instanceof Error ? err.stack : String(err),
    );
    process.exit(1);
  });

  // LH-02 (log hygiene) — v produkci netiskni debug/verbose, aby debug zbytky
  // netekly do prod logu (stdout → Docker → disk). Dev má plnou úroveň.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isProd
      ? ['log', 'warn', 'error']
      : ['log', 'warn', 'error', 'debug', 'verbose'],
  });

  app.setGlobalPrefix('api');
  // Body limit zvednut z expressího defaultu (100 kB) — bohaté / migrované
  // stránky a postavy (roky obsahu + subdokumenty v jednom PATCH) jinak
  // při uložení vrací 413 Content Too Large.
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { limit: '5mb', extended: true });
  // PC-07: forbidNonWhitelisted — neznámá pole vrátí 400 místo tichého dropu
  // (drift FE↔BE přestane být tichý). whitelist+transform jako dřív.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // F2 (error-contract): CS hlášky + code:'VALIDATION' + fields{} pro field-mapping
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useWebSocketAdapter(new CustomIoAdapter(app));
  // PC-04: origin z jednoho zdroje; localhost varianty jen mimo produkci.
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

  // 14.3 — Bezpečnostní hlavičky (API hardening). Hlavní XSS-CSP žije na FE
  // nginx (servíruje HTML dokument); BE vrací jen JSON (/api) a obrázky
  // (/static/), takže tady stačí restriktivní hardening:
  //   • CSP default-src 'none' — kdyby někdo otevřel /api/... přímo v
  //     prohlížeči, nespustí se žádný skript ani se nic nenačte.
  //   • HSTS — vynutí HTTPS na API doméně (ctěno jen po HTTPS spojení).
  //   • crossOriginResourcePolicy:false — /static/ si CORP řídí sám níže
  //     ('cross-origin' pro PixiJS WebGL textury); helmetí default 'same-origin'
  //     by cross-origin texture load rozbil.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
      frameguard: { action: 'deny' },
      crossOriginResourcePolicy: false,
    }),
  );

  // 10.2c-fix — lokální storage fallback pro Cloudinary outage.
  // Soubory v `backend/uploads/` jsou servable přes `/static/`.
  // useStaticAssets PO enableCors + explicit CORS headers pro WebGL
  // texture load v PixiJS (browser jinak blokuje cross-origin texture).
  const allowedOrigin = getPrimaryOrigin();
  app.useStaticAssets(resolve(process.cwd(), 'uploads'), {
    prefix: '/static/',
    setHeaders: (res: ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  // PC-22: Swagger jen mimo produkci — neexponovat celé API schema veřejně v prod.
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Projekt Ikaros API')
      .setDescription(
        'REST API dokumentace pro Projekt Ikaros.\n\n' +
          '**WebSocket eventy:** viz `docs/websocket-api.md` v repozitáři\n\n' +
          'Autorizace: Bearer JWT token — získán z `POST /api/auth/login`',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
