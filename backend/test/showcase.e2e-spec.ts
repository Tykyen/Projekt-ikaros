import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './helpers/app-factory';
import { registerUser, authHeader, type AuthSession } from './helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from './helpers/seed-scenario';

/**
 * 22.4 — Veřejná výkladní skříň světa (leak-pojistky).
 *
 * Kontrakt: anonym vidí NEJVÝŠE to, co člen v roli Čtenář, a JEN když PJ
 * vitrínu (`world.publicShowcase`) vědomě zapnul. Testuje se:
 *   1. governance přepínače (jen PJ; ne private; auto-drop při přechodu na private)
 *   2. anon čtení vitrínového světa (pages/bestiae/world-maps) — 200
 *   3. anon ⊆ Čtenář invariant (žádné pole/záznam navíc)
 *   4. svět BEZ vitríny / private → 403; AKJ obsah nikdy; osobní bestie nikdy
 *   5. mutace pro anonyma → 401 (Optional guard nesmí otevřít zápis)
 *
 * Spec: Projekt-ikaros-FE/docs/arch/phase-22/spec-22.4-verejna-vykladni-skrin.md
 */
describe('22.4 · veřejná výkladní skříň (showcase)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed; // svět A — public + vitrína ON
  let outsider: AuthSession; // přihlášený uživatel s osobní bestií (leak cíl)
  let worldNoShowcaseId: string; // svět C — public, vitrína OFF
  let bestieWorldId: string; // world-scoped bestie světa A
  let bestieUserId: string; // osobní (user-scope) bestie outsidera
  let akjPageSlug: string; // AKJ chráněná stránka světa A

  const SYSTEM_ID = 'showcase-e2e-sys';
  const srv = () => app.getHttpServer();
  const PJ = () => authHeader(seed.pj.accessToken);
  const HRAC = () => authHeader(seed.hrac.accessToken);

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;

    // Svět A (kanonický seed staví private — PJ ho zveřejní + zapne vitrínu).
    seed = await buildCanonicalWorld(app, testApp.connection);
    await request(srv())
      .patch(`/api/worlds/${seed.worldId}`)
      .set(PJ())
      .send({ accessMode: 'public' })
      .expect(200);
    const on = await request(srv())
      .patch(`/api/worlds/${seed.worldId}`)
      .set(PJ())
      .send({ publicShowcase: true })
      .expect(200);
    expect(on.body.publicShowcase).toBe(true); // toEntity nese flag

    // Svět C — public, vitrína default OFF.
    outsider = await registerUser(app, {
      username: 'showcase-outsider',
      email: 'showcase-outsider@test.io',
      password: 'Password123!',
    });
    const wc = await request(srv())
      .post('/api/worlds')
      .set(authHeader(outsider.accessToken))
      .send({
        name: 'Svět C bez vitríny',
        slug: `showcase-no-vitrina-${Date.now()}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'public',
        description: 'Public svět, vitrína vypnutá',
      })
      .expect(201);
    worldNoShowcaseId = String(wc.body.id ?? wc.body._id);

    // World bestie ve světě A (PJ) + osobní bestie outsidera (leak cíl).
    const bw = await request(srv()).post('/api/bestiae').set(PJ()).send({
      scope: 'world',
      worldId: seed.worldId,
      systemId: SYSTEM_ID,
      name: 'Vitrínový zlobr',
      systemStats: {},
    });
    expect([200, 201]).toContain(bw.status);
    bestieWorldId = String(bw.body.id ?? bw.body._id);
    const bu = await request(srv())
      .post('/api/bestiae')
      .set(authHeader(outsider.accessToken))
      .send({
        scope: 'user',
        systemId: SYSTEM_ID,
        name: 'Soukromá bestie outsidera',
        systemStats: {},
      });
    expect([200, 201]).toContain(bu.status);
    bestieUserId = String(bu.body.id ?? bu.body._id);

    // Mapy světa A: veřejná (isPublic) + tajná (isPublic:false).
    await request(srv())
      .post(`/api/world-maps/${seed.worldId}/maps`)
      .set(PJ())
      .send({
        title: 'Veřejná mapa',
        imageUrl: 'https://x/map-pub.webp',
        isPublic: true,
      })
      .expect(201);
    await request(srv())
      .post(`/api/world-maps/${seed.worldId}/maps`)
      .set(PJ())
      .send({
        title: 'Tajná mapa PJ',
        imageUrl: 'https://x/map-sec.webp',
        isPublic: false,
      })
      .expect(201);

    // AKJ chráněná stránka světa A (anon ji nesmí přečíst NIKDY).
    akjPageSlug = 'vitrina-akj-tajemstvi';
    await request(srv())
      .post(`/api/worlds/${seed.worldId}/pages`)
      .set(PJ())
      .send({
        slug: akjPageSlug,
        type: 'Ostatní',
        title: 'AKJ tajemství',
        content: '<p>Jen pro zasvěcené</p>',
        accessRequirements: [{ type: 'AKJ', value: '3' }],
      })
      .expect(201);
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ════════════════════════════════════════════════════════════════════
  // 1 · Governance přepínače
  // ════════════════════════════════════════════════════════════════════
  describe('governance publicShowcase', () => {
    it('člen s rolí Hrac přepínač nezapne (403)', async () => {
      const res = await request(srv())
        .patch(`/api/worlds/${seed.worldId}`)
        .set(HRAC())
        .send({ publicShowcase: false });
      expect(res.status).toBe(403);
    });

    it('vitrína na private světě → 400 SHOWCASE_PRIVATE_WORLD', async () => {
      const res = await request(srv())
        .patch(`/api/worlds/${worldNoShowcaseId}`)
        .set(authHeader(outsider.accessToken))
        .send({ accessMode: 'private', publicShowcase: true });
      expect(res.status).toBe(400);
      // Error contract (13. styl): { error: { code, message, timestamp } }.
      expect(res.body.error?.code).toBe('SHOWCASE_PRIVATE_WORLD');
    });

    it('přechod na private vitrínu automaticky shodí (A→B→A)', async () => {
      // Svět C: zapnout vitrínu → přepnout na private → flag spadl.
      await request(srv())
        .patch(`/api/worlds/${worldNoShowcaseId}`)
        .set(authHeader(outsider.accessToken))
        .send({ publicShowcase: true })
        .expect(200);
      const priv = await request(srv())
        .patch(`/api/worlds/${worldNoShowcaseId}`)
        .set(authHeader(outsider.accessToken))
        .send({ accessMode: 'private' })
        .expect(200);
      expect(priv.body.publicShowcase).toBe(false);
      // Zpět do výchozího stavu testu: public, vitrína OFF.
      const back = await request(srv())
        .patch(`/api/worlds/${worldNoShowcaseId}`)
        .set(authHeader(outsider.accessToken))
        .send({ accessMode: 'public' })
        .expect(200);
      expect(back.body.publicShowcase).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 2 · Anon čte vitrínový svět (200) + invariant anon ⊆ Čtenář
  // ════════════════════════════════════════════════════════════════════
  describe('anon na vitrínovém světě A', () => {
    it('GET world detail nese publicShowcase', async () => {
      const res = await request(srv())
        .get(`/api/worlds/${seed.worldId}`)
        .expect(200);
      expect(res.body.publicShowcase).toBe(true);
    });

    it('wiki stránka: 200 a anon ⊆ člen (žádná pole navíc)', async () => {
      const anon = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/${seed.pageSlug}`)
        .expect(200);
      const member = await request(srv())
        .get(`/api/worlds/${seed.worldId}/pages/${seed.pageSlug}`)
        .set(HRAC())
        .expect(200);
      expect(anon.body.slug).toBe(seed.pageSlug);
      expect(typeof anon.body.content).toBe('string');
      // Invariant: anon nedostane žádný klíč, který nemá člen.
      const memberKeys = new Set(Object.keys(member.body as object));
      for (const key of Object.keys(anon.body as object)) {
        expect(memberKeys.has(key)).toBe(true);
      }
    });

    it('bestiář: world bestie ano, osobní bestie NIKDY (leak pin)', async () => {
      const res = await request(srv())
        .get(`/api/bestiae?systemId=${SYSTEM_ID}&worldId=${seed.worldId}`)
        .expect(200);
      const worldIds = (res.body.world as { id: string }[]).map((b) => b.id);
      expect(worldIds).toContain(bestieWorldId);
      // Pin na mongoose-strip past: user-scope větev nesmí matchnout nic.
      expect(res.body.user).toEqual([]);
    });

    it('bestie detail: world-scope 200, user-scope 403', async () => {
      await request(srv()).get(`/api/bestiae/${bestieWorldId}`).expect(200);
      const res = await request(srv()).get(`/api/bestiae/${bestieUserId}`);
      expect(res.status).toBe(403);
    });

    it('atlas map: jen isPublic mapy, bez visibleToPlayerIds', async () => {
      const res = await request(srv())
        .get(`/api/world-maps?worldId=${seed.worldId}`)
        .expect(200);
      const titles = (res.body as { title: string }[]).map((m) => m.title);
      expect(titles).toContain('Veřejná mapa');
      expect(titles).not.toContain('Tajná mapa PJ');
      for (const m of res.body as { visibleToPlayerIds: string[] }[]) {
        expect(m.visibleToPlayerIds).toEqual([]);
      }
    });

    it('strom složek atlasu: 200', async () => {
      await request(srv())
        .get(`/api/world-maps/folders?worldId=${seed.worldId}`)
        .expect(200);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 3 · Anon blokován: bez vitríny / AKJ / bez worldId
  // ════════════════════════════════════════════════════════════════════
  describe('anon blokován', () => {
    it('svět C (public, vitrína OFF): pages/bestiae/mapy → 403', async () => {
      const page = await request(srv()).get(
        `/api/worlds/${worldNoShowcaseId}/pages/cokoliv`,
      );
      expect(page.status).toBe(403);
      const best = await request(srv()).get(
        `/api/bestiae?systemId=${SYSTEM_ID}&worldId=${worldNoShowcaseId}`,
      );
      expect(best.status).toBe(403);
      const maps = await request(srv()).get(
        `/api/world-maps?worldId=${worldNoShowcaseId}`,
      );
      expect(maps.status).toBe(403);
    });

    it('neexistující svět → 403 (anti-enumeration, ne 404)', async () => {
      const res = await request(srv()).get(
        '/api/worlds/64b000000000000000000000/pages/cokoliv',
      );
      expect(res.status).toBe(403);
    });

    it('AKJ stránka na vitrínovém světě → 403 (obsah nikdy)', async () => {
      const res = await request(srv()).get(
        `/api/worlds/${seed.worldId}/pages/${akjPageSlug}`,
      );
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('Jen pro zasvěcené');
    });

    it('bestiář bez worldId (osobní/system katalog) → 403', async () => {
      const res = await request(srv()).get(
        `/api/bestiae?systemId=${SYSTEM_ID}`,
      );
      expect(res.status).toBe(403);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // 4 · Mutace pro anonyma zůstávají zamčené (401)
  // ════════════════════════════════════════════════════════════════════
  describe('anon mutace → 401', () => {
    it('PATCH world / POST page / POST mapa / POST bestie', async () => {
      const world = await request(srv())
        .patch(`/api/worlds/${seed.worldId}`)
        .send({ name: 'Hacked' });
      expect(world.status).toBe(401);
      const page = await request(srv())
        .post(`/api/worlds/${seed.worldId}/pages`)
        .send({ slug: 'hack', type: 'Ostatní', title: 'Hack', content: '' });
      expect(page.status).toBe(401);
      const map = await request(srv())
        .post(`/api/world-maps/${seed.worldId}/maps`)
        .send({ title: 'Hack', imageUrl: 'https://x/h.webp' });
      expect(map.status).toBe(401);
      const bestie = await request(srv()).post('/api/bestiae').send({
        scope: 'world',
        worldId: seed.worldId,
        systemId: SYSTEM_ID,
        name: 'Hack',
        systemStats: {},
      });
      expect(bestie.status).toBe(401);
    });
  });
});
