import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MapsService } from './maps.service';
import { ContentLicensesService } from '../content-licenses/content-licenses.service';
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
  // 15.4 (E) — seed config nové scény z world map defaults. Default null =
  // žádné defaulty → seed se přeskočí (existující create testy beze změny).
  const mockWorldSettingsRepo = {
    findByWorldId: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MapsService,
        { provide: 'IMapsRepository', useValue: mockRepo },
        { provide: 'IMapTemplatesRepository', useValue: mockTemplateRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        {
          provide: 'IWorldSettingsRepository',
          useValue: mockWorldSettingsRepo,
        },
        { provide: 'ICharactersRepository', useValue: mockCharacterRepo },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'ICharacterDiaryRepository', useValue: mockDiaryRepo },
        // 22.5 — licenční brána klonu (default: bez karty → clone povolen).
        {
          provide: ContentLicensesService,
          useValue: { getLatest: jest.fn().mockResolvedValue(null) },
        },
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
      const result = await service.findByWorld('world1', {
        id: 'pp',
        role: UserRole.Ikarus,
      });
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('hráč (ne-staff) → 403, žádný dump scén', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.findByWorld('world1', { id: 'hrac', role: UserRole.Ikarus }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.findByWorld).not.toHaveBeenCalled();
    });

    it('GlobalAdmin S ELEVACÍ bez membershipu → projde', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findByWorld.mockResolvedValue([mockScene]);
      const result = await service.findByWorld('world1', {
        id: 'admin',
        role: UserRole.Admin,
        elevatedWorldIds: ['world1'],
      });
      expect(result).toHaveLength(1);
    });

    it('GlobalAdmin BEZ elevace a bez membershipu → 403', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findByWorld('world1', { id: 'admin', role: UserRole.Admin }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteScene (CD-04 — dangling currentSceneId cleanup)', () => {
    it('po smazání scény vyčistí currentSceneId u členů, co na ní byli', async () => {
      mockRepo.findById.mockResolvedValue(mockScene); // worldId: 'world1'
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.delete.mockResolvedValue(true);
      await service.deleteScene('scene1', { id: 'pj1', role: UserRole.Hrac });
      expect(mockRepo.delete).toHaveBeenCalledWith('scene1');
      expect(mockMembershipRepo.clearSceneForAll).toHaveBeenCalledWith(
        'scene1',
      );
    });

    it('neexistující scéna → NotFound a žádný cleanup', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.deleteScene('nope', { id: 'pj1', role: UserRole.Hrac }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
      expect(mockMembershipRepo.clearSceneForAll).not.toHaveBeenCalled();
    });

    it('FIX-16 (cross-world IDOR) — PJ jiného světa nemůže smazat cizí scénu', async () => {
      mockRepo.findById.mockResolvedValue(mockScene); // worldId: 'world1'
      // requester je PJ ve 'worldA', ne ve 'world1' (scéna).
      mockMembershipRepo.findByUserAndWorld.mockImplementation(
        (_userId: string, worldId: string) =>
          Promise.resolve(worldId === 'worldA' ? { role: WorldRole.PJ } : null),
      );
      await expect(
        service.deleteScene('scene1', { id: 'pjA', role: UserRole.Hrac }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
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

    it('inicializuje z VLASTNÍ šablony pokud templateId je předáno', async () => {
      const tpl = {
        id: 'tpl1',
        ownerId: 'pj1',
        name: 'Šablona',
        imageUrl: '',
        config: { size: 40, originX: 0, originY: 0, showGrid: true },
        npcTemplates: [],
        tokens: [],
        effects: [],
        fogEnabled: false,
        revealedHexes: [],
        activeSoundIds: ['s1'],
      };
      mockTemplateRepo.findById.mockResolvedValue(tpl);
      mockRepo.create.mockResolvedValue(mockScene);
      // 22.5 — requesterId = owner → vlastní šablona, žádná katalog/licence brána.
      await service.create({ templateId: 'tpl1' }, 'world1', 'pj1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          templateId: 'tpl1',
          activeSoundIds: ['s1'], // vlastní šablona si zvuky ponechá
          isActive: false,
          isHidden: false,
          isLocked: false,
        }),
      );
    });

    it('22.5 — klon CIZÍ nepublikované šablony → ForbiddenException', async () => {
      mockTemplateRepo.findById.mockResolvedValue({
        id: 'tpl1',
        ownerId: 'pj2',
        published: false,
        config: { size: 40 },
        npcTemplates: [],
        tokens: [],
        effects: [],
        revealedHexes: [],
        activeSoundIds: [],
      });
      await expect(
        service.create({ templateId: 'tpl1' }, 'world1', 'pj1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('22.5 — klon CIZÍ publikované+schválené šablony strippne zvuky', async () => {
      mockTemplateRepo.findById.mockResolvedValue({
        id: 'tpl1',
        ownerId: 'pj2',
        published: true,
        reviewStatus: 'approved',
        moderationHidden: false,
        config: { size: 40, originX: 0, originY: 0, showGrid: true },
        npcTemplates: [],
        tokens: [],
        effects: [],
        fogEnabled: false,
        revealedHexes: [],
        activeSoundIds: ['s1', 's2'],
      });
      mockRepo.create.mockResolvedValue(mockScene);
      await service.create({ templateId: 'tpl1' }, 'world1', 'pj1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: 'tpl1', activeSoundIds: [] }),
      );
    });
  });

  describe('setActive', () => {
    it('volá repo.setActive a vrátí scénu', async () => {
      mockRepo.findById.mockResolvedValue(mockScene); // worldId: 'world1'
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.setActive.mockResolvedValue(undefined);
      await service.setActive('scene1', { id: 'pj1', role: UserRole.Hrac });
      expect(mockRepo.setActive).toHaveBeenCalledWith('scene1', 'world1');
    });

    it('vyhodí NotFoundException pokud scéna neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.setActive('bad', { id: 'pj1', role: UserRole.Hrac }),
      ).rejects.toThrow(NotFoundException);
    });

    it('FIX-16 (cross-world IDOR) — PJ jiného světa nemůže aktivovat cizí scénu', async () => {
      mockRepo.findById.mockResolvedValue(mockScene); // worldId: 'world1'
      mockMembershipRepo.findByUserAndWorld.mockImplementation(
        (_userId: string, worldId: string) =>
          Promise.resolve(worldId === 'worldA' ? { role: WorldRole.PJ } : null),
      );
      await expect(
        service.setActive('scene1', { id: 'pjA', role: UserRole.Hrac }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.setActive).not.toHaveBeenCalled();
    });
  });

  describe('replace', () => {
    it('PJ světa scény smí scénu nahradit', async () => {
      mockRepo.findById.mockResolvedValue(mockScene); // worldId: 'world1'
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.replace.mockResolvedValue({ ...mockScene, name: 'Nová' });
      const result = await service.replace(
        'scene1',
        { name: 'Nová' },
        { id: 'pj1', role: UserRole.Hrac },
      );
      expect(mockRepo.replace).toHaveBeenCalledWith(
        'scene1',
        expect.objectContaining({ name: 'Nová', worldId: 'world1' }),
      );
      expect(result.name).toBe('Nová');
    });

    it('vyhodí NotFoundException pokud scéna neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.replace(
          'bad',
          { name: 'X' },
          { id: 'pj1', role: UserRole.Hrac },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('FIX-16 (cross-world IDOR) — PJ jiného světa nemůže přepsat cizí scénu', async () => {
      mockRepo.findById.mockResolvedValue(mockScene); // worldId: 'world1'
      // requester je PJ ve 'worldA' (uvedeném v těle požadavku), ne ve 'world1'
      // (skutečný svět scény) — dřív se autorizovalo proti tělu, ne proti DB.
      mockMembershipRepo.findByUserAndWorld.mockImplementation(
        (_userId: string, worldId: string) =>
          Promise.resolve(worldId === 'worldA' ? { role: WorldRole.PJ } : null),
      );
      await expect(
        service.replace(
          'scene1',
          { name: 'Hacknuto', worldId: 'worldA' },
          { id: 'pjA', role: UserRole.Hrac },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.replace).not.toHaveBeenCalled();
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
        { id: 'user1', role: UserRole.Hrac },
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
          {
            id: 'otherUser',
            role: UserRole.Hrac,
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí NotFoundException pokud token neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      await expect(
        service.moveToken(
          'scene1',
          { id: 'bad', q: 0, r: 0 },
          {
            id: 'user1',
            role: UserRole.Hrac,
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    // ─── D-053b — membership-based PJ check ─────────────────────────────────

    it('D-053b — Sa S ELEVACÍ hýbe cizím tokenem', async () => {
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
          {
            id: 'sa1',
            role: UserRole.Superadmin,
            elevatedWorldIds: ['world1'],
          },
        ),
      ).resolves.toBeDefined();
      // Elevovaný Sa = bypass, membership se nekonzultuje
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('D-053b — Admin S ELEVACÍ hýbe cizím tokenem', async () => {
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
          {
            id: 'admin1',
            role: UserRole.Admin,
            elevatedWorldIds: ['world1'],
          },
        ),
      ).resolves.toBeDefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('elevation — Admin BEZ elevace nemá token bypass (cizí token = Forbidden)', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      // bez membershipu v daném světě a bez elevace → padá na ownership check
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.moveToken(
          'scene1',
          { id: 'tok1', q: 5, r: 5 },
          {
            id: 'admin1',
            role: UserRole.Admin,
          },
        ),
      ).rejects.toThrow(ForbiddenException);
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
          {
            id: 'worldPj1',
            role: UserRole.Hrac,
          },
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
          {
            id: 'otherWorldPj',
            role: UserRole.Hrac,
          },
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
        service.removeToken('scene1', 'tok1', {
          id: 'otherUser',
          role: UserRole.Hrac,
        }),
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
        service.removeToken('scene1', 'tok1', {
          id: 'worldPj1',
          role: UserRole.Hrac,
        }),
      ).resolves.toBeUndefined();
    });

    it('D-053b — elevovaný Sa odstraní libovolný token bez membership lookup', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue({ ...scene, tokens: [] });
      mockRepo.atomicUpdate.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });
      await expect(
        service.removeToken('scene1', 'tok1', {
          id: 'sa1',
          role: UserRole.Superadmin,
          elevatedWorldIds: ['world1'],
        }),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });
  });

  describe('assertCanManage', () => {
    it('propustí elevovaného Admina bez kontroly membershipu', async () => {
      await expect(
        service.assertCanManage(
          { id: 'admin1', role: UserRole.Admin, elevatedWorldIds: ['world1'] },
          'world1',
        ),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('Admin BEZ elevace → padá na membership (žádný PJ → 403)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertCanManage(
          { id: 'admin1', role: UserRole.Admin },
          'world1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.findByUserAndWorld).toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.assertCanManage({ id: 'pj1', role: UserRole.Hrac }, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertCanManage({ id: 'user1', role: UserRole.Hrac }, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
