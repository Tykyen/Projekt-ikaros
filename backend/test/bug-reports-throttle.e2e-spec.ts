/**
 * Spec 25.1 — smoke: per-endpoint @Throttle(5/min) na veřejném POST /bug-reports
 * blokuje anon spam. Izolovaný setup (guardy override na passthrough) —
 * testuje POUZE throttle, ne auth; vzor auth-throttle.e2e-spec.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { BugReportsController } from '../src/modules/bug-reports/bug-reports.controller';
import { BugReportsService } from '../src/modules/bug-reports/bug-reports.service';
import { OptionalJwtAuthGuard } from '../src/common/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

describe('BugReports throttle (e2e smoke)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const mockService = {
      create: jest.fn().mockResolvedValue({ id: 'x' }),
      list: jest.fn(),
      resolve: jest.fn(),
    };
    const passthrough = { canActivate: () => true };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [BugReportsController],
      providers: [
        { provide: BugReportsService, useValue: mockService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue(passthrough)
      .overrideGuard(JwtAuthGuard)
      .useValue(passthrough)
      .overrideGuard(RolesGuard)
      .useValue(passthrough)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function payload() {
    return {
      text: 'spam',
      context: {
        url: 'https://ikaros.test/x',
        scope: 'ikaros',
        speaker: 'ikaros',
      },
    };
  }

  it('POST /bug-reports: 5 projde (201), 6. = 429', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      const res = await request(server).post('/bug-reports').send(payload());
      expect(res.status).toBe(201);
    }
    const sixth = await request(server).post('/bug-reports').send(payload());
    expect(sixth.status).toBe(429);
  });
});
