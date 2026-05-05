import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MapsService } from './maps.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockScene = {
  id: 'scene1',
  worldId: 'world1',
  name: 'Kobka',
  imageUrl: '',
  folder: undefined,
  config: { size: 40, originX: 0, originY: 0, showGrid: true },
  tokens: [],
  npcTemplates: [],
  effects: [],
  fogEnabled: false,
  revealedHexes: [],
  templateId: undefined,
  isActive: false,
  isHidden: false,
  isLocked: false,
  activeSoundIds: [],
  lastModified: new Date(),
};

const mockToken = {
  id: 'tok1',
  characterId: 'user1',
  characterSlug: 'abi',
  q: 0, r: 0, isNpc: false,
  currentHp: 10, maxHp: 10, baseHp: 10,
  armor: 2, baseArmor: 2, injury: 0,
  initiative: 0, initiativeBase: 0,
  inCombat: false, movement: 5,
  abilities: [], customData: {},
};

describe('MapsService', () => {
  let service: MapsService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findActiveByWorld: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    setActive: jest.fn(),
    replace: jest.fn(),
    delete: jest.fn(),
  };
  const mockTemplateRepo = { findById: jest.fn() };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
  const mockCharacterRepo = { findBySlugAndWorld: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MapsService,
        { provide: 'IMapsRepository', useValue: mockRepo },
        { provide: 'IMapTemplatesRepository', useValue: mockTemplateRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'ICharactersRepository', useValue: mockCharacterRepo },
      ],
    }).compile();
    service = module.get(MapsService);
  });

  describe('findByWorld', () => {
    it('vrátí scény světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockScene]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });
  });

  describe('findActive', () => {
    it('vrátí aktivní scénu', async () => {
      mockRepo.findActiveByWorld.mockResolvedValue(mockScene);
      const result = await service.findActive('world1');
      expect(result.id).toBe('scene1');
    });

    it('vyhodí NotFoundException pokud žádná aktivní scéna neexistuje', async () => {
      mockRepo.findActiveByWorld.mockResolvedValue(null);
      await expect(service.findActive('world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('vrátí scénu bez enrichmentu pokud tokeny nemají slug', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      const result = await service.findById('scene1');
      expect(result.id).toBe('scene1');
      expect(mockCharacterRepo.findBySlugAndWorld).not.toHaveBeenCalled();
    });

    it('obohacuje token s characterData pokud existuje postava', async () => {
      const sceneWithToken = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(sceneWithToken);
      mockCharacterRepo.findBySlugAndWorld.mockResolvedValue({
        name: 'Abi', imageUrl: 'img.png', diaryData: { hp: 10 },
      });
      const result = await service.findById('scene1');
      expect(result.tokens[0].characterData).toEqual({
        name: 'Abi', imageUrl: 'img.png', diaryData: { hp: 10 },
      });
    });

    it('characterData je undefined pokud postava neexistuje', async () => {
      const sceneWithToken = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(sceneWithToken);
      mockCharacterRepo.findBySlugAndWorld.mockResolvedValue(null);
      const result = await service.findById('scene1');
      expect(result.tokens[0].characterData).toBeUndefined();
    });

    it('vyhodí NotFoundException pokud scéna neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('vytvoří scénu s worldId z parametru', async () => {
      mockRepo.create.mockResolvedValue(mockScene);
      await service.create({ name: 'Kobka' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', name: 'Kobka' }),
      );
    });

    it('inicializuje z šablony pokud templateId je předáno', async () => {
      const tpl = {
        id: 'tpl1', name: 'Šablona', imageUrl: '', config: { size: 40, originX: 0, originY: 0, showGrid: true },
        npcTemplates: [], tokens: [], effects: [], fogEnabled: false,
        revealedHexes: [], activeSoundIds: [],
      };
      mockTemplateRepo.findById.mockResolvedValue(tpl);
      mockRepo.create.mockResolvedValue(mockScene);
      await service.create({ templateId: 'tpl1' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          templateId: 'tpl1',
          isActive: false,
          isHidden: false,
          isLocked: false,
        }),
      );
    });
  });

  describe('setActive', () => {
    it('volá repo.setActive a vrátí scénu', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      mockRepo.setActive.mockResolvedValue(undefined);
      await service.setActive('scene1', 'world1');
      expect(mockRepo.setActive).toHaveBeenCalledWith('scene1', 'world1');
    });

    it('vyhodí NotFoundException pokud scéna neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.setActive('bad', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('moveToken', () => {
    it('PJ může pohybovat libovolným tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      const result = await service.moveToken('scene1', { id: 'tok1', q: 2, r: 3 }, 'pj1', UserRole.PJ);
      expect(result.q).toBe(2);
      expect(result.r).toBe(3);
    });

    it('hráč může pohybovat jen svým tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      const result = await service.moveToken('scene1', { id: 'tok1', q: 1, r: 1 }, 'user1', UserRole.Hrac);
      expect(result.q).toBe(1);
    });

    it('vyhodí ForbiddenException pokud hráč zkouší pohybovat cizím tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      await expect(
        service.moveToken('scene1', { id: 'tok1', q: 1, r: 1 }, 'otherUser', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí NotFoundException pokud token neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      await expect(
        service.moveToken('scene1', { id: 'bad', q: 0, r: 0 }, 'user1', UserRole.Hrac),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeToken', () => {
    it('PJ může odstranit libovolný token', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue({ ...scene, tokens: [] });
      await expect(service.removeToken('scene1', 'tok1', 'pj1', UserRole.PJ)).resolves.toBeUndefined();
    });

    it('vyhodí ForbiddenException pokud hráč zkouší odstranit cizí token', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      await expect(
        service.removeToken('scene1', 'tok1', 'otherUser', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertCanManage('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });
});
