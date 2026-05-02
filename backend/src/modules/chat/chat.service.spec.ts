import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
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
    save: jest.fn(), update: jest.fn(), softDeleteByChannelId: jest.fn(), softDeleteByWorldId: jest.fn(),
    addReaction: jest.fn(), removeReaction: jest.fn(),
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

  describe('sendMessage', () => {
    it('should save message and emit event', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      const mockMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1', content: 'ahoj', isEdited: false, isDeleted: false, reactions: {}, attachments: [], createdAt: new Date(), updatedAt: new Date() };
      mockMessageRepo.save.mockResolvedValue(mockMsg);
      mockChannelRepo.update.mockResolvedValue({ ...mockChannel, lastMessageAt: mockMsg.createdAt });
      const result = await service.sendMessage('ch1', { content: 'ahoj' }, mockPJ);
      expect(result.content).toBe('ahoj');
      expect(mockMessageRepo.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when no channel access', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.sendMessage('ch1', { content: 'x' }, { id: 'stranger', role: UserRole.Hrac }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('editMessage', () => {
    const mockMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1', content: 'original', isEdited: false, isDeleted: false, reactions: {}, attachments: [], createdAt: new Date(), updatedAt: new Date() };

    it('should allow author to edit own message', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMessageRepo.update.mockResolvedValue({ ...mockMsg, content: 'edited', isEdited: true });
      const result = await service.editMessage('msg1', { content: 'edited' }, mockPJ);
      expect(result.isEdited).toBe(true);
      expect(result.content).toBe('edited');
    });

    it('should throw ForbiddenException for non-author without manage permission', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.editMessage('msg1', { content: 'hack' }, { id: 'user2', role: UserRole.Hrac }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should allow PJ to edit any message', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMessageRepo.update.mockResolvedValue({ ...mockMsg, content: 'pj edit', isEdited: true });
      const result = await service.editMessage('msg1', { content: 'pj edit' }, { id: 'user3', role: UserRole.Hrac });
      expect(result.content).toBe('pj edit');
    });
  });

  describe('deleteMessage', () => {
    const mockMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'user1', content: 'text', isEdited: false, isDeleted: false, reactions: {}, attachments: [], createdAt: new Date(), updatedAt: new Date() };

    it('should soft-delete message (content=null, isDeleted=true)', async () => {
      mockMessageRepo.findById.mockResolvedValue(mockMsg);
      mockMessageRepo.update.mockResolvedValue({ ...mockMsg, content: null, isDeleted: true });
      await service.deleteMessage('msg1', mockPJ);
      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg1', { isDeleted: true, content: null });
    });

    it('should throw NotFoundException for missing message', async () => {
      mockMessageRepo.findById.mockResolvedValue(null);
      await expect(service.deleteMessage('unknown', mockPJ)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMessages limit validation', () => {
    it('should clamp NaN limit to default 50', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockMessageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('ch1', 'user2', { limit: NaN });
      expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith('ch1', { before: undefined, limit: 50 });
    });

    it('should clamp limit=0 to default 50', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockMessageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('ch1', 'user2', { limit: 0 });
      expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith('ch1', { before: undefined, limit: 50 });
    });

    it('should clamp limit=200 to max 100', async () => {
      mockChannelRepo.findById.mockResolvedValue(mockChannel);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockMessageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('ch1', 'user2', { limit: 200 });
      expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith('ch1', { before: undefined, limit: 100 });
    });
  });

  describe('handleWorldCreated', () => {
    it('should create 2 groups with 1 channel each', async () => {
      const world = { id: 'world1' } as import('../worlds/interfaces/world.interface').World;
      mockGroupRepo.save.mockResolvedValueOnce({ ...mockGroup, name: 'Globální', id: 'g1' });
      mockGroupRepo.save.mockResolvedValueOnce({ ...mockGroup, name: 'Postavy', id: 'g2' });
      mockChannelRepo.save.mockResolvedValue(mockChannel);
      await service.handleWorldCreated(world);
      expect(mockGroupRepo.save).toHaveBeenCalledTimes(2);
      expect(mockChannelRepo.save).toHaveBeenCalledTimes(2);
      expect(mockGroupRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Globální' }));
      expect(mockGroupRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Postavy' }));
    });
  });

  describe('ChatMessage interface — reactions field', () => {
    it('mockMsg should have reactions field (type check)', () => {
      const msg: import('./interfaces/chat-message.interface').ChatMessage = {
        id: 'msg1', channelId: 'ch1', worldId: 'world1',
        senderId: 'user1', senderName: 'Elara',
        content: 'text', isEdited: false, isDeleted: false,
        reactions: { '👍': ['user2'] },
        createdAt: new Date(), updatedAt: new Date(),
      };
      expect(msg.reactions['👍']).toContain('user2');
    });
  });

  describe('ChatMessage interface — attachments field', () => {
    it('mockMsg should have attachments field (type check)', () => {
      const msg: import('./interfaces/chat-message.interface').ChatMessage = {
        id: 'msg1', channelId: 'ch1', worldId: 'world1',
        senderId: 'user1', senderName: 'Elara',
        content: 'text', isEdited: false, isDeleted: false,
        reactions: {},
        attachments: [{ url: 'https://example.com/a.jpg', publicId: 'abc', type: 'image', mimeType: 'image/jpeg', filename: 'a.jpg', size: 1024 }],
        createdAt: new Date(), updatedAt: new Date(),
      };
      expect(msg.attachments![0].type).toBe('image');
    });
  });
});

describe('sendMessage — new fields', () => {
  const baseMockMsg = {
    id: 'msg1', channelId: 'ch1', worldId: 'world1',
    senderId: 'user1', senderName: 'Elara', senderAvatarUrl: 'http://avatar.png',
    content: 'ahoj', isEdited: false, isDeleted: false,
    reactions: {}, attachments: [], createdAt: new Date(), updatedAt: new Date(),
  };

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
    save: jest.fn(), update: jest.fn(), softDeleteByChannelId: jest.fn(), softDeleteByWorldId: jest.fn(),
    addReaction: jest.fn(), removeReaction: jest.fn(),
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

  it('should snapshot senderAvatarUrl from membership', async () => {
    const membership = { ...mockPJMembership, avatarUrl: 'http://avatar.png', characterPath: 'Elara' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(baseMockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage('ch1', { content: 'ahoj' }, mockPJ);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ senderAvatarUrl: 'http://avatar.png' }),
    );
  });

  it('should throw ForbiddenException when non-PJ sets overrideName', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    await expect(
      service.sendMessage('ch1', { content: 'x', overrideName: 'NPC' }, { id: 'user2', role: UserRole.Hrac }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow PJ to set overrideName', async () => {
    const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'PJ' };
    const msgWithOverride = { ...baseMockMsg, overrideName: 'Starý kovář' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(msgWithOverride);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    const result = await service.sendMessage('ch1', { content: 'x', overrideName: 'Starý kovář' }, mockPJ);
    expect(result.overrideName).toBe('Starý kovář');
  });

  it('should populate replyToPreview from cited message', async () => {
    const citedMsg = { ...baseMockMsg, id: 'cited1', content: 'původní zpráva', senderName: 'Elara' };
    const replyMsg = { ...baseMockMsg, replyToId: 'cited1', replyToPreview: 'původní zpráva', replyToSenderName: 'Elara' };
    const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'Elara' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.findById.mockResolvedValue(citedMsg);
    mockMessageRepo.save.mockResolvedValue(replyMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage('ch1', { content: 'odpověď', replyToId: 'cited1' }, mockPJ);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToId: 'cited1',
        replyToPreview: 'původní zpráva',
        replyToSenderName: 'Elara',
      }),
    );
  });

  it('should add senderId to visibleTo for whisper', async () => {
    const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'Elara' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue({ ...baseMockMsg, visibleTo: ['user1', 'user2'] });
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage('ch1', { content: 'šepot', visibleTo: ['user2'] }, mockPJ);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ visibleTo: expect.arrayContaining(['user1', 'user2']) }),
    );
  });
});

describe('toggleReaction', () => {
  const mockMsg = {
    id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
    senderName: 'Elara', content: 'text', isEdited: false, isDeleted: false,
    reactions: {}, attachments: [], createdAt: new Date(), updatedAt: new Date(),
  };

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
    save: jest.fn(), update: jest.fn(), softDeleteByChannelId: jest.fn(), softDeleteByWorldId: jest.fn(),
    addReaction: jest.fn(), removeReaction: jest.fn(),
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

  it('should add reaction when user has not reacted yet', async () => {
    mockMessageRepo.findById.mockResolvedValue(mockMsg);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.addReaction.mockResolvedValue({ ...mockMsg, reactions: { '👍': ['user2'] } });
    const result = await service.toggleReaction('msg1', '👍', { id: 'user2', role: UserRole.Hrac });
    expect(mockMessageRepo.addReaction).toHaveBeenCalledWith('msg1', '👍', 'user2');
    expect(result.reactions['👍']).toContain('user2');
  });

  it('should remove reaction when user already reacted', async () => {
    const msgWithReaction = { ...mockMsg, reactions: { '👍': ['user2'] } };
    mockMessageRepo.findById.mockResolvedValue(msgWithReaction);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.removeReaction.mockResolvedValue({ ...mockMsg, reactions: { '👍': [] } });
    await service.toggleReaction('msg1', '👍', { id: 'user2', role: UserRole.Hrac });
    expect(mockMessageRepo.removeReaction).toHaveBeenCalledWith('msg1', '👍', 'user2');
    expect(mockMessageRepo.addReaction).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException for missing message', async () => {
    mockMessageRepo.findById.mockResolvedValue(null);
    await expect(service.toggleReaction('unknown', '👍', mockPJ)).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when no channel access', async () => {
    mockMessageRepo.findById.mockResolvedValue(mockMsg);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
    await expect(service.toggleReaction('msg1', '👍', { id: 'stranger', role: UserRole.Hrac }))
      .rejects.toThrow(ForbiddenException);
  });
});

describe('sendMessage — attachments', () => {
  const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'Elara' };
  const attachment = {
    url: 'https://res.cloudinary.com/test.jpg', publicId: 'chat/world1/ch1/abc',
    type: 'image' as const, mimeType: 'image/jpeg', filename: 'img.jpg', size: 1024,
  };

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
    save: jest.fn(), update: jest.fn(), softDeleteByChannelId: jest.fn(), softDeleteByWorldId: jest.fn(),
    addReaction: jest.fn(), removeReaction: jest.fn(),
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

  it('should throw BadRequestException when neither content nor attachments provided', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    await expect(
      service.sendMessage('ch1', {} as any, mockPJ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should allow message with only attachments (no content)', async () => {
    const mockMsg = {
      id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'Elara',
      content: null, isEdited: false, isDeleted: false, reactions: {}, attachments: [attachment],
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(mockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    const result = await service.sendMessage('ch1', { attachments: [attachment] } as any, mockPJ);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe('image');
  });
});

describe('findChannelForUpload', () => {
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
    save: jest.fn(), update: jest.fn(), softDeleteByChannelId: jest.fn(), softDeleteByWorldId: jest.fn(),
    addReaction: jest.fn(), removeReaction: jest.fn(),
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

  it('should return channel when user has access', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
    const result = await service.findChannelForUpload('ch1', 'user1');
    expect(result.id).toBe('ch1');
  });

  it('should throw NotFoundException for unknown channel', async () => {
    mockChannelRepo.findById.mockResolvedValue(null);
    await expect(service.findChannelForUpload('unknown', 'user1')).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when no channel access', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
    await expect(service.findChannelForUpload('ch1', 'stranger')).rejects.toThrow(ForbiddenException);
  });
});

describe('getMessages — whisper filtering', () => {
  const publicMsg = {
    id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
    senderName: 'Elara', content: 'veřejná', isEdited: false, isDeleted: false,
    reactions: {}, attachments: [], createdAt: new Date(), updatedAt: new Date(),
  };
  const whisperMsg = {
    ...publicMsg, id: 'msg2', content: 'šepot',
    visibleTo: ['user1', 'user2'],
  };

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
    save: jest.fn(), update: jest.fn(), softDeleteByChannelId: jest.fn(), softDeleteByWorldId: jest.fn(),
    addReaction: jest.fn(), removeReaction: jest.fn(),
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

  it('should hide whisper from user not in visibleTo', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockHracMembership, userId: 'user3' });
    mockMessageRepo.findByChannelId.mockResolvedValue([publicMsg, whisperMsg]);
    const result = await service.getMessages('ch1', 'user3', {});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('msg1');
  });

  it('should show whisper to sender', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.findByChannelId.mockResolvedValue([publicMsg, whisperMsg]);
    const result = await service.getMessages('ch1', 'user1', {});
    expect(result).toHaveLength(2);
  });

  it('should show all whispers to PJ', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
    mockMessageRepo.findByChannelId.mockResolvedValue([publicMsg, whisperMsg]);
    const result = await service.getMessages('ch1', 'user1', {});
    expect(result).toHaveLength(2);
  });
});
