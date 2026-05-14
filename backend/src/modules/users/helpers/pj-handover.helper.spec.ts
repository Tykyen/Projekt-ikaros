import { assessPJHandover, executePJHandover } from './pj-handover.helper';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';

describe('pj-handover.helper', () => {
  const mockMembershipRepo = {
    findByUserId: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserAndWorld: jest.fn(),
    update: jest.fn(),
  };
  const mockWorldsRepo = {
    findById: jest.fn(),
  };
  const mockUsersRepo = {
    findById: jest.fn(),
  };

  const deps = {
    membershipRepo: mockMembershipRepo,
    worldsRepo: mockWorldsRepo,
    usersRepo: mockUsersRepo,
  } as never;

  beforeEach(() => jest.clearAllMocks());

  describe('assessPJHandover', () => {
    it('user není PJ nikde → empty plan', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        {
          userId: 'u1',
          worldId: 'w1',
          role: WorldRole.Hrac,
          joinedAt: new Date(),
        },
      ]);
      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toEqual([]);
      expect(plan.blocking).toEqual([]);
    });

    it('PJ ve světě s jinými PJ → no handover', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        {
          userId: 'u1',
          worldId: 'w1',
          role: WorldRole.PJ,
          joinedAt: new Date(),
        },
      ]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', role: WorldRole.PJ, joinedAt: new Date() },
        { userId: 'u2', role: WorldRole.PJ, joinedAt: new Date() },
      ]);
      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toEqual([]);
      expect(plan.blocking).toEqual([]);
    });

    it('Sole PJ + PomocnyPJ existuje → 1 promotion', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        {
          userId: 'u1',
          worldId: 'w1',
          role: WorldRole.PJ,
          joinedAt: new Date(),
        },
      ]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', role: WorldRole.PJ, joinedAt: new Date('2026-01-01') },
        {
          userId: 'h1',
          role: WorldRole.PomocnyPJ,
          joinedAt: new Date('2026-02-01'),
        },
      ]);
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'w1',
        name: 'World 1',
        slug: 'w1',
      });
      mockUsersRepo.findById.mockResolvedValue({
        id: 'h1',
        username: 'helper',
      });

      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toHaveLength(1);
      expect(plan.promotions[0]).toMatchObject({
        worldId: 'w1',
        promotedUserId: 'h1',
        promotedUsername: 'helper',
      });
      expect(plan.blocking).toEqual([]);
    });

    it('Sole PJ bez PomocnyPJ → 1 blocker', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        {
          userId: 'u1',
          worldId: 'w1',
          role: WorldRole.PJ,
          joinedAt: new Date(),
        },
      ]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', role: WorldRole.PJ, joinedAt: new Date() },
      ]);
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'w1',
        name: 'World 1',
        slug: 'w1',
      });
      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toEqual([]);
      expect(plan.blocking).toHaveLength(1);
      expect(plan.blocking[0].worldId).toBe('w1');
    });
  });

  describe('executePJHandover', () => {
    it('updates membership role for each promotion', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        userId: 'h1',
        worldId: 'w1',
      });
      mockMembershipRepo.update.mockResolvedValue({});
      await executePJHandover(
        {
          promotions: [
            {
              worldId: 'w1',
              worldName: 'W1',
              worldSlug: 'w1',
              promotedUserId: 'h1',
              promotedUsername: 'helper',
            },
          ],
          blocking: [],
        },
        { membershipRepo: mockMembershipRepo } as never,
      );
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m1', {
        role: WorldRole.PJ,
      });
    });
  });
});
