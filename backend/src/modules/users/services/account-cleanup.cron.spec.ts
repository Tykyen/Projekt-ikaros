import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountCleanupCron } from './account-cleanup.cron';
import { UploadService } from '../../upload/upload.service';
import { UserBanCacheService } from './user-ban-cache.service';
import type { User } from '../interfaces/user.interface';
import { UserRole } from '../interfaces/user.interface';

function makeTombstone(overrides: Partial<User> = {}): User {
  return {
    id: 'tomb1',
    email: 'deleted-tomb1@deleted.local',
    username: 'old_user',
    passwordHash: '',
    role: UserRole.Ikarus,
    defaultAvatarType: 'male',
    chatColor: '#FFFFFF',
    emailVerified: false,
    hiddenPresence: false,
    isDeleted: true,
    deletedAt: new Date(Date.now() - 2000 * 24 * 60 * 60 * 1000), // 2000 dní zpět
    adminPermissions: {
      canManageAdmins: false,
      canModerateContent: false,
      canEditPlatformPages: false,
    },
    themeSettings: {},
    chatPreferences: {},
    favoriteDiscussionIds: [],
    isOnline: false,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

type MockFn = ReturnType<typeof jest.fn>;

describe('AccountCleanupCron — D-043 tombstone retention', () => {
  let cron: AccountCleanupCron;
  const usersRepo: Record<string, MockFn> = {
    findById: jest.fn(),
    findExpiredTombstones: jest.fn(),
    findAllPaginated: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const refreshRepo = { revokeAllForUser: jest.fn() };
  const friendshipsRepo = { deleteAllByUser: jest.fn() };
  const uploadService = { deleteAvatar: jest.fn() };
  const banCache = { invalidate: jest.fn() };
  const config = {
    get: jest.fn(),
  } as unknown as ConfigService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    const mod = await Test.createTestingModule({
      providers: [
        AccountCleanupCron,
        { provide: 'IUsersRepository', useValue: usersRepo },
        { provide: 'IRefreshTokenRepository', useValue: refreshRepo },
        { provide: 'IFriendshipsRepository', useValue: friendshipsRepo },
        { provide: UploadService, useValue: uploadService },
        { provide: UserBanCacheService, useValue: banCache },
        { provide: ConfigService, useValue: config },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();
    cron = mod.get(AccountCleanupCron);
    jest.clearAllMocks();
  });

  describe('removeExpiredTombstones', () => {
    it('používá ENV TOMBSTONE_RETENTION_DAYS pokud je nastaven', async () => {
      (config.get as jest.Mock).mockImplementation((key) =>
        key === 'TOMBSTONE_RETENTION_DAYS' ? 365 : undefined,
      );
      (usersRepo.findExpiredTombstones as jest.Mock).mockResolvedValue([]);

      await cron.removeExpiredTombstones();

      const cutoff = (usersRepo.findExpiredTombstones as jest.Mock).mock
        .calls[0][0] as Date;
      const expectedCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const diffMs = Math.abs(cutoff.getTime() - expectedCutoff.getTime());
      expect(diffMs).toBeLessThan(5000); // tolerance 5s
    });

    it('fallback na 1825 dní pokud ENV chybí', async () => {
      (config.get as jest.Mock).mockReturnValue(undefined);
      (usersRepo.findExpiredTombstones as jest.Mock).mockResolvedValue([]);

      await cron.removeExpiredTombstones();

      const cutoff = (usersRepo.findExpiredTombstones as jest.Mock).mock
        .calls[0][0] as Date;
      const expectedCutoff = new Date(Date.now() - 1825 * 24 * 60 * 60 * 1000);
      const diffMs = Math.abs(cutoff.getTime() - expectedCutoff.getTime());
      expect(diffMs).toBeLessThan(5000);
    });

    it('odmítne hodnoty < 30 dní (sanity check)', async () => {
      (config.get as jest.Mock).mockImplementation((key) =>
        key === 'TOMBSTONE_RETENTION_DAYS' ? 10 : undefined,
      );
      (usersRepo.findExpiredTombstones as jest.Mock).mockResolvedValue([]);

      await cron.removeExpiredTombstones();

      const cutoff = (usersRepo.findExpiredTombstones as jest.Mock).mock
        .calls[0][0] as Date;
      const expectedCutoff = new Date(Date.now() - 1825 * 24 * 60 * 60 * 1000); // fallback na default
      const diffMs = Math.abs(cutoff.getTime() - expectedCutoff.getTime());
      expect(diffMs).toBeLessThan(5000);
    });

    it('pro každý expirovaný tombstone zavolá removeTombstoneOne', async () => {
      const t1 = makeTombstone({ id: 't1', username: 'user1' });
      const t2 = makeTombstone({ id: 't2', username: 'user2' });
      (config.get as jest.Mock).mockReturnValue(undefined);
      (usersRepo.findExpiredTombstones as jest.Mock).mockResolvedValue([
        t1,
        t2,
      ]);
      (usersRepo.delete as jest.Mock).mockResolvedValue(true);

      await cron.removeExpiredTombstones();

      expect(usersRepo.delete).toHaveBeenCalledTimes(2);
      expect(usersRepo.delete).toHaveBeenCalledWith('t1');
      expect(usersRepo.delete).toHaveBeenCalledWith('t2');
    });

    it('emituje audit event user.tombstone.removed', async () => {
      const t1 = makeTombstone({ id: 't1', username: 'old_user' });
      (config.get as jest.Mock).mockReturnValue(undefined);
      (usersRepo.findExpiredTombstones as jest.Mock).mockResolvedValue([t1]);
      (usersRepo.delete as jest.Mock).mockResolvedValue(true);

      await cron.removeExpiredTombstones();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.tombstone.removed',
        expect.objectContaining({
          userId: 't1',
          username: 'old_user',
        }),
      );
    });

    it('chyba při delete jednoho tombstone nezastaví ostatní', async () => {
      const t1 = makeTombstone({ id: 't1', username: 'user1' });
      const t2 = makeTombstone({ id: 't2', username: 'user2' });
      (config.get as jest.Mock).mockReturnValue(undefined);
      (usersRepo.findExpiredTombstones as jest.Mock).mockResolvedValue([
        t1,
        t2,
      ]);
      (usersRepo.delete as jest.Mock)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(true);

      await expect(cron.removeExpiredTombstones()).resolves.not.toThrow();
      expect(usersRepo.delete).toHaveBeenCalledTimes(2);
    });

    it('prázdný seznam → noop bez emitování', async () => {
      (config.get as jest.Mock).mockReturnValue(undefined);
      (usersRepo.findExpiredTombstones as jest.Mock).mockResolvedValue([]);

      await cron.removeExpiredTombstones();

      expect(usersRepo.delete).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('removeTombstoneOne', () => {
    it('volá repo.delete + emit event', async () => {
      (usersRepo.delete as jest.Mock).mockResolvedValue(true);

      await cron.removeTombstoneOne('t1', 'old_user');

      expect(usersRepo.delete).toHaveBeenCalledWith('t1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.tombstone.removed',
        expect.objectContaining({ userId: 't1', username: 'old_user' }),
      );
    });

    it('pokud repo vrátí false → varuje a nepošle event', async () => {
      (usersRepo.delete as jest.Mock).mockResolvedValue(false);

      await cron.removeTombstoneOne('nope', 'ghost');

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('hardDeleteOne — D-041 friendship cleanup', () => {
    it('volá friendshipsRepo.deleteAllByUser jako součást tombstone pipeline', async () => {
      const user = makeTombstone({
        id: 'u1',
        username: 'alice',
        isDeleted: false,
        deletedAt: undefined,
        deletionRequestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      (usersRepo.findById as jest.Mock).mockResolvedValue(user);
      (usersRepo.update as jest.Mock).mockResolvedValue(user);
      friendshipsRepo.deleteAllByUser.mockResolvedValue(3);

      await cron.hardDeleteOne('u1');

      expect(friendshipsRepo.deleteAllByUser).toHaveBeenCalledWith('u1');
      expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('chyba friendshipsRepo nezastaví zbytek pipeline', async () => {
      const user = makeTombstone({
        id: 'u2',
        username: 'bob',
        isDeleted: false,
        deletedAt: undefined,
        deletionRequestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      (usersRepo.findById as jest.Mock).mockResolvedValue(user);
      (usersRepo.update as jest.Mock).mockResolvedValue(user);
      friendshipsRepo.deleteAllByUser.mockRejectedValue(
        new Error('mongo down'),
      );

      await cron.hardDeleteOne('u2');

      expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith('u2');
      expect(banCache.invalidate).toHaveBeenCalledWith('u2');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.deletion.hardDeleted',
        expect.any(Object),
      );
    });
  });
});
