import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { createTestApp, TestApp } from '../helpers/app-factory';
import { registerUser } from '../helpers/auth';
import { clearAllCollections } from '../helpers/db';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { WorldElevationsModule } from '../../src/modules/world-elevations/world-elevations.module';
import { WorldsModule } from '../../src/modules/worlds/worlds.module';
import { ChatModule } from '../../src/modules/chat/chat.module';
import { PushModule } from '../../src/modules/push/push.module';
import { IkarosMessagesModule } from '../../src/modules/ikaros-messages/ikaros-messages.module';

/**
 * Skill `pentest` T1 — GDPR ERASURE / zbytková PII (styl 40). Katalog PT-40a/b(+c/d).
 *
 * Model: audit přidal `user.deletion.hardDeleted` @OnEvent handlery (chat / DM /
 * push) + `anonymizeForHardDelete` ($unset PII postavy v `users`). Tento pin
 * NEZÁVISLE vypálí reálnou erasure a ověří, že PII po hard-delete účtu ZMIZÍ.
 *
 * ZELENÝ pin = obrana (erasure) drží → PII pryč. Kdyby handler zmizel /
 * přestal mazat, pin ZČERVENÁ = zbytková PII se vrátila (regrese soukromí).
 *
 * Mechanika: handlery jsou @OnEvent → střílíme přes REÁLNÝ EventEmitter2 z app
 * (`emitAsync` + await → async listenery doběhnou před asercí). `users` surface
 * není event-driven (volá ho cron před emitem), proto ho voláme přímo přes repo.
 */
describe('PT-40 · GDPR erasure (zbytková PII po hard-delete účtu)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({
      replSet: true,
      modules: [
        AuthModule,
        UsersModule,
        WorldElevationsModule,
        WorldsModule,
        ChatModule,
        PushModule,
        IkarosMessagesModule,
      ],
    });
  });
  afterAll(async () => testApp.close());
  beforeEach(async () => clearAllCollections(testApp.connection));

  const col = (name: string) => testApp.connection.collection(name);

  /** Reálná erasure přes app EventEmitter2 — emitAsync + await, ať async
   *  @OnEvent handlery (chat/DM/push) doběhnou PŘED asercí. */
  const runErasure = async (
    userId: string,
    username: string,
  ): Promise<void> => {
    await testApp.app
      .get(EventEmitter2)
      .emitAsync('user.deletion.hardDeleted', { userId, username });
  };

  // PT-40b — chat: senderName je snapshot username v době odeslání. Bez handleru
  // zůstane odesílatel identifikovatelný napořád. Erasure → 'Smazaný uživatel'
  // + null avatary/override.
  it('PT-40b: chat zprávy odesílatele anonymizovány (senderName → "Smazaný uživatel")', async () => {
    const victim = await registerUser(testApp.app, {
      username: 'chatvictim40',
      email: 'chatvictim40@test.io',
      password: 'Password123!',
    });
    const other = await registerUser(testApp.app, {
      username: 'chatbystander40',
      email: 'chatbystander40@test.io',
      password: 'Password123!',
    });

    await col('chatmessages').insertMany([
      {
        channelId: 'chan-gdpr',
        worldId: 'world-gdpr',
        senderId: victim.userId,
        senderName: 'ChatVictim RealName',
        senderAvatarUrl: 'https://cdn.example/av-victim.png',
        overrideName: 'Tajná Přezdívka',
        overrideAvatarUrl: 'https://cdn.example/ov-victim.png',
        content: 'PII zprava odesilatele',
        isDeleted: false,
        reactions: {},
        attachments: [],
      },
      // Kontrola scoping — zpráva JINÉHO odesílatele NESMÍ být zasažena.
      {
        channelId: 'chan-gdpr',
        worldId: 'world-gdpr',
        senderId: other.userId,
        senderName: 'Bystander Name',
        content: 'nedotceno',
        isDeleted: false,
        reactions: {},
        attachments: [],
      },
    ]);

    await runErasure(victim.userId, victim.username);

    const victimMsgs = await col('chatmessages')
      .find({ senderId: victim.userId })
      .toArray();
    expect(victimMsgs.length).toBeGreaterThan(0);
    for (const m of victimMsgs) {
      expect(m.senderName).toBe('Smazaný uživatel');
      expect(m.senderAvatarUrl).toBeNull();
      expect(m.overrideName).toBeNull();
      expect(m.overrideAvatarUrl).toBeNull();
    }
    // Původní jméno nesmí přežít NIKDE v kolekci.
    const leak = await col('chatmessages')
      .find({ senderName: 'ChatVictim RealName' })
      .toArray();
    expect(leak.length).toBe(0);
    // Cizí zpráva netknutá (over-anonymizace = jiná chyba).
    const bystander = await col('chatmessages').findOne({
      senderId: other.userId,
    });
    expect(bystander?.senderName).toBe('Bystander Name');
  });

  // PT-40a — push: endpoint + p256dh + auth + userAgent = PII. Erasure musí
  // smazat VŠECHNY subs uživatele (deleteMany), cizí nechat.
  it('PT-40a: push subscriptions uživatele smazány (0 po erasure)', async () => {
    const victim = await registerUser(testApp.app, {
      username: 'pushvictim40',
      email: 'pushvictim40@test.io',
      password: 'Password123!',
    });
    const other = await registerUser(testApp.app, {
      username: 'pushbystander40',
      email: 'pushbystander40@test.io',
      password: 'Password123!',
    });

    await col('push_subscriptions').insertMany([
      {
        userId: victim.userId,
        endpoint: 'https://fcm.example/ep-victim-1',
        p256dh: 'key-v1',
        auth: 'auth-v1',
        userAgent: 'Firefox',
      },
      {
        userId: victim.userId,
        endpoint: 'https://fcm.example/ep-victim-2',
        p256dh: 'key-v2',
        auth: 'auth-v2',
        userAgent: 'Chrome',
      },
      {
        userId: other.userId,
        endpoint: 'https://fcm.example/ep-other',
        p256dh: 'key-o',
        auth: 'auth-o',
      },
    ]);

    await runErasure(victim.userId, victim.username);

    const victimSubs = await col('push_subscriptions').countDocuments({
      userId: victim.userId,
    });
    expect(victimSubs).toBe(0);
    // Cizí subscription přežije.
    const otherSubs = await col('push_subscriptions').countDocuments({
      userId: other.userId,
    });
    expect(otherSubs).toBe(1);
  });

  // PT-40c — DM (ikaros-messages): anonymizuj senderName (odchozí) i
  // recipientName (příchozí). Druhá strana identifikovatelná zůstat nesmí.
  it('PT-40c: DM — senderName i recipientName oběti anonymizovány', async () => {
    const victim = await registerUser(testApp.app, {
      username: 'dmvictim40',
      email: 'dmvictim40@test.io',
      password: 'Password123!',
    });
    const partner = await registerUser(testApp.app, {
      username: 'dmpartner40',
      email: 'dmpartner40@test.io',
      password: 'Password123!',
    });

    await col('ikarosmessages').insertMany([
      // Oběť = odesílatel.
      {
        senderId: victim.userId,
        senderName: 'DMVictim RealName',
        recipientId: partner.userId,
        recipientName: 'Partner Name',
        subject: 's1',
        body: 'b1',
        conversationId: 'conv1',
      },
      // Oběť = příjemce.
      {
        senderId: partner.userId,
        senderName: 'Partner Name',
        recipientId: victim.userId,
        recipientName: 'DMVictim RealName',
        subject: 's2',
        body: 'b2',
        conversationId: 'conv2',
      },
    ]);

    await runErasure(victim.userId, victim.username);

    const sent = await col('ikarosmessages').findOne({
      senderId: victim.userId,
    });
    expect(sent?.senderName).toBe('Smazaný uživatel');
    const received = await col('ikarosmessages').findOne({
      recipientId: victim.userId,
    });
    expect(received?.recipientName).toBe('Smazaný uživatel');
    // Partner identita jinde netknutá.
    expect(sent?.recipientName).toBe('Partner Name');
    expect(received?.senderName).toBe('Partner Name');
    // Původní jméno oběti nesmí přežít v senderName ani recipientName.
    const leak = await col('ikarosmessages')
      .find({
        $or: [
          { senderName: 'DMVictim RealName' },
          { recipientName: 'DMVictim RealName' },
        ],
      })
      .toArray();
    expect(leak.length).toBe(0);
  });

  // PT-40d — users: profilová PII postavy ($unset characterName/characterBio).
  // Není event-driven (cron ji volá před emitem) → voláme repo přímo, což je
  // erasure jednotka práce pro tento surface.
  it('PT-40d: users — characterName/characterBio $unset po hard-delete', async () => {
    const victim = await registerUser(testApp.app, {
      username: 'uservictim40',
      email: 'uservictim40@test.io',
      password: 'Password123!',
    });
    const _id = new Types.ObjectId(victim.userId);
    await col('users').updateOne(
      { _id },
      {
        $set: {
          characterName: 'Aragorn',
          characterBio: 'Tajny pribeh postavy s PII',
          bio: 'uzivatelska PII',
          city: 'Praha',
        },
      },
    );
    const before = await col('users').findOne({ _id });
    expect(before?.characterName).toBe('Aragorn');

    const usersRepo = testApp.app.get<{
      anonymizeForHardDelete: (id: string, email: string) => Promise<void>;
    }>('IUsersRepository', { strict: false });
    await usersRepo.anonymizeForHardDelete(
      victim.userId,
      `deleted-${victim.userId}@deleted.local`,
    );

    const after = await col('users').findOne({ _id });
    expect(after?.characterName).toBeUndefined();
    expect(after?.characterBio).toBeUndefined();
    expect(after?.bio).toBeUndefined();
    expect(after?.city).toBeUndefined();
    expect(after?.isDeleted).toBe(true);
  });
});
