import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DungeonMapsService } from './dungeon-maps.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockDungeon = {
  id: 'dun1',
  worldId: 'world1',
  name: 'Kobka',
  gridType: 'square' as const,
  gridWidth: 20,
  gridHeight: 20,
  cellSize: 40,
  theme: 'dyson' as const,
  cells: [],
  decorations: [],
  lastModified: new Date(),
};

describe('DungeonMapsService', () => {
  let service: DungeonMapsService;

  const mockRepo = {
    findByWorld: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    replace: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
  const mockTemplateRepo = { create: jest.fn() };
  const mockMapsRepo = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DungeonMapsService,
        { provide: 'IDungeonMapsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IMapTemplatesRepository', useValue: mockTemplateRepo },
        { provide: 'IMapsRepository', useValue: mockMapsRepo },
      ],
    }).compile();
    service = module.get(DungeonMapsService);
  });

  describe('findByWorld', () => {
    it('vrátí seznam dungeonů světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockDungeon]);
      const result = await service.findByWorld('world1');
      expect(result).toEqual([mockDungeon]);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });
  });

  describe('findById', () => {
    it('vrátí dungeon pokud existuje', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      const result = await service.findById('dun1');
      expect(result).toEqual(mockDungeon);
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('neexistuje')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertCanManage', () => {
    it('projde pro Admin bez kontroly členství', async () => {
      await expect(
        service.assertCanManage('u1', UserRole.Admin, 'world1'),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('projde pro PJ světa', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.assertCanManage('pj1', UserRole.Hrac, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('hodí ForbiddenException pro hráče bez PJ role', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertCanManage('u1', UserRole.Hrac, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí ForbiddenException pokud nemá členství', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertCanManage('u1', UserRole.Hrac, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('vytvoří dungeon s worldId z DTO', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.create.mockResolvedValue(mockDungeon);
      const result = await service.create(
        { worldId: 'world1', name: 'Kobka' },
        'pj1',
        UserRole.Hrac,
      );
      expect(result).toEqual(mockDungeon);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', name: 'Kobka' }),
      );
    });
  });

  describe('replace', () => {
    it('nahradí dungeon', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      const updated = { ...mockDungeon, name: 'Nové jméno' };
      mockRepo.replace.mockResolvedValue(updated);
      const result = await service.replace(
        'dun1',
        { name: 'Nové jméno' },
        'pj1',
        UserRole.Hrac,
      );
      expect(result).toEqual(updated);
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.replace('x', {}, 'pj1', UserRole.Hrac),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('smaže dungeon', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('dun1', 'pj1', UserRole.Hrac),
      ).resolves.toBeUndefined();
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('x', 'pj1', UserRole.Hrac)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('exportTemplate', () => {
    it('vytvoří MapTemplate z dungeonu a vrátí templateId', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockTemplateRepo.create.mockResolvedValue({ id: 'tpl1', name: 'Kobka' });
      const result = await service.exportTemplate(
        'dun1',
        'https://example.com/img.png',
        'pj1',
        UserRole.Hrac,
      );
      expect(result).toEqual({ templateId: 'tpl1' });
      expect(mockTemplateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kobka',
          imageUrl: 'https://example.com/img.png',
          config: expect.objectContaining({ size: 40 }),
        }),
      );
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.exportTemplate('x', 'https://img.png', 'pj1', UserRole.Hrac),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportScene', () => {
    it('vytvoří MapScene z dungeonu a vrátí sceneId', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockMapsRepo.create.mockResolvedValue({
        id: 'scene1',
        worldId: 'world1',
      });
      const result = await service.exportScene(
        'dun1',
        'https://example.com/img.png',
        'pj1',
        UserRole.Hrac,
      );
      expect(result).toEqual({ sceneId: 'scene1' });
      expect(mockMapsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kobka',
          imageUrl: 'https://example.com/img.png',
          worldId: 'world1',
          isActive: false,
        }),
      );
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.exportScene('x', 'https://img.png', 'pj1', UserRole.Hrac),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
