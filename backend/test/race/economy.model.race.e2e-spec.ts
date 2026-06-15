import fc from 'fast-check';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, type TestApp } from '../helpers/app-factory';
import { authHeader } from '../helpers/auth';
import {
  buildCanonicalWorld,
  type CanonicalSeed,
} from '../helpers/seed-scenario';

/**
 * Oblast 01 — fast-check linearizabilita model (ceiling technika, M-MODEL).
 * Plán: docs/race-condition-plan/00-cross-cutting.md §C.
 *
 * Bariéra/Gate testy ověřují JEDEN ručně vymyšlený interleave. Tohle generuje
 * NÁHODNÉ souběžné workloady (adjust ±, undo) a tvrdí INVARIANT, který musí
 * platit po LIBOVOLNÉM prokládání:
 *
 *   I1: balance === Σ transactions.delta   (žádný drift mezi součtem a zůstatkem)
 *
 * I1 drží IFF je každý zápis atomický (`$push`+`$inc`) a undo je v transakci.
 * Kdyby tu byl lost update (starý read→`$set` undoLast), fast-check najde
 * sekvenci, která I1 poruší, a scvrkne ji na minimální repro.
 */
describe('Race: ekonomika fast-check model (e2e)', () => {
  let testApp: TestApp;
  let app: INestApplication;
  let seed: CanonicalSeed;

  const srv = () => app.getHttpServer();
  const tok = () => authHeader(seed.pj.accessToken);
  const round4 = (n: number) => Math.round(n * 10000) / 10000;

  async function makeAccount(fund: number): Promise<string> {
    const res = await request(srv())
      .post(
        `/api/worlds/${seed.worldId}/characters/${seed.characterSlug}/accounts`,
      )
      .set(tok())
      .send({
        label: `m-${Math.random().toString(36).slice(2, 7)}`,
        currency: 'zl',
      });
    const id = String(res.body.id ?? res.body._id);
    if (fund > 0) {
      await request(srv())
        .post(`/api/worlds/${seed.worldId}/accounts/${id}/adjust`)
        .set(tok())
        .send({ amount: fund, reason: 'seed' });
    }
    return id;
  }

  async function getAccount(id: string) {
    const res = await request(srv())
      .get(`/api/worlds/${seed.worldId}/accounts/${id}`)
      .set(tok());
    return res.body as { balance: number; transactions: { delta: number }[] };
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

  it('I1: balance === Σ delta po náhodném souběžném workloadu (adjust ±, undo)', async () => {
    const op = fc.oneof(
      fc.record({
        kind: fc.constant('adjust' as const),
        amount: fc.integer({ min: -50, max: 50 }).filter((n) => n !== 0),
      }),
      fc.record({ kind: fc.constant('undo' as const) }),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(op, { minLength: 2, maxLength: 6 }),
        async (ops) => {
          const acc = await makeAccount(100);
          await Promise.allSettled(
            ops.map((o) =>
              o.kind === 'adjust'
                ? request(srv())
                    .post(`/api/worlds/${seed.worldId}/accounts/${acc}/adjust`)
                    .set(tok())
                    .send({ amount: o.amount, reason: 'm' })
                : request(srv())
                    .post(`/api/worlds/${seed.worldId}/accounts/${acc}/undo`)
                    .set(tok()),
            ),
          );
          const a = await getAccount(acc);
          const sum = round4(a.transactions.reduce((s, t) => s + t.delta, 0));
          // I1 — zůstatek se vždy rovná součtu delt zaznamenaných transakcí.
          expect(round4(a.balance)).toBe(sum);
        },
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});
