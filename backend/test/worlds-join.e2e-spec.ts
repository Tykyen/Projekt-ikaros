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

/**
 * Spec 2.4 — vstup do světa.
 *  - public  → `POST /:id/join` → okamžitý membership s rolí Čtenář (1).
 *  - open/private → `POST /:id/access-request` → `WorldAccessRequest`
 *    (pre-membership), PJ/owner schvaluje přes `/access-requests/:id/approve`.
 *  - closed  → ani join, ani access-request (403).
 *
 * (Přepsáno 2026-05-16 — původní test cílil na zrušený pre-2.4 unified-join
 * flow + `world_join_request` IkarosMessage, který krok 3.5 dluh B odstranil.)
 */
describe('Worlds JOIN + access flow (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      // approve používá session.withTransaction() (worlds.service) → vyžaduje
      // replica set, jinak „Transaction numbers are only allowed on a replica set".
      replSet: true,
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

  const newOwner = () => registerUser(testApp.app, uniqueCreds('owner'));
  const newJoiner = () => registerUser(testApp.app, uniqueCreds('joiner'));

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

  const join = (worldId: string, token: string) =>
    request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(token));

  const accessRequest = (worldId: string, token: string) =>
    request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/access-request`)
      .set(authHeader(token));

  // ── public ─────────────────────────────────────────────
  it('public: POST /join → membership s rolí Čtenář (1)', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'public');
    const joiner = await newJoiner();

    const res = await join(worldId, joiner.accessToken);

    expect([200, 201]).toContain(res.status);
    const body = res.body as { role: number; userId: string };
    expect(body.role).toBe(1); // WorldRole.Ctenar
    expect(body.userId).toBe(joiner.userId);
  });

  it('public: druhý JOIN → 409 (už je členem)', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'public');
    const joiner = await newJoiner();

    await join(worldId, joiner.accessToken);
    await join(worldId, joiner.accessToken).expect(409);
  });

  it('public: POST /access-request → 400 (public nevyžaduje žádost)', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'public');
    const joiner = await newJoiner();

    await accessRequest(worldId, joiner.accessToken).expect(400);
  });

  // ── open / private ─────────────────────────────────────
  it('open: POST /access-request → vznikne WorldAccessRequest', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'open');
    const joiner = await newJoiner();

    const res = await accessRequest(worldId, joiner.accessToken);

    expect([200, 201]).toContain(res.status);
    const body = res.body as { id: string; worldId: string; userId: string };
    expect(body.id).toBeTruthy();
    expect(body.worldId).toBe(worldId);
    expect(body.userId).toBe(joiner.userId);
  });

  it('open: druhá access-request → 409 (duplicitní žádost)', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'open');
    const joiner = await newJoiner();

    await accessRequest(worldId, joiner.accessToken);
    await accessRequest(worldId, joiner.accessToken).expect(409);
  });

  it('open: POST /join → 400 (open svět vyžaduje žádost)', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'open');
    const joiner = await newJoiner();

    await join(worldId, joiner.accessToken).expect(400);
  });

  it('private: POST /access-request → vznikne WorldAccessRequest', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'private');
    const joiner = await newJoiner();

    const res = await accessRequest(worldId, joiner.accessToken);
    expect([200, 201]).toContain(res.status);
    expect((res.body as { id: string }).id).toBeTruthy();
  });

  // ── closed ─────────────────────────────────────────────
  it('closed: POST /join → 403', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'closed');
    const joiner = await newJoiner();

    await join(worldId, joiner.accessToken).expect(403);
  });

  it('closed: POST /access-request → 403', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'closed');
    const joiner = await newJoiner();

    await accessRequest(worldId, joiner.accessToken).expect(403);
  });

  // ── approve flow ───────────────────────────────────────
  it('approve: owner schválí access-request → žadatel se stane členem (Čtenář)', async () => {
    const owner = await newOwner();
    const worldId = await createWorld(owner.accessToken, 'open');
    const joiner = await newJoiner();

    const arRes = await accessRequest(worldId, joiner.accessToken);
    const requestId = (arRes.body as { id: string }).id;

    const approveRes = await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/access-requests/${requestId}/approve`)
      .set(authHeader(owner.accessToken));

    expect([200, 201]).toContain(approveRes.status);
    const body = approveRes.body as {
      ok: boolean;
      membership: { role: number; userId: string };
    };
    expect(body.ok).toBe(true);
    expect(body.membership.role).toBe(1); // WorldRole.Ctenar
    expect(body.membership.userId).toBe(joiner.userId);

    // schválený žadatel je nyní člen → další access-request → 409
    await accessRequest(worldId, joiner.accessToken).expect(409);
  });
});
