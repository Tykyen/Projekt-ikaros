import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from './helpers/app-factory';
import { registerUser, authHeader, type AuthSession } from './helpers/auth';

/**
 * 22.5 — Sdílení & klonování scén (leak-pojistky).
 *
 * Kontrakt: publikovaná šablona scény jde do veřejného katalogu jen po
 * schválení kurátorem; klon do světa nikdy nenese PC tokeny (šablona je nemá)
 * ani svět-scoped zvuky; klon respektuje licenci (`cloneAllowed`); cizí
 * nepublikovanou šablonu nelze naklonovat.
 *
 * Spec: Projekt-ikaros-FE/docs/arch/phase-22/spec-22.5-sdileni-klonovani-scen.md
 */
describe('22.5 · sdílení & klonování scén', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let pjA: AuthSession; // autor šablon
  let pjB: AuthSession; // klonér (PJ vlastního světa)
  let curator: AuthSession; // Superadmin (schvaluje)
  let worldBId: string; // svět pjB (cíl klonu)

  const srv = () => app.getHttpServer();
  const A = () => authHeader(pjA.accessToken);
  const B = () => authHeader(pjB.accessToken);
  const C = () => authHeader(curator.accessToken);
  const col = (n: string) => testApp.connection.db!.collection(n);

  /** Vytvoří šablonu scény pjA s NPC + PC tokenem + zvukem. */
  async function makeTemplate(name: string): Promise<string> {
    const res = await request(srv())
      .post('/api/map-templates')
      .set(A())
      .send({
        name,
        imageUrl: 'https://x/scene.webp',
        config: { size: 40, originX: 0, originY: 0, showGrid: true },
        tokens: [
          { id: 'npc1', isNpc: true, name: 'Skřet' },
          {
            id: 'pc1',
            isNpc: false,
            name: 'Hrdina',
            characterId: 'char-secret',
          },
        ],
        activeSoundIds: ['world-sound-1'],
      });
    expect(res.status).toBe(201);
    return String(res.body.id ?? res.body._id);
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;

    pjA = await registerUser(app, {
      username: 'scene-author',
      email: 'scene-author@test.io',
      password: 'Password123!',
    });
    pjB = await registerUser(app, {
      username: 'scene-cloner',
      email: 'scene-cloner@test.io',
      password: 'Password123!',
    });
    curator = await registerUser(app, {
      username: 'scene-curator',
      email: 'scene-curator@test.io',
      password: 'Password123!',
    });

    // Kurátor = Superadmin (role 1). JwtAuthGuard refreshuje roli z DB per-request.
    await col('users').updateOne(
      { username: 'scene-curator' },
      { $set: { role: 1 } },
    );

    // pjB si založí vlastní svět → je jeho PJ (cíl klonu).
    const wb = await request(srv())
      .post('/api/worlds')
      .set(B())
      .send({
        name: 'Svět klonéra',
        slug: `scene-clone-world-${Date.now()}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'private',
        description: 'Cíl klonu scén',
      })
      .expect(201);
    worldBId = String(wb.body.id ?? wb.body._id);
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ════════════════════════════════════════════════════════════════════
  // 1 · PC token strip při vytvoření šablony
  // ════════════════════════════════════════════════════════════════════
  it('PC token se do šablony neuloží (jen NPC)', async () => {
    const id = await makeTemplate('Strip test');
    const res = await request(srv())
      .get(`/api/map-templates/${id}`)
      .set(A())
      .expect(200);
    const ids = (res.body.tokens as { id: string }[]).map((t) => t.id);
    expect(ids).toContain('npc1');
    expect(ids).not.toContain('pc1');
    expect(JSON.stringify(res.body)).not.toContain('char-secret');
  });

  // ════════════════════════════════════════════════════════════════════
  // 2 · Publikace → pending, strip zvuků, licenční karta
  // ════════════════════════════════════════════════════════════════════
  it('publish → reviewStatus pending + activeSoundIds strippnuté', async () => {
    const id = await makeTemplate('Publish test');
    const res = await request(srv())
      .post(`/api/map-templates/${id}/publish`)
      .set(A())
      .send({ licenseMode: 'clone', attributionRequired: true })
      .expect(200);
    expect(res.body.published).toBe(true);
    expect(res.body.reviewStatus).toBe('pending');
    expect(res.body.activeSoundIds).toEqual([]);
    // Licenční karta (20D) vznikla.
    const lic = await col('content_licenses').findOne({ contentId: id });
    expect(lic).toBeTruthy();
    expect(lic?.cloneAllowed).toBe(true);
  });

  // ════════════════════════════════════════════════════════════════════
  // 3 · Katalog: pending není vidět; approve zpřístupní
  // ════════════════════════════════════════════════════════════════════
  it('pending šablona není v katalogu; kurátor schválí → je', async () => {
    const id = await makeTemplate('Catalog test');
    await request(srv())
      .post(`/api/map-templates/${id}/publish`)
      .set(A())
      .send({ licenseMode: 'clone' })
      .expect(200);

    const before = await request(srv())
      .get('/api/map-templates/catalog')
      .set(B())
      .expect(200);
    expect(
      (before.body.items as { id: string }[]).some((t) => t.id === id),
    ).toBe(false);

    // Non-kurátor (autor) schválit nemůže.
    await request(srv())
      .post(`/api/map-templates/${id}/approve`)
      .set(A())
      .expect(403);

    // Kurátor schválí.
    await request(srv())
      .post(`/api/map-templates/${id}/approve`)
      .set(C())
      .expect(200);

    const after = await request(srv())
      .get('/api/map-templates/catalog')
      .set(B())
      .expect(200);
    const entry = (
      after.body.items as { id: string; publicAuthorName: string }[]
    ).find((t) => t.id === id);
    expect(entry).toBeTruthy();
    // Whitelist mapper — žádný raw ownerId v katalogovém záznamu.
    expect(entry).not.toHaveProperty('ownerId');
    expect(entry?.publicAuthorName).toBeTruthy();
  });

  // ════════════════════════════════════════════════════════════════════
  // 4 · Klon do světa: nová scéna BEZ PC tokenů, BEZ zvuků
  // ════════════════════════════════════════════════════════════════════
  it('klon schválené šablony do světa (PJ) → scéna bez PC/zvuků', async () => {
    const id = await makeTemplate('Clone test');
    await request(srv())
      .post(`/api/map-templates/${id}/publish`)
      .set(A())
      .send({ licenseMode: 'clone' })
      .expect(200);
    await request(srv())
      .post(`/api/map-templates/${id}/approve`)
      .set(C())
      .expect(200);

    const scene = await request(srv())
      .post('/api/maps')
      .set(B())
      .send({ worldId: worldBId, templateId: id, name: 'Klon scény' })
      .expect(201);
    const tokenIds =
      (scene.body.tokens as { id: string }[] | undefined)?.map((t) => t.id) ??
      [];
    expect(tokenIds).not.toContain('pc1');
    expect(scene.body.activeSoundIds ?? []).toEqual([]);
  });

  // ════════════════════════════════════════════════════════════════════
  // 5 · Licence: read-only (cloneAllowed=false) → klon 403
  // ════════════════════════════════════════════════════════════════════
  it('šablona „jen ke čtení" (read) → klon 403', async () => {
    const id = await makeTemplate('Read-only test');
    await request(srv())
      .post(`/api/map-templates/${id}/publish`)
      .set(A())
      .send({ licenseMode: 'read' })
      .expect(200);
    await request(srv())
      .post(`/api/map-templates/${id}/approve`)
      .set(C())
      .expect(200);

    const res = await request(srv())
      .post('/api/maps')
      .set(B())
      .send({ worldId: worldBId, templateId: id });
    expect(res.status).toBe(403);
  });

  // ════════════════════════════════════════════════════════════════════
  // 6 · Cizí NEpublikovaná šablona → klon 403 (anti-enumeration)
  // ════════════════════════════════════════════════════════════════════
  it('cizí nepublikovaná šablona → klon 403', async () => {
    const id = await makeTemplate('Private test'); // pjA, nepublikováno
    const res = await request(srv())
      .post('/api/maps')
      .set(B())
      .send({ worldId: worldBId, templateId: id });
    expect(res.status).toBe(403);
  });

  // ════════════════════════════════════════════════════════════════════
  // 7 · Unpublish stáhne z katalogu
  // ════════════════════════════════════════════════════════════════════
  it('unpublish → šablona zmizí z katalogu', async () => {
    const id = await makeTemplate('Unpublish test');
    await request(srv())
      .post(`/api/map-templates/${id}/publish`)
      .set(A())
      .send({ licenseMode: 'clone' })
      .expect(200);
    await request(srv())
      .post(`/api/map-templates/${id}/approve`)
      .set(C())
      .expect(200);
    await request(srv())
      .post(`/api/map-templates/${id}/unpublish`)
      .set(A())
      .expect(200);

    const cat = await request(srv())
      .get('/api/map-templates/catalog')
      .set(B())
      .expect(200);
    expect((cat.body.items as { id: string }[]).some((t) => t.id === id)).toBe(
      false,
    );
  });
});
