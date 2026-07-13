import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';

/**
 * D-LAUNCH-GAP — lost update na `tokens.$.currentHp` (race-condition audit,
 * 15. styl, vzor read-modify-write → atomický Mongo update).
 *
 * Původní chování: FE damage/heal tlačítka počítala novou HP z klientské
 * cache a posílala ABSOLUTNÍ `patch.currentHp` → dva souběžné zásahy četly
 * stejnou bázi a druhý `$set` první přepsal (poslední vyhrává, zásah ztracen).
 *
 * Fix: `token.update` op nese `hpDelta`/`injuryDelta`; server deltu aplikuje
 * atomicky proti aktuální DB hodnotě (aggregation pipeline s clampem
 * 0..maxHp). Mongo per-dokument zápisy serializuje → VŠECHNY souběžné delty
 * se projeví, žádná se neztratí.
 */
describe('Race: mapy — token HP delta (D-LAUNCH-GAP, e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;

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

  async function addBestieToken(
    sceneId: string,
    tokenId: string,
    hp = 10,
  ): Promise<void> {
    const res = await request(srv())
      .post(`/api/maps/${sceneId}/operations`)
      .set(tok())
      .send({
        type: 'token.add',
        token: {
          id: tokenId,
          characterId: 'bestie:race-test',
          characterSlug: '',
          q: 0,
          r: 0,
          isNpc: true,
          templateId: 'tpl-race',
          currentHp: hp,
          maxHp: hp,
        },
      });
    if (res.status !== 201 && res.status !== 200)
      throw new Error(`token.add ${res.status}: ${JSON.stringify(res.body)}`);
  }

  async function readTokenHp(
    sceneId: string,
    tokenId: string,
  ): Promise<number> {
    // Přímé DB čtení (bez enrichTokens) — bestie HP žije v tokenu.
    const doc = await col('mapScenes').findOne({ _id: toId(sceneId) });
    const token = (
      doc?.tokens as Array<{ id: string; currentHp: number }> | undefined
    )?.find((t) => t.id === tokenId);
    if (!token) throw new Error(`token ${tokenId} nenalezen v DB`);
    return Number(token.currentHp);
  }

  function hpDeltaOp(sceneId: string, tokenId: string, delta: number) {
    return request(srv())
      .post(`/api/maps/${sceneId}/operations`)
      .set(tok())
      .send({ type: 'token.update', tokenId, patch: {}, hpDelta: delta });
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;
    seed = await buildCanonicalWorld(app, testApp.connection);
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── ✅ baseline: jedna delta se aplikuje a odpověď nese absolutní hodnotu ──
  it('✅ baseline: hpDelta -3 na HP 10 → DB 7, response op.patch.currentHp = 7', async () => {
    const sceneId = await createScene('hp-base');
    await addBestieToken(sceneId, 'b1');

    const res = await hpDeltaOp(sceneId, 'b1', -3);
    expect([200, 201]).toContain(res.status);
    // Normalizace pro klienty bez znalosti delty: patch nese absolutní stav.
    expect(res.body?.op?.patch?.currentHp).toBe(7);
    expect(await readTokenHp(sceneId, 'b1')).toBe(7);
  }, 60_000);

  // ── 🐛→✅ RACE: dva souběžné zásahy → OBA se projeví (žádný lost update) ──
  it('🐛→✅ dva souběžné damage (-3, -2) na HP 10 → 5 (oba zásahy platí)', async () => {
    const sceneId = await createScene('hp-race-2');
    await addBestieToken(sceneId, 'b1');

    const [r1, r2] = await Promise.all([
      hpDeltaOp(sceneId, 'b1', -3),
      hpDeltaOp(sceneId, 'b1', -2),
    ]);
    expect([200, 201]).toContain(r1.status);
    expect([200, 201]).toContain(r2.status);

    // S absolutním setem by výsledek byl 7 NEBO 8 (poslední vyhrává);
    // s atomickou deltou je vždy 5.
    expect(await readTokenHp(sceneId, 'b1')).toBe(5);
  }, 60_000);

  it('🐛→✅ 5 souběžných damage -1 na HP 10 → 5 (série se neztrácí)', async () => {
    const sceneId = await createScene('hp-race-5');
    await addBestieToken(sceneId, 'b1');

    const results = await Promise.all(
      Array.from({ length: 5 }, () => hpDeltaOp(sceneId, 'b1', -1)),
    );
    for (const r of results) expect([200, 201]).toContain(r.status);

    expect(await readTokenHp(sceneId, 'b1')).toBe(5);
  }, 60_000);

  // ── ✅ clamp: server-autoritativní meze 0..maxHp (GI styl 46) ──
  it('✅ clamp: hpDelta -999 → 0; heal +999 → maxHp', async () => {
    const sceneId = await createScene('hp-clamp');
    await addBestieToken(sceneId, 'b1');

    await hpDeltaOp(sceneId, 'b1', -999);
    expect(await readTokenHp(sceneId, 'b1')).toBe(0);

    await hpDeltaOp(sceneId, 'b1', 999);
    expect(await readTokenHp(sceneId, 'b1')).toBe(10); // maxHp
  }, 60_000);

  // ── ✅ kontrakt: delta jen pro bestie a bez kombinace s patch ──
  it('✅ hpDelta na PC token → 400 (HP PC/NPC žije v deníku postavy)', async () => {
    const sceneId = await createScene('hp-pc');
    const res = await request(srv())
      .post(`/api/maps/${sceneId}/operations`)
      .set(tok())
      .send({
        type: 'token.add',
        token: {
          id: 'pc1',
          characterId: seed.pj.userId,
          characterSlug: '',
          q: 1,
          r: 1,
          isNpc: false,
          currentHp: 0,
          maxHp: 0,
        },
      });
    expect([200, 201]).toContain(res.status);

    const bad = await hpDeltaOp(sceneId, 'pc1', -1);
    expect(bad.status).toBe(400);
  }, 60_000);

  it('✅ hpDelta + neprázdný patch → 400 (nejednoznačná kombinace)', async () => {
    const sceneId = await createScene('hp-combo');
    await addBestieToken(sceneId, 'b1');

    const bad = await request(srv())
      .post(`/api/maps/${sceneId}/operations`)
      .set(tok())
      .send({
        type: 'token.update',
        tokenId: 'b1',
        patch: { currentHp: 4 },
        hpDelta: -1,
      });
    expect(bad.status).toBe(400);
    expect(await readTokenHp(sceneId, 'b1')).toBe(10); // nic se nezapsalo
  }, 60_000);

  // mongo _id je ObjectId; sceneId je string → cast.

  function toId(id: string): any {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Types } = require('mongoose');
    return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
  }
});
