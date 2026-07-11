import request from 'supertest';
import { createTestApp, TestApp } from '../helpers/app-factory';
import { registerUser } from '../helpers/auth';
import { clearAllCollections } from '../helpers/db';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { WorldElevationsModule } from '../../src/modules/world-elevations/world-elevations.module';

/**
 * Skill `pentest` T1 — INJECTION útoky (styl 22). Katalog PT-22a/b.
 *
 * Zelené piny: obrana (ValidationPipe @IsString + escapeRegex) existuje →
 * útok MUSÍ selhat. Když zčervená, injection díra se vrátila.
 */
describe('PT-22 · Injection (NoSQL operator + ReDoS)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      modules: [AuthModule, UsersModule, WorldElevationsModule],
    });
  });
  afterAll(async () => testApp.close());
  beforeEach(async () => clearAllCollections(testApp.connection));

  const srv = () => testApp.app.getHttpServer();

  // PT-22a — NoSQL operator injection do login: {$gt:""} místo stringu by
  // matchlo prvního usera → přihlášení bez znalosti hesla. ValidationPipe
  // (@IsString) to musí odmítnout jako 400, NIKDY nevydat token.
  it('PT-22a: operator injection do /auth/login → 400, žádný token', async () => {
    await registerUser(testApp.app, {
      username: 'victim22a',
      email: 'victim22a@test.io',
      password: 'Password123!',
    });

    const res = await request(srv())
      .post('/api/auth/login')
      .send({ identifier: { $gt: '' }, password: { $gt: '' } });

    // Klíčová obrana: útok NESMÍ uspět (žádný accessToken).
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(201);
    expect(res.body?.accessToken).toBeUndefined();
    // Očekávaná obrana = 400 z ValidationPipe (@IsString).
    expect(res.status).toBe(400);
  });

  // PT-22a variant — password jako pole operátorů
  it('PT-22a2: {"$ne":null} injection → 400/401, žádný token', async () => {
    await registerUser(testApp.app, {
      username: 'victim22a2',
      email: 'victim22a2@test.io',
      password: 'Password123!',
    });

    const res = await request(srv())
      .post('/api/auth/login')
      .send({ identifier: 'victim22a2@test.io', password: { $ne: null } });

    expect([400, 401]).toContain(res.status);
    expect(res.body?.accessToken).toBeUndefined();
  });

  // PT-22b — ReDoS / regex injection do public user-search. escapeRegex musí
  // metaznaky zneškodnit → dotaz doběhne rychle, žádný catastrophic backtracking
  // a `.*` se NEinterpretuje jako "vše" (0 nebo přesná shoda, ne wildcard leak).
  it('PT-22b: ReDoS payload do /users?q= doběhne rychle a nezmatchuje vše', async () => {
    const a = await registerUser(testApp.app, {
      username: 'alpha22b',
      email: 'alpha22b@test.io',
      password: 'Password123!',
    });
    await registerUser(testApp.app, {
      username: 'beta22b',
      email: 'beta22b@test.io',
      password: 'Password123!',
    });

    const evil = '(a+)+$';
    const t0 = Date.now();
    const res = await request(srv())
      .get(`/api/users?q=${encodeURIComponent(evil)}`)
      .set('Authorization', `Bearer ${a.accessToken}`);
    const elapsed = Date.now() - t0;

    // Nesmí zaseknout event loop (ReDoS) — velkorysý strop, catastrophic
    // backtracking by trval sekundy až minuty.
    expect(elapsed).toBeLessThan(2000);
    // Endpoint odpoví (ne 500 z regex chyby); '(a+)+$' jako literál nikoho nematchne.
    expect(res.status).toBeLessThan(500);
  });

  // PT-22c — wildcard '.*' se nesmí chovat jako "vrať všechny uživatele"
  it('PT-22c: q=".*" se escapuje (nechová se jako match-all)', async () => {
    const a = await registerUser(testApp.app, {
      username: 'alpha22c',
      email: 'alpha22c@test.io',
      password: 'Password123!',
    });
    for (let i = 0; i < 3; i += 1) {
      await registerUser(testApp.app, {
        username: `noise22c${i}`,
        email: `noise22c${i}@test.io`,
        password: 'Password123!',
      });
    }

    const res = await request(srv())
      .get(`/api/users?q=${encodeURIComponent('.*')}`)
      .set('Authorization', `Bearer ${a.accessToken}`);

    expect(res.status).toBeLessThan(500);
    // Literál '.*' nikoho nematchne → prázdno/málo, NE všech 4+ uživatelů.
    const items = (res.body?.items ?? res.body?.data ?? res.body) as unknown[];
    if (Array.isArray(items)) {
      expect(items.length).toBeLessThan(4);
    }
  });
});
