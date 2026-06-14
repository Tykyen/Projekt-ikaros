import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import type { ServerResponse } from 'http';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CustomIoAdapter } from './socket-io.adapter';
import { getAllowedOrigins, getPrimaryOrigin } from './common/config/origins';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useWebSocketAdapter(new CustomIoAdapter(app));
  // PC-04: origin z jednoho zdroje; localhost varianty jen mimo produkci.
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });

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
  if (process.env.NODE_ENV !== 'production') {
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
