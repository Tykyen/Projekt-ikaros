import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorldsService } from './worlds.service';
import { WorldRole } from './interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';

const mockRequester = { id: 'user1', role: UserRole.Hrac, username: 'user1' };

const mockWorld = {
  id: 'world1',
  name: 'Matrix',
  slug: 'matrix',
  ownerId: 'user1',
  isActive: true,
  accessMode: 'private',
  playerCount: 0,
  system: 'matrix',
  tones: [],
  dice: [],
  offeredCharacters: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('WorldsService', () => {
  let service: WorldsService;
  const mockWorldsRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    existsBySlug: jest.fn(),
    increment: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
  };
  const mockSettingsRepo = {
    findByWorldId: jest.fn(),
    upsert: jest.fn(),
  };

  const mockCurrenciesService = { seedForWorld: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorldsService,
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldSettingsRepository', useValue: mockSettingsRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: WorldCurrenciesService, useValue: mockCurrenciesService },
      ],
    }).compile();
    service = module.get(WorldsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all active worlds', async () => {
      mockWorldsRepo.findAll.mockResolvedValue([mockWorld]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Matrix');
    });
  });

  describe('join', () => {
    it('should throw ForbiddenException for closed world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, accessMode: 'closed' });
      await expect(service.join('world1', 'user2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if user already member', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ id: 'm1', role: WorldRole.Hrac });
      await expect(service.join('world1', 'user2')).rejects.toThrow(ConflictException);
    });

    it('should create membership with Hrac role for public world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, accessMode: 'public' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.save.mockResolvedValue({ id: 'm1', role: WorldRole.Hrac });
      const result = await service.join('world1', 'user2');
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorldRole.Hrac }),
      );
      expect(result.role).toBe(WorldRole.Hrac);
    });

    it('should create membership with Pending role for non-public world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, accessMode: 'open' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.save.mockResolvedValue({ id: 'm1', role: WorldRole.Pending });
      await service.join('world1', 'user2');
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorldRole.Pending }),
      );
    });

    it('neemituje event pokud membership je již Pending', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, accessMode: 'private' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1', userId: 'user2', worldId: 'world1', role: WorldRole.Pending, joinedAt: new Date(), akj: 0,
      });
      const emit = service['eventEmitter'].emit as jest.Mock;
      await service.join('world1', 'user2', 'Frodo');
      expect(emit).not.toHaveBeenCalledWith('world.join.requested', expect.anything());
    });

    it('emituje world.join.requested s worldName a requesterName při private world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, name: 'Matrix', accessMode: 'private' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1', userId: 'user2', worldId: 'world1', role: WorldRole.Pending, joinedAt: new Date(), akj: 0,
      });
      const emit = service['eventEmitter'].emit as jest.Mock;
      await service.join('world1', 'user2', 'Frodo');
      expect(emit).toHaveBeenCalledWith('world.join.requested', {
        worldId: 'world1',
        worldName: 'Matrix',
        requesterId: 'user2',
        requesterName: 'Frodo',
      });
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException for unknown world', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should allow owner to update', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockWorldsRepo.update.mockResolvedValue({ ...mockWorld, name: 'Updated' });
      const result = await service.update('world1', { name: 'Updated' }, mockRequester);
      expect(result.name).toBe('Updated');
    });

    it('should allow Admin to update any world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, ownerId: 'other' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockWorldsRepo.update.mockResolvedValue({ ...mockWorld, name: 'Updated' });
      const adminUser = { id: 'admin1', role: UserRole.Admin, username: 'admin1' };
      const result = await service.update('world1', { name: 'Updated' }, adminUser);
      expect(result.name).toBe('Updated');
    });

    it('should throw ForbiddenException for non-owner without sufficient role', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, ownerId: 'other' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.update('world1', {}, mockRequester)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateMemberFree', () => {
    it('nastaví isFree na true pokud je requester PJ', async () => {
      const pj = { id: 'pj1', role: UserRole.PJ, username: 'pj' };
      const membership = { id: 'mem1', worldId: 'w1', userId: 'u1', role: WorldRole.Hrac, isFree: false, joinedAt: new Date(), akj: 0 };
      mockMembershipRepo.findById.mockResolvedValue(membership);
      mockMembershipRepo.update.mockResolvedValue({ ...membership, isFree: true });

      const result = await service.updateMemberFree('mem1', true, pj);

      expect(mockMembershipRepo.update).toHaveBeenCalledWith('mem1', { isFree: true });
      expect(result?.isFree).toBe(true);
    });

    it('hodí ForbiddenException pokud requester není PJ+', async () => {
      const hrac = { id: 'u1', role: UserRole.Hrac, username: 'u1' };
      const membership = { id: 'mem1', worldId: 'w1', userId: 'u2', role: WorldRole.Hrac, isFree: false, joinedAt: new Date(), akj: 0 };
      mockMembershipRepo.findById.mockResolvedValue(membership);

      await expect(service.updateMemberFree('mem1', true, hrac)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMyWorlds', () => {
    it('should use findByIds to avoid N+1', async () => {
      const memberships = [
        { id: 'm1', worldId: 'world1', userId: 'user1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0 },
        { id: 'm2', worldId: 'world2', userId: 'user1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0 },
      ];
      mockMembershipRepo.findByUserId.mockResolvedValue(memberships);
      mockWorldsRepo.findByIds.mockResolvedValue([mockWorld, { ...mockWorld, id: 'world2' }]);
      const result = await service.findMyWorlds('user1');
      expect(mockWorldsRepo.findByIds).toHaveBeenCalledWith(['world1', 'world2']);
      expect(mockWorldsRepo.findById).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });
});
