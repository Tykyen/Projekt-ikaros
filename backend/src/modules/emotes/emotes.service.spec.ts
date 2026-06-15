// backend/src/modules/emotes/emotes.service.spec.ts
import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
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
  imageUrl:
    'https://res.cloudinary.com/test-cloud/image/upload/ikaros/emotes/smich.png',
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
    updateById: jest.fn(),
    deleteById: jest.fn(),
    countByWorldId: jest.fn().mockResolvedValue(0),
    countGlobal: jest.fn().mockResolvedValue(0),
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
      await expect(
        service.assertIsMember('admin1', UserRole.Admin, 'world1'),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí člena světa s rolí Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertIsMember('user1', UserRole.Hrac, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('odmítne Pending člena', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Zadatel,
      });
      await expect(
        service.assertIsMember('user1', UserRole.Hrac, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertIsMember('user1', UserRole.Hrac, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertWorldCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(
        service.assertWorldCanManage('admin1', UserRole.Admin, 'world1'),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PomocnyPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        service.assertWorldCanManage('pj1', UserRole.Hrac, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.assertWorldCanManage('pj1', UserRole.Hrac, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('odmítne Hrace', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertWorldCanManage('user1', UserRole.Hrac, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertWorldCanManage('user1', UserRole.Hrac, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertGlobalCanManage', () => {
    it('propustí Admina', () => {
      expect(() => service.assertGlobalCanManage(UserRole.Admin)).not.toThrow();
    });

    it('propustí Superadmina', () => {
      expect(() =>
        service.assertGlobalCanManage(UserRole.Superadmin),
      ).not.toThrow();
    });

    it('odmítne PJ (globální roli)', () => {
      expect(() => service.assertGlobalCanManage(UserRole.PJ)).toThrow(
        ForbiddenException,
      );
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
      const result = await service.create(
        'world1',
        {
          name: 'Smích',
          shortcode: 'smich',
          imageId: 'img1',
          imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
        },
        'user1',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          shortcode: 'smich',
          createdBy: 'user1',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.created', {
        worldId: 'world1',
        emote: mockEmote,
      });
      expect(result).toEqual(mockEmote);
    });

    it('vyhodí ConflictException pokud shortcode existuje', async () => {
      mockRepo.findByShortcode.mockResolvedValue(mockEmote);
      await expect(
        service.create(
          'world1',
          {
            name: 'Smích',
            shortcode: 'smich',
            imageId: 'img1',
            imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
          },
          'user1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('vyhodí ConflictException pokud svět dosáhl limitu 100', async () => {
      mockRepo.countByWorldId.mockResolvedValueOnce(100);
      await expect(
        service.create(
          'world1',
          {
            name: 'Smích',
            shortcode: 'smich',
            imageId: 'img1',
            imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
          },
          'user1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.findByShortcode).not.toHaveBeenCalled();
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    // UM-11 — FE nahraje obrázek PŘED create. Při 409 (shortcode kolize / limit)
    // by nahraný blob zůstal orphan → emote.service ho uklidí přes media.orphaned.
    it('UM-11 — shortcode kolize → uklidí orphan blob (media.orphaned)', async () => {
      mockRepo.findByShortcode.mockResolvedValue(mockEmote);
      const imageUrl = 'https://res.cloudinary.com/x/image/upload/img1.png';
      await expect(
        service.create(
          'world1',
          { name: 'Smích', shortcode: 'smich', imageId: 'img1', imageUrl },
          'user1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: [imageUrl],
      });
    });

    it('UM-11 — limit dosažen → uklidí orphan blob (media.orphaned)', async () => {
      mockRepo.countByWorldId.mockResolvedValueOnce(100);
      const imageUrl = 'https://res.cloudinary.com/x/image/upload/img1.png';
      await expect(
        service.create(
          'world1',
          { name: 'Smích', shortcode: 'smich', imageId: 'img1', imageUrl },
          'user1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: [imageUrl],
      });
    });

    it('UM-11 — úspěšný create NEemituje media.orphaned', async () => {
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockEmote);
      await service.create(
        'world1',
        {
          name: 'Smích',
          shortcode: 'smich',
          imageId: 'img1',
          imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
        },
        'user1',
      );
      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'media.orphaned',
        expect.anything(),
      );
    });
  });

  describe('createGlobal', () => {
    it('vytvoří globální emote s worldId null', async () => {
      const globalEmote = { ...mockEmote, worldId: null };
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(globalEmote);
      const result = await service.createGlobal(
        {
          name: 'Smích',
          shortcode: 'smich',
          imageId: 'img1',
          imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
        },
        'admin1',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: null, createdBy: 'admin1' }),
      );
      expect(result.worldId).toBeNull();
    });

    it('vyhodí ConflictException pokud globální shortcode existuje', async () => {
      mockRepo.findByShortcode.mockResolvedValue({
        ...mockEmote,
        worldId: null,
      });
      await expect(
        service.createGlobal(
          {
            name: 'Smích',
            shortcode: 'smich',
            imageId: 'img1',
            imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
          },
          'admin1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('vyhodí ConflictException pokud globální limit 200 dosažen', async () => {
      mockRepo.countGlobal.mockResolvedValueOnce(200);
      await expect(
        service.createGlobal(
          {
            name: 'Smích',
            shortcode: 'smich',
            imageId: 'img1',
            imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
          },
          'admin1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('emituje emote.created s worldId: null', async () => {
      const globalEmote = { ...mockEmote, worldId: null };
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(globalEmote);
      await service.createGlobal(
        {
          name: 'Smích',
          shortcode: 'smich',
          imageId: 'img1',
          imageUrl: 'https://res.cloudinary.com/x/image/upload/img1.png',
        },
        'admin1',
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.created', {
        worldId: null,
        emote: globalEmote,
      });
    });

    // UM-11 — global cesta: orphan cleanup při 409.
    it('UM-11 — globální shortcode kolize → uklidí orphan blob', async () => {
      mockRepo.findByShortcode.mockResolvedValue({
        ...mockEmote,
        worldId: null,
      });
      const imageUrl = 'https://res.cloudinary.com/x/image/upload/img1.png';
      await expect(
        service.createGlobal(
          { name: 'Smích', shortcode: 'smich', imageId: 'img1', imageUrl },
          'admin1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: [imageUrl],
      });
    });
  });

  describe('deleteFromWorld', () => {
    it('smaže emote ze světa a emituje emote.deleted', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(
        service.deleteFromWorld('emote1', 'world1'),
      ).resolves.toBeUndefined();
      expect(mockRepo.deleteById).toHaveBeenCalledWith('emote1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.deleted', {
        worldId: 'world1',
        emoteId: 'emote1',
      });
    });

    it('vyhodí NotFoundException pokud emote neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.deleteFromWorld('bad', 'world1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('vyhodí NotFoundException pokud emote patří jinému světu', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEmote, worldId: 'world2' });
      await expect(service.deleteFromWorld('emote1', 'world1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteGlobal', () => {
    it('smaže globální emote a emituje emote.deleted s worldId: null', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEmote, worldId: null });
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(service.deleteGlobal('emote1')).resolves.toBeUndefined();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.deleted', {
        worldId: null,
        emoteId: 'emote1',
      });
    });

    it('vyhodí NotFoundException pokud emote není globální', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      await expect(service.deleteGlobal('emote1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateInWorld', () => {
    it('aktualizuje name a emituje emote.updated', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      const updated = { ...mockEmote, name: 'Smích2' };
      mockRepo.updateById.mockResolvedValue(updated);
      const result = await service.updateInWorld('emote1', 'world1', {
        name: 'Smích2',
      });
      expect(mockRepo.updateById).toHaveBeenCalledWith('emote1', {
        name: 'Smích2',
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.updated', {
        worldId: 'world1',
        emote: updated,
      });
      expect(result.name).toBe('Smích2');
    });

    it('shortcode change: pokud koliduje, vrátí ConflictException', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.findByShortcode.mockResolvedValue({
        ...mockEmote,
        id: 'other',
        shortcode: 'jiny',
      });
      await expect(
        service.updateInWorld('emote1', 'world1', { shortcode: 'jiny' }),
      ).rejects.toThrow(); // ConflictException
      expect(mockRepo.updateById).not.toHaveBeenCalled();
    });

    it('shortcode change: stejný emote (id match) projde', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.findByShortcode.mockResolvedValue(mockEmote); // sama na sebe
      mockRepo.updateById.mockResolvedValue({
        ...mockEmote,
        shortcode: 'novy',
      });
      await expect(
        service.updateInWorld('emote1', 'world1', { shortcode: 'novy' }),
      ).resolves.toBeDefined();
    });

    it('emote v jiném světě → NotFoundException', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEmote, worldId: 'world2' });
      await expect(
        service.updateInWorld('emote1', 'world1', { name: 'X' }),
      ).rejects.toThrow();
    });

    it('prázdné DTO → BadRequestException', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      await expect(
        service.updateInWorld('emote1', 'world1', {}),
      ).rejects.toThrow();
    });

    it('imageId bez imageUrl → BadRequestException', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      await expect(
        service.updateInWorld('emote1', 'world1', { imageId: 'new' }),
      ).rejects.toThrow();
    });
  });

  describe('updateGlobal', () => {
    it('aktualizuje globální emote', async () => {
      const globalEmote = { ...mockEmote, worldId: null };
      mockRepo.findById.mockResolvedValue(globalEmote);
      const updated = { ...globalEmote, name: 'X' };
      mockRepo.updateById.mockResolvedValue(updated);
      const result = await service.updateGlobal('emote1', { name: 'X' });
      expect(result.name).toBe('X');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.updated', {
        worldId: null,
        emote: updated,
      });
    });

    it('emote s worldId !== null → NotFoundException', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      await expect(
        service.updateGlobal('emote1', { name: 'X' }),
      ).rejects.toThrow();
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
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.created', {
        worldId: 'world2',
        emote: copied,
      });
      expect(result.worldId).toBe('world2');
    });

    it('vyhodí NotFoundException pokud zdrojový emote neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.copy('bad', 'world1', 'world2', 'user1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ConflictException pokud shortcode existuje v cílovém světě', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.findByShortcode.mockResolvedValue({
        ...mockEmote,
        worldId: 'world2',
      });
      await expect(
        service.copy('emote1', 'world1', 'world2', 'user1'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
