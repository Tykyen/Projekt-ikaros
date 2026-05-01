import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatService } from './chat.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockPJ: { id: string; role: UserRole } = { id: 'user1', role: UserRole.Hrac };
const mockAdmin: { id: string; role: UserRole } = { id: 'admin1', role: UserRole.Admin };

const mockGroup = { id: 'group1', worldId: 'world1', name: 'Globální', order: 0, createdAt: new Date() };
const mockChannel = {
  id: 'ch1', groupId: 'group1', worldId: 'world1', name: 'obecný',
  accessMode: 'all' as const, allowedRoles: [], allowedMemberIds: [],
  order: 0, isDeleted: false, createdAt: new Date(),
};
const mockPJMembership = { id: 'm1', userId: 'user1', worldId: 'world1', role: WorldRole.PJ, joinedAt: new Date(), akj: 0 };
const mockHracMembership = { id: 'm2', userId: 'user2', worldId: 'world1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0 };

describe('ChatService', () => {
  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(), findByWorldId: jest.fn(), countByWorldId: jest.fn(),
    save: jest.fn(), update: jest.fn(), delete: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(), findByGroupId: jest.fn(), findByWorldId: jest.fn(),
    save: jest.fn(), update: jest.fn(), delete: jest.fn(), softDeleteByWorldId: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(), findByChannelId: jest.fn(), countAfter: jest.fn(),
    save: jest.fn(), update: jest.fn(), softDeleteByWorldId: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(), findByUserAndChannels: jest.fn(), upsert: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(), findByWorldId: jest.fn(),
    findByUserId: jest.fn(), findById: jest.fn(), countByWorldId: jest.fn(),
    save: jest.fn(), update: jest.fn(), delete: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    it('should allow PJ to create group', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.countByWorldId.mockResolvedValue(2);
      mockGroupRepo.save.mockResolvedValue({ ...mockGroup, name: 'Nová' });
      const result = await service.createGroup('world1', { name: 'Nová' }, mockPJ);
      expect(result.name).toBe('Nová');
    });

    it('should throw ForbiddenException for Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.createGroup('world1', { name: 'X' }, { id: 'user2', role: UserRole.Hrac }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should allow Admin regardless of membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockGroupRepo.countByWorldId.mockResolvedValue(0);
      mockGroupRepo.save.mockResolvedValue(mockGroup);
      const result = await service.createGroup('world1', { name: 'G' }, mockAdmin);
      expect(result).toBeDefined();
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and its channels', async () => {
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByGroupId.mockResolvedValue([mockChannel]);
      mockChannelRepo.delete.mockResolvedValue(true);
      mockGroupRepo.delete.mockResolvedValue(true);
      await service.deleteGroup('group1', mockPJ);
      expect(mockChannelRepo.delete).toHaveBeenCalledWith('ch1');
      expect(mockGroupRepo.delete).toHaveBeenCalledWith('group1');
    });

    it('should throw NotFoundException for unknown group', async () => {
      mockGroupRepo.findById.mockResolvedValue(null);
      await expect(service.deleteGroup('unknown', mockPJ)).rejects.toThrow(NotFoundException);
    });
  });

  describe('hasChannelAccess', () => {
    it('returns true for accessMode=all when member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      const result = await service.hasChannelAccess(mockChannel, 'user2');
      expect(result).toBe(true);
    });

    it('returns false for accessMode=all when not member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.hasChannelAccess(mockChannel, 'stranger');
      expect(result).toBe(false);
    });

    it('returns false for accessMode=all when Pending', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockHracMembership, role: WorldRole.Pending });
      const result = await service.hasChannelAccess(mockChannel, 'user2');
      expect(result).toBe(false);
    });

    it('returns true for accessMode=roles when role matches', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      const roleChannel = { ...mockChannel, accessMode: 'roles' as const, allowedRoles: [WorldRole.PJ] };
      const result = await service.hasChannelAccess(roleChannel, 'user1');
      expect(result).toBe(true);
    });

    it('returns true for accessMode=members when userId in list', async () => {
      const membersChannel = { ...mockChannel, accessMode: 'members' as const, allowedMemberIds: ['user2'] };
      const result = await service.hasChannelAccess(membersChannel, 'user2');
      expect(result).toBe(true);
    });
  });
});
