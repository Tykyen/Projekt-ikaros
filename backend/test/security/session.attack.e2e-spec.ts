import request from 'supertest';
import { authenticator } from 'otplib';
import { createTestApp, TestApp } from '../helpers/app-factory';
import { registerUser, authHeader } from '../helpers/auth';
import { clearAllCollections } from '../helpers/db';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { WorldElevationsModule } from '../../src/modules/world-elevations/world-elevations.module';

/**
 * Skill `pentest` T1 — SESSION / AUTH útoky (styl 35). Katalog PT-35a..e.
 *
 * Cíl: reálně vypálit útoky na 2FA lockout, enumeraci účtů a invalidaci tokenů
 * proti běžící instanci. Audit stylu 35 tyto díry NEopravil (blast-radius auth) —
 * proto RED díry dokumentuje `it.failing` (test padne dnes = díra existuje; až
 * někdo obranu doplní, `it.failing` se rozbije → signál překlopit na `it`).
 * Co drží (anti-enumerace forgot-password, per-request ban/delete gate, mrtvý
 * refresh po logout-all) = zelený `it` pin, aby regrese nepropadla tiše.
 *
 * POZN. k harnessu: app-factory NEregistruje APP_GUARD ThrottlerGuard → @Throttle
 * (per-IP) je v testu VYPNUTÝ. Tzn. tyto testy měří VÝHRADNĚ per-účet obranu —
 * přesně to, co u brute-force / lockoutu zkoumáme (IP throttle není náhrada za
 * per-účet lockout: útočník rotuje IP, viz X-Forwarded-For níže).
 */
describe('PT-35 · Session / Auth (TOTP lockout · enumerace · invalidace tokenů)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      modules: [AuthModule, UsersModule, WorldElevationsModule],
      // TotpCryptoService je fail-closed bez 32B klíče → bez něj 2FA setup hodí
      // 503 a útoky na 2FA by se nedaly reprodukovat. Deterministický test klíč.
      envOverrides: { TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64') },
    });
  });
  afterAll(async () => testApp.close());
  beforeEach(async () => clearAllCollections(testApp.connection));

  const srv = () => testApp.app.getHttpServer();

  /** Zapne uživateli reálné TOTP 2FA (setup → enable). Vrací secret pro kódy. */
  async function enableTotpFor(accessToken: string): Promise<string> {
    const setup = await request(srv())
      .post('/api/auth/2fa/setup')
      .set(authHeader(accessToken));
    expect(setup.status).toBe(201);
    const secret = setup.body.secret as string;
    const code = authenticator.generate(secret);
    const enabled = await request(srv())
      .post('/api/auth/2fa/enable')
      .set(authHeader(accessToken))
      .send({ code });
    expect(enabled.status).toBe(200);
    return secret;
  }

  /** Krok 1 loginu (heslo) u účtu s 2FA → vrátí challengeId (žádný token). */
  async function beginTotpLogin(
    identifier: string,
    password: string,
  ): Promise<string> {
    const res = await request(srv())
      .post('/api/auth/login')
      .send({ identifier, password });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('totp_required');
    expect(res.body.accessToken).toBeUndefined();
    return res.body.challengeId as string;
  }

  // ── A · PT-35a — TOTP brute-force ────────────────────────────────────

  // GREEN pin: jeden špatný TOTP kód se opravdu ověřuje a odmítne — žádný token
  // neuteče a špatný kód se NEomylem neakceptuje. Tohle drží.
  it('PT-35a-green: špatný TOTP kód → 401 TOTP_INVALID_CODE, žádný token', async () => {
    const u = await registerUser(testApp.app, {
      username: 'totp35a',
      email: 'totp35a@test.io',
      password: 'Password123!',
    });
    await enableTotpFor(u.accessToken);
    const challengeId = await beginTotpLogin('totp35a@test.io', 'Password123!');

    const res = await request(srv())
      .post('/api/auth/login/totp')
      .send({ challengeId, code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOTP_INVALID_CODE');
    expect(res.body?.accessToken).toBeUndefined();
  });

  // RED (díra): server nemá PER-ÚČET lockout. `loginTotp` ověřuje challenge přes
  // `peek` (nespotřebuje při chybě) a nikde nedrží čítač neúspěchů → útočník smí
  // proti JEDNOMU challenge (TTL 5 min) hádat kód donekonečna, i s rotací IP.
  // Bezpečný systém by po N chybách účet/challenge zamkl (423/429). Tady se to
  // NIKDY nestane → assertion padá → `it.failing` dokumentuje díru.
  it.failing(
    'PT-35a: TOTP brute — 20 špatných kódů z různých IP NEzamkne účet (chybí lockout)',
    async () => {
      const u = await registerUser(testApp.app, {
        username: 'totp35abrute',
        email: 'totp35abrute@test.io',
        password: 'Password123!',
      });
      const secret = await enableTotpFor(u.accessToken);
      const challengeId = await beginTotpLogin(
        'totp35abrute@test.io',
        'Password123!',
      );
      const valid = authenticator.generate(secret);

      const statuses: number[] = [];
      for (let i = 0; i < 20; i += 1) {
        let code = String((i * 137 + 1) % 1_000_000).padStart(6, '0');
        if (code === valid) code = '000001'; // hádej jen ŠPATNĚ
        const res = await request(srv())
          .post('/api/auth/login/totp')
          .set('X-Forwarded-For', `203.0.113.${i}`) // rotace „IP"
          .send({ challengeId, code });
        statuses.push(res.status);
      }

      // Bezpečná obrana (NEEXISTUJE): per-účet lockout by 20 hádání zastavil
      // statusem 423 (Locked) / 429 (Too Many Requests). Dnes jsou VŠECHNY 401
      // TOTP_INVALID_CODE → challenge žije dál, brute pokračuje.
      const lockedOut = statuses.some((s) => s === 423 || s === 429);
      expect(lockedOut).toBe(true);
    },
  );

  // ── B · PT-35b/c/d — enumerace účtů ──────────────────────────────────

  // RED (díra / by-design oráklum): /auth/check-email vrací {available:bool},
  // takže odpověď pro EXISTUJÍCÍ vs NEEXISTUJÍCÍ e-mail se liší → orákl existence
  // účtu (harvest e-mailů). Bezpečně by byly odpovědi nerozlišitelné. Pozn.: účel
  // endpointu (kontrola dostupnosti při registraci) z něj dělá vědomý trade-off —
  // dokumentujeme jako přijatou díru, ať se o ní ví.
  it.failing(
    'PT-35b: /auth/check-email rozlišuje existující vs neexistující účet (enum orákl)',
    async () => {
      await registerUser(testApp.app, {
        username: 'enum35b',
        email: 'enum35b@test.io',
        password: 'Password123!',
      });

      const exists = await request(srv()).get(
        `/api/auth/check-email?e=${encodeURIComponent('enum35b@test.io')}`,
      );
      const missing = await request(srv()).get(
        `/api/auth/check-email?e=${encodeURIComponent('ghost35b@test.io')}`,
      );

      expect(exists.status).toBe(200);
      expect(missing.status).toBe(200);
      // Bezpečně by byly odpovědi nerozlišitelné. Dnes: false vs true → orákl.
      expect(exists.body.available).toBe(missing.body.available);
    },
  );

  // RED (díra / by-design): register vrací pro zabraný e-mail 409 EMAIL_TAKEN,
  // pro volný 201 → další orákl existence účtu (odlišný od validační chyby).
  it.failing(
    'PT-35c: register EMAIL_TAKEN prozradí existující účet (enum orákl)',
    async () => {
      await registerUser(testApp.app, {
        username: 'enum35c',
        email: 'enum35c@test.io',
        password: 'Password123!',
      });

      // Pokus zaregistrovat na zabraný e-mail (jiný username).
      const taken = await request(srv()).post('/api/auth/register').send({
        username: 'enum35cDup',
        email: 'enum35c@test.io',
        password: 'Password123!',
        acceptedTerms: true,
        isMinor: false,
        captchaToken: 'dev-bypass',
      });

      // Bezpečně by pokus NEprozradil, že e-mail existuje (žádný rozlišující
      // 409 EMAIL_TAKEN). Dnes prozradí → orákl.
      expect(taken.status).not.toBe(409);
      expect(taken.body?.error?.code).not.toBe('EMAIL_TAKEN');
    },
  );

  // RED (díra / by-design): /auth/check-username stejný orákl na přezdívky.
  it.failing(
    'PT-35d: /auth/check-username rozlišuje existující vs volnou přezdívku (enum orákl)',
    async () => {
      await registerUser(testApp.app, {
        username: 'enum35d',
        email: 'enum35d@test.io',
        password: 'Password123!',
      });

      const exists = await request(srv()).get(
        `/api/auth/check-username?u=${encodeURIComponent('enum35d')}`,
      );
      const missing = await request(srv()).get(
        `/api/auth/check-username?u=${encodeURIComponent('ghost35dxyz')}`,
      );

      expect(exists.status).toBe(200);
      expect(missing.status).toBe(200);
      expect(exists.body.available).toBe(missing.body.available);
    },
  );

  // GREEN pin: /auth/forgot-password je anti-enumerace — vždy {ok:true} bez
  // ohledu na existenci e-mailu. Tohle drží; nesmí regresovat na orákl.
  it('PT-35-green: forgot-password neleakuje existenci účtu (vždy ok:true)', async () => {
    await registerUser(testApp.app, {
      username: 'fp35',
      email: 'fp35@test.io',
      password: 'Password123!',
    });

    const exists = await request(srv())
      .post('/api/auth/forgot-password')
      .send({ email: 'fp35@test.io' });
    const missing = await request(srv())
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost-fp35@test.io' });

    expect(exists.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(exists.body).toEqual({ ok: true });
    expect(missing.body).toEqual({ ok: true });
  });

  // ── C · PT-35e — invalidace tokenů ───────────────────────────────────

  // GREEN pin: logout-all (forced logout) reálně zabije REFRESH token — rodina je
  // revokovaná, další refresh spustí reuse-detection (401). Tohle drží.
  it('PT-35e-green: logout-all zneplatní refresh token (nelze obnovit relaci)', async () => {
    const u = await registerUser(testApp.app, {
      username: 'inv35refresh',
      email: 'inv35refresh@test.io',
      password: 'Password123!',
    });

    const logoutAll = await request(srv())
      .post('/api/auth/logout-all')
      .set(authHeader(u.accessToken));
    expect(logoutAll.status).toBe(204);

    const refreshed = await request(srv())
      .post('/api/auth/refresh')
      .send({ refreshToken: u.refreshToken });

    expect(refreshed.status).toBe(401);
    expect(refreshed.body?.accessToken).toBeUndefined();
  });

  // GREEN pin: per-request DB gate v JwtAuthGuard — ban nastavený za běhu zabije
  // i JIŽ vydaný access token (guard čte usera čerstvě z DB). Proto ban/delete
  // access token ZNEPLATNIT umí; jen „logout-all/změna hesla" ne (viz níže).
  it('PT-35e-green2: ban za běhu zablokuje již vydaný access token (per-request gate)', async () => {
    const u = await registerUser(testApp.app, {
      username: 'inv35ban',
      email: 'inv35ban@test.io',
      password: 'Password123!',
    });

    // token před banem funguje
    const before = await request(srv())
      .get('/api/users/me')
      .set(authHeader(u.accessToken));
    expect(before.status).toBe(200);

    // ban přímo v DB (simuluje admin ban za běhu)
    await testApp.connection
      .collection('users')
      .updateOne({ username: 'inv35ban' }, { $set: { bannedAt: new Date() } });

    const after = await request(srv())
      .get('/api/users/me')
      .set(authHeader(u.accessToken));
    expect(after.status).toBe(401);
    expect(after.body?.error?.code).toBe('BANNED');
  });

  // RED (díra): access token je stateless bez `tokenVersion`. Po logout-all
  // („odhlásit všude") zůstává STARÝ access token plně funkční až do expirace
  // (prod TTL 3 dny) — guard usera najde (není ban/delete) → projde. Ukradený
  // token tedy „odhlášení všude" ani změna hesla nezneplatní. Bezpečně by měl
  // logout-all access token okamžitě zabít → dnes NE → `it.failing`.
  it.failing(
    'PT-35e: access token přežije logout-all (chybí tokenVersion → nelze zneplatnit)',
    async () => {
      const u = await registerUser(testApp.app, {
        username: 'inv35access',
        email: 'inv35access@test.io',
        password: 'Password123!',
      });

      const before = await request(srv())
        .get('/api/users/me')
        .set(authHeader(u.accessToken));
      expect(before.status).toBe(200);

      const logoutAll = await request(srv())
        .post('/api/auth/logout-all')
        .set(authHeader(u.accessToken));
      expect(logoutAll.status).toBe(204);

      // Bezpečná obrana (NEEXISTUJE): starý access token má být po forced-logout
      // mrtvý. Dnes stále vrací 200 → assertion padá → dokumentuje díru.
      const after = await request(srv())
        .get('/api/users/me')
        .set(authHeader(u.accessToken));
      expect(after.status).toBe(401);
    },
  );

  // ── D · login timing (jen poznámka) ──────────────────────────────────
  // Neexistující účet: `login` hodí INVALID_CREDENTIALS BEZ bcrypt.compare
  // (chybí dummy-hash), kdežto existující účet se špatným heslem bcrypt.compare
  // PROVEDE. To je časový orákl existence účtu. E2e ho nelze měřit deterministicky
  // (GC/CI šum > rozdíl v ms), proto jen dokumentujeme a neděláme flaky test.
  it.skip('PT-35f: login timing orákl (bcrypt jen u existujícího účtu) — netestovatelné e2e', () => {
    expect(true).toBe(true);
  });
});
