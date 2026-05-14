import { Test } from '@nestjs/testing';
import { WorldJoinRequestProvider } from './world-join-request.provider';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from './interfaces/world-membership.interface';

describe('WorldJoinRequestProvider (Spec 2.4)', () => {
  let provider: WorldJoinRequestProvider;

  const mockWorldsRepo = {
    findByOwnerId: jest.fn(),
    findByIds: jest.fn(),
  };
  const mockMembershipRepo = {
    countByRoleAcrossWorlds: jest.fn(),
    findPaginatedByRoleAcrossWorlds: jest.fn(),
  };
  const mockUsersService = {
    publicProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorldJoinRequestProvider,
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    provider = module.get(WorldJoinRequestProvider);
    jest.clearAllMocks();
  });

  describe('countForUser', () => {
    it('Ikarus owner: scope = owned worldIds, vrátí count z repo', async () => {
      mockWorldsRepo.findByOwnerId.mockResolvedValue([
        { id: 'w1' },
        { id: 'w2' },
      ]);
      mockMembershipRepo.countByRoleAcrossWorlds.mockResolvedValue(3);

      const count = await provider.countForUser('u1', UserRole.Ikarus);

      expect(mockMembershipRepo.countByRoleAcrossWorlds).toHaveBeenCalledWith(
        WorldRole.Zadatel,
        ['w1', 'w2'],
      );
      expect(count).toBe(3);
    });

    it('Admin: scope undefined (global)', async () => {
      mockMembershipRepo.countByRoleAcrossWorlds.mockResolvedValue(7);

      const count = await provider.countForUser('adm1', UserRole.Admin);

      expect(mockWorldsRepo.findByOwnerId).not.toHaveBeenCalled();
      expect(mockMembershipRepo.countByRoleAcrossWorlds).toHaveBeenCalledWith(
        WorldRole.Zadatel,
        undefined,
      );
      expect(count).toBe(7);
    });

    it('user bez vlastněných světů → 0 (prázdné pole)', async () => {
      mockWorldsRepo.findByOwnerId.mockResolvedValue([]);
      mockMembershipRepo.countByRoleAcrossWorlds.mockResolvedValue(0);

      const count = await provider.countForUser('u1', UserRole.Ikarus);

      expect(mockMembershipRepo.countByRoleAcrossWorlds).toHaveBeenCalledWith(
        WorldRole.Zadatel,
        [],
      );
      expect(count).toBe(0);
    });
  });

  describe('listForUser', () => {
    it('populate worlds + requester users, vrátí WorldJoinRequestListItem[]', async () => {
      mockWorldsRepo.findByOwnerId.mockResolvedValue([{ id: 'w1' }]);
      mockMembershipRepo.findPaginatedByRoleAcrossWorlds.mockResolvedValue({
        items: [
          {
            id: 'm1',
            worldId: 'w1',
            userId: 'u9',
            role: WorldRole.Zadatel,
            joinedAt: new Date('2026-05-14T10:00:00Z'),
            akj: 0,
          },
        ],
        total: 1,
      });
      mockWorldsRepo.findByIds.mockResolvedValue([
        { id: 'w1', name: 'Šedý hrad', slug: 'sedy-hrad' },
      ]);
      mockUsersService.publicProfile.mockResolvedValue({
        id: 'u9',
        username: 'frodo',
        avatarUrl: 'http://x/a.png',
      });

      const result = await provider.listForUser('u1', UserRole.Ikarus, 1, 20);

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        membershipId: 'm1',
        worldId: 'w1',
        worldName: 'Šedý hrad',
        worldSlug: 'sedy-hrad',
        requestedAt: '2026-05-14T10:00:00.000Z',
        requester: {
          id: 'u9',
          username: 'frodo',
          avatarUrl: 'http://x/a.png',
        },
      });
    });

    it('prázdný výsledek → items=[], total=0, žádné populate calls', async () => {
      mockWorldsRepo.findByOwnerId.mockResolvedValue([{ id: 'w1' }]);
      mockMembershipRepo.findPaginatedByRoleAcrossWorlds.mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await provider.listForUser('u1', UserRole.Ikarus, 1, 20);

      expect(result).toEqual({ items: [], total: 0 });
      expect(mockWorldsRepo.findByIds).not.toHaveBeenCalled();
      expect(mockUsersService.publicProfile).not.toHaveBeenCalled();
    });
  });

  describe('canHandle', () => {
    it('vždy true (filter podle ownerId je v list/count)', () => {
      expect(provider.canHandle('u1', UserRole.Ikarus)).toBe(true);
      expect(provider.canHandle('u1', UserRole.Admin)).toBe(true);
    });
  });
});
