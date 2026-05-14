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

describe('Auth refresh flow (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [AuthModule, UsersModule],
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
    it('vrátí nový pár a invaliduje starý refresh token (rotation)', async () => {
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

      // Druhé použití původního tokenu = reuse detection → 401
      const res2 = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(res2.status).toBe(401);
    });

    it('reuse detection revokuje celou rodinu', async () => {
      const session = await freshSession();

      // První refresh — projde
      const res1 = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      const newTokens = res1.body as {
        refreshToken: string;
      };

      // Reuse starého tokenu → revoke family
      await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);

      // Ani nový (rotated) token už nesmí fungovat — rodina je revoked
      const res3 = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: newTokens.refreshToken });
      expect(res3.status).toBe(401);
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

      // Event user.password.changed by měl být handler v AuthService
      // synchronně volán → refresh token je už revoked.
      // Ale @OnEvent je async, takže potřebujeme krátký flush:
      await new Promise((resolve) => setImmediate(resolve));

      // Refresh starým tokenem už nesmí projít
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken });
      expect(res.status).toBe(401);
    });
  });
});
