// backend/src/modules/emotes/emotes.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmotesService } from './emotes.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockEmote = {
  id: 'emote1',
  worldId: 'world1',
  name: 'Smích',
  shortcode: 'smich',
  imageId: 'ikaros/emotes/smich',
  createdBy: 'user1',
  createdAt: new Date(),
};

describe('EmotesService', () => {
  let service: EmotesService;
  const mockRepo = {
    findByWorldId: jest.fn(),
    findGlobal: jest.fn(),
    findById: jest.fn(),
    findByShortcode: jest.fn(),
    create: jest.fn(),
    deleteById: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        EmotesService,
        { provide: 'ICustomEmotesRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    service = module.get(EmotesService);
  });

  describe('assertIsMember', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertIsMember('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí člena světa s rolí Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertIsMember('user1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne Pending člena', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Pending });
      await expect(service.assertIsMember('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertIsMember('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertWorldCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertWorldCanManage('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PomocnyPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PomocnyPJ });
      await expect(service.assertWorldCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertWorldCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne Hrace', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertWorldCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertWorldCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertGlobalCanManage', () => {
    it('propustí Admina', () => {
      expect(() => service.assertGlobalCanManage(UserRole.Admin)).not.toThrow();
    });

    it('propustí Superadmina', () => {
      expect(() => service.assertGlobalCanManage(UserRole.Superadmin)).not.toThrow();
    });

    it('odmítne PJ (globální roli)', () => {
      expect(() => service.assertGlobalCanManage(UserRole.PJ)).toThrow(ForbiddenException);
    });
  });

  describe('findByWorld', () => {
    it('vrátí emoty daného světa', async () => {
      mockRepo.findByWorldId.mockResolvedValue([mockEmote]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorldId).toHaveBeenCalledWith('world1');
    });
  });

  describe('findGlobal', () => {
    it('vrátí globální emoty', async () => {
      const globalEmote = { ...mockEmote, worldId: null };
      mockRepo.findGlobal.mockResolvedValue([globalEmote]);
      const result = await service.findGlobal();
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('vytvoří emote a emituje událost', async () => {
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockEmote);
      const result = await service.create('world1', { name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'user1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', shortcode: 'smich', createdBy: 'user1' }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.created', { worldId: 'world1', emote: mockEmote });
      expect(result).toEqual(mockEmote);
    });

    it('vyhodí ConflictException pokud shortcode existuje', async () => {
      mockRepo.findByShortcode.mockResolvedValue(mockEmote);
      await expect(
        service.create('world1', { name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'user1'),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('createGlobal', () => {
    it('vytvoří globální emote s worldId null', async () => {
      const globalEmote = { ...mockEmote, worldId: null };
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(globalEmote);
      const result = await service.createGlobal({ name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'admin1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: null, createdBy: 'admin1' }),
      );
      expect(result.worldId).toBeNull();
    });

    it('vyhodí ConflictException pokud globální shortcode existuje', async () => {
      mockRepo.findByShortcode.mockResolvedValue({ ...mockEmote, worldId: null });
      await expect(
        service.createGlobal({ name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'admin1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteFromWorld', () => {
    it('smaže emote ze světa', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(service.deleteFromWorld('emote1', 'world1')).resolves.toBeUndefined();
      expect(mockRepo.deleteById).toHaveBeenCalledWith('emote1');
    });

    it('vyhodí NotFoundException pokud emote neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.deleteFromWorld('bad', 'world1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí NotFoundException pokud emote patří jinému světu', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEmote, worldId: 'world2' });
      await expect(service.deleteFromWorld('emote1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteGlobal', () => {
    it('smaže globální emote', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEmote, worldId: null });
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(service.deleteGlobal('emote1')).resolves.toBeUndefined();
    });

    it('vyhodí NotFoundException pokud emote není globální', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      await expect(service.deleteGlobal('emote1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('copy', () => {
    it('zkopíruje emote do cílového světa a emituje událost', async () => {
      const copied = { ...mockEmote, id: 'emote2', worldId: 'world2' };
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(copied);
      const result = await service.copy('emote1', 'world1', 'world2', 'user1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world2',
          shortcode: 'smich',
          createdBy: 'user1',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.created', { worldId: 'world2', emote: copied });
      expect(result.worldId).toBe('world2');
    });

    it('vyhodí NotFoundException pokud zdrojový emote neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.copy('bad', 'world1', 'world2', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ConflictException pokud shortcode existuje v cílovém světě', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.findByShortcode.mockResolvedValue({ ...mockEmote, worldId: 'world2' });
      await expect(service.copy('emote1', 'world1', 'world2', 'user1')).rejects.toThrow(ConflictException);
    });
  });
});
