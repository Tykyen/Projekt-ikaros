import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CustomIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useWebSocketAdapter(new CustomIoAdapter(app));
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
  }); // WebSocket CORS je nastaven v CustomIoAdapter

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
