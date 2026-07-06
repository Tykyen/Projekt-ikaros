import request from 'supertest';
import { Types } from 'mongoose';
import { createTestApp, TestApp } from './helpers/app-factory';
import { registerUser, loginUser, authHeader } from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { WorldsModule } from '../src/modules/worlds/worlds.module';
import { GameEventsModule } from '../src/modules/game-events/game-events.module';
import { ChatModule } from '../src/modules/chat/chat.module';
import { PushModule } from '../src/modules/push/push.module';
import { WorldElevationsModule } from '../src/modules/world-elevations/world-elevations.module';

describe('GameEvents role gating (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [
        AuthModule,
        UsersModule,
        WorldsModule,
        GameEventsModule,
        ChatModule,
        PushModule,
        // AuthService injektuje WorldElevationsService — @Global modul se
        // ale při selektivním modules importu neregistruje automaticky.
        WorldElevationsModule,
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

  async function setupOwnerAndWorld() {
    const ownerCreds = uniqueCreds('owner');
    const owner = await registerUser(testApp.app, ownerCreds);

    counter += 1;
    const wRes = await request(testApp.app.getHttpServer())
      .post('/api/worlds')
      .set(authHeader(owner.accessToken))
      .send({
        name: `GE Test World ${counter}`,
        slug: `ge-${counter}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'public',
      });

    if (wRes.status !== 201) {
      throw new Error(
        `world create failed: ${wRes.status} ${JSON.stringify(wRes.body)}`,
      );
    }
    const world = wRes.body as {
      id?: string;
      _id?: string;
    };
    return {
      ownerCreds,
      owner,
      worldId: String(world.id ?? world._id),
    };
  }

  async function joinAndPromote(
    worldId: string,
    user: { accessToken: string; userId: string },
    worldRole: number,
    group?: string,
  ) {
    await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(user.accessToken));

    await testApp.connection
      .collection('worldmemberships')
      .updateOne(
        { userId: user.userId, worldId },
        { $set: { role: worldRole, ...(group ? { group } : {}) } },
      );
  }

  function eventPayload(worldId: string, overrides = {}) {
    return {
      worldId,
      title: 'Setkání u draka',
      date: new Date(Date.now() + 86_400_000).toISOString(),
      description: 'Sraz v hospodě.',
      ...overrides,
    };
  }

  it('Anonymous POST → 401', async () => {
    const { worldId } = await setupOwnerAndWorld();
    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .send(eventPayload(worldId))
      .expect(401);
  });

  it('Hrac POST → 403', async () => {
    const { worldId } = await setupOwnerAndWorld();
    const hrac = await registerUser(testApp.app, uniqueCreds('hrac'));
    await joinAndPromote(worldId, hrac, 2); // WorldRole.Hrac (D-053)

    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(hrac.accessToken))
      .send(eventPayload(worldId))
      .expect(403);
  });

  it('PomocnyPJ POST → 201', async () => {
    const { worldId } = await setupOwnerAndWorld();
    const pomocnyPJ = await registerUser(testApp.app, uniqueCreds('pomocny'));
    await joinAndPromote(worldId, pomocnyPJ, 4); // WorldRole.PomocnyPJ (D-053)

    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(pomocnyPJ.accessToken))
      .send(eventPayload(worldId))
      .expect(201);
  });

  // R-20 governance (viz docs/arch/phase-1/_side-tasks/spec-world-admin-elevation.md,
  // paměť admin_governance): platform Admin/Superadmin NEMÁ automaticky moc uvnitř
  // světa. Bypass (`worldAdminBypass`) platí JEN pro svět, kde má admin AKTIVNÍ
  // elevaci (záznam v `world_elevations`). Bez elevace a bez membershipu = jako
  // nečlen → 403. (Dřív tenhle test čekal bezpodmínečný 201 — starý model.)
  it('Admin globální BEZ elevace (ne-member) POST → 403 (R-20 governance)', async () => {
    const { worldId } = await setupOwnerAndWorld();
    const adminCreds = uniqueCreds('admin');
    const admin = await registerUser(testApp.app, adminCreds);

    // Povýšení na UserRole.Admin = 2 (nižší číslo = vyšší oprávnění).
    await testApp.connection
      .collection('users')
      .updateOne(
        { _id: new Types.ObjectId(admin.userId) },
        { $set: { role: 2 } },
      );

    // Re-login, aby JWT nesl role = 2.
    const adminFresh = await loginUser(
      testApp.app,
      adminCreds.email,
      adminCreds.password,
    );

    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(adminFresh.accessToken))
      .send(eventPayload(worldId))
      .expect(403);
  });

  it('Admin globální S elevací POST → 201 (bypass po nahození práv)', async () => {
    const { worldId } = await setupOwnerAndWorld();
    const adminCreds = uniqueCreds('adminelev');
    const admin = await registerUser(testApp.app, adminCreds);

    // Povýšení na UserRole.Admin = 2.
    await testApp.connection
      .collection('users')
      .updateOne(
        { _id: new Types.ObjectId(admin.userId) },
        { $set: { role: 2 } },
      );

    // Aktivace elevace pro TENTO svět — záznam v `world_elevations`.
    // JwtAuthGuard čte `elevatedWorldIds` z této kolekce při KAŽDÉM requestu
    // (listWorldIdsForUser), takže stačí vložit doc; re-login není kvůli
    // elevaci nutný, ale potřebujeme čerstvý JWT s role = 2 (viz níže).
    await testApp.connection.collection('world_elevations').insertOne({
      userId: admin.userId,
      worldId,
      activatedAt: new Date(),
    });

    // Re-login, aby JWT nesl role = 2 (bypass gate: role <= Admin ∧ elevated).
    const adminFresh = await loginUser(
      testApp.app,
      adminCreds.email,
      adminCreds.password,
    );

    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(adminFresh.accessToken))
      .send(eventPayload(worldId))
      .expect(201);
  });

  it('groupOnly viditelnost: Hrac v group A vidí, Hrac v group B nevidí', async () => {
    const { ownerCreds, owner, worldId } = await setupOwnerAndWorld();

    const hracA = await registerUser(testApp.app, uniqueCreds('hracA'));
    const hracB = await registerUser(testApp.app, uniqueCreds('hracB'));
    await joinAndPromote(worldId, hracA, 2, 'A'); // WorldRole.Hrac, group A (D-053)
    await joinAndPromote(worldId, hracB, 2, 'B'); // WorldRole.Hrac, group B (D-053)

    // Owner needs WorldRole.PJ to create event — promote his membership
    // (owner gets membership when world is created, but test setup may differ).
    // Insert/update membership for owner with PJ role:
    await testApp.connection.collection('worldmemberships').updateOne(
      { userId: owner.userId, worldId },
      { $set: { role: 5 } }, // WorldRole.PJ (D-053)
      { upsert: true },
    );
    const ownerFresh = await loginUser(
      testApp.app,
      ownerCreds.email,
      ownerCreds.password,
    );

    // Vytvoř groupOnly event pro group A
    const createRes = await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(ownerFresh.accessToken))
      .send(eventPayload(worldId, { groupOnly: true, targetGroup: 'A' }));
    if (createRes.status !== 201) {
      throw new Error(
        `event create failed: ${createRes.status} ${JSON.stringify(
          createRes.body,
        )}`,
      );
    }

    // Hrac v group A vidí
    const resA = await request(testApp.app.getHttpServer())
      .get(`/api/game-events?worldId=${worldId}`)
      .set(authHeader(hracA.accessToken));
    expect(resA.status).toBe(200);
    const listA = resA.body as unknown[];
    expect(listA.length).toBe(1);

    // Hrac v group B nevidí
    const resB = await request(testApp.app.getHttpServer())
      .get(`/api/game-events?worldId=${worldId}`)
      .set(authHeader(hracB.accessToken));
    expect(resB.status).toBe(200);
    const listB = resB.body as unknown[];
    expect(listB.length).toBe(0);
  });
});
