// backend/src/modules/push/push.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';
import type { IPushSubscriptionRepository } from './interfaces/push-subscription-repository.interface';
import type { PushSubscription } from './interfaces/push-subscription.interface';

jest.mock('web-push');
import * as webpush from 'web-push';

const makeSub = (
  overrides: Partial<PushSubscription> = {},
): PushSubscription => ({
  id: 'sub1',
  userId: 'user1',
  endpoint: 'https://push.example.com/sub1',
  p256dh: 'key',
  auth: 'auth',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date(),
  lastUsedAt: new Date(),
  ...overrides,
});

describe('PushService', () => {
  let service: PushService;
  let repo: jest.Mocked<IPushSubscriptionRepository>;
  // 15.9 — push filtr čte notificationPreferences přes IUsersRepository.
  let usersRepo: { findByIds: jest.Mock; findById: jest.Mock };

  beforeEach(async () => {
    repo = {
      findByUserId: jest.fn(),
      findAll: jest.fn(),
      upsertByEndpoint: jest.fn(),
      deleteByEndpoint: jest.fn(),
      deleteByEndpointOnly: jest.fn(),
      deleteByIdAndUser: jest.fn(),
      deleteByUserId: jest.fn(),
    };
    usersRepo = {
      findByIds: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: 'IPushSubscriptionRepository', useValue: repo },
        { provide: 'IUsersRepository', useValue: usersRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                VAPID_PUBLIC_KEY: 'pubkey',
                VAPID_PRIVATE_KEY: 'privkey',
                VAPID_SUBJECT: 'mailto:test@test.com',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get(PushService);
    (webpush.sendNotification as jest.Mock).mockResolvedValue({
      statusCode: 201,
    });
  });

  it('notify — odešle push na všechny subscriptions usera', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('notify — přeskočí usera bez subscriptions', async () => {
    repo.findByUserId.mockResolvedValue([]);
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('notifyUsers — odešle push každému userId', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    await service.notifyUsers(['user1', 'user2'], {
      title: 'Test',
      body: 'Ahoj',
    });
    expect(repo.findByUserId).toHaveBeenCalledTimes(2);
  });

  it('notifyAll — odešle push všem subscriptions', async () => {
    repo.findAll.mockResolvedValue([
      makeSub(),
      makeSub({
        id: 'sub2',
        userId: 'user2',
        endpoint: 'https://push.example.com/sub2',
      }),
    ]);
    await service.notifyAll({ title: 'Test', body: 'Ahoj' });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  // D-NEW-INV-PUSH — odesílatel broadcast zprávy nedostane push na vlastní zprávu.
  it('notifyAll s excludeUserId — vynechá všechna zařízení odesílatele', async () => {
    repo.findAll.mockResolvedValue([
      makeSub(),
      makeSub({
        id: 'sub1b',
        userId: 'user1',
        endpoint: 'https://push.example.com/sub1b',
      }),
      makeSub({
        id: 'sub2',
        userId: 'user2',
        endpoint: 'https://push.example.com/sub2',
      }),
    ]);
    await service.notifyAll({ title: 'Test', body: 'Ahoj' }, undefined, {
      excludeUserId: 'user1',
    });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('auto-cleanup — smaže subscription při 410', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(repo.deleteByEndpointOnly).toHaveBeenCalledWith(
      'https://push.example.com/sub1',
    );
  });

  it('auto-cleanup — smaže subscription při 404', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 404,
    });
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(repo.deleteByEndpointOnly).toHaveBeenCalledWith(
      'https://push.example.com/sub1',
    );
  });

  it('subscribe — upsertne subscription s user-agentem a lastUsedAt', async () => {
    repo.upsertByEndpoint.mockResolvedValue(makeSub());
    await service.subscribe(
      'user1',
      { endpoint: 'https://...', p256dh: 'k', auth: 'a' },
      'Mozilla/5.0',
    );
    expect(repo.upsertByEndpoint).toHaveBeenCalledWith({
      userId: 'user1',
      endpoint: 'https://...',
      p256dh: 'k',
      auth: 'a',
      userAgent: 'Mozilla/5.0',
      lastUsedAt: expect.any(Date),
    });
    // oldEndpoint se nepropisuje do upsertu (jen řídí cleanup).
    expect(repo.deleteByEndpoint).not.toHaveBeenCalled();
  });

  it('subscribe — při rotaci smaže starý endpoint [push dedup]', async () => {
    repo.upsertByEndpoint.mockResolvedValue(makeSub());
    await service.subscribe('user1', {
      endpoint: 'https://new',
      p256dh: 'k',
      auth: 'a',
      oldEndpoint: 'https://old',
    });
    // FIX-7 — scoped na {endpoint, userId}, ne jen endpoint (hijack ochrana).
    expect(repo.deleteByEndpoint).toHaveBeenCalledWith('https://old', 'user1');
    expect(repo.upsertByEndpoint).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://new' }),
    );
  });

  it('subscribe — nemaže když oldEndpoint == nový endpoint', async () => {
    repo.upsertByEndpoint.mockResolvedValue(makeSub());
    await service.subscribe('user1', {
      endpoint: 'https://same',
      p256dh: 'k',
      auth: 'a',
      oldEndpoint: 'https://same',
    });
    expect(repo.deleteByEndpoint).not.toHaveBeenCalled();
  });

  it('TTL — default 4 h se předá jako option', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    await service.notify('user1', { title: 'T', body: 'B' });
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      // D-AUDIT: timeout 10 s — anti-hang na push providera.
      expect.objectContaining({ TTL: 4 * 60 * 60, timeout: 10_000 }),
    );
  });

  it('topic + ttl — validní topic projde, transport-only pole nejdou klientovi', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    await service.notify('user1', {
      title: 'T',
      body: 'B',
      tag: 'chat-abc',
      topic: 'chat-abc',
      ttl: 120,
    });
    const [, sentBody, sentOpts] = (webpush.sendNotification as jest.Mock).mock
      .calls[0] as [unknown, string, { TTL: number; topic?: string }];
    expect(sentOpts).toEqual({ TTL: 120, topic: 'chat-abc', timeout: 10_000 });
    const parsed = JSON.parse(sentBody) as Record<string, unknown>;
    expect(parsed.tag).toBe('chat-abc'); // tag klientovi ANO
    expect(parsed).not.toHaveProperty('ttl'); // transport-only NE
    expect(parsed).not.toHaveProperty('topic');
  });

  it('topic — nevalidní (mezera/>32) se vynechá', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    await service.notify('user1', {
      title: 'T',
      body: 'B',
      topic: 'invalid topic with spaces',
    });
    const [, , sentOpts] = (webpush.sendNotification as jest.Mock).mock
      .calls[0] as [unknown, string, { topic?: string }];
    expect(sentOpts).not.toHaveProperty('topic');
  });

  it('unsubscribe — smaže subscription', async () => {
    repo.deleteByEndpoint.mockResolvedValue(true);
    await service.unsubscribe('user1', 'https://...');
    expect(repo.deleteByEndpoint).toHaveBeenCalledWith('https://...', 'user1');
  });

  // ── 15.9 — filtr dle notificationPreferences ──────────────────────────
  describe('filtr preferencí (kategorie)', () => {
    it('notifyUsers s kategorií — zahodí příjemce, který má kategorii vypnutou', async () => {
      repo.findByUserId.mockResolvedValue([makeSub()]);
      usersRepo.findByIds.mockResolvedValue([
        { id: 'user1', notificationPreferences: { worldChat: true } },
        { id: 'user2', notificationPreferences: { worldChat: false } },
      ]);
      await service.notifyUsers(
        ['user1', 'user2'],
        { title: 'T', body: 'B' },
        'worldChat',
      );
      // jen user1 projde → findByUserId volán 1×
      expect(repo.findByUserId).toHaveBeenCalledTimes(1);
      expect(repo.findByUserId).toHaveBeenCalledWith('user1');
    });

    it('notifyUsers s kategorií — undefined preference → default (worldChat ZAP)', async () => {
      repo.findByUserId.mockResolvedValue([makeSub()]);
      usersRepo.findByIds.mockResolvedValue([
        { id: 'user1', notificationPreferences: undefined },
      ]);
      await service.notifyUsers(
        ['user1'],
        { title: 'T', body: 'B' },
        'worldChat',
      );
      expect(repo.findByUserId).toHaveBeenCalledTimes(1);
    });

    it('notifyUsers s kategorií — Hospoda je opt-in (default VYP) → nic neodejde', async () => {
      repo.findByUserId.mockResolvedValue([makeSub()]);
      usersRepo.findByIds.mockResolvedValue([
        { id: 'user1', notificationPreferences: undefined },
      ]);
      await service.notifyUsers(
        ['user1'],
        { title: 'T', body: 'B' },
        'hospoda',
      );
      expect(repo.findByUserId).not.toHaveBeenCalled();
    });

    it('notifyUsers s kategorií — pushEnabled:false vypne vše', async () => {
      repo.findByUserId.mockResolvedValue([makeSub()]);
      usersRepo.findByIds.mockResolvedValue([
        {
          id: 'user1',
          notificationPreferences: { pushEnabled: false, worldChat: true },
        },
      ]);
      await service.notifyUsers(
        ['user1'],
        { title: 'T', body: 'B' },
        'worldChat',
      );
      expect(repo.findByUserId).not.toHaveBeenCalled();
    });

    it('notifyAll s kategorií — profiltruje subscriptions dle preferencí', async () => {
      repo.findAll.mockResolvedValue([
        makeSub({ userId: 'user1', endpoint: 'e1' }),
        makeSub({ userId: 'user2', endpoint: 'e2' }),
      ]);
      usersRepo.findByIds.mockResolvedValue([
        { id: 'user1', notificationPreferences: { ikarosNews: true } },
        { id: 'user2', notificationPreferences: { ikarosNews: false } },
      ]);
      await service.notifyAll({ title: 'T', body: 'B' }, 'ikarosNews');
      // jen user1 subscription → 1 odeslání
      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('notifyAll s kategorií + excludeUserId — exclude platí i s filtrem preferencí', async () => {
      repo.findAll.mockResolvedValue([
        makeSub({ userId: 'user1', endpoint: 'e1' }),
        makeSub({ userId: 'user2', endpoint: 'e2' }),
      ]);
      usersRepo.findByIds.mockResolvedValue([
        { id: 'user2', notificationPreferences: { hospoda: true } },
      ]);
      await service.notifyAll({ title: 'T', body: 'B' }, 'hospoda', {
        excludeUserId: 'user1',
      });
      // user1 vyloučen ještě před filtrem kategorií → nefigurovat ani v lookupu
      expect(usersRepo.findByIds).toHaveBeenCalledWith(['user2']);
      expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('bez kategorie — zpětná kompatibilita, žádný filtr (findByIds se nevolá)', async () => {
      repo.findByUserId.mockResolvedValue([makeSub()]);
      await service.notifyUsers(['user1'], { title: 'T', body: 'B' });
      expect(usersRepo.findByIds).not.toHaveBeenCalled();
      expect(repo.findByUserId).toHaveBeenCalledTimes(1);
    });
  });

  it('getSubscriptions — vrátí vlastní zařízení BEZ kryptografických klíčů [D-030]', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    const result = await service.getSubscriptions('user1');
    expect(repo.findByUserId).toHaveBeenCalledWith('user1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'sub1',
      endpoint: 'https://push.example.com/sub1',
      userAgent: 'Mozilla/5.0',
      createdAt: expect.any(Date),
      lastUsedAt: expect.any(Date),
    });
    expect(result[0]).not.toHaveProperty('p256dh');
    expect(result[0]).not.toHaveProperty('auth');
  });

  it('unsubscribeById — smaže konkrétní zařízení vlastníka [D-030]', async () => {
    repo.deleteByIdAndUser.mockResolvedValue(true);
    await service.unsubscribeById('user1', 'sub1');
    expect(repo.deleteByIdAndUser).toHaveBeenCalledWith('sub1', 'user1');
  });
});
