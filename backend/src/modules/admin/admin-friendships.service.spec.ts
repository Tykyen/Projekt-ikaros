import { AdminFriendshipsService } from './admin-friendships.service';
import type { IFriendshipsRepository } from '../friendships/interfaces/friendships-repository.interface';
import type { IFriendBlocksRepository } from '../friendships/interfaces/friend-blocks-repository.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

const friendsRepo = {
  findAllForUser: jest.fn(),
  findActiveBetween: jest.fn(),
  findLatestRejected: jest.fn(),
  findById: jest.fn(),
  remove: jest.fn(),
} as unknown as jest.Mocked<IFriendshipsRepository>;

const blocksRepo = {
  findActive: jest.fn(),
} as unknown as jest.Mocked<IFriendBlocksRepository>;

const usersRepo = {
  findByIds: jest.fn(),
} as unknown as jest.Mocked<IUsersRepository>;

function friendship(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    requesterId: 'uA',
    recipientId: 'uB',
    status: 'accepted',
    requestedAt: new Date('2026-01-01'),
    acceptedAt: new Date('2026-01-02'),
    ...over,
  };
}

describe('AdminFriendshipsService (N-6b / D-056)', () => {
  let service: AdminFriendshipsService;

  beforeEach(() => {
    jest.clearAllMocks();
    (usersRepo.findByIds as jest.Mock).mockResolvedValue([
      { id: 'uA', username: 'Alice' },
      { id: 'uB', username: 'Bob' },
    ]);
    (blocksRepo.findActive as jest.Mock).mockResolvedValue(null);
    service = new AdminFriendshipsService(friendsRepo, blocksRepo, usersRepo);
  });

  it('listByUser — mapuje accepted + usernames', async () => {
    (friendsRepo.findAllForUser as jest.Mock).mockResolvedValue({
      items: [friendship()],
      total: 1,
    });
    const res = await service.listByUser('uA', 1, 50);
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      userAId: 'uA',
      userBId: 'uB',
      userAUsername: 'Alice',
      userBUsername: 'Bob',
      status: 'accepted',
    });
  });

  it('rejected → declined + lastDeclinedById = příjemce', async () => {
    (friendsRepo.findAllForUser as jest.Mock).mockResolvedValue({
      items: [
        friendship({
          status: 'rejected',
          rejectedAt: new Date('2026-01-03'),
          acceptedAt: undefined,
        }),
      ],
      total: 1,
    });
    const res = await service.listByUser('uA', 1, 50);
    expect(res.items[0].status).toBe('declined');
    expect(res.items[0].lastDeclinedById).toBe('uB');
    expect(res.items[0].lastDeclinedAt).not.toBeNull();
  });

  it('block → status blocked + blockedById', async () => {
    (friendsRepo.findAllForUser as jest.Mock).mockResolvedValue({
      items: [friendship()],
      total: 1,
    });
    (blocksRepo.findActive as jest.Mock).mockResolvedValueOnce({
      id: 'b1',
      blockerId: 'uA',
      blockedId: 'uB',
    });
    const res = await service.listByUser('uA', 1, 50);
    expect(res.items[0].status).toBe('blocked');
    expect(res.items[0].blockedById).toBe('uA');
  });

  it('byPair — žádný friendship → null', async () => {
    (friendsRepo.findActiveBetween as jest.Mock).mockResolvedValue(null);
    (friendsRepo.findLatestRejected as jest.Mock).mockResolvedValue(null);
    const res = await service.byPair('uA', 'uB');
    expect(res.friendship).toBeNull();
  });

  it('resetCooldown na rejected → remove + view', async () => {
    (friendsRepo.findById as jest.Mock).mockResolvedValue(
      friendship({
        status: 'rejected',
        rejectedAt: new Date(),
        acceptedAt: undefined,
      }),
    );
    (friendsRepo.remove as jest.Mock).mockResolvedValue(true);
    const res = await service.resetCooldown('f1');
    expect(friendsRepo.remove).toHaveBeenCalledWith('f1');
    expect(res.friendship.id).toBe('f1');
  });

  it('resetCooldown na non-rejected → NO_COOLDOWN (409)', async () => {
    (friendsRepo.findById as jest.Mock).mockResolvedValue(
      friendship({ status: 'accepted' }),
    );
    await expect(service.resetCooldown('f1')).rejects.toMatchObject({
      response: { code: 'NO_COOLDOWN' },
    });
  });
});
