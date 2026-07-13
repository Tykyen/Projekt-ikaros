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
import { WorldElevationsService } from '../src/modules/world-elevations/world-elevations.service';

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
      // D-SEC-GAP — anti-enumeration: check endpointy vrací konstantní tvar.
      checkUsername: jest.fn().mockResolvedValue({ available: true }),
      checkEmail: jest.fn().mockResolvedValue({ available: true }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        // AuthController má JwtAuthGuard na logout-all/resend-verification →
        // Nest resolvuje jeho konstruktor při app.init() bez ohledu na to,
        // že tento smoke test volá jen /login. Mock, žádná reálná DB/logika
        // (JwtAuthGuard.canActivate se v tomto testu nikdy nevykoná).
        { provide: 'IUsersRepository', useValue: {} },
        { provide: WorldElevationsService, useValue: {} },
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

  // D-SEC-GAP — anti-enumeration mitigace: check-username/check-email vrací
  // existenci účtu (záměrná UX opora registrace) → přísný limit 10/min/IP
  // proti hromadnému scrapingu. Response musí zůstat konstantní tvar
  // { available: boolean } — žádné detaily.
  it('/auth/check-username: 10 pokusů projde, 11. = 429', async () => {
    const server = app.getHttpServer();

    for (let i = 0; i < 10; i++) {
      const res = await request(server).get('/auth/check-username?u=hrdina');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: true });
    }

    const eleventh = await request(server).get('/auth/check-username?u=hrdina');
    expect(eleventh.status).toBe(429);
  });

  it('/auth/check-email: 10 pokusů projde, 11. = 429', async () => {
    const server = app.getHttpServer();

    for (let i = 0; i < 10; i++) {
      const res = await request(server).get('/auth/check-email?e=a@b.cz');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: true });
    }

    const eleventh = await request(server).get('/auth/check-email?e=a@b.cz');
    expect(eleventh.status).toBe(429);
  });
});
