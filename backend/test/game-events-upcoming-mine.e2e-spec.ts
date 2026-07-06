import request from 'supertest';
import { createTestApp, TestApp } from './helpers/app-factory';
import { registerUser, loginUser, authHeader } from './helpers/auth';
import { clearAllCollections } from './helpers/db';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UsersModule } from '../src/modules/users/users.module';
import { WorldsModule } from '../src/modules/worlds/worlds.module';
import { GameEventsModule } from '../src/modules/game-events/game-events.module';
import { ChatModule } from '../src/modules/chat/chat.module';
import { PushModule } from '../src/modules/push/push.module';
import { MailerModule } from '../src/modules/mailer/mailer.module';
import { SecurityTokensModule } from '../src/modules/security-tokens/security-tokens.module';
import { DataExportModule } from '../src/modules/data-export/data-export.module';
import { UploadModule } from '../src/modules/upload/upload.module';
import { FriendshipsModule } from '../src/modules/friendships/friendships.module';
import { PendingActionsModule } from '../src/modules/pending-actions/pending-actions.module';
import { IkarosMessagesModule } from '../src/modules/ikaros-messages/ikaros-messages.module';
import { WorldRole } from '../src/modules/worlds/interfaces/world-membership.interface';
import { WorldElevationsModule } from '../src/modules/world-elevations/world-elevations.module';

describe('GameEvents upcoming/mine (e2e)', () => {
  let testApp: TestApp;

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
        GameEventsModule,
        ChatModule,
        PushModule,
        IkarosMessagesModule,
        PendingActionsModule,
        FriendshipsModule,
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

  async function setupWorld(name: string) {
    const ownerCreds = uniqueCreds('owner');
    const owner = await registerUser(testApp.app, ownerCreds);
    counter += 1;
    const slug = `up-${counter}`;
    const wRes = await request(testApp.app.getHttpServer())
      .post('/api/worlds')
      .set(authHeader(owner.accessToken))
      .send({
        name,
        slug,
        genre: 'fantasy',
        system: 'dnd5e',
        accessMode: 'public',
      });
    if (wRes.status !== 201) {
      throw new Error(
        `world create failed: ${wRes.status} ${JSON.stringify(wRes.body)}`,
      );
    }
    const world = wRes.body as { id?: string; _id?: string };
    const worldId = String(world.id ?? world._id);
    // promote owner to PJ
    await testApp.connection
      .collection('worldmemberships')
      .updateOne(
        { userId: owner.userId, worldId },
        { $set: { role: WorldRole.PJ } },
        { upsert: true },
      );
    const ownerFresh = await loginUser(
      testApp.app,
      ownerCreds.email,
      ownerCreds.password,
    );
    return { ownerFresh, worldId, slug, name };
  }

  async function joinAsRole(
    worldId: string,
    user: { accessToken: string; userId: string },
    role: WorldRole,
    group?: string,
  ) {
    await request(testApp.app.getHttpServer())
      .post(`/api/worlds/${worldId}/join`)
      .set(authHeader(user.accessToken));
    await testApp.connection
      .collection('worldmemberships')
      .updateOne(
        { userId: user.userId, worldId },
        { $set: { role, ...(group ? { group } : {}) } },
      );
  }

  function isoIn(daysFromNow: number) {
    return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
  }

  it('vrací jen eventy ze světů, kde má user membership', async () => {
    const worldA = await setupWorld('World A');
    const worldB = await setupWorld('World B');

    const hrac = await registerUser(testApp.app, uniqueCreds('hrc'));
    await joinAsRole(worldA.worldId, hrac, WorldRole.Hrac);
    // ne-member ve worldu B

    // event v A
    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(worldA.ownerFresh.accessToken))
      .send({
        worldId: worldA.worldId,
        title: 'Event A',
        date: isoIn(1),
      })
      .expect(201);

    // event v B
    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(worldB.ownerFresh.accessToken))
      .send({
        worldId: worldB.worldId,
        title: 'Event B',
        date: isoIn(2),
      })
      .expect(201);

    const res = await request(testApp.app.getHttpServer())
      .get('/api/game-events/upcoming/mine')
      .set(authHeader(hrac.accessToken))
      .expect(200);

    const body = res.body as Array<{ title: string; worldSlug: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('Event A');
    expect(body[0].worldSlug).toBe(worldA.slug);
  });

  it('setřídí podle date vzestupně a respektuje limit', async () => {
    const world = await setupWorld('Sort World');
    const hrac = await registerUser(testApp.app, uniqueCreds('hrc'));
    await joinAsRole(world.worldId, hrac, WorldRole.Hrac);

    // 3 eventy v různých datech
    for (const [title, days] of [
      ['Pozdě', 5],
      ['Brzy', 1],
      ['Středně', 3],
    ] as const) {
      await request(testApp.app.getHttpServer())
        .post('/api/game-events')
        .set(authHeader(world.ownerFresh.accessToken))
        .send({ worldId: world.worldId, title, date: isoIn(days) })
        .expect(201);
    }

    const res = await request(testApp.app.getHttpServer())
      .get('/api/game-events/upcoming/mine?limit=2')
      .set(authHeader(hrac.accessToken))
      .expect(200);

    const body = res.body as Array<{ title: string }>;
    expect(body.map((e) => e.title)).toEqual(['Brzy', 'Středně']);
  });

  it('filtruje groupOnly podle membership group', async () => {
    const world = await setupWorld('Group World');
    const hracMages = await registerUser(testApp.app, uniqueCreds('mag'));
    const hracRogues = await registerUser(testApp.app, uniqueCreds('rog'));
    await joinAsRole(world.worldId, hracMages, WorldRole.Hrac, 'mages');
    await joinAsRole(world.worldId, hracRogues, WorldRole.Hrac, 'rogues');

    await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(world.ownerFresh.accessToken))
      .send({
        worldId: world.worldId,
        title: 'Mages only',
        date: isoIn(1),
        groupOnly: true,
        targetGroup: 'mages',
      })
      .expect(201);

    const magesRes = await request(testApp.app.getHttpServer())
      .get('/api/game-events/upcoming/mine')
      .set(authHeader(hracMages.accessToken))
      .expect(200);
    expect(magesRes.body).toHaveLength(1);

    const roguesRes = await request(testApp.app.getHttpServer())
      .get('/api/game-events/upcoming/mine')
      .set(authHeader(hracRogues.accessToken))
      .expect(200);
    expect(roguesRes.body).toHaveLength(0);
  });

  it('user bez membership dostane prázdný seznam', async () => {
    const orphan = await registerUser(testApp.app, uniqueCreds('orphan'));
    const res = await request(testApp.app.getHttpServer())
      .get('/api/game-events/upcoming/mine')
      .set(authHeader(orphan.accessToken))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('myRsvp = confirmed po POST /:id/confirm', async () => {
    const world = await setupWorld('RSVP World');
    const hrac = await registerUser(testApp.app, uniqueCreds('rsvp'));
    await joinAsRole(world.worldId, hrac, WorldRole.Hrac);

    const createRes = await request(testApp.app.getHttpServer())
      .post('/api/game-events')
      .set(authHeader(world.ownerFresh.accessToken))
      .send({
        worldId: world.worldId,
        title: 'RSVP test',
        date: isoIn(1),
        confirmable: true,
      })
      .expect(201);
    const eventId = (createRes.body as { id: string }).id;

    // confirm
    await request(testApp.app.getHttpServer())
      .post(`/api/game-events/${eventId}/confirm`)
      .set(authHeader(hrac.accessToken))
      .expect(201);

    const res = await request(testApp.app.getHttpServer())
      .get('/api/game-events/upcoming/mine')
      .set(authHeader(hrac.accessToken))
      .expect(200);
    const body = res.body as Array<{ myRsvp: string; confirmedCount: number }>;
    expect(body[0].myRsvp).toBe('confirmed');
    expect(body[0].confirmedCount).toBe(1);
  });

  it('non-auth → 401', async () => {
    await request(testApp.app.getHttpServer())
      .get('/api/game-events/upcoming/mine')
      .expect(401);
  });
});
