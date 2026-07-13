import request from 'supertest';
import { Types } from 'mongoose';
import { createTestApp, TestApp } from './helpers/app-factory';
import { registerUser, authHeader, type AuthSession } from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { FriendshipsModule } from '../src/modules/friendships/friendships.module';
import { PendingActionsModule } from '../src/modules/pending-actions/pending-actions.module';
import { UploadModule } from '../src/modules/upload/upload.module';
import { WorldsModule } from '../src/modules/worlds/worlds.module';
import { ChatModule } from '../src/modules/chat/chat.module';
import { PushModule } from '../src/modules/push/push.module';
import { IkarosMessagesModule } from '../src/modules/ikaros-messages/ikaros-messages.module';
import { MailerModule } from '../src/modules/mailer/mailer.module';
import { SecurityTokensModule } from '../src/modules/security-tokens/security-tokens.module';
import { DataExportModule } from '../src/modules/data-export/data-export.module';
import { WorldElevationsModule } from '../src/modules/world-elevations/world-elevations.module';

/**
 * Spec 1.8 — e2e flow pro Friendship modul.
 *
 * Pokrytí:
 *  - send → accept → list → remove (happy path)
 *  - 409 paths (REQUEST_EXISTS, ALREADY_FRIENDS)
 *  - 403 paths (NOT_PARTICIPANT, NOT_RECIPIENT)
 *  - 429 REJECTED_RECENTLY (cool-down)
 *  - status endpoint pro 5 stavů
 *  - integrace s `/pending-actions/count` agregátorem
 */
describe('Friendships flow (e2e)', () => {
  let testApp: TestApp;
  let counter = 0;
  let alice: AuthSession;
  let bob: AuthSession;
  let carol: AuthSession;

  beforeAll(async () => {
    testApp = await createTestApp({
      modules: [
        MailerModule,
        SecurityTokensModule,
        DataExportModule,
        AuthModule,
        UsersModule,
        UploadModule,
        WorldsModule,
        ChatModule,
        PushModule,
        IkarosMessagesModule,
        PendingActionsModule,
        FriendshipsModule,
        // AuthService injektuje WorldElevationsService — @Global modul se
        // ale při selektivním modules importu neregistruje automaticky.
        WorldElevationsModule,
      ],
      envOverrides: {
        FRIEND_REQUEST_COOLDOWN_HOURS: '1',
      },
    });
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await clearAllCollections(testApp.connection);
    counter += 1;
    alice = await registerUser(testApp.app, {
      username: `alice${counter}`,
      email: `alice${counter}@e2e.io`,
      password: 'Password123!',
    });
    bob = await registerUser(testApp.app, {
      username: `bob${counter}`,
      email: `bob${counter}@e2e.io`,
      password: 'Password123!',
    });
    carol = await registerUser(testApp.app, {
      username: `carol${counter}`,
      email: `carol${counter}@e2e.io`,
      password: 'Password123!',
    });
  });

  it('happy path: send → accept → list → remove', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    expect(send.status).toBe(201);
    const fid = (send.body as { friendship: { id: string } }).friendship.id;

    const accept = await request(testApp.app.getHttpServer())
      .post(`/api/friends/${fid}/accept`)
      .set(authHeader(bob.accessToken));
    expect(accept.status).toBe(200);
    expect(
      (accept.body as { friendship: { status: string } }).friendship.status,
    ).toBe('accepted');

    const aliceList = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(alice.accessToken));
    expect(aliceList.status).toBe(200);
    expect((aliceList.body as { items: unknown[]; total: number }).total).toBe(
      1,
    );

    const bobList = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(bob.accessToken));
    expect((bobList.body as { total: number }).total).toBe(1);

    const remove = await request(testApp.app.getHttpServer())
      .delete(`/api/friends/${fid}`)
      .set(authHeader(alice.accessToken));
    expect(remove.status).toBe(204);

    const aliceAfter = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(alice.accessToken));
    expect((aliceAfter.body as { total: number }).total).toBe(0);
  });

  it('duplicate request → 409 REQUEST_EXISTS', async () => {
    await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId })
      .expect(201);

    const dup = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    expect(dup.status).toBe(409);
    expect((dup.body as { error: { code: string } }).error.code).toBe(
      'REQUEST_EXISTS',
    );
  });

  it('send self → 400 SELF_FRIEND', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: alice.userId });
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'SELF_FRIEND',
    );
  });

  it('accept by requester → 403 NOT_RECIPIENT', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;

    const acc = await request(testApp.app.getHttpServer())
      .post(`/api/friends/${fid}/accept`)
      .set(authHeader(alice.accessToken));
    expect(acc.status).toBe(403);
    expect((acc.body as { error: { code: string } }).error.code).toBe(
      'NOT_RECIPIENT',
    );
  });

  it('non-participant nemůže akceptovat ani odebrat', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;

    const acc = await request(testApp.app.getHttpServer())
      .post(`/api/friends/${fid}/accept`)
      .set(authHeader(carol.accessToken));
    expect(acc.status).toBe(403);

    const del = await request(testApp.app.getHttpServer())
      .delete(`/api/friends/${fid}`)
      .set(authHeader(carol.accessToken));
    expect(del.status).toBe(403);
  });

  it('cool-down: B odmítne → A nemůže znovu poslat (429)', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;

    await request(testApp.app.getHttpServer())
      .delete(`/api/friends/${fid}`)
      .set(authHeader(bob.accessToken))
      .expect(204);

    const retry = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    expect(retry.status).toBe(429);
    expect((retry.body as { error: { code: string } }).error.code).toBe(
      'REJECTED_RECENTLY',
    );
  });

  it('cool-down asymetrie: B odmítl A, ale B sám smí poslat A okamžitě', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;

    await request(testApp.app.getHttpServer())
      .delete(`/api/friends/${fid}`)
      .set(authHeader(bob.accessToken))
      .expect(204);

    // B → A: protistrana cool-downu, ne sám decliner
    const bobSend = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(bob.accessToken))
      .send({ userId: alice.userId });
    expect(bobSend.status).toBe(201);
  });

  it('status endpoint: none → pending_outgoing/incoming → accepted', async () => {
    const initial = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect((initial.body as { kind: string }).kind).toBe('none');

    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;

    const aliceStatus = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect((aliceStatus.body as { kind: string }).kind).toBe(
      'pending_outgoing',
    );

    const bobStatus = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${alice.userId}`)
      .set(authHeader(bob.accessToken));
    expect((bobStatus.body as { kind: string }).kind).toBe('pending_incoming');

    await request(testApp.app.getHttpServer())
      .post(`/api/friends/${fid}/accept`)
      .set(authHeader(bob.accessToken))
      .expect(200);

    const after = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect((after.body as { kind: string }).kind).toBe('accepted');
  });

  it('status: self vrací kind=self', async () => {
    const res = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${alice.userId}`)
      .set(authHeader(alice.accessToken));
    expect((res.body as { kind: string }).kind).toBe('self');
  });

  it('GET /pending-actions/count zahrnuje friend pending pro příjemce', async () => {
    await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId })
      .expect(201);

    const bobCount = await request(testApp.app.getHttpServer())
      .get('/api/pending-actions/count')
      .set(authHeader(bob.accessToken));
    expect((bobCount.body as { total: number }).total).toBe(1);

    // Žadatel nemá pending pro sebe
    const aliceCount = await request(testApp.app.getHttpServer())
      .get('/api/pending-actions/count')
      .set(authHeader(alice.accessToken));
    expect((aliceCount.body as { total: number }).total).toBe(0);
  });

  it('GET /pending-actions?type=friend_request vrací item pro příjemce', async () => {
    await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId })
      .expect(201);

    const list = await request(testApp.app.getHttpServer())
      .get('/api/pending-actions?type=friend_request')
      .set(authHeader(bob.accessToken));
    expect(list.status).toBe(200);
    const body = list.body as {
      items: Array<{ direction: string; counterpart: { id: string } }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0].direction).toBe('incoming');
    expect(body.items[0].counterpart.id).toBe(alice.userId);
  });

  it('outgoing endpoint vrátí items pro žadatele', async () => {
    await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId })
      .expect(201);

    const out = await request(testApp.app.getHttpServer())
      .get('/api/friends/requests/outgoing')
      .set(authHeader(alice.accessToken));
    expect(out.status).toBe(200);
    const body = out.body as {
      items: Array<{ direction: string; counterpart: { id: string } }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0].direction).toBe('outgoing');
    expect(body.items[0].counterpart.id).toBe(bob.userId);
  });

  it('by-user alias smaže friendship podle ID partnera', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/${fid}/accept`)
      .set(authHeader(bob.accessToken))
      .expect(200);

    const del = await request(testApp.app.getHttpServer())
      .delete(`/api/friends/by-user/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect(del.status).toBe(204);

    const aliceList = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(alice.accessToken));
    expect((aliceList.body as { total: number }).total).toBe(0);
  });

  // ── D-NEW-INV-PROFILE — worldsCount ve friend shape ─────────────────

  it('list: friend.worldsCount počítá jen členství v nesmazaných světech', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/${fid}/accept`)
      .set(authHeader(bob.accessToken))
      .expect(200);

    // Přímý DB seed: 2 světy (aktivní + soft-smazaný v 30denním okně)
    // a bobova členství v obou — ověřuje reálnou $lookup agregaci.
    const activeWorldId = new Types.ObjectId();
    const deletedWorldId = new Types.ObjectId();
    await testApp.connection.db!.collection('worlds').insertMany([
      {
        _id: activeWorldId,
        name: 'Živý svět',
        slug: `zivy-${counter}`,
        ownerId: bob.userId,
        isActive: true,
        deletedAt: null,
      },
      {
        _id: deletedWorldId,
        name: 'Smazaný svět',
        slug: `smazany-${counter}`,
        ownerId: bob.userId,
        isActive: true,
        deletedAt: new Date(),
      },
    ]);
    await testApp.connection.db!.collection('worldmemberships').insertMany([
      {
        userId: bob.userId,
        worldId: String(activeWorldId),
        role: 2,
        joinedAt: new Date(),
      },
      {
        userId: bob.userId,
        worldId: String(deletedWorldId),
        role: 2,
        joinedAt: new Date(),
      },
    ]);

    const aliceList = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(alice.accessToken));
    expect(aliceList.status).toBe(200);
    const body = aliceList.body as {
      items: Array<{ friend: { id: string; worldsCount: number } }>;
    };
    expect(body.items[0].friend.id).toBe(bob.userId);
    // Soft-smazaný svět se do počtu nepromítá → 1, ne 2.
    expect(body.items[0].friend.worldsCount).toBe(1);

    // Alice nemá žádné členství → 0 (zero-fill, ne undefined).
    const bobList = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(bob.accessToken));
    expect(
      (bobList.body as { items: Array<{ friend: { worldsCount: number } }> })
        .items[0].friend.worldsCount,
    ).toBe(0);
  });

  // ── D-055 block flow ────────────────────────────────────────────────

  it('block: vytvoří blok + status=blocked_by_me pro blokujícího', async () => {
    const block = await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect(block.status).toBe(201);
    expect(
      (block.body as { friendship: { status: string } }).friendship.status,
    ).toBe('blocked');

    const aliceStatus = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect((aliceStatus.body as { kind: string }).kind).toBe('blocked_by_me');
  });

  it('block: blokovaný vidí status=none (anti-stalk)', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);

    const bobStatus = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${alice.userId}`)
      .set(authHeader(bob.accessToken));
    expect((bobStatus.body as { kind: string }).kind).toBe('none');
  });

  it('block: existující accepted friendship zmizí z /friends', async () => {
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    const fid = (send.body as { friendship: { id: string } }).friendship.id;
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/${fid}/accept`)
      .set(authHeader(bob.accessToken))
      .expect(200);

    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);

    const aliceList = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(alice.accessToken));
    expect((aliceList.body as { total: number }).total).toBe(0);

    const bobList = await request(testApp.app.getHttpServer())
      .get('/api/friends')
      .set(authHeader(bob.accessToken));
    expect((bobList.body as { total: number }).total).toBe(0);
  });

  it('block: blokovaný nemůže poslat žádost → 404 USER_NOT_FOUND', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);

    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(bob.accessToken))
      .send({ userId: alice.userId });
    expect(send.status).toBe(404);
    expect((send.body as { error: { code: string } }).error.code).toBe(
      'USER_NOT_FOUND',
    );
  });

  it('block: blokující dostane 409 ALREADY_BLOCKED při sendRequest', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);

    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    expect(send.status).toBe(409);
    expect((send.body as { error: { code: string } }).error.code).toBe(
      'ALREADY_BLOCKED',
    );
  });

  it('block self → 400 SELF_BLOCK', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${alice.userId}`)
      .set(authHeader(alice.accessToken));
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'SELF_BLOCK',
    );
  });

  it('unblock → status=none + lze poslat žádost', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);

    const unblock = await request(testApp.app.getHttpServer())
      .delete(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect(unblock.status).toBe(204);

    const aliceStatus = await request(testApp.app.getHttpServer())
      .get(`/api/friends/status/${bob.userId}`)
      .set(authHeader(alice.accessToken));
    expect((aliceStatus.body as { kind: string }).kind).toBe('none');

    // Nyní lze poslat žádost
    const send = await request(testApp.app.getHttpServer())
      .post('/api/friends/request')
      .set(authHeader(alice.accessToken))
      .send({ userId: bob.userId });
    expect(send.status).toBe(201);
  });

  it('GET /friends/blocks vrací seznam mých bloků', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${carol.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);

    const list = await request(testApp.app.getHttpServer())
      .get('/api/friends/blocks')
      .set(authHeader(alice.accessToken));
    expect(list.status).toBe(200);
    const body = list.body as {
      items: Array<{ user: { id: string } }>;
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.items.map((b) => b.user.id).sort()).toEqual(
      [bob.userId, carol.userId].sort(),
    );

    // Bob nemá žádné své bloky (anti-stalk)
    const bobList = await request(testApp.app.getHttpServer())
      .get('/api/friends/blocks')
      .set(authHeader(bob.accessToken));
    expect((bobList.body as { total: number }).total).toBe(0);
  });

  it('block-by-peer: 403 BLOCKED_BY_PEER (info-leak akceptován)', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${bob.userId}`)
      .set(authHeader(alice.accessToken))
      .expect(201);

    const res = await request(testApp.app.getHttpServer())
      .post(`/api/friends/block/${alice.userId}`)
      .set(authHeader(bob.accessToken));
    expect(res.status).toBe(403);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'BLOCKED_BY_PEER',
    );
  });
});
