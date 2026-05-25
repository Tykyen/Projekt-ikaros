import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getConnectionToken } from '@nestjs/mongoose';
import { WorldsService } from './worlds.service';
import { WorldRole } from './interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
import { SystemPresetsService } from '../system-presets/system-presets.service';
import { WorldWeatherService } from '../world-weather/world-weather.service';
import { UsersService } from '../users/users.service';
import { WorldCalendarConfigService } from '../world-calendar-config/world-calendar-config.service';

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
    findByCurrentOrPreviousSlug: jest.fn(),
    renameSlug: jest.fn(),
    existsBySlug: jest.fn(),
    findByOwnerId: jest.fn(),
    increment: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    clearThemeBackgroundUrl: jest.fn(),
    migrateEmptyThemeBackgroundUrls: jest
      .fn()
      .mockResolvedValue({ updated: 0 }),
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
  const mockAccessRequestRepo = {
    findById: jest.fn(),
    findByUserAndWorld: jest.fn(),
    findByUserId: jest.fn(),
    countAcrossWorlds: jest.fn(),
    findPaginatedAcrossWorlds: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteByUserAndWorld: jest.fn(),
  };

  const mockCurrenciesService = { seedForWorld: jest.fn() };
  const mockSystemPresetsService = { findOne: jest.fn(), findAll: jest.fn() };
  const mockWeatherService = {
    seedDefaultForWorld: jest.fn().mockResolvedValue(undefined),
  };
  const mockCalendarConfigService = {
    seedGregorianDefault: jest.fn().mockResolvedValue({ slug: 'gregorian' }),
    getConfigInternal: jest.fn(),
  };
  const mockDiarySchemaVersionsRepo = {
    findMetaByWorldId: jest.fn(),
    findByWorldIdAndVersion: jest.fn(),
    findLastVersion: jest.fn(),
    findActive: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    archive: jest.fn().mockResolvedValue(undefined),
  };

  // D-061 — default: simuluje "replica set chybí" → fallback path.
  // Jednotlivé testy mohou tento mock přepsat na success.
  const mockSession = {
    withTransaction: jest.fn(async (cb: () => Promise<unknown>) => {
      await cb();
    }),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const mockConnection = {
    startSession: jest.fn().mockResolvedValue(mockSession),
  };

  beforeEach(async () => {
    // Reset mock session do default success path před každým testem.
    mockSession.withTransaction.mockImplementation(
      async (cb: () => Promise<unknown>) => {
        await cb();
      },
    );
    const module = await Test.createTestingModule({
      providers: [
        WorldsService,
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldSettingsRepository', useValue: mockSettingsRepo },
        {
          provide: 'IWorldAccessRequestRepository',
          useValue: mockAccessRequestRepo,
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: WorldCurrenciesService, useValue: mockCurrenciesService },
        { provide: SystemPresetsService, useValue: mockSystemPresetsService },
        { provide: WorldWeatherService, useValue: mockWeatherService },
        {
          provide: 'IDiarySchemaVersionsRepository',
          useValue: mockDiarySchemaVersionsRepo,
        },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: WorldCalendarConfigService,
          useValue: mockCalendarConfigService,
        },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();
    service = module.get(WorldsService);
    jest.clearAllMocks();
    // Re-aplikuj default po clearAllMocks (jinak by withTransaction byl no-op).
    mockSession.withTransaction.mockImplementation(
      async (cb: () => Promise<unknown>) => {
        await cb();
      },
    );
  });

  describe('findAll', () => {
    it('should return all active worlds', async () => {
      mockWorldsRepo.findAll.mockResolvedValue([mockWorld]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Matrix');
    });
  });

  describe('joinPublic (2.4)', () => {
    it('public world → creates Ctenar membership', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'public',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockAccessRequestRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        userId: 'u2',
        worldId: 'world1',
        role: WorldRole.Ctenar,
        joinedAt: new Date(),
        akj: 0,
      });
      const result = await service.joinPublic('world1', 'u2');
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorldRole.Ctenar }),
      );
      expect(result.role).toBe(WorldRole.Ctenar);
    });

    it('non-public world → BadRequestException', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'open',
      });
      await expect(service.joinPublic('world1', 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('closed world → ForbiddenException', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'closed',
      });
      await expect(service.joinPublic('world1', 'u2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('already member → ConflictException', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'public',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Hrac,
      });
      await expect(service.joinPublic('world1', 'u2')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('requestAccess (2.4)', () => {
    it('open world → creates AccessRequest', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'open',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockAccessRequestRepo.create.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'u2',
        requestedAt: new Date(),
      });
      const result = await service.requestAccess('world1', 'u2');
      expect(mockAccessRequestRepo.create).toHaveBeenCalledWith({
        worldId: 'world1',
        userId: 'u2',
      });
      expect(result.id).toBe('ar1');
    });

    it('private world → creates AccessRequest + emits world.access.requested', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'private',
        ownerId: 'pj1',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockAccessRequestRepo.create.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'u2',
        requestedAt: new Date(),
      });
      const emit = service['eventEmitter'].emit as jest.Mock;
      await service.requestAccess('world1', 'u2');
      expect(emit).toHaveBeenCalledWith(
        'world.access.requested',
        expect.objectContaining({
          accessRequestId: 'ar1',
          worldId: 'world1',
          ownerId: 'pj1',
          requesterId: 'u2',
        }),
      );
    });

    it('public world → BadRequestException', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'public',
      });
      await expect(service.requestAccess('world1', 'u2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('already member → ConflictException', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        accessMode: 'open',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Hrac,
      });
      await expect(service.requestAccess('world1', 'u2')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancelAccessRequest (2.4)', () => {
    it('deletes own pending AR', async () => {
      mockAccessRequestRepo.findByUserAndWorld.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'u2',
        requestedAt: new Date(),
      });
      mockAccessRequestRepo.delete.mockResolvedValue(true);
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      const result = await service.cancelAccessRequest('world1', 'u2');
      expect(mockAccessRequestRepo.delete).toHaveBeenCalledWith('ar1');
      expect(result.ok).toBe(true);
    });

    it('non-existent AR → NotFoundException', async () => {
      mockAccessRequestRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.cancelAccessRequest('world1', 'u2')).rejects.toThrow(
        NotFoundException,
      );
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

  describe('updateAkjTypes (krok 5.3d)', () => {
    const akjTypes = [
      { key: 'verejne', name: 'Veřejné', level: 0 },
      { key: 'tajne', name: 'Tajný spis', level: 1 },
    ];

    it('uloží AKJ úrovně pokud je requester PomocnyPJ', async () => {
      const pomocnyPj = { id: 'user1', role: UserRole.Ikarus, username: 'pp' };
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mem-pp',
        worldId: 'world1',
        userId: 'user1',
        role: WorldRole.PomocnyPJ,
        joinedAt: new Date(),
        akj: 0,
      });
      mockSettingsRepo.upsert.mockResolvedValue({
        worldId: 'world1',
        akjTypes,
      });

      const result = await service.updateAkjTypes(
        'world1',
        { akjTypes },
        pomocnyPj,
      );

      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith('world1', {
        akjTypes,
      });
      expect(result.akjTypes).toEqual(akjTypes);
    });

    it('hodí ForbiddenException pokud je requester jen Hráč', async () => {
      const hrac = { id: 'u99', role: UserRole.Ikarus, username: 'u99' };
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mem-h',
        worldId: 'world1',
        userId: 'u99',
        role: WorldRole.Hrac,
        joinedAt: new Date(),
        akj: 0,
      });

      await expect(
        service.updateAkjTypes('world1', { akjTypes }, hrac),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSettingsRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('transferOwnership (D-NEW-world-transfer)', () => {
    const owner = { id: 'user1', role: UserRole.Ikarus, username: 'owner' };

    it('vlastník předá svět členovi — nový PJ, starý PomocnyPJ, ownerId změněn', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld
        .mockResolvedValueOnce({
          id: 'mem-new',
          worldId: 'world1',
          userId: 'u2',
          role: WorldRole.Hrac,
          joinedAt: new Date(),
          akj: 0,
        })
        .mockResolvedValueOnce({
          id: 'mem-old',
          worldId: 'world1',
          userId: 'user1',
          role: WorldRole.PJ,
          joinedAt: new Date(),
          akj: 0,
        });
      mockWorldsRepo.update.mockResolvedValue({
        ...mockWorld,
        ownerId: 'u2',
      });

      const result = await service.transferOwnership('world1', 'u2', owner);

      expect(mockMembershipRepo.update).toHaveBeenCalledWith('mem-new', {
        role: WorldRole.PJ,
      });
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('mem-old', {
        role: WorldRole.PomocnyPJ,
      });
      expect(mockWorldsRepo.update).toHaveBeenCalledWith('world1', {
        ownerId: 'u2',
      });
      expect(result.ownerId).toBe('u2');
    });

    it('ForbiddenException pokud requester není vlastník ani admin', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      const stranger = {
        id: 'u99',
        role: UserRole.Ikarus,
        username: 'cizi',
      };
      await expect(
        service.transferOwnership('world1', 'u2', stranger),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BadRequestException pokud nový vlastník není člen světa', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValueOnce(null);
      await expect(
        service.transferOwnership('world1', 'u-ghost', owner),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMembers (krok 5.3 — enrich user summary)', () => {
    it('připojí ke každému členu public summary uživatele', async () => {
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        {
          id: 'mem1',
          worldId: 'world1',
          userId: 'user1',
          role: WorldRole.Hrac,
          joinedAt: new Date(),
          akj: 0,
        },
      ]);
      mockUsersService.publicProfile.mockResolvedValueOnce({
        id: 'user1',
        username: 'Aragorn',
        avatarUrl: null,
      });

      const result = await service.getMembers('world1');

      expect(result[0].user?.username).toBe('Aragorn');
    });

    it('člen se smazaným účtem zůstane bez `user` (žádný throw)', async () => {
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        {
          id: 'mem1',
          worldId: 'world1',
          userId: 'ghost',
          role: WorldRole.Hrac,
          joinedAt: new Date(),
          akj: 0,
        },
      ]);
      mockUsersService.publicProfile.mockRejectedValueOnce(
        new Error('not found'),
      );

      const result = await service.getMembers('world1');

      expect(result[0].user).toBeUndefined();
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

  // 9.2b — `updateCalendarConfig` describe smazán; calendar config se zapisuje
  // přes `world-calendar-config` modul (multi-config kolekce).

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

  // Krok 6.3 D-NEW-dice-default-set — výchozí dice set per RPG systém.
  describe('create — krok 6.3 default dice set', () => {
    beforeEach(() => {
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);
      mockSettingsRepo.upsert.mockResolvedValue({});
      mockMembershipRepo.save.mockResolvedValue({ id: 'M1' });
      mockWorldsRepo.save.mockResolvedValue({ ...mockWorld, id: 'W1' });
    });

    it('matrix system → default dice: [fate]', async () => {
      await service.create({ name: 'T', slug: 't', system: 'matrix' }, 'u1');
      expect(mockWorldsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ dice: ['fate'] }),
      );
    });

    it('dnd5e system → default dice: full polyhedral + d100', async () => {
      await service.create({ name: 'T', slug: 't', system: 'dnd5e' }, 'u1');
      expect(mockWorldsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dice: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'],
        }),
      );
    });

    it('neznámý system → fallback [fate, d6, d20]', async () => {
      await service.create(
        { name: 'T', slug: 't', system: 'made-up-rpg' },
        'u1',
      );
      expect(mockWorldsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ dice: ['fate', 'd6', 'd20'] }),
      );
    });

    it('DTO s explicitním dice → priorita před default', async () => {
      await service.create(
        {
          name: 'T',
          slug: 't',
          system: 'dnd5e',
          dice: ['d20'],
        },
        'u1',
      );
      expect(mockWorldsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ dice: ['d20'] }),
      );
    });

    it('DTO s prázdným dice [] → fallback na default per system', async () => {
      await service.create(
        { name: 'T', slug: 't', system: 'matrix', dice: [] },
        'u1',
      );
      expect(mockWorldsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ dice: ['fate'] }),
      );
    });
  });

  // Krok 6.3 — backfill bootstrap pro existující světy s prázdným dice.
  describe('onApplicationBootstrap — dice backfill', () => {
    it('doplní default dice světu s dice: []', async () => {
      mockWorldsRepo.findAll.mockResolvedValue([
        { id: 'W1', system: 'dnd5e', dice: [] },
        { id: 'W2', system: 'matrix', dice: [] },
      ]);
      mockWorldsRepo.update.mockResolvedValue({});

      await service.onApplicationBootstrap();

      expect(mockWorldsRepo.update).toHaveBeenCalledTimes(2);
      expect(mockWorldsRepo.update).toHaveBeenCalledWith('W1', {
        dice: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'],
      });
      expect(mockWorldsRepo.update).toHaveBeenCalledWith('W2', {
        dice: ['fate'],
      });
    });

    it('idempotentní — světy s neprázdným dice se nepřepíší', async () => {
      mockWorldsRepo.findAll.mockResolvedValue([
        { id: 'W1', system: 'dnd5e', dice: ['d20'] },
        { id: 'W2', system: 'matrix', dice: ['fate'] },
      ]);
      mockWorldsRepo.update.mockResolvedValue({});

      await service.onApplicationBootstrap();

      expect(mockWorldsRepo.update).not.toHaveBeenCalled();
    });

    it('chyba v findAll nevyhodí — jen zaloguje', async () => {
      mockWorldsRepo.findAll.mockRejectedValue(new Error('DB down'));
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
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

    it('změna system + existující aktivní verze → archive(active) + create(new, archivedAt: null) (8.5)', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findActive.mockResolvedValue({
        id: 'v1',
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [{ key: 'level', label: 'Level', type: 'number', order: 1 }],
        archivedAt: null,
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(1);
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [{ key: 'sila', label: 'Síla', type: 'number', order: 1 }],
      });

      await service.update('W1', { system: 'drd-hero' }, Admin);

      // Předchozí aktivní byla archivována.
      expect(mockDiarySchemaVersionsRepo.archive).toHaveBeenCalledWith('W1', 1);
      // Nová aktivní vytvořená pro nový system, schéma = preset.
      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'W1',
          version: 2,
          system: 'drd-hero',
          schema: [{ key: 'sila', label: 'Síla', type: 'number', order: 1 }],
          archivedAt: null,
        }),
      );
      // Live aktivní v settings je nový preset.
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({
          diarySchema: [
            { key: 'sila', label: 'Síla', type: 'number', order: 1 },
          ],
        }),
      );
    });

    it('změna system bez aktivní verze v tabulce → bez archive, ale create nová verze (8.5)', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [],
      });
      mockDiarySchemaVersionsRepo.findActive.mockResolvedValue(null);
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(0);
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [{ key: 'sila', label: 'Síla', type: 'number', order: 1 }],
      });

      await service.update('W1', { system: 'drd-hero' }, Admin);

      expect(mockDiarySchemaVersionsRepo.archive).not.toHaveBeenCalled();
      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          system: 'drd-hero',
          archivedAt: null,
        }),
      );
      expect(mockSettingsRepo.upsert).toHaveBeenCalled();
    });

    it('bez změny system → ani archive, ani create', async () => {
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

      expect(mockDiarySchemaVersionsRepo.archive).not.toHaveBeenCalled();
      expect(mockDiarySchemaVersionsRepo.create).not.toHaveBeenCalled();
      expect(mockSettingsRepo.upsert).not.toHaveBeenCalled();
    });

    it('změna system na neznámý → archive + create se schématem [] (8.5)', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findActive.mockResolvedValue({
        id: 'v1',
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [{ key: 'level', label: 'Level', type: 'number', order: 1 }],
        archivedAt: null,
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(1);
      mockSystemPresetsService.findOne.mockReturnValue(null);

      await service.update('W1', { system: 'custom' }, Admin);

      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ schema: [], archivedAt: null }),
      );
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
      mockDiarySchemaVersionsRepo.findActive.mockResolvedValue(null);
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

  // 8.5-BE-1 — createDiarySchemaVersion
  describe('createDiarySchemaVersion (8.5)', () => {
    const PJ = { id: 'pj1', role: 9, username: 'pj' } as const;
    const Hrac = { id: 'hr1', role: 9, username: 'hrac' } as const;
    const newSchema = [
      { key: 'sila', label: 'Síla', type: 'stat' as const, order: 0 },
    ];

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1', system: 'dnd5e' });
      // PJ = WorldRole.PJ (5), Hrac = WorldRole.Hrac (2) — pod PJ+ guard
      mockMembershipRepo.findByUserAndWorld.mockImplementation(
        (userId: string) =>
          Promise.resolve(userId === 'pj1' ? { role: 5 } : { role: 2 }),
      );
    });

    it('PJ + existující aktivní → archive(active) + create(version+1, archivedAt: null)', async () => {
      mockDiarySchemaVersionsRepo.findActive.mockResolvedValue({
        id: 'v1',
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [],
        archivedAt: null,
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(1);
      mockDiarySchemaVersionsRepo.create.mockResolvedValue({
        id: 'v2',
        worldId: 'W1',
        version: 2,
        system: 'dnd5e',
        schema: newSchema,
        archivedAt: null,
      });

      const result = await service.createDiarySchemaVersion(
        'W1',
        { schema: newSchema },
        PJ,
      );

      expect(mockDiarySchemaVersionsRepo.archive).toHaveBeenCalledWith('W1', 1);
      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'W1',
          version: 2,
          schema: newSchema,
          archivedAt: null,
        }),
      );
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith('W1', {
        diarySchema: newSchema,
      });
      expect(result.version).toBe(2);
    });

    it('PJ + žádná aktivní (první verze) → bez archive, create version=1', async () => {
      mockDiarySchemaVersionsRepo.findActive.mockResolvedValue(null);
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(0);
      mockDiarySchemaVersionsRepo.create.mockResolvedValue({
        id: 'v1',
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: newSchema,
        archivedAt: null,
      });

      await service.createDiarySchemaVersion('W1', { schema: newSchema }, PJ);

      expect(mockDiarySchemaVersionsRepo.archive).not.toHaveBeenCalled();
      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 1, archivedAt: null }),
      );
    });

    it('Non-PJ člen → 403', async () => {
      mockDiarySchemaVersionsRepo.findActive.mockResolvedValue(null);
      await expect(
        service.createDiarySchemaVersion('W1', { schema: newSchema }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockDiarySchemaVersionsRepo.create).not.toHaveBeenCalled();
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
  describe('approveAccessRequest (2.4)', () => {
    const ownerRequester = {
      id: 'user1',
      role: UserRole.Ikarus,
      username: 'tomas',
    };
    const pendingAr = {
      id: 'ar1',
      worldId: 'world1',
      userId: 'u2',
      requestedAt: new Date(),
    };

    it('owner approves (transaction success) → membership.save + AR.delete vč. session', async () => {
      // Default mockSession.withTransaction zavolá cb okamžitě (success path).
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue(pendingAr);
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        userId: 'u2',
        worldId: 'world1',
        role: WorldRole.Ctenar,
        joinedAt: new Date(),
        akj: 0,
      });
      mockAccessRequestRepo.delete.mockResolvedValue(true);

      const result = await service.approveAccessRequest(
        'world1',
        'ar1',
        ownerRequester,
      );

      // D-061 — uvnitř transakce save i delete dostanou session jako 2. arg.
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u2',
          worldId: 'world1',
          role: WorldRole.Ctenar,
        }),
        mockSession,
      );
      expect(mockAccessRequestRepo.delete).toHaveBeenCalledWith(
        'ar1',
        mockSession,
      );
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(result.ok).toBe(true);
      expect(result.membership.role).toBe(WorldRole.Ctenar);
    });

    it('D-061 — replica set chybí → graceful fallback na sekvenční flow', async () => {
      // Simulace dev mongo bez replica setu.
      mockSession.withTransaction.mockRejectedValueOnce(
        new Error('Transaction numbers are only allowed on a replica set'),
      );
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue(pendingAr);
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        userId: 'u2',
        worldId: 'world1',
        role: WorldRole.Ctenar,
        joinedAt: new Date(),
        akj: 0,
      });
      mockAccessRequestRepo.delete.mockResolvedValue(true);

      const result = await service.approveAccessRequest(
        'world1',
        'ar1',
        ownerRequester,
      );

      // Fallback path volá save i delete BEZ session (klasický flow).
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u2', worldId: 'world1' }),
      );
      // Delete v fallbacku volán bez session — jen s ar.id.
      expect(mockAccessRequestRepo.delete).toHaveBeenCalledWith('ar1');
      expect(result.ok).toBe(true);
    });

    it('non-owner Hrac → ForbiddenException', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      const intruder = {
        id: 'u2',
        role: UserRole.Ikarus,
        username: 'pepa',
      };
      await expect(
        service.approveAccessRequest('world1', 'ar1', intruder),
      ).rejects.toThrow(ForbiddenException);
    });

    it('non-existent AR → NotFoundException', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue(null);
      await expect(
        service.approveAccessRequest('world1', 'ar1', ownerRequester),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectAccessRequest (2.4)', () => {
    const ownerRequester = {
      id: 'user1',
      role: UserRole.Ikarus,
      username: 'tomas',
    };
    const pendingAr = {
      id: 'ar1',
      worldId: 'world1',
      userId: 'u2',
      requestedAt: new Date(),
    };

    it('owner deletes AR', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue(pendingAr);
      mockAccessRequestRepo.delete.mockResolvedValue(true);

      const result = await service.rejectAccessRequest(
        'world1',
        'ar1',
        ownerRequester,
      );

      expect(mockAccessRequestRepo.delete).toHaveBeenCalledWith('ar1');
      expect(result.ok).toBe(true);
    });

    it('Admin can reject in foreign world', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue(pendingAr);
      mockAccessRequestRepo.delete.mockResolvedValue(true);

      const admin = { id: 'admX', role: UserRole.Admin, username: 'A' };
      await expect(
        service.rejectAccessRequest('world1', 'ar1', admin),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('findByIdForRequester (2.4 — private scope)', () => {
    const privateWorld = { ...mockWorld, accessMode: 'private' };
    const publicWorld = { ...mockWorld, accessMode: 'public' };

    it('public world → returns to anyone (anon)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(publicWorld);
      const result = await service.findByIdForRequester('world1', null);
      expect(result.id).toBe('world1');
    });

    it('private world + anon → NotFoundException', async () => {
      mockWorldsRepo.findById.mockResolvedValue(privateWorld);
      await expect(
        service.findByIdForRequester('world1', null),
      ).rejects.toThrow(NotFoundException);
    });

    it('private world + non-member non-admin → NotFoundException', async () => {
      mockWorldsRepo.findById.mockResolvedValue(privateWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockAccessRequestRepo.findByUserAndWorld.mockResolvedValue(null);
      const stranger = {
        id: 'stranger',
        role: UserRole.Ikarus,
        username: 'X',
      };
      await expect(
        service.findByIdForRequester('world1', stranger),
      ).rejects.toThrow(NotFoundException);
    });

    it('private world + member → returns world', async () => {
      mockWorldsRepo.findById.mockResolvedValue(privateWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Ctenar,
      });
      const member = { id: 'mem1', role: UserRole.Ikarus, username: 'M' };
      const result = await service.findByIdForRequester('world1', member);
      expect(result.id).toBe('world1');
    });

    it('private world + pending AR → returns world', async () => {
      mockWorldsRepo.findById.mockResolvedValue(privateWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockAccessRequestRepo.findByUserAndWorld.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'applicant',
        requestedAt: new Date(),
      });
      const applicant = {
        id: 'applicant',
        role: UserRole.Ikarus,
        username: 'A',
      };
      const result = await service.findByIdForRequester('world1', applicant);
      expect(result.id).toBe('world1');
    });

    it('private world + Admin → returns world', async () => {
      mockWorldsRepo.findById.mockResolvedValue(privateWorld);
      const admin = { id: 'adm', role: UserRole.Admin, username: 'A' };
      const result = await service.findByIdForRequester('world1', admin);
      expect(result.id).toBe('world1');
    });
  });

  describe('findMyAccessRequests (2.4)', () => {
    it('returns AR with embedded world summary', async () => {
      mockAccessRequestRepo.findByUserId.mockResolvedValue([
        {
          id: 'ar1',
          worldId: 'world1',
          userId: 'u2',
          requestedAt: new Date(),
        },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([mockWorld]);
      const result = await service.findMyAccessRequests('u2');
      expect(result).toHaveLength(1);
      expect(result[0].accessRequest.id).toBe('ar1');
      expect(result[0].world).toEqual({
        id: 'world1',
        name: 'Matrix',
        slug: 'matrix',
        accessMode: 'private',
      });
    });

    it('returns [] when no pending AR', async () => {
      mockAccessRequestRepo.findByUserId.mockResolvedValue([]);
      const result = await service.findMyAccessRequests('u2');
      expect(result).toEqual([]);
    });
  });

  describe('onCharacterDeleted (8.2)', () => {
    it('vyčistí characterPath a avatarUrl u členů s mazanou postavou', async () => {
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { id: 'm1', characterPath: 'medak' },
        { id: 'm2', characterPath: 'jina-postava' },
        { id: 'm3', characterPath: 'medak' },
      ]);
      await service.onCharacterDeleted({ worldId: 'world1', slug: 'medak' });
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m1', {
        characterPath: undefined,
        avatarUrl: undefined,
      });
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m3', {
        characterPath: undefined,
        avatarUrl: undefined,
      });
      expect(mockMembershipRepo.update).not.toHaveBeenCalledWith(
        'm2',
        expect.anything(),
      );
    });

    it('neudělá nic, pokud žádný člen postavu nemá', async () => {
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { id: 'm1', characterPath: 'jina' },
      ]);
      await service.onCharacterDeleted({ worldId: 'world1', slug: 'medak' });
      expect(mockMembershipRepo.update).not.toHaveBeenCalled();
    });
  });

  // Side-task character-tab-visibility — sanitace whitelisty
  describe('updateSettings — characterTabVisibility sanitace', () => {
    const pjMembership = { id: 'm-pj', role: WorldRole.PJ };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(pjMembership);
      mockSettingsRepo.upsert.mockImplementation((_id, data) =>
        Promise.resolve({
          id: 's1',
          worldId: 'world1',
          ...data,
        }),
      );
    });

    it('propustí valid whitelist hodnoty', async () => {
      await service.updateSettings(
        'world1',
        {
          characterTabVisibility: {
            PostavaHrace: ['denik', 'finance'],
            NPC: ['kalendar'],
          },
        },
        mockRequester,
      );
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({
          characterTabVisibility: {
            PostavaHrace: ['denik', 'finance'],
            NPC: ['kalendar'],
          },
        }),
      );
    });

    it('dedupuje duplicity v listu', async () => {
      await service.updateSettings(
        'world1',
        {
          characterTabVisibility: {
            PostavaHrace: ['denik', 'denik', 'finance', 'finance'],
          },
        },
        mockRequester,
      );
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call.characterTabVisibility.PostavaHrace).toEqual([
        'denik',
        'finance',
      ]);
    });

    it('filtruje neznámé hodnoty mimo whitelist', async () => {
      await service.updateSettings(
        'world1',
        {
          characterTabVisibility: {
            // bypass DTO via cast — defense-in-depth check
            NPC: ['denik', 'profil', 'malware', 'finance'] as never,
          },
        },
        mockRequester,
      );
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call.characterTabVisibility.NPC).toEqual(['denik', 'finance']);
    });

    it('respektuje cap na 6 prvků', async () => {
      const oversized = [
        'soukrome',
        'denik',
        'finance',
        'vybava',
        'kalendar',
        'poznamky',
        'denik2',
      ];
      await service.updateSettings(
        'world1',
        {
          characterTabVisibility: {
            PostavaHrace: oversized,
          },
        },
        mockRequester,
      );
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call.characterTabVisibility.PostavaHrace).toHaveLength(6);
      expect(call.characterTabVisibility.PostavaHrace).not.toContain('denik2');
    });

    it('chybějící characterTabVisibility nechá DTO beze změny', async () => {
      await service.updateSettings(
        'world1',
        { groupColors: { Korektoři: '#abc' } },
        mockRequester,
      );
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call.characterTabVisibility).toBeUndefined();
      expect(call.groupColors).toEqual({ Korektoři: '#abc' });
    });

    it('403 pro neoprávněnou roli (PomocnyPJ)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm-pp',
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        service.updateSettings(
          'world1',
          { characterTabVisibility: { PostavaHrace: ['denik'] } },
          { ...mockRequester, role: UserRole.Ikarus },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // 9.3 — timelineCalendarSlug persist (A → B → null → A pattern dle
  // memory/feedback_persist_across_variants).
  describe('updateSettings — timelineCalendarSlug persistence', () => {
    const pjMembership = { id: 'm-pj', role: WorldRole.PJ };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(pjMembership);
      mockSettingsRepo.upsert.mockImplementation((_id, data) =>
        Promise.resolve({
          id: 's1',
          worldId: 'world1',
          ...data,
        }),
      );
    });

    it('propaguje string slug do upsert', async () => {
      await service.updateSettings(
        'world1',
        { timelineCalendarSlug: 'elf-cal' },
        mockRequester,
      );
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({ timelineCalendarSlug: 'elf-cal' }),
      );
    });

    it('propaguje null clearing do upsert', async () => {
      await service.updateSettings(
        'world1',
        { timelineCalendarSlug: null },
        mockRequester,
      );
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({ timelineCalendarSlug: null }),
      );
    });

    it('A → B → null → A pattern (žádné krájení dat)', async () => {
      await service.updateSettings(
        'world1',
        { timelineCalendarSlug: 'elf-cal' },
        mockRequester,
      );
      await service.updateSettings(
        'world1',
        { timelineCalendarSlug: 'dwarf-cal' },
        mockRequester,
      );
      await service.updateSettings(
        'world1',
        { timelineCalendarSlug: null },
        mockRequester,
      );
      await service.updateSettings(
        'world1',
        { timelineCalendarSlug: 'elf-cal' },
        mockRequester,
      );

      const calls = mockSettingsRepo.upsert.mock.calls;
      expect(calls[0][1].timelineCalendarSlug).toBe('elf-cal');
      expect(calls[1][1].timelineCalendarSlug).toBe('dwarf-cal');
      expect(calls[2][1].timelineCalendarSlug).toBeNull();
      expect(calls[3][1].timelineCalendarSlug).toBe('elf-cal');
    });

    it('chybějící timelineCalendarSlug nemění field', async () => {
      await service.updateSettings(
        'world1',
        { groupColors: { Korektoři: '#abc' } },
        mockRequester,
      );
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call).not.toHaveProperty('timelineCalendarSlug');
    });
  });
});
