import request from 'supertest';
import { createTestApp, TestApp } from './helpers/app-factory';
import {
  registerUser,
  loginUser,
  authHeader,
  AuthSession,
} from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { WorldElevationsModule } from '../src/modules/world-elevations/world-elevations.module';

describe('Auth refresh flow (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      // AuthService injektuje WorldElevationsService — @Global modul se
      // ale při selektivním modules importu neregistruje automaticky.
      modules: [AuthModule, UsersModule, WorldElevationsModule],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await clearAllCollections(testApp.connection);
  });

  // Pomocná funkce — generuje unique email per test, aby se obešel throttler limit
  // pro register (10/min): každý test má jiný username, ne kolize.
  let testCounter = 0;
  function uniqueCreds() {
    testCounter += 1;
    return {
      username: `alice${testCounter}`,
      email: `alice${testCounter}@test.io`,
      password: 'Password123!',
    };
  }

  async function freshSession(): Promise<AuthSession> {
    return registerUser(testApp.app, uniqueCreds());
  }

  describe('POST /api/auth/refresh', () => {
    it('vrátí nový pár a rotuje starý refresh token', async () => {
      const session = await freshSession();

      const res1 = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(res1.status).toBe(200);
      const body1 = res1.body as {
        accessToken: string;
        refreshToken: string;
      };
      expect(body1.accessToken).toBeDefined();
      expect(body1.refreshToken).toBeDefined();
      expect(body1.refreshToken).not.toBe(session.refreshToken);
    });

    // 23.5 grace okno: reuse čerstvě zrotovaného tokenu VE window (default 60 s)
    // je souběžný refresh (druhý tab / PWA / retry) → dostane TÝŽ nástupnický pár,
    // NE reuse-detection. Bez tohohle sliding session nepřežila 1. expiraci.
    it('grace okno: souběžný reuse vrátí týž nástupnický pár (23.5)', async () => {
      const session = await freshSession();

      const res1 = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(res1.status).toBe(200);
      const body1 = res1.body as { refreshToken: string };

      const res2 = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(res2.status).toBe(200);
      // Idempotence: TÝŽ pár jako první rotace, ne nový token ani 401.
      expect((res2.body as { refreshToken: string }).refreshToken).toBe(
        body1.refreshToken,
      );
    });

    // Reuse PO grace okně = krádež/retry mimo okno → revoke celé rodiny (401).
    // Okno vypnuto přes env (REFRESH_REUSE_GRACE_MS=0) → reuse padá do detekce
    // hned, deterministicky bez čekání 60 s.
    it('reuse po grace okně revokuje celou rodinu', async () => {
      const prevGrace = process.env.REFRESH_REUSE_GRACE_MS;
      process.env.REFRESH_REUSE_GRACE_MS = '0';
      try {
        const session = await freshSession();

        // První refresh — projde (rotace)
        const res1 = await request(testApp.app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: session.refreshToken });
        expect(res1.status).toBe(200);
        const newTokens = res1.body as { refreshToken: string };

        // Reuse starého tokenu bez grace → reuse detection → revoke family
        await request(testApp.app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: session.refreshToken })
          .expect(401);

        // Ani nový (rotated) token už nesmí fungovat — rodina je revoked
        const res3 = await request(testApp.app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: newTokens.refreshToken });
        expect(res3.status).toBe(401);
      } finally {
        if (prevGrace === undefined) delete process.env.REFRESH_REUSE_GRACE_MS;
        else process.env.REFRESH_REUSE_GRACE_MS = prevGrace;
      }
    });

    it('logout znemožní následný refresh (per-session)', async () => {
      const session = await freshSession();

      await request(testApp.app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: session.refreshToken })
        .expect(204);

      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(res.status).toBe(401);
    });

    it('logout je idempotentní (neplatný token → 204)', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: 'totally-invalid-token' })
        .expect(204);
    });

    it('logout-all revokuje všechny tokeny userId', async () => {
      const creds = uniqueCreds();
      const session1 = await registerUser(testApp.app, creds);
      // Login podruhé — nová rodina, jiný refresh token
      const session2 = await loginUser(
        testApp.app,
        creds.email,
        creds.password,
      );
      expect(session1.refreshToken).not.toBe(session2.refreshToken);

      await request(testApp.app.getHttpServer())
        .post('/api/auth/logout-all')
        .set(authHeader(session2.accessToken))
        .expect(204);

      // Oba refresh tokeny už nesmí projít
      await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session1.refreshToken })
        .expect(401);

      await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session2.refreshToken })
        .expect(401);
    });

    it('logout-all bez JWT → 401', async () => {
      await request(testApp.app.getHttpServer())
        .post('/api/auth/logout-all')
        .expect(401);
    });

    it('change password revokuje všechny refresh tokeny userId', async () => {
      const creds = uniqueCreds();
      const session = await registerUser(testApp.app, creds);

      // Změň heslo
      await request(testApp.app.getHttpServer())
        .put('/api/users/password')
        .set(authHeader(session.accessToken))
        .send({
          oldPassword: creds.password,
          newPassword: 'NewPassword456!',
        })
        .expect(204);

      // Revokaci provádí async `@OnEvent('user.password.changed')` handler v
      // AuthService (`revokeAllForUser` → `refresh_tokens.revoked=true`) — NENÍ
      // synchronní vůči HTTP odpovědi na změnu hesla. Jeden `setImmediate` flush
      // byl pod paralelní zátěží (--maxWorkers=2) flaky (handler ještě neproběhl
      // → refresh vrátil 200). Pollovat SAMOTNÝ refresh endpoint nejde: úspěšný
      // refresh token zrotuje (spotřebuje ho) → druhý pokus by vrátil 401 z
      // JINÉHO důvodu (rotace, ne revokace) = falešně zelená. Proto čekáme
      // deterministicky na revokaci v DB, PAK refresh zavoláme jen jednou.
      const refreshTokens = testApp.connection.collection('refresh_tokens');
      let revoked = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const remaining = await refreshTokens.countDocuments({
          userId: session.userId,
          revoked: { $ne: true },
        });
        if (remaining === 0) {
          revoked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(revoked).toBe(true);

      // Refresh starým (revokovaným) tokenem už nesmí projít.
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(res.status).toBe(401);
    });
  });
});
