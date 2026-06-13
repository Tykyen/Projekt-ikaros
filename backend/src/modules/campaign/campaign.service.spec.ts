import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockSubject = {
  id: 'sub1',
  worldId: 'w1',
  ownerId: 'user1',
  isShared: false,
  type: 'NPC' as const,
  name: 'Goblin',
  tags: [],
  status: 'active' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSubjectShared = {
  ...mockSubject,
  id: 'sub2',
  isShared: true,
  ownerId: 'pj1',
};

describe('CampaignService', () => {
  let service: CampaignService;

  const mockSubjectRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockRelRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockStorylineRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockScenarioRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    maxOrder: jest.fn(),
  };
  const mockNoteRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockShopRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    pullLinkedItem: jest.fn(),
    countByGroup: jest.fn(),
  };
  const mockShopGroupRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    countChildren: jest.fn(),
  };
  const mockLogRepo = { append: jest.fn(), findMany: jest.fn() };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: 'ICampaignSubjectRepository', useValue: mockSubjectRepo },
        { provide: 'ICampaignRelationshipRepository', useValue: mockRelRepo },
        {
          provide: 'ICampaignStorylineRepository',
          useValue: mockStorylineRepo,
        },
        { provide: 'ICampaignScenarioRepository', useValue: mockScenarioRepo },
        { provide: 'ICampaignQuickNoteRepository', useValue: mockNoteRepo },
        { provide: 'ICampaignShopItemRepository', useValue: mockShopRepo },
        {
          provide: 'ICampaignShopGroupRepository',
          useValue: mockShopGroupRepo,
        },
        { provide: 'ICampaignChangeLogRepository', useValue: mockLogRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(CampaignService);
  });

  describe('getWorldRole', () => {
    it('vrátí PJ pro admina bez DB dotazu', async () => {
      const role = await service.getWorldRole('admin1', UserRole.Admin, 'w1');
      expect(role).toBe(WorldRole.PJ);
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('vrátí WorldRole z membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      const role = await service.getWorldRole('user1', UserRole.Hrac, 'w1');
      expect(role).toBe(WorldRole.PomocnyPJ);
    });

    it('nečlen → ForbiddenException (N-06: nečlen nemá přístup ke kampaňovým datům)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getWorldRole('user1', UserRole.Hrac, 'w1'),
      ).rejects.toThrow(/Nejsi členem/);
    });
  });

  describe('resolveScope', () => {
    it('Hráč vidí jen vlastní data', () => {
      const filter = service.resolveScope('user1', WorldRole.Hrac, 'w1');
      expect(filter).toEqual({ worldId: 'w1', ownerId: 'user1' });
    });

    it('PomocnýPJ vidí vlastní + sdílená', () => {
      const filter = service.resolveScope('pj2', WorldRole.PomocnyPJ, 'w1');
      expect(filter).toEqual({
        worldId: 'w1',
        $or: [{ ownerId: 'pj2' }, { isShared: true }],
      });
    });

    it('PJ vidí vše ve světě', () => {
      const filter = service.resolveScope('pj1', WorldRole.PJ, 'w1');
      expect(filter).toEqual({ worldId: 'w1' });
    });
  });

  describe('canModify', () => {
    it('vlastník může modifikovat', () => {
      expect(service.canModify(mockSubject, 'user1', WorldRole.Hrac)).toBe(
        true,
      );
    });

    it('cizí hráč nemůže modifikovat', () => {
      expect(service.canModify(mockSubject, 'user2', WorldRole.Hrac)).toBe(
        false,
      );
    });

    it('PomocnýPJ může modifikovat sdílenou entitu', () => {
      expect(
        service.canModify(mockSubjectShared, 'pj2', WorldRole.PomocnyPJ),
      ).toBe(true);
    });

    it('PomocnýPJ nemůže modifikovat cizí nesdílený subjekt', () => {
      expect(service.canModify(mockSubject, 'pj2', WorldRole.PomocnyPJ)).toBe(
        false,
      );
    });

    it('PJ může modifikovat cokoliv', () => {
      expect(service.canModify(mockSubject, 'pj1', WorldRole.PJ)).toBe(true);
    });
  });

  describe('subjects', () => {
    it('findSubjects volá repo s resolveScope filtrem', async () => {
      mockSubjectRepo.findMany.mockResolvedValue([mockSubject]);
      const result = await service.findSubjects(
        'user1',
        WorldRole.Hrac,
        'w1',
        {},
      );
      expect(mockSubjectRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'w1', ownerId: 'user1' }),
      );
      expect(result).toHaveLength(1);
    });

    it('createSubject zapíše changelog', async () => {
      mockSubjectRepo.create.mockResolvedValue(mockSubject);
      mockLogRepo.append.mockResolvedValue(undefined);
      await service.createSubject(
        'user1',
        'UserName',
        WorldRole.Hrac,
        'w1',
        false,
        { name: 'Goblin', type: 'NPC' },
      );
      // Give fire-and-forget time to run
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockLogRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({
          changeType: 'created',
          entityType: 'subject',
          entityName: 'Goblin',
        }),
      );
    });

    it('deleteSubject vyhodí ForbiddenException pro cizího vlastníka', async () => {
      mockSubjectRepo.findById.mockResolvedValue(mockSubject);
      await expect(
        service.deleteSubject('sub1', 'user2', WorldRole.Hrac, 'user2Name'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deleteSubject vyhodí NotFoundException pokud subjekt neexistuje', async () => {
      mockSubjectRepo.findById.mockResolvedValue(null);
      await expect(
        service.deleteSubject('sub1', 'user1', WorldRole.PJ, 'pjName'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('shopitems cascade delete', () => {
    it('deleteShopItem volá pullLinkedItem pro kaskádové mazání', async () => {
      const mockItem = {
        id: 'item1',
        worldId: 'w1',
        ownerId: 'user1',
        isShared: false,
        name: 'Meč',
        groupId: 'zbrane',
        description: undefined,
        subgroupId: undefined,
        price: 0,
        currencyCode: '',
        discountPercent: 0,
        linkedItemIds: [],
        referenceLink: undefined,
        isRecommended: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockShopRepo.findById.mockResolvedValue(mockItem);
      mockShopRepo.delete.mockResolvedValue(true);
      mockShopRepo.pullLinkedItem.mockResolvedValue(undefined);
      mockLogRepo.append.mockResolvedValue(undefined);
      await service.deleteShopItem('item1', 'user1', WorldRole.PJ, 'pjName');
      expect(mockShopRepo.pullLinkedItem).toHaveBeenCalledWith('w1', 'item1');
    });
  });

  describe('shopgroups (N0 — typy + slevy)', () => {
    const mockGroup = {
      id: 'g1',
      worldId: 'w1',
      ownerId: 'pj1',
      isShared: false,
      name: 'Zbraně',
      parentId: undefined,
      order: 0,
      discountPercent: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('findShopGroups: hráč vidí isShared (publikované) skupiny, ne ownerId scope (N-22)', async () => {
      mockShopGroupRepo.findMany.mockResolvedValue([mockGroup]);
      await service.findShopGroups('user1', WorldRole.Hrac, 'w1');
      expect(mockShopGroupRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'w1', isShared: true }),
      );
    });

    it('findShopGroups: PJ má plný scope světa (N-22)', async () => {
      mockShopGroupRepo.findMany.mockResolvedValue([mockGroup]);
      await service.findShopGroups('pj1', WorldRole.PJ, 'w1');
      const arg = mockShopGroupRepo.findMany.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      expect(arg).toMatchObject({ worldId: 'w1' });
      expect(arg.isShared).toBeUndefined();
      expect(arg.ownerId).toBeUndefined();
    });

    it('createShopGroup předá discountPercent do repo a zapíše changelog', async () => {
      mockShopGroupRepo.create.mockImplementation(
        (d: Record<string, unknown>) => Promise.resolve({ id: 'g1', ...d }),
      );
      mockLogRepo.append.mockResolvedValue(undefined);
      await service.createShopGroup('pj1', 'PJ', WorldRole.PJ, 'w1', false, {
        name: 'Zbraně',
        discountPercent: 20,
      });
      expect(mockShopGroupRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Zbraně', discountPercent: 20 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockLogRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'shopgroup',
          changeType: 'created',
        }),
      );
    });

    it('deleteShopGroup vyhodí ConflictException u neprázdné skupiny (položky)', async () => {
      mockShopGroupRepo.findById.mockResolvedValue(mockGroup);
      mockShopRepo.countByGroup.mockResolvedValue(3);
      mockShopGroupRepo.countChildren.mockResolvedValue(0);
      await expect(
        service.deleteShopGroup('g1', 'pj1', WorldRole.PJ, 'PJ'),
      ).rejects.toThrow(ConflictException);
      expect(mockShopGroupRepo.delete).not.toHaveBeenCalled();
    });

    it('deleteShopGroup vyhodí ConflictException u skupiny s podskupinami', async () => {
      mockShopGroupRepo.findById.mockResolvedValue(mockGroup);
      mockShopRepo.countByGroup.mockResolvedValue(0);
      mockShopGroupRepo.countChildren.mockResolvedValue(2);
      await expect(
        service.deleteShopGroup('g1', 'pj1', WorldRole.PJ, 'PJ'),
      ).rejects.toThrow(ConflictException);
    });

    it('deleteShopGroup smaže prázdnou skupinu', async () => {
      mockShopGroupRepo.findById.mockResolvedValue(mockGroup);
      mockShopRepo.countByGroup.mockResolvedValue(0);
      mockShopGroupRepo.countChildren.mockResolvedValue(0);
      mockShopGroupRepo.delete.mockResolvedValue(true);
      mockLogRepo.append.mockResolvedValue(undefined);
      await service.deleteShopGroup('g1', 'pj1', WorldRole.PJ, 'PJ');
      expect(mockShopGroupRepo.delete).toHaveBeenCalledWith('g1');
    });

    it('createShopItem předá groupId + discountPercent do repo (žádný field-drop)', async () => {
      mockShopRepo.create.mockImplementation((d: Record<string, unknown>) =>
        Promise.resolve({ id: 'item1', ...d }),
      );
      mockLogRepo.append.mockResolvedValue(undefined);
      await service.createShopItem('pj1', 'PJ', WorldRole.PJ, 'w1', false, {
        name: 'Meč',
        groupId: 'g1',
        subgroupId: 'g2',
        price: 15,
        discountPercent: 10,
      });
      expect(mockShopRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'g1',
          subgroupId: 'g2',
          discountPercent: 10,
        }),
      );
    });
  });

  describe('changelog', () => {
    it('PJ dostane všechny záznamy světa', async () => {
      mockLogRepo.findMany.mockResolvedValue([]);
      await service.getChangelog('w1', WorldRole.PJ, 50);
      expect(mockLogRepo.findMany).toHaveBeenCalledWith({ worldId: 'w1' }, 50);
    });

    it('PomocnýPJ dostane vlastní i sdílené záznamy', async () => {
      mockLogRepo.findMany.mockResolvedValue([]);
      await service.getChangelog('w1', WorldRole.PomocnyPJ, 50, 'user1');
      expect(mockLogRepo.findMany).toHaveBeenCalledWith(
        { worldId: 'w1', $or: [{ ownerId: 'user1' }, { isShared: true }] },
        50,
      );
    });
  });

  describe('relationships — emoční model (11.1)', () => {
    it('createRelationship předá valence/emotionTag do repo (passthrough, žádný field-drop)', async () => {
      mockRelRepo.create.mockImplementation((d: Record<string, unknown>) =>
        Promise.resolve({ id: 'rel1', ...d }),
      );
      mockLogRepo.append.mockResolvedValue(undefined);
      await service.createRelationship('u1', 'U', WorldRole.Hrac, 'w1', false, {
        subjectAId: 'a',
        subjectBId: 'b',
        sideA: { valence: -3, emotionTag: 'nenávist', strength: 8 },
        sideB: { valence: 2, emotionTag: 'sympatie' },
      });
      expect(mockRelRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sideA: expect.objectContaining({
            valence: -3,
            emotionTag: 'nenávist',
            strength: 8,
          }),
          sideB: expect.objectContaining({
            valence: 2,
            emotionTag: 'sympatie',
            strength: 5,
          }),
        }),
      );
    });
  });

  describe('subjects — typy STATE/OTHER (11.1)', () => {
    it('createSubject akceptuje typ STATE', async () => {
      mockSubjectRepo.create.mockResolvedValue({
        ...mockSubject,
        type: 'STATE',
      });
      mockLogRepo.append.mockResolvedValue(undefined);
      const res = await service.createSubject(
        'u1',
        'U',
        WorldRole.Hrac,
        'w1',
        false,
        { name: 'Aragonské království', type: 'STATE' },
      );
      expect(mockSubjectRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'STATE' }),
      );
      expect(res.type).toBe('STATE');
    });
  });

  describe('getPlayers', () => {
    it('vrátí členy světa kromě requestujícího uživatele', async () => {
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'user1', role: WorldRole.Hrac, characterPath: '/char1' },
        { userId: 'user2', role: WorldRole.Hrac, characterPath: '/char2' },
        { userId: 'pj1', role: WorldRole.PJ, characterPath: '/pj' },
      ]);
      const result = await service.getPlayers('pj1', 'w1');
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.userId === 'pj1')).toBeUndefined();
    });
  });
});
