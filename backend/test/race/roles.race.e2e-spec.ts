import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader, registerUser } from '../helpers/auth';
import {
  buildCanonicalWorld,
  WorldRole,
  type CanonicalSeed,
} from '../helpers/seed-scenario';
import { Barrier, Gate, withBarrier, withGate } from './race-barrier';

/**
 * Oblast 03 — Souběžné změny rolí / členství (race-condition audit, 15. styl).
 * Plán: docs/race-condition-plan/03-role.md. Registr: docs/race-condition-audit.md.
 */
describe('Race: role / členství (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;

  let membershipRepo: any;

  let worldsRepo: any;

  const srv = () => app.getHttpServer();
  const pjTok = () => authHeader(seed.pj.accessToken);
  const col = (n: string) => testApp.connection.db!.collection(n);

  async function playerCount(): Promise<number> {
    const w = await col('worlds').findOne({ slug: seed.worldSlug });
    return (w?.playerCount as number) ?? 0;
  }

  async function membershipIdOf(userId: string): Promise<string> {
    const m = await col('worldmemberships').findOne({
      worldId: seed.worldId,
      userId,
    });
    return String(m?._id ?? '');
  }

  /** Vytvoří nového člena s danou rolí (register → access-request → approve → role). */
  async function addMember(suffix: string, role: number) {
    const u = await registerUser(app, {
      username: `r-${suffix}`,
      email: `r-${suffix}@test.io`,
      password: 'Password123!',
    });
    const ar = await request(srv())
      .post(`/api/worlds/${seed.worldId}/access-request`)
      .set(authHeader(u.accessToken));
    const requestId = String(ar.body.id ?? ar.body._id);
    await request(srv())
      .post(`/api/worlds/${seed.worldId}/access-requests/${requestId}/approve`)
      .set(pjTok());
    const mId = await membershipIdOf(u.userId);
    await request(srv())
      .patch(`/api/worlds/${seed.worldId}/members/${mId}/role`)
      .set(pjTok())
      .send({ role });
    return { user: u, membershipId: mId };
  }

  function patchRole(membershipId: string, role: number) {
    return request(srv())
      .patch(`/api/worlds/${seed.worldId}/members/${membershipId}/role`)
      .set(pjTok())
      .send({ role });
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      envOverrides: { TURNSTILE_SECRET: '' },
    });
    app = testApp.app;
    seed = await buildCanonicalWorld(app, testApp.connection);
    membershipRepo = app.get('IWorldMembershipRepository');
    worldsRepo = app.get('IWorldsRepository');
  }, 180_000);

  afterAll(async () => {
    await testApp?.close();
  });

  // ── ✅ RC-R1: vlastník světa je immutable → „0 PJ" přes demote nedosažitelné ──
  it('✅ RC-R1: 2 souběžné demote vlastníka → oba 403, vlastník zůstává PJ', async () => {
    const ownerMid = await membershipIdOf(seed.pj.userId);
    const results = await Promise.allSettled([
      patchRole(ownerMid, WorldRole.Hrac),
      patchRole(ownerMid, WorldRole.Hrac),
    ]);
    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : 0,
    );
    expect(statuses.every((s) => s === 403)).toBe(true);
    const owner = await col('worldmemberships').findOne({
      worldId: seed.worldId,
      userId: seed.pj.userId,
    });
    expect(owner!.role).toBe(WorldRole.PJ);
  }, 60_000);

  // ── ✅ RC-R4: 2 souběžné approve téhož requestu → 1 membership (unique index) ──
  it('✅ RC-R4: double-approve → právě 1 membership, žádné 500', async () => {
    const u = await registerUser(app, {
      username: 'r-dblappr',
      email: 'r-dblappr@test.io',
      password: 'Password123!',
    });
    const ar = await request(srv())
      .post(`/api/worlds/${seed.worldId}/access-request`)
      .set(authHeader(u.accessToken));
    const requestId = String(ar.body.id ?? ar.body._id);
    const approve = () =>
      request(srv())
        .post(
          `/api/worlds/${seed.worldId}/access-requests/${requestId}/approve`,
        )
        .set(pjTok());
    const results = await Promise.allSettled([approve(), approve()]);
    const statuses = results.map((r) =>
      r.status === 'fulfilled' ? r.value.status : 0,
    );
    const count = await col('worldmemberships').countDocuments({
      worldId: seed.worldId,
      userId: u.userId,
    });
    expect(count).toBe(1);
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
  }, 60_000);

  // ── 🐛 RC-R2: playerCount drift — wasPlayer ze zastaralého readu + idempotentní změna ──
  it('🐛 RC-R2: 2 souběžné Ctenar→Hrac na témž členu → playerCount +1, ne +2', async () => {
    const { membershipId } = await addMember('drift', WorldRole.Ctenar);
    const before = await playerCount();

    // Bariéra na membershipRepo.update: oba requesty přečtou roli Ctenar PŘED
    // zápisem → oba spočtou wasPlayer=false → oba $inc(+1) → drift +2.
    const barrier = new Barrier(2);
    const restore = withBarrier(membershipRepo, 'update', barrier);
    try {
      await Promise.allSettled([
        patchRole(membershipId, WorldRole.Hrac),
        patchRole(membershipId, WorldRole.Hrac),
      ]);
    } finally {
      restore();
    }

    const after = await playerCount();
    // Invariant: jeden člen = jeden hráč → playerCount smí narůst max o 1.
    expect(after - before).toBe(1);
  }, 60_000);

  // ── 🐛 RC-R3: transferOwnership TOCTOU — newOwner opustí svět mezi read↔write ──
  // transferOwnership: read newOwnerMembership → update role → ... → write
  // world.ownerId. Vše bez atomické podmínky. Když newOwner opustí svět (leave)
  // v okně mezi readem jeho membershipu a zápisem ownerId, svět skončí
  // s `ownerId` ukazujícím na uživatele BEZ membershipu → invariant „svět má
  // právě 1 vlastníka s membershipem" je porušen (vlastník-duch).
  it('🐛 RC-R3: leave nového vlastníka mezi read↔write transferu → vlastník má membership', async () => {
    // Nový kandidát na vlastníka = čerstvý člen (Hrac), aby leave nebyl blokován.
    const { user: cand, membershipId: candMid } = await addMember(
      'transfer-cand',
      WorldRole.Hrac,
    );

    const gate = new Gate();
    // Gate na worldsRepo.update (zápis ownerId) — drží transfer PO readu
    // newOwner membershipu, PŘED zápisem nového vlastníka světa.
    const restore = withGate(worldsRepo, 'update', gate);
    try {
      const transferP = request(srv())
        .patch(`/api/worlds/${seed.worldId}/owner`)
        .set(pjTok())
        .send({ newOwnerId: cand.userId })
        .then((r) => r);
      await gate.reached; // transfer přečetl membership kandidáta, čeká na write owner
      // Kandidát mezitím opustí svět (ještě NENÍ vlastník → leave projde).
      await request(srv())
        .delete(`/api/worlds/${seed.worldId}/members/${candMid}`)
        .set(authHeader(cand.accessToken));
      gate.open();
      await transferP; // transfer teď zapíše ownerId na (mezitím odešlého) kandidáta
    } finally {
      restore();
    }

    // Invariant: aktuální vlastník světa MUSÍ mít membership v tom světě.
    const world = await col('worlds').findOne({ slug: seed.worldSlug });
    const ownerId = String(world?.ownerId ?? '');
    const ownerMembership = await col('worldmemberships').findOne({
      worldId: seed.worldId,
      userId: ownerId,
    });
    expect(ownerMembership).not.toBeNull();
  }, 60_000);
});
