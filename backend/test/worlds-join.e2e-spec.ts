import request from 'supertest';
import { createTestApp, TestApp } from './helpers/app-factory';
import { registerUser, authHeader } from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { WorldsModule } from '../src/modules/worlds/worlds.module';
import { IkarosMessagesModule } from '../src/modules/ikaros-messages/ikaros-messages.module';
import { ChatModule } from '../src/modules/chat/chat.module';
import { PushModule } from '../src/modules/push/push.module';

describe('Worlds JOIN flow (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [
        AuthModule,
        UsersModule,
        WorldsModule,
        IkarosMessagesModule,
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

  async function newOwner() {
    return registerUser(testApp.app, uniqueCreds('owner'));
  }
  async function newJoiner() {
    return registerUser(testApp.app, uniqueCreds('joiner'));
  }

  async function createWorld(
    ownerToken: string,
    accessMode: 'public' | 'open' | 'private' | 'closed',
  ): Promise<string> {
    counter += 1;
    const res = await request(testApp.app.getHttpServer())
      .post('/api/worlds')
      .set(authHeader(ownerToken))
      .send({
        name: `Test World ${accessMode} ${counter}`,
        slug: `test-${accessMode}-${counter}`,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode,
        description: 'Testovací svět',
      });

    if (res.status !== 201) {
      throw new Error(
        `createWorld failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    const body = res.body as { id?: string; _id?: string };
    return body.id ?? (body._id as string);
  }

  it('public: JOIN → 201/200, role = Hrac (0), playerCount inkrement', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'public');
    const joiner = await newJoiner();

    const res = await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken));

    expect([200, 201]).toContain(res.status);
    const body = res.body as { role: number };
    expect(body.role).toBe(0); // WorldRole.Hrac

    const wRes = await request(testApp.app.getHttpServer()).get(
      `/api/worlds/${worldId}`,
    );
    const world = wRes.body as { playerCount?: number };
    expect(world.playerCount ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('open: JOIN → role = Pending (-1) + IkarosMessage v DB', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'open');
    // POST /worlds nevytvoří membership pro ownera; pro test viditelnosti
    // listeneru (filtr PJ/PomocnyPJ) musíme owner-membership vložit ručně.
    // Owner po POST /worlds má membership s defaultní rolí — upgrade na PJ.
    await testApp.connection.collection('worldmemberships').updateOne(
      { userId: owner.userId, worldId },
      { $set: { role: 3 } }, // WorldRole.PJ
      { upsert: true },
    );
    const joiner = await newJoiner();

    const res = await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken));

    expect([200, 201]).toContain(res.status);
    const body = res.body as { role: number };
    expect(body.role).toBe(-1);

    // EventEmitter listener IkarosMessages je async (membershipRepo.findByWorldId
    // → Promise.all(saveMessage)) — krátký timeout flush.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const messages = await testApp.connection
      .collection('ikarosmessages')
      .find({ actionType: 'world_join_request', actionWorldId: worldId })
      .toArray();
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]).toMatchObject({
      actionType: 'world_join_request',
      recipientId: owner.userId,
    });
  });

  it('private: JOIN → role = Pending (default mode pro non-public/open)', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'private');
    const joiner = await newJoiner();

    const res = await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken));

    expect([200, 201]).toContain(res.status);
    const body = res.body as { role: number };
    expect(body.role).toBe(-1);
  });

  it('closed: JOIN → 403 ForbiddenException', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'closed');
    const joiner = await newJoiner();

    await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken))
      .expect(403);
  });

  it('idempotence Pending: dvojí JOIN do open → stejná membership, žádný druhý event', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'open');
    await testApp.connection.collection('worldmemberships').updateOne(
      { userId: owner.userId, worldId },
      { $set: { role: 3 } }, // WorldRole.PJ — listener filter
      { upsert: true },
    );
    const joiner = await newJoiner();

    const res1 = await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken));
    const m1 = res1.body as { id?: string; _id?: string };
    const id1 = m1.id ?? m1._id;

    const res2 = await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken));
    const m2 = res2.body as { id?: string; _id?: string };
    const id2 = m2.id ?? m2._id;

    expect([200, 201]).toContain(res2.status);
    expect(id2).toBe(id1);

    await new Promise((resolve) => setImmediate(resolve));

    const messages = await testApp.connection
      .collection('ikarosmessages')
      .find({
        actionType: 'world_join_request',
        actionWorldId: worldId,
        recipientId: owner.userId,
      })
      .toArray();
    expect(messages.length).toBe(1);
  });

  it('Conflict pro Hrac: druhý JOIN po promotion na Hrac → 409', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'public');
    const joiner = await newJoiner();

    // První JOIN do public → Hrac
    await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken));

    // Druhý JOIN → 409
    await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(joiner.accessToken))
      .expect(409);
  });
});
