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

  beforeEach(async () => {
    repo = {
      findByUserId: jest.fn(),
      findAll: jest.fn(),
      upsertByEndpoint: jest.fn(),
      deleteByEndpoint: jest.fn(),
      deleteByEndpointOnly: jest.fn(),
      deleteByIdAndUser: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: 'IPushSubscriptionRepository', useValue: repo },
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
  });

  it('unsubscribe — smaže subscription', async () => {
    repo.deleteByEndpoint.mockResolvedValue(true);
    await service.unsubscribe('user1', 'https://...');
    expect(repo.deleteByEndpoint).toHaveBeenCalledWith('https://...', 'user1');
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
