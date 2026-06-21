// backend/src/modules/sounds/sounds.service.spec.ts
import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { SoundsService } from './sounds.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import {
  SoundMediaType,
  SoundPrimaryFunction,
  SoundEnvironment,
  SoundEmotionalTone,
  SoundOnsetProfile,
  SoundOutroProfile,
  SoundFactionStyle,
  SoundTechLevel,
  SoundMagicLevel,
  SoundCombatEnergy,
} from './schemas/sound.schema';

const makeSound = (overrides = {}) => ({
  id: 'sound1',
  worldId: 'world1',
  name: 'Dark Ambient',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  mediaType: SoundMediaType.ambient,
  primaryFunction: SoundPrimaryFunction.tension,
  environment: SoundEnvironment.interior,
  emotionalTone: SoundEmotionalTone.dread,
  intensity: 3,
  duration: 180,
  loop: true,
  onsetProfile: SoundOnsetProfile.soft,
  outroProfile: SoundOutroProfile.fade,
  factionStyle: SoundFactionStyle.civilian,
  techLevel: SoundTechLevel.modern,
  magicLevel: SoundMagicLevel.none,
  combatEnergy: SoundCombatEnergy.none,
  tags: ['dark', 'ambient'],
  notes: '',
  status: 'active' as const,
  proposedBy: null,
  proposedByWorldId: null,
  rejectReason: null,
  createdBy: 'user1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('SoundsService', () => {
  let service: SoundsService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findGlobal: jest.fn(),
    findGlobalPending: jest.fn(),
    findById: jest.fn(),
    findGlobalByUrlOrName: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    updateByIdAndWorld: jest.fn(),
    deleteById: jest.fn(),
    deleteByIdAndWorld: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SoundsService,
        { provide: 'ISoundsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(SoundsService);
  });

  describe('findByWorld', () => {
    it('vrátí zvuky daného světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([makeSound()]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });
  });

  describe('findGlobal', () => {
    it('vrátí approved globální zvuky', async () => {
      const global = makeSound({ worldId: null });
      mockRepo.findGlobal.mockResolvedValue([global]);
      const result = await service.findGlobal();
      expect(result).toHaveLength(1);
    });
  });

  describe('findGlobalPending', () => {
    it('vrátí pending nominations', async () => {
      const pending = makeSound({ worldId: null, status: 'pending' });
      mockRepo.findGlobalPending.mockResolvedValue([pending]);
      const result = await service.findGlobalPending();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('vrátí zvuk pokud patří světu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound());
      const result = await service.findOne('sound1', 'world1');
      expect(result.name).toBe('Dark Ambient');
    });

    it('vyhodí NotFoundException pokud zvuk neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findOne('sound1', 'world1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('vyhodí NotFoundException pokud zvuk patří jinému světu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world2' }));
      await expect(service.findOne('sound1', 'world1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findGlobalById', () => {
    it('vrátí globální zvuk dle id', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null }));
      const result = await service.findGlobalById('sound1');
      expect(result.worldId).toBeNull();
    });

    it('vyhodí NotFoundException pokud zvuk není globální', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world1' }));
      await expect(service.findGlobalById('sound1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createWorldSound', () => {
    it('přidá zvuk do světa se správným worldId a createdBy', async () => {
      mockRepo.create.mockResolvedValue(makeSound());
      await service.createWorldSound(
        { name: 'Dark Ambient', youtubeUrl: 'https://youtube.com/watch?v=abc' },
        'world1',
        'user1',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          createdBy: 'user1',
          status: 'active',
        }),
      );
    });
  });

  describe('createGlobalSound', () => {
    it('přidá zvuk přímo do globálního poolu jako active', async () => {
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(
        makeSound({ worldId: null, status: 'active' }),
      );
      await service.createGlobalSound(
        { name: 'Dark Ambient', youtubeUrl: 'https://youtube.com/watch?v=abc' },
        'admin1',
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: null, status: 'active' }),
      );
    });

    it('vyhodí ConflictException pokud duplicitní URL nebo název', async () => {
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(
        makeSound({ worldId: null }),
      );
      await expect(
        service.createGlobalSound(
          {
            name: 'Dark Ambient',
            youtubeUrl: 'https://youtube.com/watch?v=abc',
          },
          'admin1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('nominateToGlobal', () => {
    it('vytvoří pending nomination z world zvuku', async () => {
      mockRepo.findById.mockResolvedValue(makeSound());
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(
        makeSound({ worldId: null, status: 'pending' }),
      );
      await service.nominateToGlobal('sound1', 'world1', 'pj1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: null,
          status: 'pending',
          proposedBy: 'pj1',
          proposedByWorldId: 'world1',
        }),
      );
    });

    it('vyhodí NotFoundException pokud zvuk nepatří světu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world2' }));
      await expect(
        service.nominateToGlobal('sound1', 'world1', 'pj1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ConflictException při duplicitní URL v globálním poolu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound());
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(
        makeSound({ worldId: null }),
      );
      await expect(
        service.nominateToGlobal('sound1', 'world1', 'pj1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('approveNomination', () => {
    it('nastaví status=active', async () => {
      mockRepo.findById.mockResolvedValue(
        makeSound({ worldId: null, status: 'pending' }),
      );
      mockRepo.updateById.mockResolvedValue(
        makeSound({ worldId: null, status: 'active' }),
      );
      const result = await service.approveNomination('sound1');
      expect(mockRepo.updateById).toHaveBeenCalledWith('sound1', {
        status: 'active',
        rejectReason: null,
      });
      expect(result.status).toBe('active');
    });

    it('vyhodí NotFoundException pokud zvuk není pending globální', async () => {
      mockRepo.findById.mockResolvedValue(
        makeSound({ worldId: null, status: 'active' }),
      );
      await expect(service.approveNomination('sound1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rejectNomination', () => {
    it('nastaví status=rejected s důvodem', async () => {
      mockRepo.findById.mockResolvedValue(
        makeSound({ worldId: null, status: 'pending' }),
      );
      mockRepo.updateById.mockResolvedValue(
        makeSound({
          worldId: null,
          status: 'rejected',
          rejectReason: 'Duplicita',
        }),
      );
      await service.rejectNomination('sound1', 'Duplicita');
      expect(mockRepo.updateById).toHaveBeenCalledWith('sound1', {
        status: 'rejected',
        rejectReason: 'Duplicita',
      });
    });

    it('vyhodí NotFoundException pokud zvuk není pending', async () => {
      mockRepo.findById.mockResolvedValue(
        makeSound({ worldId: null, status: 'active' }),
      );
      await expect(service.rejectNomination('sound1', 'důvod')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('importToWorld', () => {
    it('zkopíruje globální zvuk do světa s novým worldId', async () => {
      const globalSound = makeSound({ worldId: null, status: 'active' });
      mockRepo.findById.mockResolvedValue(globalSound);
      mockRepo.create.mockResolvedValue(
        makeSound({ id: 'new1', worldId: 'world1' }),
      );
      const result = await service.importToWorld('sound1', 'world1', 'pj1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          name: 'Dark Ambient',
          status: 'active',
          createdBy: 'pj1',
        }),
      );
      expect(result.worldId).toBe('world1');
    });

    it('vyhodí NotFoundException pokud globální zvuk neexistuje nebo není active', async () => {
      mockRepo.findById.mockResolvedValue(
        makeSound({ worldId: null, status: 'pending' }),
      );
      await expect(
        service.importToWorld('sound1', 'world1', 'pj1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateWorldSound', () => {
    it('aktualizuje zvuk světa', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue(
        makeSound({ name: 'Updated' }),
      );
      const result = await service.updateWorldSound('sound1', 'world1', {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });

    it('vyhodí NotFoundException pokud vrátí null', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue(null);
      await expect(
        service.updateWorldSound('sound1', 'world1', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateGlobalSound', () => {
    it('aktualizuje globální zvuk dle id', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null }));
      mockRepo.updateById.mockResolvedValue(
        makeSound({ worldId: null, name: 'Updated' }),
      );
      const result = await service.updateGlobalSound('sound1', {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });

    it('vyhodí NotFoundException pokud zvuk není globální', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world1' }));
      await expect(
        service.updateGlobalSound('sound1', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeWorldSound', () => {
    it('smaže world zvuk', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(true);
      await expect(
        service.removeWorldSound('sound1', 'world1'),
      ).resolves.toBeUndefined();
    });

    it('vyhodí NotFoundException pokud zvuk neexistuje', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(false);
      await expect(
        service.removeWorldSound('sound1', 'world1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeGlobalSound', () => {
    it('smaže globální zvuk', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null }));
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(
        service.removeGlobalSound('sound1'),
      ).resolves.toBeUndefined();
    });

    it('vyhodí NotFoundException pokud zvuk není globální', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world1' }));
      await expect(service.removeGlobalSound('sound1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertCanManageWorld', () => {
    it('propustí elevovaného Admina bez kontroly membershipu', async () => {
      await expect(
        service.assertCanManageWorld(
          {
            id: 'admin1',
            role: UserRole.Admin,
            username: 'a',
            elevatedWorldIds: ['world1'],
          },
          'world1',
        ),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('de-elevovaný Admin nemá bypass → padá na membership (nečlen → 403)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertCanManageWorld(
          { id: 'admin1', role: UserRole.Admin, username: 'a' },
          'world1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.findByUserAndWorld).toHaveBeenCalled();
    });

    it('propustí PJ daného světa', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      await expect(
        service.assertCanManageWorld(
          { id: 'pj1', role: UserRole.Hrac, username: 'p' },
          'world1',
        ),
      ).resolves.toBeUndefined();
    });

    it('propustí PomocnýPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        service.assertCanManageWorld(
          { id: 'ppj1', role: UserRole.Hrac, username: 'pp' },
          'world1',
        ),
      ).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertCanManageWorld(
          { id: 'user1', role: UserRole.Hrac, username: 'u' },
          'world1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // R-RUN-01 (plný audit 2026-06-20) — member gate na GET /worlds/:id/sounds.
  describe('assertIsMember', () => {
    it('odmítne nečlena světa (ForbiddenException)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertIsMember(
          { id: 'outsider', role: UserRole.Hrac, username: 'o' },
          'world1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('odmítne Zadatele (pending člen)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Zadatel,
      });
      await expect(
        service.assertIsMember(
          { id: 'pending', role: UserRole.Hrac, username: 'p' },
          'world1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('propustí běžného člena (Hráč)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.assertIsMember(
          { id: 'member', role: UserRole.Hrac, username: 'm' },
          'world1',
        ),
      ).resolves.toBeUndefined();
    });

    it('propustí elevovaného Admina bez kontroly membershipu', async () => {
      mockMembershipRepo.findByUserAndWorld.mockClear();
      await expect(
        service.assertIsMember(
          {
            id: 'admin1',
            role: UserRole.Admin,
            username: 'a',
            elevatedWorldIds: ['world1'],
          },
          'world1',
        ),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('de-elevovaný Admin nemá bypass → padá na membership (nečlen → 403)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.assertIsMember(
          { id: 'admin1', role: UserRole.Admin, username: 'a' },
          'world1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.findByUserAndWorld).toHaveBeenCalled();
    });
  });

  describe('assertIsAdmin', () => {
    it('propustí Admina', async () => {
      await expect(
        service.assertIsAdmin(UserRole.Admin),
      ).resolves.toBeUndefined();
    });

    it('propustí Superadmina', async () => {
      await expect(
        service.assertIsAdmin(UserRole.Superadmin),
      ).resolves.toBeUndefined();
    });

    it('odmítne PJ s ForbiddenException', async () => {
      await expect(service.assertIsAdmin(UserRole.PJ)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
