import { UserBanCacheService } from './user-ban-cache.service';

// D-028 — Redis mock pro pub/sub invalidation.
const mockRedis = {
  duplicate: jest.fn().mockReturnValue({
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }),
  publish: jest.fn().mockResolvedValue(1),
};

describe('UserBanCacheService', () => {
  let service: UserBanCacheService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new UserBanCacheService(mockRedis as any);
  });

  it('get neexistujícího userId → null', () => {
    expect(service.get('u1')).toBeNull();
  });

  it('set + get vrátí stejný stav', () => {
    const ban = {
      bannedAt: new Date('2026-05-01'),
      bannedUntil: new Date('2027-05-01'),
      banReason: 'spam',
    };
    service.set('u1', ban);
    expect(service.get('u1')).toEqual(ban);
  });

  it('invalidate → následný get vrátí null', () => {
    service.set('u1', { bannedAt: new Date() });
    service.invalidate('u1');
    expect(service.get('u1')).toBeNull();
  });

  it('permanent ban (bannedUntil undefined) → vždy aktivní', () => {
    const ban = { bannedAt: new Date('2020-01-01') };
    service.set('u1', ban);
    expect(service.get('u1')).toEqual(ban);
  });

  it('temp ban v minulosti → get vrací null + automaticky invaliduje', () => {
    service.set('u1', {
      bannedAt: new Date('2020-01-01'),
      bannedUntil: new Date('2020-01-02'),
    });
    expect(service.get('u1')).toBeNull();
    expect(service.get('u1')).toBeNull();
  });

  it('temp ban v budoucnosti → get vrací stav', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const ban = { bannedAt: new Date(), bannedUntil: future };
    service.set('u1', ban);
    expect(service.get('u1')).toEqual(ban);
  });

  it('size() vrátí počet aktivních ban entries', () => {
    expect(service.size()).toBe(0);
    service.set('u1', { bannedAt: new Date() });
    service.set('u2', { bannedAt: new Date() });
    expect(service.size()).toBe(2);
    service.invalidate('u1');
    expect(service.size()).toBe(1);
  });
});
