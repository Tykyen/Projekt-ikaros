/**
 * Spec 25.1 — in-app hlášení chyb. Ověřuje intake (anon i přihlášený),
 * role gating admin výpisu (Sa/Admin) a resolve.
 *
 * Throttle (5/min) je v samostatném izolovaném testu (bug-reports-throttle),
 * protože createTestApp záměrně neregistruje APP_GUARD ThrottlerGuard.
 */
import request from 'supertest';
import { Types } from 'mongoose';
import { createTestApp, TestApp } from './helpers/app-factory';
import { registerUser, loginUser, authHeader } from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { WorldElevationsModule } from '../src/modules/world-elevations/world-elevations.module';
import { AlertModule } from '../src/common/alerting/alert.module';
import { BugReportsModule } from '../src/modules/bug-reports/bug-reports.module';

interface BugItem {
  id: string;
  text: string;
  reporterId?: string;
  status: string;
}

describe('BugReports (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [
        AuthModule,
        UsersModule,
        // OptionalJwtAuthGuard/JwtAuthGuard injektují WorldElevationsService;
        // BugReportsService injektuje AlertService (@Global se selektivně neregistruje).
        WorldElevationsModule,
        AlertModule,
        BugReportsModule,
      ],
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await clearAllCollections(testApp.connection);
  });

  let counter = 0;
  function uniqueCreds(prefix: string) {
    counter += 1;
    return {
      username: `${prefix}${counter}`,
      email: `${prefix}${counter}@test.io`,
      password: 'Password123!',
    };
  }

  function bugPayload(overrides: Record<string, unknown> = {}) {
    return {
      text: 'Tlačítko „Uložit" nic nedělá.',
      context: {
        url: 'https://ikaros.test/ikaros',
        scope: 'ikaros',
        speaker: 'ikaros',
        route: '/ikaros',
      },
      ...overrides,
    };
  }

  async function makeAdmin(prefix: string) {
    const creds = uniqueCreds(prefix);
    const user = await registerUser(testApp.app, creds);
    await testApp.connection.collection('users').updateOne(
      { _id: new Types.ObjectId(user.userId) },
      { $set: { role: 2 } }, // UserRole.Admin (nižší číslo = vyšší oprávnění)
    );
    // Re-login, aby JWT nesl role = 2.
    const fresh = await loginUser(testApp.app, creds.email, creds.password);
    return fresh;
  }

  it('Anonym POST → 201, uloží bez reporterId', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/bug-reports')
      .send(bugPayload())
      .expect(201);
    expect(res.body.id).toBeTruthy();

    const admin = await makeAdmin('adminA');
    const list = await request(testApp.app.getHttpServer())
      .get('/api/bug-reports')
      .set(authHeader(admin.accessToken))
      .expect(200);
    const items = (list.body.items as BugItem[]).filter(
      (i) => i.id === res.body.id,
    );
    expect(items).toHaveLength(1);
    expect(items[0].reporterId).toBeUndefined();
    expect(items[0].status).toBe('new');
  });

  it('Přihlášený POST → 201, doplní reporterId z tokenu', async () => {
    const reporter = await registerUser(testApp.app, uniqueCreds('reporter'));
    const res = await request(testApp.app.getHttpServer())
      .post('/api/bug-reports')
      .set(authHeader(reporter.accessToken))
      .send(bugPayload({ email: 'me@test.io' }))
      .expect(201);

    const admin = await makeAdmin('adminB');
    const list = await request(testApp.app.getHttpServer())
      .get('/api/bug-reports')
      .set(authHeader(admin.accessToken))
      .expect(200);
    const item = (list.body.items as BugItem[]).find(
      (i) => i.id === res.body.id,
    );
    expect(item?.reporterId).toBe(reporter.userId);
  });

  it('POST bez context → 400 (validace)', async () => {
    await request(testApp.app.getHttpServer())
      .post('/api/bug-reports')
      .send({ text: 'chybí kontext' })
      .expect(400);
  });

  it('Běžný uživatel GET → 403', async () => {
    const hrac = await registerUser(testApp.app, uniqueCreds('hrac'));
    await request(testApp.app.getHttpServer())
      .get('/api/bug-reports')
      .set(authHeader(hrac.accessToken))
      .expect(403);
  });

  it('Anonym GET → 401', async () => {
    await request(testApp.app.getHttpServer())
      .get('/api/bug-reports')
      .expect(401);
  });

  it('Admin resolve → status resolved', async () => {
    const created = await request(testApp.app.getHttpServer())
      .post('/api/bug-reports')
      .send(bugPayload())
      .expect(201);
    const id = created.body.id as string;

    const admin = await makeAdmin('adminC');
    await request(testApp.app.getHttpServer())
      .post(`/api/bug-reports/${id}/resolve`)
      .set(authHeader(admin.accessToken))
      .expect(201);

    const list = await request(testApp.app.getHttpServer())
      .get('/api/bug-reports?status=resolved')
      .set(authHeader(admin.accessToken))
      .expect(200);
    const item = (list.body.items as BugItem[]).find((i) => i.id === id);
    expect(item?.status).toBe('resolved');
  });

  it('Admin resolve neexistujícího → 404', async () => {
    const admin = await makeAdmin('adminD');
    await request(testApp.app.getHttpServer())
      .post(`/api/bug-reports/${new Types.ObjectId().toString()}/resolve`)
      .set(authHeader(admin.accessToken))
      .expect(404);
  });
});
