import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';
import { Gate, withGate } from './race-barrier';
import { Types } from 'mongoose';

/**
 * Oblast 04 (rozšíření) — Create dítěte v soft-smazaném světě (RC-D2).
 * Plán: docs/race-condition-plan/04-mazani.md. Registr: docs/race-condition-audit.md.
 *
 * Třída PH (phantom/orphan): create cesta (page/character) ověřuje práva přes
 * `worldsRepo.findById`, ale ten (BaseMongo) NEfiltruje `isActive` → vrací i
 * soft-smazaný svět. Když svět soft-smaže běh A v okně mezi readem světa (uvnitř
 * `assertCanWrite`) a zápisem stránky, dítě vznikne v MRTVÉM světě (phantom).
 *
 * Fix (vzor RC-D3/D6 re-check + guard před zápisem): create assertuje, že svět
 * je aktivní (`isActive && !deletedAt`). Po fixu create do mrtvého světa → 404.
 */
describe('Race: create v soft-smazaném světě (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;

  let pagesRepo: any;

  const srv = () => app.getHttpServer();
  const tok = () => authHeader(seed.pj.accessToken);
  const col = (n: string) => testApp.connection.db!.collection(n);

  /** Soft-delete světa přímou DB manipulací (deterministické, mirror softDelete). */
  async function softDeleteWorld(worldId: string): Promise<void> {
    await col('worlds').updateOne(
      { _id: new Types.ObjectId(worldId) },
      { $set: { isActive: false, deletedAt: new Date() } },
    );
  }

  async function reviveWorld(worldId: string): Promise<void> {
    await col('worlds').updateOne(
      { _id: new Types.ObjectId(worldId) },
      { $set: { isActive: true, deletedAt: null } },
    );
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

  // ── ✅ Baseline: create stránky v ŽIVÉM světě projde ────────────────────────
  it('✅ baseline: create stránky v aktivním světě → 201', async () => {
    await reviveWorld(seed.worldId);
    const res = await request(srv())
      .post(`/api/worlds/${seed.worldId}/pages`)
      .set(tok())
      .send({
        slug: `live-${Date.now().toString(36)}`,
        type: 'Ostatní',
        title: 'Live',
        content: '<p>x</p>',
      });
    expect([200, 201]).toContain(res.status);
  }, 60_000);

  // ── 🐛 RC-D2: create stránky když je svět soft-smazaný (statický stav) ──────
  // Nejde přímo o souběh, ale o phantom dítě: jakmile je svět mrtvý, create už
  // nesmí projít. (Race níže pokrývá interleave create↔soft-delete.)
  it('🐛 RC-D2: create stránky v už soft-smazaném světě → odmítnuto (ne phantom)', async () => {
    await softDeleteWorld(seed.worldId);
    try {
      const res = await request(srv())
        .post(`/api/worlds/${seed.worldId}/pages`)
        .set(tok())
        .send({
          slug: `phantom-static-${Date.now().toString(36)}`,
          type: 'Ostatní',
          title: 'Phantom',
          content: '<p>x</p>',
        });
      // Invariant: do mrtvého světa NESMÍ vzniknout živá stránka.
      expect([200, 201]).not.toContain(res.status);
      const liveCount = await col('pages').countDocuments({
        worldId: seed.worldId,
        slug: { $regex: '^phantom-static-' },
      });
      expect(liveCount).toBe(0);
    } finally {
      await reviveWorld(seed.worldId);
    }
  }, 60_000);

  // ── 🐛 RC-D2: přímý create postavy (POST /characters) v mrtvém světě ────────
  it('🐛 RC-D2: create postavy v už soft-smazaném světě → odmítnuto (ne phantom)', async () => {
    await softDeleteWorld(seed.worldId);
    try {
      const res = await request(srv())
        .post(`/api/worlds/${seed.worldId}/characters`)
        .set(tok())
        .send({
          slug: `npc-phantom-${Date.now().toString(36)}`,
          name: 'Phantom NPC',
          isNpc: true,
        });
      expect([200, 201]).not.toContain(res.status);
      const liveCount = await col('characters').countDocuments({
        worldId: seed.worldId,
        slug: { $regex: '^npc-phantom-' },
      });
      expect(liveCount).toBe(0);
    } finally {
      await reviveWorld(seed.worldId);
    }
  }, 60_000);

  // ── 🐛 RC-D2 (race): soft-delete světa mezi assertCanWrite read↔page save ────
  it('🐛 RC-D2: soft-delete světa mezi read práv↔save stránky → žádné phantom dítě', async () => {
    await reviveWorld(seed.worldId);
    const slug = `phantom-race-${Date.now().toString(36)}`;

    const gate = new Gate();
    // Gate na pagesRepo.save (po assertCanWrite readu světa, PŘED zápisem stránky).
    const restore = withGate(pagesRepo, 'save', gate);
    try {
      const createP = request(srv())
        .post(`/api/worlds/${seed.worldId}/pages`)
        .set(tok())
        .send({ slug, type: 'Ostatní', title: 'Phantom', content: '<p>x</p>' })
        .then((r) => r);
      await gate.reached; // create ověřil práva (svět ještě žil), čeká na save
      await softDeleteWorld(seed.worldId); // svět mezitím soft-smazán
      gate.open();
      await createP; // page save teď zapisuje do mrtvého světa
    } finally {
      restore();
      await reviveWorld(seed.worldId);
    }

    // Invariant: pokud byl svět mrtvý v okamžiku zápisu, nesmí zůstat živá stránka.
    const orphan = await col('pages').countDocuments({
      worldId: seed.worldId,
      slug,
    });
    expect(orphan).toBe(0);
  }, 60_000);
});
