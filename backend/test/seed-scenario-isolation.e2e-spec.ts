import request from 'supertest';
import { createTestApp, type TestApp } from './helpers/app-factory';
import { authHeader } from './helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from './helpers/seed-scenario';

/**
 * Seed scenario gauntlet — osa IS (tenant izolace). Oblast 08 plánu (K-SS11).
 *
 * Dva kanonické světy A,B (oba private). Identita ze světa A (PJ-A = NEčlen B)
 * NESMÍ přečíst žádný obsah světa B: detail / stránky / členy / chat / scény.
 * Happy-path 1-světová zápletka tuhle nejvyšší bezpečnostní vlastnost z principu
 * nechytí — proto samostatný gauntlet běh.
 *
 * **Kontrolní strana (anti-false-green):** člen B (PJ-B) tentýž zdroj VIDÍ. Bez
 * toho by endpoint, který vrací 403 úplně všem, test falešně zezelenal — neověřil
 * by izolaci, jen že nikdo nic nevidí.
 *
 * replSet kvůli transakční approve cestě v builderu. Pasti: kombinovaný test:e2e
 * SIGABRT → pouštět sólo (`npm run test:e2e -- seed-scenario-isolation`).
 */
describe('Seed scenario gauntlet — IS tenant izolace (e2e)', () => {
  let testApp: TestApp;
  let A: CanonicalSeed;
  let B: CanonicalSeed;

  const srv = () => testApp.app.getHttpServer();
  const outsider = () => authHeader(A.pj.accessToken); // PJ světa A = nečlen B
  const insider = () => authHeader(B.pj.accessToken); // PJ světa B = člen + staff

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    A = await buildCanonicalWorld(testApp.app, testApp.connection, {
      suffix: 'isoa',
    });
    B = await buildCanonicalWorld(testApp.app, testApp.connection, {
      suffix: 'isob',
    });
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  /**
   * Neúnik: odpověď buď odepře (401/403/404), nebo vrátí 200 BEZ výskytu `needle`
   * (leak-safe prázdno/filtr). 200 obsahující needle = únik cizího světa → fail.
   * Diagnostika kompaktní (žádný dump celého těla — leaklé seznamy jsou obří).
   */
  function expectNoLeak(
    endpoint: string,
    res: request.Response,
    needle: string,
  ): void {
    const allowed = [401, 403, 404].includes(res.status);
    const leaked =
      res.status === 200 && JSON.stringify(res.body ?? '').includes(needle);
    expect({ endpoint, status: res.status, leaked }).toEqual({
      endpoint,
      status: res.status,
      leaked: false,
    });
    expect(allowed || res.status === 200).toBe(true);
  }

  it('detail světa: člen 200, nečlen 404 (private leak-safe)', async () => {
    const ok = await request(srv())
      .get(`/api/worlds/${B.worldId}`)
      .set(insider());
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).toContain(B.worldSlug);

    const leak = await request(srv())
      .get(`/api/worlds/${B.worldId}`)
      .set(outsider());
    expect(leak.status).toBe(404);
  });

  it('stránky: člen vidí page B, nečlen ne', async () => {
    const ok = await request(srv())
      .get(`/api/worlds/${B.worldId}/pages`)
      .set(insider());
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).toContain(B.pageSlug); // kontrola: člen to fakt vidí

    const leak = await request(srv())
      .get(`/api/worlds/${B.worldId}/pages`)
      .set(outsider());
    expectNoLeak('GET /worlds/:id/pages', leak, B.pageSlug);
  });

  it('členové: člen vidí hráče B, nečlen ne', async () => {
    const ok = await request(srv())
      .get(`/api/worlds/${B.worldId}/members`)
      .set(insider());
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).toContain(B.hrac.userId);

    const leak = await request(srv())
      .get(`/api/worlds/${B.worldId}/members`)
      .set(outsider());
    expectNoLeak('GET /worlds/:id/members', leak, B.hrac.userId);
  });

  it('chat: člen vidí kanál B, nečlen ne', async () => {
    const ok = await request(srv())
      .get(`/api/worlds/${B.worldId}/chat/groups`)
      .set(insider());
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).toContain(B.chatGroupId);

    const leak = await request(srv())
      .get(`/api/worlds/${B.worldId}/chat/groups`)
      .set(outsider());
    expectNoLeak('GET /worlds/:id/chat/groups', leak, B.chatGroupId);
  });

  it('mapa: člen (staff) vidí scénu B, nečlen ne', async () => {
    const ok = await request(srv())
      .get('/api/maps')
      .query({ worldId: B.worldId })
      .set(insider());
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).toContain(B.sceneId);

    const leak = await request(srv())
      .get('/api/maps')
      .query({ worldId: B.worldId })
      .set(outsider());
    expectNoLeak('GET /maps?worldId', leak, B.sceneId);
  });
});
