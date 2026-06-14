import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MapsService } from './maps.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  q: 0,
  r: 0,
  isNpc: false,
  currentHp: 10,
  maxHp: 10,
  baseHp: 10,
  armor: 2,
  baseArmor: 2,
  injury: 0,
  initiative: 0,
  initiativeBase: 0,
  inCombat: false,
  movement: 5,
  abilities: [],
  customData: {},
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
    // 10.2-prep-2 — moveToken/removeToken nyní používají atomic update.
    atomicUpdate: jest
      .fn()
      .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    findActiveScenesByWorld: jest.fn(),
  };
  const mockTemplateRepo = { findById: jest.fn() };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    // CD-04 — deleteScene čistí dangling currentSceneId.
    clearSceneForAll: jest.fn().mockResolvedValue(0),
  };
  const mockCharacterRepo = { findBySlugAndWorld: jest.fn() };
  // 9.1 (cleanup) — enrichTokens čte Page.imageUrl (Character.imageUrl byl smazán).
  const mockPagesRepo = {
    findBySlugAndWorld: jest.fn().mockResolvedValue(null),
  };
  // 10.2g — read-only diary subdoc pro enrichTokens (HP postavy → HP bar).
  const mockDiaryRepo = {
    findByCharacterId: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MapsService,
        { provide: 'IMapsRepository', useValue: mockRepo },
        { provide: 'IMapTemplatesRepository', useValue: mockTemplateRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'ICharactersRepository', useValue: mockCharacterRepo },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'ICharacterDiaryRepository', useValue: mockDiaryRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(MapsService);
  });

  describe('findByWorld (R-11 staff-only)', () => {
    it('vrátí scény světa pro staff (PomocnyPJ+)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findByWorld.mockResolvedValue([mockScene]);
      const result = await service.findByWorld('world1', 'pp', UserRole.Ikarus);
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('hráč (ne-staff) → 403, žádný dump scén', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.findByWorld('world1', 'hrac', UserRole.Ikarus),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.findByWorld).not.toHaveBeenCalled();
    });

    it('GlobalAdmin bez membershipu → projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findByWorld.mockResolvedValue([mockScene]);
      const result = await service.findByWorld(
        'world1',
        'admin',
        UserRole.Admin,
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteScene (CD-04 — dangling currentSceneId cleanup)', () => {
    it('po smazání scény vyčistí currentSceneId u členů, co na ní byli', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await service.deleteScene('scene1');
      expect(mockRepo.delete).toHaveBeenCalledWith('scene1');
      expect(mockMembershipRepo.clearSceneForAll).toHaveBeenCalledWith(
        'scene1',
      );
    });

    it('neexistující scéna → NotFound a žádný cleanup', async () => {
      mockRepo.delete.mockResolvedValue(false);
      await expect(service.deleteScene('nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockMembershipRepo.clearSceneForAll).not.toHaveBeenCalled();
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
      await expect(service.findActive('world1')).rejects.toThrow(
        NotFoundException,
      );
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
      // 9.1 — name + diaryData z Character, imageUrl z Page
      // (po sjednocení Character→Page).
      mockCharacterRepo.findBySlugAndWorld.mockResolvedValue({
        name: 'Abi',
        diaryData: { hp: 10 },
      });
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue({
        imageUrl: 'img.png',
      });
      const result = await service.findById('scene1');
      expect(result.tokens[0].characterData).toEqual({
        name: 'Abi',
        imageUrl: 'img.png',
        diaryData: { hp: 10 },
        // 10.2g — characterData nese i diary customData (per-system HP klíče).
        customData: {},
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
        id: 'tpl1',
        name: 'Šablona',
        imageUrl: '',
        config: { size: 40, originX: 0, originY: 0, showGrid: true },
        npcTemplates: [],
        tokens: [],
        effects: [],
        fogEnabled: false,
        revealedHexes: [],
        activeSoundIds: [],
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
      await expect(service.setActive('bad', 'world1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('moveToken', () => {
    it('hráč může pohybovat jen svým tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      mockRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.moveToken(
        'scene1',
        { id: 'tok1', q: 1, r: 1 },
        'user1',
        UserRole.Hrac,
      );
      expect(result.q).toBe(1);
    });

    it('vyhodí ForbiddenException pokud hráč zkouší pohybovat cizím tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.moveToken(
          'scene1',
          { id: 'tok1', q: 1, r: 1 },
          'otherUser',
          UserRole.Hrac,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí NotFoundException pokud token neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      await expect(
        service.moveToken(
          'scene1',
          { id: 'bad', q: 0, r: 0 },
          'user1',
          UserRole.Hrac,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    // ─── D-053b — membership-based PJ check ─────────────────────────────────

    it('D-053b — Sa hýbe cizím tokenem v jakémkoli světě', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      mockRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      await expect(
        service.moveToken(
          'scene1',
          { id: 'tok1', q: 5, r: 5 },
          'sa1',
          UserRole.Superadmin,
        ),
      ).resolves.toBeDefined();
      // Sa nemá smysl konzultovat membership — bypass
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('D-053b — Admin hýbe cizím tokenem v jakémkoli světě', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      mockRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      await expect(
        service.moveToken(
          'scene1',
          { id: 'tok1', q: 5, r: 5 },
          'admin1',
          UserRole.Admin,
        ),
      ).resolves.toBeDefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('D-053b — world PJ DANÉHO světa hýbe cizím tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      mockRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.moveToken(
          'scene1',
          { id: 'tok1', q: 5, r: 5 },
          'worldPj1',
          UserRole.Hrac,
        ),
      ).resolves.toBeDefined();
      expect(mockMembershipRepo.findByUserAndWorld).toHaveBeenCalledWith(
        'worldPj1',
        'world1',
      );
    });

    it('D-053b — world PJ JINÉHO světa nemůže hýbat cizím tokenem (Forbidden)', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      // membership pro tento svět = žádný (PJ je world2, nikoliv world1)
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.moveToken(
          'scene1',
          { id: 'tok1', q: 5, r: 5 },
          'otherWorldPj',
          UserRole.Hrac,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeToken', () => {
    it('vyhodí ForbiddenException pokud hráč zkouší odstranit cizí token', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.removeToken('scene1', 'tok1', 'otherUser', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('D-053b — world PJ daného světa smí odstranit libovolný token', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue({ ...scene, tokens: [] });
      mockRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.removeToken('scene1', 'tok1', 'worldPj1', UserRole.Hrac),
      ).resolves.toBeUndefined();
    });

    it('D-053b — Sa odstraní libovolný token bez membership lookup', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue({ ...scene, tokens: [] });
      mockRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      await expect(
        service.removeToken('scene1', 'tok1', 'sa1', UserRole.Superadmin),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });
  });

  describe('assertCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(
        service.assertCanManage('admin1', UserRole.Admin, 'world1'),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.assertCanManage('pj1', UserRole.Hrac, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertCanManage('user1', UserRole.Hrac, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
