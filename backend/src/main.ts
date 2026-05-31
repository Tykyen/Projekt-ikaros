import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import type { ServerResponse } from 'http';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CustomIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useWebSocketAdapter(new CustomIoAdapter(app));
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
  });

  // 10.2c-fix — lokální storage fallback pro Cloudinary outage.
  // Soubory v `backend/uploads/` jsou servable přes `/static/`.
  // useStaticAssets PO enableCors + explicit CORS headers pro WebGL
  // texture load v PixiJS (browser jinak blokuje cross-origin texture).
  const allowedOrigin = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  app.useStaticAssets(resolve(process.cwd(), 'uploads'), {
    prefix: '/static/',
    setHeaders: (res: ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
