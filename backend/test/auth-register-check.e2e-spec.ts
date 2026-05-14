/**
 * E2E test pro krok 1.2: register conflict s `code` field a check-username/email endpointy.
 */
import request from 'supertest';
import { createTestApp, TestApp } from './helpers/app-factory';
import { registerUser } from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';

describe('Auth register conflict + check (e2e)', () => {
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

  describe('POST /api/auth/register — conflict s code field', () => {
    it('409 + code EMAIL_TAKEN pro duplicitní e-mail', async () => {
      await registerUser(testApp.app, {
        email: 'taken@test.io',
        username: 'first',
        password: 'Password123!',
      });

      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'taken@test.io',
          username: 'second',
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: 'EMAIL_TAKEN',
          message: 'Email již existuje',
        },
      });
    });

    it('409 + code USERNAME_TAKEN pro duplicitní username', async () => {
      await registerUser(testApp.app, {
        email: 'first@test.io',
        username: 'duplicateUser',
        password: 'Password123!',
      });

      const res = await request(testApp.app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'second@test.io',
          username: 'duplicateUser',
          password: 'Password123!',
        });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          code: 'USERNAME_TAKEN',
          message: 'Username již existuje',
        },
      });
    });
  });

  describe('GET /api/auth/check-username', () => {
    it('200 + available=true pro neobsazenou přezdívku', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-username')
        .query({ u: 'NewUser' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: true });
    });

    it('200 + available=false pro existující přezdívku', async () => {
      await registerUser(testApp.app, {
        email: 'check@test.io',
        username: 'TakenName',
        password: 'Password123!',
      });

      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-username')
        .query({ u: 'TakenName' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });

    it('200 + available=false pro krátký username (early return)', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-username')
        .query({ u: 'ab' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });

    it('200 + available=false pro username s @ (early return)', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-username')
        .query({ u: 'bad@user' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });

    it('200 + available=false pro chybějící query parametr', async () => {
      const res = await request(testApp.app.getHttpServer()).get(
        '/api/auth/check-username',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });
  });

  describe('GET /api/auth/check-email', () => {
    it('200 + available=true pro neobsazený e-mail', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-email')
        .query({ e: 'fresh@test.io' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: true });
    });

    it('200 + available=false pro existující e-mail', async () => {
      await registerUser(testApp.app, {
        email: 'taken-check@test.io',
        username: 'someuser',
        password: 'Password123!',
      });

      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-email')
        .query({ e: 'taken-check@test.io' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });

    it('200 + available=false case-insensitive lookup pro existující e-mail', async () => {
      await registerUser(testApp.app, {
        email: 'mixed@test.io',
        username: 'mixeduser',
        password: 'Password123!',
      });

      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-email')
        .query({ e: 'MIXED@TEST.IO' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });

    it('200 + available=false pro řetězec bez @ (early return)', async () => {
      const res = await request(testApp.app.getHttpServer())
        .get('/api/auth/check-email')
        .query({ e: 'noatsign' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });
  });
});
