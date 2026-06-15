import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';
import { Gate, withGate } from './race-barrier';

/**
 * Oblast 04 — Mazání scény vs. přiřazení hráče (race-condition audit, 15. styl).
 * Plán: docs/race-condition-plan/04-mazani.md. Registr: docs/race-condition-audit.md.
 *
 * RC-D6 (PH): `handleAssignToScene` validuje scénu (`findById`), pak zapíše
 * `membership.currentSceneId = sceneId`. Když se scéna smaže v okně mezi
 * validací a zápisem, `deleteScene → clearSceneForAll` proběhne DŘÍV, než
 * assign zapíše (nikdo ještě na scéně není) → assign vyrobí dangling ref na
 * mrtvou scénu. Fix: po zápisu re-ověř existenci scény a při zmizení vrať zpět.
 */
describe('Race: mapy — scéna delete vs assign (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;

  let membershipRepo: any;

  const srv = () => app.getHttpServer();
  const tok = () => authHeader(seed.pj.accessToken);
  const col = (n: string) => testApp.connection.db!.collection(n);

  async function createScene(name: string): Promise<string> {
    const res = await request(srv())
      .post('/api/maps')
      .set(tok())
      .send({ worldId: seed.worldId, name });
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`createScene ${res.status}: ${JSON.stringify(res.body)}`);
    return String(res.body.id ?? res.body._id);
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;
    seed = await buildCanonicalWorld(app, testApp.connection);
    membershipRepo = app.get('IWorldMembershipRepository');
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── ✅ baseline: assign na živou scénu → currentSceneId nastaven ────────────
  it('✅ baseline: assign hráče na existující scénu → currentSceneId == scene', async () => {
    const sceneId = await createScene('m-base');
    const res = await request(srv())
      .post(`/api/worlds/${seed.worldId}/operations`)
      .set(tok())
      .send({
        type: 'member.assignToScene',
        userId: seed.hrac.userId,
        sceneId,
      });
    expect([200, 201]).toContain(res.status);
    const m = await col('worldmemberships').findOne({
      worldId: seed.worldId,
      userId: seed.hrac.userId,
    });
    expect(m?.currentSceneId).toBe(sceneId);
    // úklid pro další test
    await membershipRepo.setCurrentScene(seed.hrac.userId, seed.worldId, null);
  }, 60_000);

  // ── 🐛 RC-D6: scéna smazána mezi validací↔zápisem assign → žádný dangling ref ──
  it('🐛 RC-D6: smazání scény mezi read↔write assign → membership nezůstane na mrtvé scéně', async () => {
    const sceneId = await createScene('m-del-race');
    // hráč start: bez scény (čistý stav).
    await membershipRepo.setCurrentScene(seed.hrac.userId, seed.worldId, null);

    const gate = new Gate();
    // Gate na setCurrentScene (zápis assign). Drží PO validaci scény (findById
    // v handleAssignToScene proběhl), PŘED zápisem. onlyFirst=true → rollback
    // (druhé volání setCurrentScene v fixu) negatuje.
    const restore = withGate(membershipRepo, 'setCurrentScene', gate);
    try {
      const assignP = request(srv())
        .post(`/api/worlds/${seed.worldId}/operations`)
        .set(tok())
        .send({
          type: 'member.assignToScene',
          userId: seed.hrac.userId,
          sceneId,
        })
        .then((r) => r);
      await gate.reached; // assign zvalidoval scénu, čeká na zápis currentSceneId
      await request(srv())
        .delete(`/api/maps/${sceneId}?worldId=${seed.worldId}`)
        .set(tok()); // smaž scénu mezitím (clearSceneForAll nic netrefí)
      gate.open();
      await assignP; // assign zapíše currentSceneId na (mezitím) smazanou scénu
    } finally {
      restore();
    }

    const sceneGone =
      (await col('mapScenes').countDocuments({ _id: toId(sceneId) })) === 0;
    const danglingRefs = await col('worldmemberships').countDocuments({
      worldId: seed.worldId,
      currentSceneId: sceneId,
    });
    // Invariant: pokud scéna zmizela, žádný membership nesmí na ni dál ukazovat.
    if (sceneGone) expect(danglingRefs).toBe(0);
  }, 60_000);

  // mongo _id je ObjectId; sceneId je string → cast pro count.

  function toId(id: string): any {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Types } = require('mongoose');
    return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
  }
});
