/**
 * E2E test pro krok 1.1: login podle e-mailu NEBO přezdívky a register validace
 * (přezdívka nesmí obsahovat @).
 */
import request from 'supertest';
import { createTestApp, TestApp } from './helpers/app-factory';
import { registerUser, loginUser } from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { WorldElevationsModule } from '../src/modules/world-elevations/world-elevations.module';

describe('Auth login by identifier (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      // AuthService injektuje WorldElevationsService (@Global, ale při
      // selektivním modules importu se @Global moduly nezaregistrují samy —
      // musí být explicitně v seznamu), jinak Nest DI compile selže.
      modules: [AuthModule, UsersModule, WorldElevationsModule],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await clearAllCollections(testApp.connection);
  });

  let counter = 0;
  function uniqueCreds() {
    counter += 1;
    return {
      username: `bob${counter}`,
      email: `bob${counter}@test.io`,
      password: 'Password123!',
    };
  }

  describe('POST /api/auth/login', () => {
    it('přihlásí emailem (identifier obsahuje @)', async () => {
      const creds = uniqueCreds();
      await registerUser(testApp.app, creds);

      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });

      expect(res.status).toBe(200);
      const body = res.body as {
        accessToken: string;
        refreshToken: string;
      };
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
    });

    it('přihlásí přezdívkou (identifier bez @)', async () => {
      const creds = uniqueCreds();
      await registerUser(testApp.app, creds);

      const session = await loginUser(
        testApp.app,
        creds.username,
        creds.password,
      );
      expect(session.accessToken).toBeDefined();
      expect(session.username).toBe(creds.username);
    });

    it('401 pokud přezdívka neexistuje', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'neexistuje', password: 'whatever' });
      expect(res.status).toBe(401);
    });

    it('401 pokud email neexistuje', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'x@y.z', password: 'whatever' });
      expect(res.status).toBe(401);
    });

    it('401 pro správnou přezdívku ale špatné heslo', async () => {
      const creds = uniqueCreds();
      await registerUser(testApp.app, creds);

      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: creds.username, password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('400 pokud chybí identifier', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: 'pass' });
      expect(res.status).toBe(400);
    });

    it('400 pokud chybí password', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/register — username constraint', () => {
    it('400 pokud username obsahuje @', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          username: 'evil@user',
          email: 'evil@test.io',
          password: 'Password123!',
          acceptedTerms: true,
          captchaToken: 'dev-bypass',
        });
      expect(res.status).toBe(400);
    });

    it('201 pokud username neobsahuje @', async () => {
      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          username: 'cleanuser',
          email: 'clean@test.io',
          password: 'Password123!',
          acceptedTerms: true,
          captchaToken: 'dev-bypass',
        });
      expect(res.status).toBe(201);
    });
  });
});
