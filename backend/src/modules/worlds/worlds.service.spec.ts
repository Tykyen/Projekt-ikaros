import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorldsService } from './worlds.service';
import { WorldRole } from './interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
import { SystemPresetsService } from '../system-presets/system-presets.service';
import { WorldWeatherService } from '../world-weather/world-weather.service';
import { UsersService } from '../users/users.service';

const mockRequester = { id: 'user1', role: UserRole.Ikarus, username: 'user1' };

const mockWorld = {
  id: 'world1',
  name: 'Matrix',
  slug: 'matrix',
  ownerId: 'user1',
  isActive: true,
  accessMode: 'private',
  playerCount: 0,
  system: 'matrix',
  tones: [],
  dice: [],
  offeredCharacters: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('WorldsService', () => {
  let service: WorldsService;
  const mockWorldsRepo = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    existsBySlug: jest.fn(),
    findByOwnerId: jest.fn(),
    increment: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    updateCalendarConfig: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserId: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
  };
  const mockUsersService = {
    publicProfile: jest
      .fn()
      .mockResolvedValue({ id: 'user1', username: 'user1', avatarUrl: null }),
  };
  const mockSettingsRepo = {
    findByWorldId: jest.fn(),
    upsert: jest.fn(),
  };

  const mockCurrenciesService = { seedForWorld: jest.fn() };
  const mockSystemPresetsService = { findOne: jest.fn(), findAll: jest.fn() };
  const mockWeatherService = {
    seedDefaultForWorld: jest.fn().mockResolvedValue(undefined),
  };
  const mockDiarySchemaVersionsRepo = {
    findMetaByWorldId: jest.fn(),
    findByWorldIdAndVersion: jest.fn(),
    findLastVersion: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorldsService,
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldSettingsRepository', useValue: mockSettingsRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: WorldCurrenciesService, useValue: mockCurrenciesService },
        { provide: SystemPresetsService, useValue: mockSystemPresetsService },
        { provide: WorldWeatherService, useValue: mockWeatherService },
        {
          provide: 'IDiarySchemaVersionsRepository',
          useValue: mockDiarySchemaVersionsRepo,
        },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();
    service = module.get(WorldsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all active worlds', async () => {
      mockWorldsRepo.findAll.mockResolvedValue([mockWorld]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Matrix');
    });
  });

  describe('join', () => {
    it('should throw ForbiddenException for closed world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'closed',
      });
      await expect(service.join('world1', 'user2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException if user already member', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Hrac,
      });
      await expect(service.join('world1', 'user2')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should create membership with Hrac role for public world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'public',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Hrac,
      });
      const result = await service.join('world1', 'user2');
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorldRole.Hrac }),
      );
      expect(result.role).toBe(WorldRole.Hrac);
    });

    it('should create membership with Pending role for non-public world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'open',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Zadatel,
      });
      await service.join('world1', 'user2');
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorldRole.Zadatel }),
      );
    });

    it('neemituje event pokud membership je již Pending', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'private',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        userId: 'user2',
        worldId: 'world1',
        role: WorldRole.Zadatel,
        joinedAt: new Date(),
        akj: 0,
      });
      const emit = service['eventEmitter'].emit as jest.Mock;
      await service.join('world1', 'user2', 'Frodo');
      expect(emit).not.toHaveBeenCalledWith(
        'world.join.requested',
        expect.anything(),
      );
    });

    it('emituje world.join.requested s worldName a requesterName při private world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        name: 'Matrix',
        accessMode: 'private',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        userId: 'user2',
        worldId: 'world1',
        role: WorldRole.Zadatel,
        joinedAt: new Date(),
        akj: 0,
      });
      const emit = service['eventEmitter'].emit as jest.Mock;
      await service.join('world1', 'user2', 'Frodo');
      expect(emit).toHaveBeenCalledWith('world.join.requested', {
        worldId: 'world1',
        worldName: 'Matrix',
        requesterId: 'user2',
        requesterName: 'Frodo',
      });
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException for unknown world', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should allow PJ in world to update', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mem-pj',
        userId: 'user1',
        worldId: 'world1',
        role: WorldRole.PJ,
        joinedAt: new Date(),
        akj: 0,
      });
      mockWorldsRepo.update.mockResolvedValue({
        ...mockWorld,
        name: 'Updated',
      });
      const result = await service.update(
        'world1',
        { name: 'Updated' },
        mockRequester,
      );
      expect(result.name).toBe('Updated');
    });

    it('should deny owner WITHOUT membership (vlastník ≠ PJ)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld); // ownerId: 'user1' = mockRequester.id
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.update('world1', { name: 'X' }, mockRequester),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Admin to update any world', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        ownerId: 'other',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockWorldsRepo.update.mockResolvedValue({
        ...mockWorld,
        name: 'Updated',
      });
      const adminUser = {
        id: 'admin1',
        role: UserRole.Admin,
        username: 'admin1',
      };
      const result = await service.update(
        'world1',
        { name: 'Updated' },
        adminUser,
      );
      expect(result.name).toBe('Updated');
    });

    it('should throw ForbiddenException for non-owner without sufficient role', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        ownerId: 'other',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.update('world1', {}, mockRequester)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateMemberFree', () => {
    it('nastaví isFree na true pokud je requester PJ ve světě', async () => {
      const pj = { id: 'user1', role: UserRole.Ikarus, username: 'pj' };
      const targetMembership = {
        id: 'mem1',
        worldId: 'world1',
        userId: 'u1',
        role: WorldRole.Hrac,
        isFree: false,
        joinedAt: new Date(),
        akj: 0,
      };
      const requesterPjMembership = {
        id: 'mem-pj',
        worldId: 'world1',
        userId: 'user1',
        role: WorldRole.PJ,
        joinedAt: new Date(),
        akj: 0,
      };
      mockMembershipRepo.findById.mockResolvedValue(targetMembership);
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        requesterPjMembership,
      );
      mockMembershipRepo.update.mockResolvedValue({
        ...targetMembership,
        isFree: true,
      });

      const result = await service.updateMemberFree('mem1', true, pj);

      expect(mockMembershipRepo.update).toHaveBeenCalledWith('mem1', {
        isFree: true,
      });
      expect(result.isFree).toBe(true);
    });

    it('hodí ForbiddenException pro vlastníka světa BEZ membershipu (vlastník ≠ PJ)', async () => {
      const ownerWithoutMembership = {
        id: 'user1',
        role: UserRole.Ikarus,
        username: 'owner',
      };
      const targetMembership = {
        id: 'mem1',
        worldId: 'world1',
        userId: 'u1',
        role: WorldRole.Hrac,
        isFree: false,
        joinedAt: new Date(),
        akj: 0,
      };
      mockMembershipRepo.findById.mockResolvedValue(targetMembership);
      mockWorldsRepo.findById.mockResolvedValue(mockWorld); // ownerId: 'user1', ale bez membershipu
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);

      await expect(
        service.updateMemberFree('mem1', true, ownerWithoutMembership),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí ForbiddenException pokud requester nemá dostatečná oprávnění', async () => {
      const hrac = { id: 'u99', role: UserRole.Ikarus, username: 'u99' };
      const membership = {
        id: 'mem1',
        worldId: 'world1',
        userId: 'u1',
        role: WorldRole.Hrac,
        isFree: false,
        joinedAt: new Date(),
        akj: 0,
      };
      mockMembershipRepo.findById.mockResolvedValue(membership);
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);

      await expect(
        service.updateMemberFree('mem1', true, hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí NotFoundException pokud membership neexistuje po update', async () => {
      const pj = { id: 'user1', role: UserRole.Ikarus, username: 'pj' };
      const targetMembership = {
        id: 'mem1',
        worldId: 'world1',
        userId: 'u1',
        role: WorldRole.Hrac,
        isFree: false,
        joinedAt: new Date(),
        akj: 0,
      };
      const requesterPjMembership = {
        id: 'mem-pj',
        worldId: 'world1',
        userId: 'user1',
        role: WorldRole.PJ,
        joinedAt: new Date(),
        akj: 0,
      };
      mockMembershipRepo.findById.mockResolvedValue(targetMembership);
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
        requesterPjMembership,
      );
      mockMembershipRepo.update.mockResolvedValue(null);

      await expect(service.updateMemberFree('mem1', true, pj)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findMyWorlds', () => {
    it('should use findByIds to avoid N+1', async () => {
      const memberships = [
        {
          id: 'm1',
          worldId: 'world1',
          userId: 'user1',
          role: WorldRole.Hrac,
          joinedAt: new Date(),
          akj: 0,
        },
        {
          id: 'm2',
          worldId: 'world2',
          userId: 'user1',
          role: WorldRole.Hrac,
          joinedAt: new Date(),
          akj: 0,
        },
      ];
      mockMembershipRepo.findByUserId.mockResolvedValue(memberships);
      mockWorldsRepo.findByIds.mockResolvedValue([
        mockWorld,
        { ...mockWorld, id: 'world2' },
      ]);
      const result = await service.findMyWorlds('user1');
      expect(mockWorldsRepo.findByIds).toHaveBeenCalledWith([
        'world1',
        'world2',
      ]);
      expect(mockWorldsRepo.findById).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('updateCalendarConfig', () => {
    const otherWorld = { ...mockWorld, id: 'world2', ownerId: 'owner99' };
    const config = {
      daysOfWeek: ['Po', 'Út'],
      months: [{ name: 'Leden', daysCount: 31 }],
      celestialBodies: [],
    };

    it('PomocnyPJ ve světě → smí zapsat', async () => {
      mockWorldsRepo.findById.mockResolvedValue(otherWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        userId: 'user1',
        worldId: 'world2',
        role: WorldRole.PomocnyPJ,
        akj: 0,
        joinedAt: new Date(),
      });
      mockWorldsRepo.updateCalendarConfig.mockResolvedValue({
        ...otherWorld,
        calendarConfig: config,
      });

      const result = await service.updateCalendarConfig(
        'world2',
        config,
        mockRequester,
      );
      expect(mockWorldsRepo.updateCalendarConfig).toHaveBeenCalledWith(
        'world2',
        config,
      );
      expect(result.calendarConfig).toEqual(config);
    });

    it('PJ ve světě → smí zapsat', async () => {
      mockWorldsRepo.findById.mockResolvedValue(otherWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        userId: 'user1',
        worldId: 'world2',
        role: WorldRole.PJ,
        akj: 0,
        joinedAt: new Date(),
      });
      mockWorldsRepo.updateCalendarConfig.mockResolvedValue({
        ...otherWorld,
        calendarConfig: config,
      });
      await service.updateCalendarConfig('world2', config, mockRequester);
      expect(mockWorldsRepo.updateCalendarConfig).toHaveBeenCalled();
    });

    it('Hrac ve světě → 403', async () => {
      mockWorldsRepo.findById.mockResolvedValue(otherWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        userId: 'user1',
        worldId: 'world2',
        role: WorldRole.Hrac,
        akj: 0,
        joinedAt: new Date(),
      });
      await expect(
        service.updateCalendarConfig('world2', config, mockRequester),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Globální Admin (bez membershipu) → smí zapsat', async () => {
      const admin = { id: 'admin1', role: UserRole.Admin, username: 'admin' };
      mockWorldsRepo.findById.mockResolvedValue(otherWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockWorldsRepo.updateCalendarConfig.mockResolvedValue({
        ...otherWorld,
        calendarConfig: config,
      });
      await service.updateCalendarConfig('world2', config, admin);
      expect(mockWorldsRepo.updateCalendarConfig).toHaveBeenCalled();
    });

    it('Vlastník bez membershipu → 403', async () => {
      const ownerWorld = { ...mockWorld, id: 'world3', ownerId: 'user1' };
      mockWorldsRepo.findById.mockResolvedValue(ownerWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.updateCalendarConfig('world3', config, mockRequester),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Neexistující svět → 404', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateCalendarConfig('nope', config, mockRequester),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create — seed default weather generator', () => {
    it('zavolá weatherService.seedDefaultForWorld s world.id a dto.genre po worlds.save', async () => {
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'W1', system: 'matrix' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);

      await service.create(
        { name: 'Test', slug: 'test', genre: 'fantasy' },
        'u1',
      );

      expect(mockWeatherService.seedDefaultForWorld).toHaveBeenCalledWith(
        'W1',
        'fantasy',
      );
    });

    it('bez genre → volá seedDefaultForWorld s fallback "other"', async () => {
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'W2', system: 'matrix' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);

      await service.create({ name: 'NoGenre', slug: 'no-genre' }, 'u1');

      expect(mockWeatherService.seedDefaultForWorld).toHaveBeenCalledWith(
        'W2',
        'other',
      );
    });
  });

  describe('create — auto-seed diarySchema dle systému', () => {
    it('známý systém → seedne diarySchema z presetu', async () => {
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'dnd5e',
        displayName: 'D&D 5e',
        schema: [{ key: 'level', label: 'Úroveň', type: 'number', order: 1 }],
      });
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'W1', system: 'dnd5e' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);

      await service.create({ name: 'X', slug: 'x', system: 'dnd5e' }, 'u1');

      expect(mockSystemPresetsService.findOne).toHaveBeenCalledWith('dnd5e');
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({
          diarySchema: [
            { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
          ],
        }),
      );
    });

    it('neznámý systém → diarySchema = []', async () => {
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'W1', system: 'custom' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);

      await service.create({ name: 'X', slug: 'x', system: 'custom' }, 'u1');

      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({ diarySchema: [] }),
      );
    });
  });

  describe('isSlugAvailable — krok 2.3 D-NEW-slug-check', () => {
    it('vrátí true, pokud slug není v DB', async () => {
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      expect(await service.isSlugAvailable('volny-slug')).toBe(true);
    });

    it('vrátí false, pokud je slug obsazený', async () => {
      mockWorldsRepo.existsBySlug.mockResolvedValue(true);
      expect(await service.isSlugAvailable('obsazeny')).toBe(false);
    });

    it('vrátí false pro neplatný formát (mezery, velká písmena)', async () => {
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      expect(await service.isSlugAvailable('Špatný Slug')).toBe(false);
      expect(await service.isSlugAvailable('a')).toBe(false); // < 2 znaky
    });
  });

  describe('create — krok 2.3 D-NEW-quota', () => {
    it('Ikarus (běžný uživatel) s 30 aktivními světy dostane WORLD_QUOTA_REACHED', async () => {
      mockWorldsRepo.findByOwnerId.mockResolvedValue(
        Array.from({ length: 30 }, (_, i) => ({ id: `w${i}` })),
      );

      await expect(
        service.create(
          { name: 'ThirtyFirst', slug: 'thirty-first' },
          'u1',
          UserRole.Ikarus,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Admin nemá limit (skip quota check)', async () => {
      mockWorldsRepo.findByOwnerId.mockResolvedValue(
        Array.from({ length: 99 }, (_, i) => ({ id: `w${i}` })),
      );
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({
        ...mockWorld,
        id: 'W1',
        system: 'matrix',
      });
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);
      mockSettingsRepo.upsert.mockResolvedValue({});
      mockMembershipRepo.save.mockResolvedValue({ id: 'M1' });

      await expect(
        service.create({ name: 'Big', slug: 'big' }, 'admin', UserRole.Admin),
      ).resolves.toBeDefined();
    });

    it('chybějící ownerRole (legacy / seed) skip quota check', async () => {
      // Žádné findByOwnerId.mock — pokud by byl volaný, jest hodí undefined.
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ ...mockWorld, id: 'W1' });
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);
      mockSettingsRepo.upsert.mockResolvedValue({});
      mockMembershipRepo.save.mockResolvedValue({ id: 'M1' });

      await expect(
        service.create({ name: 'Seed', slug: 'seed' }, 'u1'),
      ).resolves.toBeDefined();
      expect(mockWorldsRepo.findByOwnerId).not.toHaveBeenCalled();
    });
  });

  describe('create — krok 2.3 forward tones/dice/playersWanted', () => {
    it('propaguje nová DTO pole do worldsRepo.save', async () => {
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({
        ...mockWorld,
        id: 'W1',
        system: 'matrix',
      });
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);
      mockSettingsRepo.upsert.mockResolvedValue({});
      mockMembershipRepo.save.mockResolvedValue({ id: 'M1' });

      await service.create(
        {
          name: 'Test',
          slug: 'test',
          tones: ['Temný', 'Hrdinský'],
          dice: ['d20', 'd6'],
          playersWanted: 'aktivní hráče',
        },
        'u1',
      );

      expect(mockWorldsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tones: ['Temný', 'Hrdinský'],
          dice: ['d20', 'd6'],
          playersWanted: 'aktivní hráče',
        }),
      );
    });
  });

  describe('update — archive + re-seed při změně system', () => {
    const Admin = { id: 'u1', role: 2, username: 'a' } as const;
    const existingWorld = {
      id: 'W1',
      system: 'dnd5e',
      ownerId: 'someone',
    };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(existingWorld);
      mockWorldsRepo.update.mockResolvedValue({
        ...existingWorld,
        system: 'drd-hero',
      });
    });

    it('změna system + neprázdné stávající schéma → archivace + re-seed', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(0);
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [{ key: 'sila', label: 'Síla', type: 'number', order: 1 }],
      });

      await service.update('W1', { system: 'drd-hero' }, Admin);

      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'W1',
          version: 1,
          system: 'dnd5e',
          schema: [{ key: 'level', label: 'Level', type: 'number', order: 1 }],
        }),
      );
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({
          diarySchema: [
            { key: 'sila', label: 'Síla', type: 'number', order: 1 },
          ],
        }),
      );
    });

    it('změna system + prázdné stávající schéma → bez archivace, jen re-seed', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [],
      });
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [{ key: 'sila', label: 'Síla', type: 'number', order: 1 }],
      });

      await service.update('W1', { system: 'drd-hero' }, Admin);

      expect(mockDiarySchemaVersionsRepo.create).not.toHaveBeenCalled();
      expect(mockSettingsRepo.upsert).toHaveBeenCalled();
    });

    it('bez změny system → ani archivace, ani re-seed', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });

      await service.update(
        'W1',
        { name: 'New name' }, // bez system field
        Admin,
      );

      expect(mockDiarySchemaVersionsRepo.create).not.toHaveBeenCalled();
      expect(mockSettingsRepo.upsert).not.toHaveBeenCalled();
    });

    it('změna system na neznámý → archivace + diarySchema = []', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(0);
      mockSystemPresetsService.findOne.mockReturnValue(null);

      await service.update('W1', { system: 'custom' }, Admin);

      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalled();
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({ diarySchema: [] }),
      );
    });

    it('verze auto-increment per world (last=2 → next=3)', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(2);
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [],
      });

      await service.update('W1', { system: 'drd-hero' }, Admin);

      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 3 }),
      );
    });
  });

  describe('getDiarySchemaVersions — listing meta', () => {
    const Hrac = { id: 'u1', role: 9, username: 'h' } as const;

    it('member: vrátí meta pole bez schema[]', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockDiarySchemaVersionsRepo.findMetaByWorldId.mockResolvedValue([
        { version: 2, system: 'dnd5e', archivedAt: new Date() },
        { version: 1, system: 'gurps', archivedAt: new Date() },
      ]);

      const result = await service.getDiarySchemaVersions('W1', Hrac);
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('schema');
    });

    it('non-member: 403', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getDiarySchemaVersions('W1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('neexistující svět: 404', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(
        service.getDiarySchemaVersions('fake', Hrac),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('Pending člen (role -1): 403', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 0 });
      await expect(
        service.getDiarySchemaVersions('W1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('getDiarySchemaVersion — detail', () => {
    const Hrac = { id: 'u1', role: 9, username: 'h' } as const;

    it('member + existující verze: vrátí plný DiarySchemaVersion', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockDiarySchemaVersionsRepo.findByWorldIdAndVersion.mockResolvedValue({
        id: 'v1',
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [{ key: 'level', label: 'Level', type: 'number', order: 1 }],
        archivedAt: new Date(),
      });

      const result = await service.getDiarySchemaVersion('W1', 1, Hrac);
      expect(result.schema).toHaveLength(1);
    });

    it('member + neexistující verze: 404', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockDiarySchemaVersionsRepo.findByWorldIdAndVersion.mockResolvedValue(
        null,
      );
      await expect(
        service.getDiarySchemaVersion('W1', 99, Hrac),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // 2.4 — populate owner v findById
  describe('findById (2.4 owner populate)', () => {
    it('populate owner do response', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockUsersService.publicProfile.mockResolvedValueOnce({
        id: 'user1',
        username: 'tomas',
        avatarUrl: 'http://x/a.png',
      });
      const result = await service.findById('world1');
      expect(result.owner).toEqual({
        id: 'user1',
        username: 'tomas',
        avatarUrl: 'http://x/a.png',
      });
    });

    it('owner zůstává undefined při smazaném účtu', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockUsersService.publicProfile.mockRejectedValueOnce(
        new NotFoundException(),
      );
      const result = await service.findById('world1');
      expect(result.owner).toBeUndefined();
    });
  });

  // 2.4 — accept/reject pending Zadatel žádosti
  describe('acceptJoinRequest (2.4)', () => {
    const ownerRequester = {
      id: 'user1',
      role: UserRole.Ikarus,
      username: 'tomas',
    };
    const pendingMembership = {
      id: 'm1',
      userId: 'u2',
      worldId: 'world1',
      role: WorldRole.Zadatel,
      joinedAt: new Date(),
      akj: 0,
    };

    it('owner promote Zadatel→Hrac + playerCount++', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findById.mockResolvedValue(pendingMembership);
      mockMembershipRepo.update.mockResolvedValue({
        ...pendingMembership,
        role: WorldRole.Hrac,
      });

      const result = await service.acceptJoinRequest(
        'world1',
        'm1',
        ownerRequester,
      );

      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m1', {
        role: WorldRole.Hrac,
      });
      expect(mockWorldsRepo.increment).toHaveBeenCalledWith(
        'world1',
        'playerCount',
        1,
      );
      expect(result.ok).toBe(true);
      expect(result.membership.role).toBe(WorldRole.Hrac);
    });

    it('non-owner Hrac → ForbiddenException', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      const intruder = {
        id: 'u2',
        role: UserRole.Ikarus,
        username: 'pepa',
      };
      await expect(
        service.acceptJoinRequest('world1', 'm1', intruder),
      ).rejects.toThrow(ForbiddenException);
    });

    it('membership není pending → BadRequestException', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findById.mockResolvedValue({
        ...pendingMembership,
        role: WorldRole.Hrac,
      });
      await expect(
        service.acceptJoinRequest('world1', 'm1', ownerRequester),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('rejectJoinRequest (2.4)', () => {
    const ownerRequester = {
      id: 'user1',
      role: UserRole.Ikarus,
      username: 'tomas',
    };
    const pendingMembership = {
      id: 'm1',
      userId: 'u2',
      worldId: 'world1',
      role: WorldRole.Zadatel,
      joinedAt: new Date(),
      akj: 0,
    };

    it('owner delete pending membership', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findById.mockResolvedValue(pendingMembership);
      mockMembershipRepo.delete.mockResolvedValue(true);

      const result = await service.rejectJoinRequest(
        'world1',
        'm1',
        ownerRequester,
      );

      expect(mockMembershipRepo.delete).toHaveBeenCalledWith('m1');
      expect(result.ok).toBe(true);
    });

    it('Admin smí rejectnout v cizím světě', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findById.mockResolvedValue(pendingMembership);
      mockMembershipRepo.delete.mockResolvedValue(true);

      const admin = { id: 'admX', role: UserRole.Admin, username: 'A' };
      await expect(
        service.rejectJoinRequest('world1', 'm1', admin),
      ).resolves.toEqual({ ok: true });
    });
  });
});
