import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';
import { Barrier, Gate, withBarrier, withGate } from './race-barrier';

/**
 * Oblast 02 — Souběžné úpravy stránky (race-condition audit, 15. styl).
 * Plán: docs/race-condition-plan/02-stranky.md. Registr: docs/race-condition-audit.md.
 *
 * Page update = read-modify-write s full `$set`. Optimistic lock
 * (`expectedUpdatedAt`) je app-level mezi findById a update → ne atomický.
 */
describe('Race: stránky (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;

  let pagesRepo: any;

  const srv = () => app.getHttpServer();
  const tok = () => authHeader(seed.pj.accessToken);

  async function createPage(slug: string, title = 'T'): Promise<string> {
    const res = await request(srv())
      .post(`/api/worlds/${seed.worldId}/pages`)
      .set(tok())
      .send({ slug, type: 'Ostatní', title, content: '<p>x</p>' });
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`createPage ${res.status}: ${JSON.stringify(res.body)}`);
    return String(res.body.id ?? res.body._id);
  }

  async function getPageBySlug(slug: string) {
    const res = await request(srv())
      .get(`/api/worlds/${seed.worldId}/pages/${slug}`)
      .set(tok());
    return res.body as { id: string; updatedAt: string; title: string };
  }

  function patchPage(id: string, body: Record<string, unknown>) {
    return request(srv())
      .patch(`/api/worlds/${seed.worldId}/pages/${id}`)
      .set(tok())
      .send(body);
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;
    seed = await buildCanonicalWorld(app, testApp.connection);
    pagesRepo = app.get('IPagesRepository');
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── ✅ Baseline: souběžné úpravy RŮZNÝCH stránek se neovlivní ──────────────
  it('✅ baseline: 2 souběžné patche různých stránek → obě se zapíšou', async () => {
    const a = await createPage('p-base-a');
    const b = await createPage('p-base-b');
    const [ra, rb] = await Promise.all([
      patchPage(a, { title: 'AA' }),
      patchPage(b, { title: 'BB' }),
    ]);
    expect([200, 201]).toContain(ra.status);
    expect([200, 201]).toContain(rb.status);
    expect((await getPageBySlug('p-base-a')).title).toBe('AA');
    expect((await getPageBySlug('p-base-b')).title).toBe('BB');
  }, 60_000);

  // ── 🐛 RC-P1: optimistic lock je app-level (ne atomický) → souběžný edit projde ──
  it('🐛 RC-P1: 2 souběžné edity stejné verze (expectedUpdatedAt) → jen 1 smí projít', async () => {
    const id = await createPage('p-optlock');
    const page = await getPageBySlug('p-optlock');
    const expectedUpdatedAt = new Date(page.updatedAt).toISOString();

    // Bariéra na repo.update: oba patche projdou optimistic checkem (oba čtou
    // stejné updatedAt) a sejdou se na zápisu → oba zapíšou (lock nechytí souběh).
    const barrier = new Barrier(2);
    const restore = withBarrier(pagesRepo, 'update', barrier);
    let results: PromiseSettledResult<request.Response>[] = [];
    try {
      results = await Promise.allSettled([
        patchPage(id, { title: 'A', expectedUpdatedAt }),
        patchPage(id, { title: 'B', expectedUpdatedAt }),
      ]);
    } finally {
      restore();
    }

    const conflicts = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 409,
    ).length;
    // Invariant: ze 2 souběžných editů stejné verze smí uspět právě 1, druhý 409.
    expect(conflicts).toBe(1);
  }, 60_000);

  // ── 🐛 RC-P2: souběžné AKJ granty (full-array akjTabs $set) → grant nezmizí ──
  // Granty = `access[]` v `akjTabs[]`. Editor save posílá CELÉ `akjTabs` pole
  // (full `$set`) + `expectedUpdatedAt`. Dva souběžné granty (každý přidá jiný
  // UserId na touž záložku) stejné verze: bez atomické podmínky by druhý `$set`
  // přepsal první → grant prvního zmizí. Stejný kořen jako RC-P1; ověřujeme, že
  // RC-P1 fix (`updateIfUnchanged` cond. na `updatedAt`) kryje i grant payload.
  it('🐛 RC-P2: 2 souběžné granty stejné verze na túž AKJ záložku → 1 projde, 1× 409 (žádný tichý lost grant)', async () => {
    const id = await createPage('p-akj-grant');
    // Založ AKJ záložku (zatím bez grantů).
    const tabId = 'tab-grant-1';
    await patchPage(id, {
      akjTabs: [{ id: tabId, name: 'Tajná', order: 0, access: [] }],
    });
    const page = await getPageBySlug('p-akj-grant');
    const expectedUpdatedAt = new Date(page.updatedAt).toISOString();

    // Každý PATCH přidá jiný UserId grant na túž záložku (full akjTabs $set).
    const grant = (userId: string) =>
      patchPage(id, {
        expectedUpdatedAt,
        akjTabs: [
          {
            id: tabId,
            name: 'Tajná',
            order: 0,
            access: [{ type: 'UserId', value: userId }],
          },
        ],
      });

    const barrier = new Barrier(2);
    const restore = withBarrier(pagesRepo, 'updateIfUnchanged', barrier);
    let results: PromiseSettledResult<request.Response>[] = [];
    try {
      results = await Promise.allSettled([grant('user-A'), grant('user-B')]);
    } finally {
      restore();
    }

    const conflicts = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 409,
    ).length;
    // Invariant: ze 2 souběžných grantů stejné verze smí uspět právě 1, druhý
    // 409 (musí retry, čímž uvidí grant prvního a nepřepíše ho).
    expect(conflicts).toBe(1);
  }, 60_000);

  // ── 🐛 RC-P3: slug uniqueness check-then-create → 2. zápis E11000 (500 vs 409) ──
  it('🐛 RC-P3: 2 souběžné create stejného slugu → 1× 201, druhý čistý 409 (ne 500)', async () => {
    const slug = 'p-dup-slug';
    const mk = () =>
      request(srv())
        .post(`/api/worlds/${seed.worldId}/pages`)
        .set(tok())
        .send({ slug, type: 'Ostatní', title: 'Dup', content: '<p>x</p>' });
    const results = await Promise.allSettled([mk(), mk()]);
    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : 0,
    );
    const created = statuses.filter((s) => s === 201 || s === 200).length;
    const serverErrors = statuses.filter((s) => s >= 500).length;
    // V DB smí vzniknout jen 1 stránka s tím slugem.
    const count = await testApp.connection
      .db!.collection('pages')
      .countDocuments({ worldId: seed.worldId, slug });
    expect(count).toBe(1);
    expect(created).toBe(1);
    // Druhý pokus má skončit čistým 409 (konflikt), ne 500 (neošetřený E11000).
    expect(serverErrors).toBe(0);
  }, 60_000);

  // ── 🐛 RC-P4: update PO smazání (gate mezi findById↔update) → 404, ne 200-s-null ──
  it('🐛 RC-P4: smazání stránky mezi read↔write update → 404, ne 200 s null', async () => {
    const id = await createPage('p-del-race');

    const gate = new Gate();
    const restore = withGate(pagesRepo, 'update', gate);
    let res: request.Response;
    try {
      const patchP = patchPage(id, { title: 'Z' }).then((r) => r);
      await gate.reached; // update prošel findById (stránka existuje), čeká na write
      await request(srv())
        .delete(`/api/worlds/${seed.worldId}/pages/${id}`)
        .set(tok()); // smaž mezitím
      gate.open();
      res = await patchP; // update teď najde smazanou stránku
    } finally {
      restore();
    }

    // Invariant: PATCH na (mezitím) smazanou stránku nesmí vrátit 200 s null
    // tělem — musí to být 404 (nebo aspoň ne úspěch s prázdným/null dokumentem).
    expect(res.status).not.toBe(201);
    if (res.status === 200) {
      expect(res.body?.id ?? res.body?._id).toBeTruthy();
    }
  }, 60_000);
});
