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
  const mockUsersRepo = { findById: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new UserBanCacheService(mockRedis as any, mockUsersRepo as any);
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

  // FIX-A část 1 (2026-07, WS reconnect-gate) — isBlocked() cache-first + DB fallback.
  describe('isBlocked()', () => {
    it('cache hit (banned) → true, BEZ DB dotazu', async () => {
      service.set('u1', { bannedAt: new Date() });
      await expect(service.isBlocked('u1')).resolves.toBe(true);
      expect(mockUsersRepo.findById).not.toHaveBeenCalled();
    });

    it('cache miss + DB: uživatel neexistuje → true (blokován)', async () => {
      mockUsersRepo.findById.mockResolvedValue(null);
      await expect(service.isBlocked('ghost')).resolves.toBe(true);
    });

    it('cache miss + DB: isDeleted → true', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        isDeleted: true,
      });
      await expect(service.isBlocked('u1')).resolves.toBe(true);
    });

    it('cache miss + DB: bannedAt nastaven → true + dopočítá cache (další volání bez DB)', async () => {
      const bannedAt = new Date('2026-01-01');
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        isDeleted: false,
        bannedAt,
        banReason: 'spam',
      });
      await expect(service.isBlocked('u1')).resolves.toBe(true);
      expect(service.get('u1')).toEqual({
        bannedAt,
        bannedUntil: undefined,
        banReason: 'spam',
      });

      mockUsersRepo.findById.mockClear();
      await expect(service.isBlocked('u1')).resolves.toBe(true);
      expect(mockUsersRepo.findById).not.toHaveBeenCalled(); // druhé volání = cache hit
    });

    it('cache miss + DB: deletionRequestedAt (soft-delete pending) → true, NEcachuje se (FIX-3)', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        isDeleted: false,
        deletionRequestedAt: new Date('2026-01-01'),
      });
      await expect(service.isBlocked('u1')).resolves.toBe(true);
      expect(service.get('u1')).toBeNull();
    });

    it('cache miss + DB: účet v pořádku → false, NEcachuje se', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        isDeleted: false,
      });
      await expect(service.isBlocked('u1')).resolves.toBe(false);
      expect(service.get('u1')).toBeNull();
    });

    it('DB výpadek → fail-open (false), nesmí spadnout', async () => {
      mockUsersRepo.findById.mockRejectedValue(new Error('mongo down'));
      await expect(service.isBlocked('u1')).resolves.toBe(false);
    });
  });
});
