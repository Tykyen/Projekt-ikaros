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
    await joinAndPromote(worldId, hrac, 0); // WorldRole.Hrac

    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(hrac.accessToken))
      .send(eventPayload(worldId))
      .expect(403);
  });

  it('PomocnyPJ POST → 201', async () => {
    const { worldId } = await setupOwnerAndWorld();
    const pomocnyPJ = await registerUser(testApp.app, uniqueCreds('pomocny'));
    await joinAndPromote(worldId, pomocnyPJ, 2); // WorldRole.PomocnyPJ

    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(pomocnyPJ.accessToken))
      .send(eventPayload(worldId))
      .expect(201);
  });

  it('Admin globální (ne-member světa) POST → 201 (bypass)', async () => {
    const { worldId } = await setupOwnerAndWorld();
    const adminCreds = uniqueCreds('admin');
    const admin = await registerUser(testApp.app, adminCreds);

    // Promote globally to UserRole.Admin = 2 (lower number = higher privilege).
    await testApp.connection
      .collection('users')
      .updateOne(
        { _id: new Types.ObjectId(admin.userId) },
        { $set: { role: 2 } },
      );

    // Re-login so the new JWT carries role = 2
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
    await joinAndPromote(worldId, hracA, 0, 'A'); // WorldRole.Hrac, group A
    await joinAndPromote(worldId, hracB, 0, 'B'); // WorldRole.Hrac, group B

    // Owner needs WorldRole.PJ to create event — promote his membership
    // (owner gets membership when world is created, but test setup may differ).
    // Insert/update membership for owner with PJ role:
    await testApp.connection.collection('worldmemberships').updateOne(
      { userId: owner.userId, worldId },
      { $set: { role: 3 } }, // WorldRole.PJ
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
