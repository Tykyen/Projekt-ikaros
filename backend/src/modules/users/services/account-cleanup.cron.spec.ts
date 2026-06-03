import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountCleanupCron } from './account-cleanup.cron';
import { MailerService } from '../../mailer/mailer.service';
import type { User } from '../interfaces/user.interface';
import { UserRole } from '../interfaces/user.interface';

const DAY_MS = 24 * 60 * 60 * 1000;

function makePending(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'alice@example.com',
    username: 'alice',
    passwordHash: 'hash',
    role: UserRole.Ikarus,
    defaultAvatarType: 'male',
    chatColor: '#FFFFFF',
    isDeleted: false,
    deletionRequestedAt: new Date(Date.now() - 31 * DAY_MS),
    deletionRequestedBy: 'u1',
    deletionReason: 'self',
    themeSettings: {},
    chatPreferences: {},
    favoriteDiscussionIds: [],
    isOnline: false,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

describe('AccountCleanupCron — 1.3c (N-3) hard cleanup', () => {
  let cron: AccountCleanupCron;
  const usersRepo: Record<string, jest.Mock> = {
    findExpiredPendingDeletion: jest.fn(),
    anonymizeForHardDelete: jest.fn(),
  };
  const mailer = {} as unknown as MailerService;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    const mod = await Test.createTestingModule({
      providers: [
        AccountCleanupCron,
        { provide: 'IUsersRepository', useValue: usersRepo },
        { provide: EventEmitter2, useValue: events },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();
    cron = mod.get(AccountCleanupCron);
    jest.clearAllMocks();
  });

  it('cutoff = now − 30 dní', async () => {
    usersRepo.findExpiredPendingDeletion.mockResolvedValue([]);

    await cron.sweep();

    const cutoff = usersRepo.findExpiredPendingDeletion.mock
      .calls[0][0] as Date;
    const expected = Date.now() - 30 * DAY_MS;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5000);
  });

  it('prázdný seznam → noop (žádná anonymizace ani emit)', async () => {
    usersRepo.findExpiredPendingDeletion.mockResolvedValue([]);

    await cron.sweep();

    expect(usersRepo.anonymizeForHardDelete).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('pro každý expirovaný účet anonymizuje + emituje hardDeleted', async () => {
    const a = makePending({ id: 'a', username: 'alice' });
    const b = makePending({ id: 'b', username: 'bob' });
    usersRepo.findExpiredPendingDeletion.mockResolvedValue([a, b]);
    usersRepo.anonymizeForHardDelete.mockResolvedValue(undefined);

    await cron.sweep();

    expect(usersRepo.anonymizeForHardDelete).toHaveBeenCalledTimes(2);
    expect(usersRepo.anonymizeForHardDelete).toHaveBeenCalledWith(
      'a',
      'deleted-a@deleted.local',
    );
    expect(usersRepo.anonymizeForHardDelete).toHaveBeenCalledWith(
      'b',
      'deleted-b@deleted.local',
    );
    expect(events.emit).toHaveBeenCalledWith(
      'user.deletion.hardDeleted',
      expect.objectContaining({
        userId: 'a',
        username: 'alice',
        deletionRequestedBy: 'u1',
        deletionReason: 'self',
      }),
    );
  });

  it('chyba u jednoho účtu nezastaví zbytek dávky', async () => {
    const a = makePending({ id: 'a' });
    const b = makePending({ id: 'b' });
    usersRepo.findExpiredPendingDeletion.mockResolvedValue([a, b]);
    usersRepo.anonymizeForHardDelete
      .mockRejectedValueOnce(new Error('mongo down'))
      .mockResolvedValueOnce(undefined);

    await expect(cron.sweep()).resolves.not.toThrow();

    expect(usersRepo.anonymizeForHardDelete).toHaveBeenCalledTimes(2);
    // jen druhý (úspěšný) account vyemituje event
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'user.deletion.hardDeleted',
      expect.objectContaining({ userId: 'b' }),
    );
  });
});
