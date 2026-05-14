import request from 'supertest';
import { createTestApp, TestApp } from './helpers/app-factory';
import { AppController } from '../src/app.controller';

describe('AppController (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [],
      controllers: [AppController],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /api/health vrací rozšířenou diagnostiku (mongo, env, cloudinary, vapid)', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    // V testovacím prostředí nemáme Cloudinary klíče, proto status=degraded;
    // klíčové ale je, že struktura odpovídá kontraktu a mongo.ok=true.
    expect(res.body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      uptimeSec: expect.any(Number),
      timestamp: expect.any(String),
      checks: {
        backend: { ok: true },
        mongo: { ok: true },
        env: expect.objectContaining({ ok: expect.any(Boolean) }),
        cloudinary: expect.objectContaining({ ok: expect.any(Boolean) }),
        vapid: expect.objectContaining({
          ok: expect.any(Boolean),
          pushModule: true,
        }),
      },
    });
  });
});
