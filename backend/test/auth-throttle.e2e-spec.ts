/**
 * Smoke test: ověřuje, že per-endpoint @Throttle decorator + global ThrottlerGuard
 * správně blokují brute-force na /auth/login (limit 5/min/IP).
 *
 * Izolovaný setup — ne plný AppModule, jen AuthController + mocknutý AuthService.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';

describe('Auth throttle (e2e smoke)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const mockAuthService = {
      login: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Bad creds')),
      register: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      logoutAll: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/login: 5 pokusů projde s 401 (špatné creds), 6. = 429', async () => {
    const server = app.getHttpServer();
    const payload = { identifier: 'attacker', password: 'wrong' };

    for (let i = 0; i < 5; i++) {
      const res = await request(server).post('/auth/login').send(payload);
      expect(res.status).toBe(401);
    }

    const sixth = await request(server).post('/auth/login').send(payload);
    expect(sixth.status).toBe(429);
  });
});
