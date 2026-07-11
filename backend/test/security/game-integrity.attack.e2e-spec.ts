import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { registerUser, authHeader, type AuthSession } from '../helpers/auth';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { WorldElevationsModule } from '../../src/modules/world-elevations/world-elevations.module';
import { WorldsModule } from '../../src/modules/worlds/worlds.module';
import { MapsModule } from '../../src/modules/maps/maps.module';
import { CharactersModule } from '../../src/modules/characters/characters.module';

/**
 * Skill `pentest` T1 — HERNÍ INTEGRITA / FÉROVOST (styl 46). Katalog PT-46a/d/e/g.
 *
 * Útočný vektor = `POST /api/maps/:id/operations` (REST). Pozn.: FE jezdí přes
 * WebSocket, ale `MapsController.applyOperation` volá STEJNÝ `MapOperationsService.apply()`
 * jako WS gateway — identický authorizer, clamp i DB zápis. REST je tu jen
 * deterministický nosič téhož server-authoritativního kódu (žádný socket race).
 *
 *  ZELENÉ piny (obrana MUSÍ držet — zčervená = díra se vrátila):
 *   - PT-46d/e HP clamp (map-operations.service.ts:642) — currentHp/injury do mezí.
 *
 *  ČERVENÉ díry (`it.failing` = dokumentace neopravené díry, zezelená po fixu):
 *   - PT-46a dice forge — RNG je na FE, server ukládá `dicePayload` verbatim.
 *   - PT-46g turn-gate — authorizer řeší jen vlastnictví, ne `combat.currentTokenId`.
 *   - PT-46d-bypass — clamp přeskočí, když klient pošle currentHp jako STRING ("9e9").
 */
describe('PT-46 · Herní integrita (HP clamp / dice forge / turn-gate)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let pj: AuthSession;
  let hrac: AuthSession;
  let worldId: string;
  let sceneId: string;

  const srv = () => app.getHttpServer();
  const col = (n: string) => testApp.connection.db!.collection(n);
  const idOf = (b: { id?: string; _id?: string }) =>
    String(b?.id ?? b?._id ?? '');

  // Vlastní token hráče (owner = hrac.userId; authorizer:134 porovnává
  // token.characterId === user.id) s maxHp=30 → clamp má horní mez.
  const HERO = 'tok-hrac';
  // Cizí token (na tahu v boji) — pro turn-gate.
  const OTHER = 'tok-a';

  const pjOp = (op: unknown) =>
    request(srv())
      .post(`/api/maps/${sceneId}/operations`)
      .set(authHeader(pj.accessToken))
      .send(op as object);
  const hracOp = (op: unknown) =>
    request(srv())
      .post(`/api/maps/${sceneId}/operations`)
      .set(authHeader(hrac.accessToken))
      .send(op as object);

  async function readToken(
    tokenId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const doc = await col('mapScenes').findOne({
      _id: new Types.ObjectId(sceneId),
    });
    const tokens = (doc?.tokens ?? []) as Array<Record<string, unknown>>;
    return tokens.find((t) => t.id === tokenId);
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      modules: [
        AuthModule,
        UsersModule,
        WorldElevationsModule,
        WorldsModule,
        MapsModule,
        CharactersModule,
      ],
    });
    app = testApp.app;

    const sfx = `gi${Date.now().toString(36)}`;
    pj = await registerUser(app, {
      username: `pj-${sfx}`,
      email: `pj-${sfx}@test.io`,
      password: 'Password123!',
    });
    hrac = await registerUser(app, {
      username: `hrac-${sfx}`,
      email: `hrac-${sfx}@test.io`,
      password: 'Password123!',
    });

    // Svět (PJ = vlastník → world role PJ) — private + access-request flow.
    const wRes = await request(srv())
      .post('/api/worlds')
      .set(authHeader(pj.accessToken))
      .send({
        name: `Svět ${sfx}`,
        slug: `world-${sfx}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'private',
        description: 'PT-46 herní integrita',
      });
    if (![200, 201].includes(wRes.status))
      throw new Error(
        `create-world ${wRes.status}: ${JSON.stringify(wRes.body)}`,
      );
    worldId = idOf(wRes.body);

    // Hráč: access-request → approve (Čtenář) → PATCH role Hrac (2).
    const arRes = await request(srv())
      .post(`/api/worlds/${worldId}/access-request`)
      .set(authHeader(hrac.accessToken));
    const requestId = idOf(arRes.body);
    await request(srv())
      .post(`/api/worlds/${worldId}/access-requests/${requestId}/approve`)
      .set(authHeader(pj.accessToken));
    const membershipDoc = await col('worldmemberships').findOne({
      worldId,
      userId: hrac.userId,
    });
    const membershipId = String(membershipDoc?._id ?? '');
    if (!membershipId) throw new Error('membership po approve nenalezen');
    await request(srv())
      .patch(`/api/worlds/${worldId}/members/${membershipId}/role`)
      .set(authHeader(pj.accessToken))
      .send({ role: 2 }); // WorldRole.Hrac

    // Scéna (PJ).
    const sRes = await request(srv())
      .post('/api/maps')
      .set(authHeader(pj.accessToken))
      .send({ worldId, name: `Bojiště ${sfx}` });
    if (![200, 201].includes(sRes.status))
      throw new Error(
        `create-scene ${sRes.status}: ${JSON.stringify(sRes.body)}`,
      );
    sceneId = idOf(sRes.body);

    // PJ přidá tokeny (token.add je PJ-only). HERO = hráčův (maxHp 30).
    const addHero = await pjOp({
      type: 'token.add',
      token: {
        id: HERO,
        characterId: hrac.userId,
        characterSlug: `hrac-pc-${sfx}`,
        q: 0,
        r: 0,
        isNpc: false,
        maxHp: 30,
        currentHp: 20,
        injury: 0,
      },
    });
    if (![200, 201].includes(addHero.status))
      throw new Error(
        `token.add HERO ${addHero.status}: ${JSON.stringify(addHero.body)}`,
      );
    const addOther = await pjOp({
      type: 'token.add',
      token: {
        id: OTHER,
        characterId: pj.userId,
        characterSlug: `a-pc-${sfx}`,
        q: 1,
        r: 1,
        isNpc: false,
        maxHp: 10,
        currentHp: 10,
        injury: 0,
      },
    });
    if (![200, 201].includes(addOther.status))
      throw new Error(
        `token.add OTHER ${addOther.status}: ${JSON.stringify(addOther.body)}`,
      );
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── PT-46d · currentHp:99999 → clamp na maxHp (ZELENÝ) ──────────────────────
  // Hráč smí patchovat VLASTNÍ currentHp (authorizer:151), ale server je
  // autoritativní: 99999 se musí seříznout na maxHp (30), ne uložit doslova.
  it('PT-46d · currentHp:99999 na vlastní token → clamp na maxHp (30)', async () => {
    const res = await hracOp({
      type: 'token.update',
      tokenId: HERO,
      patch: { currentHp: 99999 },
    });
    expect([200, 201]).toContain(res.status); // authorizer patch pustí
    const tok = await readToken(HERO);
    expect(tok?.currentHp).toBe(30); // clamp na maxHp
    expect(tok?.currentHp).not.toBe(99999); // NE 99999-exploit
  });

  // ── PT-46e · currentHp:-50 → clamp na 0 (ZELENÝ) ───────────────────────────
  it('PT-46e · currentHp:-50000 → clamp na 0', async () => {
    const res = await hracOp({
      type: 'token.update',
      tokenId: HERO,
      patch: { currentHp: -50000 },
    });
    expect([200, 201]).toContain(res.status);
    const tok = await readToken(HERO);
    expect(tok?.currentHp).toBe(0); // záporné HP není platný stav
  });

  // ── PT-46e · injury:-5 → clamp na 0 (ZELENÝ) ───────────────────────────────
  it('PT-46e · injury:-5 → clamp na 0 (injury ≥ 0)', async () => {
    const res = await hracOp({
      type: 'token.update',
      tokenId: HERO,
      patch: { injury: -5 },
    });
    expect([200, 201]).toContain(res.status);
    const tok = await readToken(HERO);
    expect(tok?.injury).toBe(0);
  });

  // ── PT-46d-bypass · currentHp jako STRING "9e9" obchází clamp (ČERVENÝ) ─────
  // Clamp běží jen když `typeof currentHp === 'number'` (service:655). Klient
  // pošle string "9e9" → clamp se přeskočí a uloží se doslova; FE ho pak
  // parsuje jako 9e9. DTO patch je `@IsObject()` bez hloubkové typové kontroly.
  it('PT-46d-bypass · currentHp:"9e9" (string) coercnut Number()+clampnut na maxHp (fix pentest 2026-07-11)', async () => {
    await hracOp({
      type: 'token.update',
      tokenId: HERO,
      patch: { currentHp: '9e9' },
    });
    const tok = await readToken(HERO);
    // Fix: Number("9e9")=9e9 (finite) → clamp na maxHp(30); ne-číselný string → 400.
    expect(typeof tok?.currentHp).toBe('number');
    expect(tok?.currentHp as number).toBeLessThanOrEqual(30);
  });

  // ── PT-46a · dice forge — server ukládá dicePayload verbatim (ČERVENÝ) ──────
  // RNG žije na FE; `dice.roll` applyAtomic (service:1347) jen `$push` roll bez
  // validace. Hráč podvrhne `total:999` k libovolné kostce.
  it.failing(
    'PT-46a · forge dice.roll {total:999} se uloží verbatim (RNG na FE) — NEOPRAVENO',
    async () => {
      const res = await hracOp({
        type: 'dice.roll',
        roll: {
          id: 'forge-1',
          rolledAt: new Date().toISOString(),
          byUserId: hrac.userId, // authorizer:167 hlídá jen shodu s user.id
          rollerName: hrac.username,
          rollerKind: 'pc',
          category: 'custom',
          dicePayload: { sum: 20, total: 999, faces: [20] },
        },
      });
      expect([200, 201]).toContain(res.status); // forge projde
      const doc = await col('mapScenes').findOne({
        _id: new Types.ObjectId(sceneId),
      });
      const rolls = (doc?.diceRolls ?? []) as Array<Record<string, unknown>>;
      const roll = rolls.find((r) => r.id === 'forge-1');
      // ŽÁDOUCÍ: server nesmí uložit klientem podvržený total (má házet/validovat).
      expect((roll?.dicePayload as { total?: number })?.total).not.toBe(999);
    },
  );

  // ── PT-46g · tah mimo pořadí — token.move projde bez ohledu na tah (ČERVENÝ) ─
  // V boji je na tahu OTHER (order[0]), ne HERO. Hráč přesto pohne HERO.
  // authorizer (case token.move) ověřuje jen vlastnictví + zámek, ne
  // `combat.currentTokenId`.
  it.failing(
    'PT-46g · token.move mimo tah (currentTokenId≠token) projde — NEOPRAVENO',
    async () => {
      const start = await pjOp({
        type: 'combat.start',
        orderTokenIds: [OTHER, HERO], // na tahu OTHER (currentTokenId=order[0])
      });
      expect([200, 201]).toContain(start.status);
      const move = await hracOp({
        type: 'token.move',
        tokenId: HERO,
        q: 5,
        r: 5,
      });
      // ŽÁDOUCÍ: v boji mimo tah → 403. REALITA: authorizer řeší jen vlastnictví.
      expect(move.status).toBe(403);
    },
  );
});
