import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
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
import { WorldElevationsService } from '../world-elevations/world-elevations.service';
import { PagesService } from '../pages/pages.service';

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
    findAllUnfiltered: jest.fn(),
    countAll: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    findByCurrentOrPreviousSlug: jest.fn(),
    renameSlug: jest.fn(),
    existsBySlug: jest.fn(),
    findByOwnerId: jest.fn(),
    // D-SEC-GAP-2026-07-11 — creation-flood cap; default hluboko pod stropem.
    countByOwnerId: jest.fn().mockResolvedValue(0),
    findDeleted: jest.fn(),
    findExpiredDeleted: jest.fn(),
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
    updateRoleIfChanged: jest.fn(),
    clearCharacter: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
  };
  const mockUsersService = {
    publicProfile: jest
      .fn()
      .mockResolvedValue({ id: 'user1', username: 'user1', avatarUrl: null }),
    // create()/assertCanJoinMoreWorlds() dohledávají supporter status uživatele
    // (19.4). Default null → fail-open (viz assertCanJoinMoreWorlds:349).
    findById: jest.fn().mockResolvedValue(null),
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
  // 15.10 fáze B — pozvánky do světa.
  const mockInviteRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByToken: jest.fn(),
    findActiveByWorld: jest.fn(),
    findPendingUserInvite: jest.fn(),
    findPendingForUser: jest.fn(),
    countPendingForUser: jest.fn(),
    updateStatus: jest.fn(),
    incrementUsedCount: jest.fn(),
    delete: jest.fn(),
  };
  // 15.10 fáze C — approve žádosti s postavou vytvoří živou stránku postavy.
  // 15.11 — findPendingProposals napájí page-review v getWorldPendingActions.
  const mockPagesService = {
    create: jest.fn().mockResolvedValue({ id: 'pg1', slug: 'postava' }),
    findPendingProposals: jest.fn().mockResolvedValue([]),
  };
  // FIX-18 — updateMemberCharacter ověřuje vlastnictví Character při self-edit.
  const mockCharactersRepo = {
    findBySlugAndWorld: jest.fn(),
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
        { provide: 'IWorldInviteRepository', useValue: mockInviteRepo },
        { provide: PagesService, useValue: mockPagesService },
        { provide: 'ICharactersRepository', useValue: mockCharactersRepo },
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
        {
          provide: WorldElevationsService,
          useValue: {
            activate: jest.fn().mockResolvedValue(undefined),
            deactivate: jest.fn().mockResolvedValue(undefined),
            isElevated: jest.fn().mockResolvedValue(false),
            listWorldIdsForUser: jest.fn().mockResolvedValue([]),
            deactivateAllForUser: jest.fn().mockResolvedValue(undefined),
          },
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

  describe('getWorldPendingActions (15.10)', () => {
    const ar = {
      id: 'ar1',
      worldId: 'world1',
      userId: 'u2',
      requestedAt: new Date('2026-07-15T10:00:00.000Z'),
    };

    it('owner → mapuje pending žádosti na multi-typ položky', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld); // ownerId: user1
      mockAccessRequestRepo.findPaginatedAcrossWorlds.mockResolvedValue({
        items: [ar],
        total: 1,
      });
      mockUsersService.publicProfile.mockResolvedValue({
        id: 'u2',
        username: 'zadatel',
        avatarUrl: 'a.png',
      });

      const result = await service.getWorldPendingActions(
        'world1',
        mockRequester,
      );

      expect(
        mockAccessRequestRepo.findPaginatedAcrossWorlds,
      ).toHaveBeenCalledWith(['world1'], 1, 500);
      expect(result).toEqual([
        {
          type: 'access-request',
          id: 'ar1',
          userId: 'u2',
          displayName: 'zadatel',
          avatarUrl: 'a.png',
          createdAt: '2026-07-15T10:00:00.000Z',
        },
      ]);
    });

    it('co-PJ (ne vlastník, role ≥ PJ) → frontu vidí', async () => {
      const coPj = { id: 'u99', role: UserRole.Ikarus, username: 'copj' };
      mockWorldsRepo.findById.mockResolvedValue(mockWorld); // owner user1 ≠ u99
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mem-copj',
        worldId: 'world1',
        userId: 'u99',
        role: WorldRole.PJ,
        joinedAt: new Date(),
        akj: 0,
      });
      mockAccessRequestRepo.findPaginatedAcrossWorlds.mockResolvedValue({
        items: [ar],
        total: 1,
      });

      const result = await service.getWorldPendingActions('world1', coPj);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('access-request');
    });

    it('ne-moderátor (bez membershipu, ne vlastník) → ForbiddenException', async () => {
      const outsider = { id: 'u99', role: UserRole.Ikarus, username: 'x' };
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getWorldPendingActions('world1', outsider),
      ).rejects.toThrow(ForbiddenException);
    });

    it('žádné pending → prázdné pole (bez lookupu profilů žadatelů)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findPaginatedAcrossWorlds.mockResolvedValue({
        items: [],
        total: 0,
      });
      const result = await service.getWorldPendingActions(
        'world1',
        mockRequester,
      );
      expect(result).toEqual([]);
      // findById si tahá owner profil (user1); žadatelovy (u2) se ale
      // při prázdné frontě lookupovat nesmí.
      expect(mockUsersService.publicProfile).not.toHaveBeenCalledWith('u2');
    });
  });

  describe('pozvánky do světa (15.10 fáze B)', () => {
    const outsider = { id: 'u9', role: UserRole.Ikarus, username: 'x' };
    const invitee = { id: 'u2', role: UserRole.Ikarus, username: 'zvany' };

    describe('createInvite', () => {
      it('user → vytvoří cílenou pozvánku (role Čtenář)', async () => {
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
        mockInviteRepo.findPendingUserInvite.mockResolvedValue(null);
        mockInviteRepo.create.mockResolvedValue({ id: 'inv1', kind: 'user' });
        const res = await service.createInvite('world1', mockRequester, {
          kind: 'user',
          invitedUserId: 'u2',
        });
        expect(mockInviteRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'user',
            invitedUserId: 'u2',
            role: WorldRole.Ctenar,
          }),
        );
        expect(res.id).toBe('inv1');
      });

      it('user už člen → ConflictException', async () => {
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ id: 'm1' });
        await expect(
          service.createInvite('world1', mockRequester, {
            kind: 'user',
            invitedUserId: 'u2',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('user s existující pending pozvánkou → ConflictException', async () => {
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
        mockInviteRepo.findPendingUserInvite.mockResolvedValue({ id: 'old' });
        await expect(
          service.createInvite('world1', mockRequester, {
            kind: 'user',
            invitedUserId: 'u2',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('user bez invitedUserId → BadRequestException', async () => {
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        await expect(
          service.createInvite('world1', mockRequester, { kind: 'user' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('link → vytvoří odkaz s tokenem', async () => {
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        mockInviteRepo.create.mockResolvedValue({ id: 'inv2', kind: 'link' });
        await service.createInvite('world1', mockRequester, {
          kind: 'link',
          maxUses: 5,
        });
        expect(mockInviteRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'link',
            maxUses: 5,
            token: expect.any(String),
          }),
        );
      });

      it('ne-moderátor → ForbiddenException', async () => {
        mockWorldsRepo.findById.mockResolvedValue({
          ...mockWorld,
          ownerId: 'other',
        });
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
        await expect(
          service.createInvite('world1', outsider, { kind: 'link' }),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('acceptUserInvite', () => {
      it('pozvaný přijme → membership Čtenář + accepted', async () => {
        mockInviteRepo.findById.mockResolvedValue({
          id: 'inv1',
          worldId: 'world1',
          kind: 'user',
          invitedUserId: 'u2',
          status: 'pending',
        });
        mockMembershipRepo.save.mockResolvedValue({
          id: 'm1',
          role: WorldRole.Ctenar,
        });
        const res = await service.acceptUserInvite('world1', 'inv1', invitee);
        expect(mockMembershipRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'u2', role: WorldRole.Ctenar }),
        );
        expect(mockInviteRepo.updateStatus).toHaveBeenCalledWith(
          'inv1',
          'accepted',
        );
        expect(res.ok).toBe(true);
      });

      it('cizí uživatel → ForbiddenException', async () => {
        mockInviteRepo.findById.mockResolvedValue({
          id: 'inv1',
          worldId: 'world1',
          kind: 'user',
          invitedUserId: 'u2',
          status: 'pending',
        });
        await expect(
          service.acceptUserInvite('world1', 'inv1', outsider),
        ).rejects.toThrow(ForbiddenException);
      });

      it('už není pending → GoneException', async () => {
        mockInviteRepo.findById.mockResolvedValue({
          id: 'inv1',
          worldId: 'world1',
          kind: 'user',
          invitedUserId: 'u2',
          status: 'accepted',
        });
        await expect(
          service.acceptUserInvite('world1', 'inv1', invitee),
        ).rejects.toThrow(GoneException);
      });
    });

    describe('acceptLinkInvite', () => {
      it('platný odkaz → membership + increment usedCount', async () => {
        mockInviteRepo.findByToken.mockResolvedValue({
          id: 'inv2',
          worldId: 'world1',
          kind: 'link',
          status: 'pending',
          usedCount: 0,
        });
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
        mockMembershipRepo.save.mockResolvedValue({
          id: 'm2',
          role: WorldRole.Ctenar,
        });
        mockInviteRepo.incrementUsedCount.mockResolvedValue({
          id: 'inv2',
          usedCount: 1,
        });
        const res = await service.acceptLinkInvite('tok', outsider);
        expect(res.worldId).toBe('world1');
        expect(mockInviteRepo.incrementUsedCount).toHaveBeenCalledWith('inv2');
      });

      it('expirovaný odkaz → GoneException + status expired', async () => {
        mockInviteRepo.findByToken.mockResolvedValue({
          id: 'inv2',
          worldId: 'world1',
          kind: 'link',
          status: 'pending',
          usedCount: 0,
          expiresAt: new Date('2020-01-01'),
        });
        await expect(service.acceptLinkInvite('tok', outsider)).rejects.toThrow(
          GoneException,
        );
        expect(mockInviteRepo.updateStatus).toHaveBeenCalledWith(
          'inv2',
          'expired',
        );
      });

      it('vyčerpaný odkaz (usedCount ≥ maxUses) → GoneException', async () => {
        mockInviteRepo.findByToken.mockResolvedValue({
          id: 'inv2',
          worldId: 'world1',
          kind: 'link',
          status: 'pending',
          usedCount: 3,
          maxUses: 3,
        });
        await expect(service.acceptLinkInvite('tok', outsider)).rejects.toThrow(
          GoneException,
        );
      });

      it('už člen → ConflictException', async () => {
        mockInviteRepo.findByToken.mockResolvedValue({
          id: 'inv2',
          worldId: 'world1',
          kind: 'link',
          status: 'pending',
          usedCount: 0,
        });
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ id: 'm1' });
        await expect(service.acceptLinkInvite('tok', outsider)).rejects.toThrow(
          ConflictException,
        );
      });

      it('neexistující token → NotFoundException', async () => {
        mockInviteRepo.findByToken.mockResolvedValue(null);
        await expect(service.acceptLinkInvite('tok', outsider)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('revokeInvite', () => {
      it('→ updateStatus revoked', async () => {
        mockWorldsRepo.findById.mockResolvedValue(mockWorld);
        mockInviteRepo.findById.mockResolvedValue({
          id: 'inv1',
          worldId: 'world1',
        });
        const res = await service.revokeInvite('world1', 'inv1', mockRequester);
        expect(mockInviteRepo.updateStatus).toHaveBeenCalledWith(
          'inv1',
          'revoked',
        );
        expect(res.ok).toBe(true);
      });
    });
  });

  describe('přihláška s postavou (15.10 fáze C, var. A)', () => {
    it('requestAccess s návrhem postavy → uloží (trimnutý) characterDraft', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld); // accessMode private
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockAccessRequestRepo.create.mockResolvedValue({ id: 'ar1' });
      await service.requestAccess('world1', 'u2', {
        name: '  Vlkodlak  ',
        note: '  chci hrát drsňáka  ',
      });
      expect(mockAccessRequestRepo.create).toHaveBeenCalledWith({
        worldId: 'world1',
        userId: 'u2',
        characterDraft: { name: 'Vlkodlak', note: 'chci hrát drsňáka' },
      });
    });

    it('requestAccess s prázdným jménem → prostá žádost (draft undefined)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockAccessRequestRepo.create.mockResolvedValue({ id: 'ar1' });
      await service.requestAccess('world1', 'u2', { name: '   ' });
      expect(mockAccessRequestRepo.create).toHaveBeenCalledWith({
        worldId: 'world1',
        userId: 'u2',
        characterDraft: undefined,
      });
    });

    it('approve žádosti S postavou → živá Page + membership Hráč + characterPath', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'u2',
        characterDraft: { name: 'Vlkodlak', note: 'bio' },
      });
      mockPagesService.create.mockResolvedValue({
        id: 'pg1',
        slug: 'vlkodlak',
      });
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Hrac,
        characterPath: 'vlkodlak',
      });
      const res = await service.approveAccessRequest(
        'world1',
        'ar1',
        mockRequester,
      );
      expect(mockPagesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Postava hráče',
          title: 'Vlkodlak',
          ownerUserId: 'u2',
        }),
        'world1',
        mockRequester,
      );
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u2',
          role: WorldRole.Hrac,
          characterPath: 'vlkodlak',
        }),
      );
      expect(mockAccessRequestRepo.delete).toHaveBeenCalledWith('ar1');
      expect(res.membership.role).toBe(WorldRole.Hrac);
    });

    it('approve žádosti BEZ postavy → membership Čtenář (dnešní flow, žádná Page)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'u2',
      });
      mockMembershipRepo.save.mockResolvedValue({
        id: 'm1',
        role: WorldRole.Ctenar,
      });
      const res = await service.approveAccessRequest(
        'world1',
        'ar1',
        mockRequester,
      );
      expect(mockPagesService.create).not.toHaveBeenCalled();
      // tx flow volá save(entity, session) — dva argumenty.
      expect(mockMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorldRole.Ctenar }),
        expect.anything(),
      );
      expect(res.membership.role).toBe(WorldRole.Ctenar);
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

    it('R-NEW — Admin NEMŮŽE měnit cizí svět (governance je PJ-only)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        ownerId: 'other',
      });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const adminUser = {
        id: 'admin1',
        role: UserRole.Admin,
        username: 'admin1',
      };
      await expect(
        service.update('world1', { name: 'Updated' }, adminUser),
      ).rejects.toThrow(ForbiddenException);
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

    it('uloží diceVisibility patch (10.2j)', async () => {
      const dto = {
        diceVisibility: {
          showPjRolls: false,
          showNpcBestieRolls: true,
          showTeammateRolls: true,
        },
      };
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
        ...dto,
      });
      const result = await service.update(mockWorld.id, dto, mockRequester);
      expect(mockWorldsRepo.update).toHaveBeenCalledWith(
        mockWorld.id,
        expect.objectContaining({ diceVisibility: dto.diceVisibility }),
      );
      expect(result.diceVisibility).toEqual(dto.diceVisibility);
    });

    // Bug-fix (sdílený motiv) — theme pole smí měnit jen vedení (PomocnyPJ+).
    it('Korektor NESMÍ měnit sdílený motiv (themeId) → 403', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mem-kor',
        userId: 'user1',
        worldId: 'world1',
        role: WorldRole.Korektor,
        joinedAt: new Date(),
        akj: 0,
      });
      await expect(
        service.update('world1', { themeId: 'cyberpunk' }, mockRequester),
      ).rejects.toThrow(ForbiddenException);
      expect(mockWorldsRepo.update).not.toHaveBeenCalled();
    });

    it('Korektor SMÍ měnit ne-theme pole (jméno) i bez theme guardu', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mem-kor',
        userId: 'user1',
        worldId: 'world1',
        role: WorldRole.Korektor,
        joinedAt: new Date(),
        akj: 0,
      });
      mockWorldsRepo.update.mockResolvedValue({ ...mockWorld, name: 'Nové' });
      const result = await service.update(
        'world1',
        { name: 'Nové' },
        mockRequester,
      );
      expect(result.name).toBe('Nové');
    });

    it('PomocnyPJ SMÍ měnit sdílený motiv (themeId)', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mem-ppj',
        userId: 'user1',
        worldId: 'world1',
        role: WorldRole.PomocnyPJ,
        joinedAt: new Date(),
        akj: 0,
      });
      mockWorldsRepo.update.mockResolvedValue({
        ...mockWorld,
        themeId: 'cyberpunk',
      });
      const result = await service.update(
        'world1',
        { themeId: 'cyberpunk' },
        mockRequester,
      );
      expect(result.themeId).toBe('cyberpunk');
    });
  });

  // 5.9b — per-člen vlastní motiv + pozadí v „Můj vzhled" (jen pro sebe).
  describe('updateMyTheme — per-člen motiv/pozadí (5.9b)', () => {
    const memberMembership = {
      id: 'mem-me',
      userId: 'user1',
      worldId: 'world1',
      role: WorldRole.Hrac,
      joinedAt: new Date(),
      akj: 0,
    };

    it('non-member → 403 NOT_A_MEMBER', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.updateMyTheme(
          'world1',
          { themeId: 'cyberpunk' },
          mockRequester,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('uloží vlastní motiv + pozadí na MEMBERSHIP (ne World)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(memberMembership);
      mockMembershipRepo.update.mockImplementation((id, patch) =>
        Promise.resolve({ ...memberMembership, id, ...patch }),
      );
      const result = await service.updateMyTheme(
        'world1',
        { themeId: 'cyberpunk', themeBackgroundUrl: 'https://x/bg.webp' },
        mockRequester,
      );
      expect(mockMembershipRepo.update).toHaveBeenCalledWith(
        'mem-me',
        expect.objectContaining({
          themeId: 'cyberpunk',
          themeBackgroundUrl: 'https://x/bg.webp',
        }),
      );
      // World repo se NESMÍ dotknout — žádný propsání motivu všem.
      expect(mockWorldsRepo.update).not.toHaveBeenCalled();
      expect(result.themeId).toBe('cyberpunk');
    });

    it("prázdný řetězec ('') = clear → null (zpět na vzhled PJ)", async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(memberMembership);
      mockMembershipRepo.update.mockImplementation((id, patch) =>
        Promise.resolve({ ...memberMembership, id, ...patch }),
      );
      await service.updateMyTheme(
        'world1',
        { themeId: '', themeBackgroundUrl: '' },
        mockRequester,
      );
      expect(mockMembershipRepo.update).toHaveBeenCalledWith(
        'mem-me',
        expect.objectContaining({ themeId: null, themeBackgroundUrl: null }),
      );
    });

    it('backward-compat: bez motiv/pozadí polí je nezahrne do patche', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(memberMembership);
      mockMembershipRepo.update.mockImplementation((id, patch) =>
        Promise.resolve({ ...memberMembership, id, ...patch }),
      );
      await service.updateMyTheme(
        'world1',
        { themeAdjust: { brightness: 1.1 }, themeUserOverrides: {} },
        mockRequester,
      );
      const patch = mockMembershipRepo.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty('themeId');
      expect(patch).not.toHaveProperty('themeBackgroundUrl');
    });

    it("16.2c — uloží diarySkin; '' = clear → null; absence nezahrne", async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(memberMembership);
      mockMembershipRepo.update.mockImplementation((id, patch) =>
        Promise.resolve({ ...memberMembership, id, ...patch }),
      );
      // uloží
      const r = await service.updateMyTheme(
        'world1',
        { diarySkin: 'fantasy' },
        mockRequester,
      );
      expect(r.diarySkin).toBe('fantasy');
      // '' = clear → null
      await service.updateMyTheme('world1', { diarySkin: '' }, mockRequester);
      expect(mockMembershipRepo.update).toHaveBeenLastCalledWith(
        'mem-me',
        expect.objectContaining({ diarySkin: null }),
      );
      // absence → nezahrne do patche
      await service.updateMyTheme(
        'world1',
        { themeAdjust: { brightness: 1 } },
        mockRequester,
      );
      const lastPatch = mockMembershipRepo.update.mock.calls.at(-1)?.[1];
      expect(lastPatch).not.toHaveProperty('diarySkin');
    });
  });

  describe('updateMemberRole — DI-05 playerCount auto-count', () => {
    const owner = { id: 'user1', role: UserRole.Ikarus, username: 'pj' };
    const ownerMembership = {
      id: 'mem-pj',
      worldId: 'world1',
      userId: 'user1',
      role: WorldRole.PJ,
      joinedAt: new Date(),
      akj: 0,
    };
    const target = (role: WorldRole) => ({
      id: 'mem1',
      worldId: 'world1',
      userId: 'u1',
      role,
      joinedAt: new Date(),
      akj: 0,
    });

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(ownerMembership);
      mockMembershipRepo.update.mockImplementation((id, patch) =>
        Promise.resolve({ ...target(WorldRole.Ctenar), id, ...patch }),
      );
      // RC-R2 fix — service teď mění roli přes updateRoleIfChanged (vrací stav
      // PŘED změnou, nebo null když beze změny). Mimikuj: vrať findById doc když
      // se role liší, jinak null.
      mockMembershipRepo.updateRoleIfChanged.mockImplementation(
        async (id: string, role: number) => {
          const cur = await mockMembershipRepo.findById(id);
          return cur && cur.role !== role ? cur : null;
        },
      );
    });

    it('povýšení na Hrac → playerCount +1', async () => {
      mockMembershipRepo.findById.mockResolvedValue(target(WorldRole.Ctenar));
      await service.updateMemberRole('mem1', WorldRole.Hrac, owner);
      expect(mockWorldsRepo.increment).toHaveBeenCalledWith(
        'world1',
        'playerCount',
        1,
      );
    });

    it('degradace z Hrac → playerCount −1', async () => {
      mockMembershipRepo.findById.mockResolvedValue(target(WorldRole.Hrac));
      await service.updateMemberRole('mem1', WorldRole.Ctenar, owner);
      expect(mockWorldsRepo.increment).toHaveBeenCalledWith(
        'world1',
        'playerCount',
        -1,
      );
    });

    it('změna role bez Hrac (Ctenar→PomocnyPJ) → žádná změna playerCount', async () => {
      mockMembershipRepo.findById.mockResolvedValue(target(WorldRole.Ctenar));
      await service.updateMemberRole('mem1', WorldRole.PomocnyPJ, owner);
      expect(mockWorldsRepo.increment).not.toHaveBeenCalled();
    });
  });

  describe('R-NEW — platformový Admin nemá moc uvnitř světa', () => {
    const admin = { id: 'admX', role: UserRole.Admin, username: 'A' };

    beforeEach(() => {
      // admin/requester defaultně NENÍ člen → governance brány padnou na Forbidden
      // (reset leftover mockResolvedValue — clearAllMocks neresetuje implementace).
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
    });

    it('approveAccessRequest cizího světa → Forbidden', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld); // ownerId 'user1' ≠ admX
      mockAccessRequestRepo.findById.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'u9',
        status: 'pending',
      });
      await expect(
        service.approveAccessRequest('world1', 'ar1', admin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updateMemberRole cizího světa → Forbidden', async () => {
      mockMembershipRepo.findById.mockResolvedValue({
        id: 'mem1',
        worldId: 'world1',
        userId: 'u9',
        role: WorldRole.Ctenar,
        joinedAt: new Date(),
        akj: 0,
      });
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null); // admin není člen
      await expect(
        service.updateMemberRole('mem1', WorldRole.Hrac, admin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('transferOwnership cizího světa → Forbidden', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      await expect(
        service.transferOwnership('world1', 'u2', admin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('co-PJ (role PJ, ne vlastník) SMÍ odmítnout žádost', async () => {
      const coPj = { id: 'copj', role: UserRole.Ikarus, username: 'copj' };
      mockWorldsRepo.findById.mockResolvedValue(mockWorld); // ownerId 'user1' ≠ copj
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm-copj',
        worldId: 'world1',
        userId: 'copj',
        role: WorldRole.PJ,
        joinedAt: new Date(),
        akj: 0,
      });
      mockAccessRequestRepo.findById.mockResolvedValue({
        id: 'ar1',
        worldId: 'world1',
        userId: 'u9',
        status: 'pending',
      });
      mockAccessRequestRepo.delete.mockResolvedValue(true);
      await expect(
        service.rejectAccessRequest('world1', 'ar1', coPj),
      ).resolves.toEqual({ ok: true });
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

    it('N-18 — assertMembershipInWorld: membership cizího světa → 404', async () => {
      mockMembershipRepo.findById.mockResolvedValue({
        id: 'mem1',
        worldId: 'jiny-svet',
        userId: 'u1',
        role: WorldRole.Hrac,
        joinedAt: new Date(),
        akj: 0,
      });
      await expect(
        service.assertMembershipInWorld('mem1', 'world1'),
      ).rejects.toMatchObject({ response: { code: 'MEMBERSHIP_NOT_FOUND' } });
    });

    it('N-18 — assertMembershipInWorld: membership patří světu → projde', async () => {
      mockMembershipRepo.findById.mockResolvedValue({
        id: 'mem1',
        worldId: 'world1',
        userId: 'u1',
        role: WorldRole.Hrac,
        joinedAt: new Date(),
        akj: 0,
      });
      await expect(
        service.assertMembershipInWorld('mem1', 'world1'),
      ).resolves.toBeUndefined();
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

  describe('updateMemberRole (R-03 strop role)', () => {
    const world = { ...mockWorld, ownerId: 'owner' };

    it('PomocnyPJ nesmí povýšit člena na PJ (strop role) → 403', async () => {
      mockMembershipRepo.findById.mockResolvedValue({
        id: 'm1',
        userId: 'victim',
        worldId: 'world1',
        role: WorldRole.Hrac,
      });
      mockWorldsRepo.findById.mockResolvedValue(world);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mp',
        userId: 'pp',
        worldId: 'world1',
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        service.updateMemberRole('m1', WorldRole.PJ, {
          id: 'pp',
          role: UserRole.Ikarus,
          username: 'pp',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.update).not.toHaveBeenCalled();
    });

    it('roli vlastníka světa nelze měnit (immutable) → 403', async () => {
      mockMembershipRepo.findById.mockResolvedValue({
        id: 'mo',
        userId: 'owner',
        worldId: 'world1',
        role: WorldRole.PJ,
      });
      mockWorldsRepo.findById.mockResolvedValue(world);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mo',
        userId: 'owner',
        worldId: 'world1',
        role: WorldRole.PJ,
      });
      await expect(
        service.updateMemberRole('mo', WorldRole.Hrac, {
          id: 'owner',
          role: UserRole.Ikarus,
          username: 'owner',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.update).not.toHaveBeenCalled();
    });

    it('PJ (non-owner) smí nastavit hráče na Korektor (pod svou rolí)', async () => {
      mockMembershipRepo.findById.mockResolvedValue({
        id: 'm1',
        userId: 'victim',
        worldId: 'world1',
        role: WorldRole.Hrac,
      });
      mockWorldsRepo.findById.mockResolvedValue(world);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mpj',
        userId: 'pj',
        worldId: 'world1',
        role: WorldRole.PJ,
      });
      // RC-R2 fix — role se mění přes updateRoleIfChanged (vrací PŘEDCHOZÍ doc).
      mockMembershipRepo.updateRoleIfChanged.mockResolvedValue({
        id: 'm1',
        userId: 'victim',
        worldId: 'world1',
        role: WorldRole.Hrac, // stav PŘED změnou
      });
      const result = await service.updateMemberRole('m1', WorldRole.Korektor, {
        id: 'pj',
        role: UserRole.Ikarus,
        username: 'pj',
      });
      expect(result.role).toBe(WorldRole.Korektor);
      expect(mockMembershipRepo.updateRoleIfChanged).toHaveBeenCalledWith(
        'm1',
        WorldRole.Korektor,
      );
    });
  });

  describe('updateMemberGroup (#2 — chat sync emit)', () => {
    const world = { ...mockWorld, ownerId: 'owner' };

    it('uloží skupinu a emitne world.membership.changed (chat dorovná kanál)', async () => {
      mockMembershipRepo.findById.mockResolvedValue({
        id: 'm1',
        userId: 'victim',
        worldId: 'world1',
        role: WorldRole.Hrac,
      });
      mockWorldsRepo.findById.mockResolvedValue(world);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'mpj',
        userId: 'pj',
        worldId: 'world1',
        role: WorldRole.PJ,
      });
      const updated = {
        id: 'm1',
        userId: 'victim',
        worldId: 'world1',
        role: WorldRole.Hrac,
        group: 'Rytíři',
      };
      mockMembershipRepo.update.mockResolvedValue(updated);
      const emit = service['eventEmitter'].emit as jest.Mock;
      emit.mockClear();

      const result = await service.updateMemberGroup('m1', 'Rytíři', {
        id: 'pj',
        role: UserRole.Ikarus,
        username: 'pj',
      });

      expect(result.group).toBe('Rytíři');
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m1', {
        group: 'Rytíři',
      });
      expect(emit).toHaveBeenCalledWith('world.membership.changed', {
        worldId: 'world1',
        membership: updated,
      });
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
      mockUsersService.publicProfile.mockResolvedValue({
        id: 'user1',
        username: 'Aragorn',
        avatarUrl: null,
      });
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        accessMode: 'open',
      });

      const result = await service.getMembers('world1', null);

      expect(result[0].user?.username).toBe('Aragorn');
    });

    it('N-7 — privátní svět + anon → 404 (žádný leak členů)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        accessMode: 'private',
      });
      await expect(service.getMembers('world1', null)).rejects.toMatchObject({
        response: { code: 'WORLD_NOT_FOUND' },
      });
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
      mockUsersService.publicProfile.mockRejectedValue(new Error('not found'));
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'world1',
        accessMode: 'open',
      });

      const result = await service.getMembers('world1', null);

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
      // Supporter → owner-kvóta 30 (WORLD_QUOTA_REACHED); jinak by cesta
      // spadla do non-supporter větve (limit 3, jiný kód). Viz worlds.service:459.
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'u1',
        role: UserRole.Ikarus,
        isSupporter: true,
      });
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

  describe('create — D-SEC-GAP-2026-07-11 creation-flood cap', () => {
    it('50 světů na účtu (vč. soft-deleted) → 409 LIMIT_REACHED', async () => {
      mockWorldsRepo.countByOwnerId.mockResolvedValueOnce(50);

      await expect(
        service.create({ name: 'Flood', slug: 'flood' }, 'u1', UserRole.Ikarus),
      ).rejects.toMatchObject({ response: { code: 'LIMIT_REACHED' } });
      // Strop zafunguje dřív, než se sahá na slug/save.
      expect(mockWorldsRepo.existsBySlug).not.toHaveBeenCalled();
      expect(mockWorldsRepo.save).not.toHaveBeenCalled();
    });

    it('pod stropem (49) → create projde', async () => {
      mockWorldsRepo.countByOwnerId.mockResolvedValueOnce(49);
      // Supporter → aktivní owner-kvóta (30) se nepočítá přes membershipy.
      mockUsersService.findById.mockResolvedValueOnce({
        id: 'u1',
        role: UserRole.Ikarus,
        isSupporter: true,
      });
      mockWorldsRepo.findByOwnerId.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ id: `w${i}` })),
      );
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ ...mockWorld, id: 'W1' });
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);
      mockSettingsRepo.upsert.mockResolvedValue({});
      mockMembershipRepo.save.mockResolvedValue({ id: 'M1' });

      await expect(
        service.create(
          { name: 'UnderCap', slug: 'under-cap' },
          'u1',
          UserRole.Ikarus,
        ),
      ).resolves.toBeDefined();
    });

    it('env MAX_WORLDS_PER_USER přepíše default bez rebuildu', async () => {
      process.env.MAX_WORLDS_PER_USER = '2';
      try {
        mockWorldsRepo.countByOwnerId.mockResolvedValueOnce(2);
        await expect(
          service.create(
            { name: 'EnvCap', slug: 'env-cap' },
            'u1',
            UserRole.Ikarus,
          ),
        ).rejects.toMatchObject({ response: { code: 'LIMIT_REACHED' } });
      } finally {
        delete process.env.MAX_WORLDS_PER_USER;
      }
    });

    it('Admin je exempt (strop se nečte)', async () => {
      mockWorldsRepo.countByOwnerId.mockResolvedValueOnce(999);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ ...mockWorld, id: 'W1' });
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);
      mockSettingsRepo.upsert.mockResolvedValue({});
      mockMembershipRepo.save.mockResolvedValue({ id: 'M1' });

      await expect(
        service.create({ name: 'Adm', slug: 'adm' }, 'admin', UserRole.Admin),
      ).resolves.toBeDefined();
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
      mockWorldsRepo.findAllUnfiltered.mockResolvedValue([
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
      mockWorldsRepo.findAllUnfiltered.mockResolvedValue([
        { id: 'W1', system: 'dnd5e', dice: ['d20'] },
        { id: 'W2', system: 'matrix', dice: ['fate'] },
      ]);
      mockWorldsRepo.update.mockResolvedValue({});

      await service.onApplicationBootstrap();

      expect(mockWorldsRepo.update).not.toHaveBeenCalled();
    });

    it('chyba ve findAllUnfiltered nevyhodí — jen zaloguje', async () => {
      mockWorldsRepo.findAllUnfiltered.mockRejectedValue(new Error('DB down'));
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

    // R-20 world elevation — assertMember admin bypass jen při elevaci.
    it('platform Admin S ELEVACÍ obejde assertMember (bez membershipu)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockDiarySchemaVersionsRepo.findMetaByWorldId.mockResolvedValue([]);
      const elevatedAdmin = {
        id: 'adm',
        role: UserRole.Admin,
        username: 'A',
        elevatedWorldIds: ['W1'],
      };
      const result = await service.getDiarySchemaVersions('W1', elevatedAdmin);
      expect(result).toEqual([]);
    });

    it('platform Admin BEZ ELEVACE nemá assertMember bypass → 403 (R-20)', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const deElevatedAdmin = {
        id: 'adm',
        role: UserRole.Admin,
        username: 'A',
        // žádná elevace pro W1
        elevatedWorldIds: [],
      };
      await expect(
        service.getDiarySchemaVersions('W1', deElevatedAdmin),
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

    it('R-NEW — Admin NEMŮŽE odmítnout žádost v cizím světě', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockAccessRequestRepo.findById.mockResolvedValue(pendingAr);

      const admin = { id: 'admX', role: UserRole.Admin, username: 'A' };
      await expect(
        service.rejectAccessRequest('world1', 'ar1', admin),
      ).rejects.toThrow(ForbiddenException);
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
      expect(mockMembershipRepo.clearCharacter).toHaveBeenCalledWith('m1');
      expect(mockMembershipRepo.clearCharacter).toHaveBeenCalledWith('m3');
      expect(mockMembershipRepo.clearCharacter).not.toHaveBeenCalledWith('m2');
    });

    it('neudělá nic, pokud žádný člen postavu nemá', async () => {
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { id: 'm1', characterPath: 'jina' },
      ]);
      await service.onCharacterDeleted({ worldId: 'world1', slug: 'medak' });
      expect(mockMembershipRepo.clearCharacter).not.toHaveBeenCalled();
    });
  });

  // UM-15 — membership.avatarUrl je snapshot obrázku postavy (chat persona).
  // Od 9.1 character.* eventy `imageUrl` NEnesou (Page mirror ho drží), takže
  // bezpodmínečný zápis `avatarUrl: payload.imageUrl` vynuloval snapshot →
  // broken image. Fix: avatarUrl měň JEN když payload imageUrl opravdu nese.
  describe('UM-15 — avatarUrl snapshot se nevynuluje při character.* bez imageUrl', () => {
    beforeEach(() => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        avatarUrl: 'https://cdn/character.webp',
      });
    });

    it('UM-15 — onCharacterUpdated bez imageUrl NEpřepíše avatarUrl', async () => {
      await service.onCharacterUpdated({
        userId: 'u1',
        worldId: 'world1',
        isNpc: false,
        slug: 'medak',
      });
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m1', {
        characterPath: 'medak',
      });
      const updateArg = mockMembershipRepo.update.mock.calls[0][1];
      expect('avatarUrl' in updateArg).toBe(false);
    });

    it('UM-15 — onCharacterCreated bez imageUrl NEpřepíše avatarUrl', async () => {
      await service.onCharacterCreated({
        userId: 'u1',
        worldId: 'world1',
        isNpc: false,
        name: 'Meďák',
        slug: 'medak',
      });
      const updateArg = mockMembershipRepo.update.mock.calls[0][1];
      expect('avatarUrl' in updateArg).toBe(false);
    });

    it('UM-15 — onCharacterUpdated s imageUrl avatarUrl nastaví (regrese)', async () => {
      await service.onCharacterUpdated({
        userId: 'u1',
        worldId: 'world1',
        isNpc: false,
        slug: 'medak',
        imageUrl: 'https://cdn/new.webp',
      });
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m1', {
        characterPath: 'medak',
        avatarUrl: 'https://cdn/new.webp',
      });
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

    it('dropne neznámé taby přes whitelist (5 platných)', async () => {
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
      expect(call.characterTabVisibility.PostavaHrace).toHaveLength(5);
      expect(call.characterTabVisibility.PostavaHrace).not.toContain('denik2');
      expect(call.characterTabVisibility.PostavaHrace).not.toContain(
        'soukrome',
      );
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

  // 12.2 — „Last info" box: server plní updatedAt, null = smazat.
  describe('updateSettings — lastInfo (12.2)', () => {
    const pjMembership = { id: 'm-pj', role: WorldRole.PJ };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(pjMembership);
      mockSettingsRepo.upsert.mockImplementation((_id, data) =>
        Promise.resolve({ id: 's1', worldId: 'world1', ...data }),
      );
    });

    it('uloží text + visible a doplní updatedAt (Date)', async () => {
      await service.updateSettings(
        'world1',
        { lastInfo: { text: 'Sezení v pátek', visible: true } },
        mockRequester,
      );
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call.lastInfo.text).toBe('Sezení v pátek');
      expect(call.lastInfo.visible).toBe(true);
      expect(call.lastInfo.updatedAt).toBeInstanceOf(Date);
    });

    it('lastInfo=null smaže oznámení', async () => {
      await service.updateSettings('world1', { lastInfo: null }, mockRequester);
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call.lastInfo).toBeNull();
    });

    it('chybějící lastInfo nechá pole beze změny', async () => {
      await service.updateSettings(
        'world1',
        { hiddenNavItems: ['mapa'] },
        mockRequester,
      );
      const call = mockSettingsRepo.upsert.mock.calls[0][1];
      expect(call.lastInfo).toBeUndefined();
    });

    it('403 pro Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm-h',
        role: WorldRole.Hrac,
      });
      await expect(
        service.updateSettings(
          'world1',
          { lastInfo: { text: 'x', visible: true } },
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

  describe('soft-delete recovery (softDelete / restore / account vazba)', () => {
    const admin = { id: 'adm', role: UserRole.Admin, username: 'adm' };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld });
      mockWorldsRepo.update.mockResolvedValue({ ...mockWorld });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
    });

    it('softDelete: PJ vlastník → isActive:false + deletedAt + deletedBy', async () => {
      await service.softDelete('world1', mockRequester);
      expect(mockWorldsRepo.update).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({ isActive: false, deletedBy: 'user1' }),
      );
      const patch = mockWorldsRepo.update.mock.calls[0][1];
      expect(patch.deletedAt).toBeInstanceOf(Date);
    });

    it('softDelete: už smazaný svět → 400', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        deletedAt: new Date(),
      });
      await expect(service.softDelete('world1', mockRequester)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('restore: ne-admin (Ikarus) → 403', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        deletedAt: new Date(),
      });
      await expect(service.restore('world1', mockRequester)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('restore: Admin v okně → isActive:true + clear deletedAt', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        deletedAt: new Date(),
      });
      await service.restore('world1', admin);
      expect(mockWorldsRepo.update).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({
          isActive: true,
          deletedAt: null,
          deletedBy: null,
        }),
      );
    });

    it('restore: po 30 dnech → 410 Gone', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      await expect(service.restore('world1', admin)).rejects.toThrow(
        GoneException,
      );
    });

    it('restore: svět není smazaný → 400', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        deletedAt: null,
      });
      await expect(service.restore('world1', admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('restore s newOwnerId přiřadí nového vlastníka', async () => {
      mockWorldsRepo.findById.mockResolvedValue({
        ...mockWorld,
        deletedAt: new Date(),
      });
      await service.restore('world1', admin, 'newOwner');
      expect(mockWorldsRepo.update).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({ ownerId: 'newOwner' }),
      );
    });

    it('listDeleted: ne-admin → 403', async () => {
      await expect(service.listDeleted(mockRequester)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('onOwnerAccountHardDeleted soft-smaže vlastněné světy (pojistka)', async () => {
      mockWorldsRepo.findByOwnerId.mockResolvedValue([
        { ...mockWorld, deletedAt: null },
      ]);
      await service.onOwnerAccountHardDeleted({ userId: 'user1' });
      expect(mockWorldsRepo.update).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({
          isActive: false,
          deletedBy: 'system:account-deleted',
        }),
      );
    });
  });

  describe('elevation (nahození práv)', () => {
    const admin = { id: 'adm1', role: UserRole.Admin, username: 'adm' };
    const hrac = { id: 'h1', role: UserRole.Hrac, username: 'h' };

    it('elevate: admin → activate + event + {elevated:true}', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'w1', name: 'Svět' });
      const activate = service['elevationService'].activate as jest.Mock;
      const emit = service['eventEmitter'].emit as jest.Mock;
      const res = await service.elevate('w1', admin);
      expect(res).toEqual({ elevated: true });
      expect(activate).toHaveBeenCalledWith('adm1', 'w1');
      expect(emit).toHaveBeenCalledWith(
        'world.elevation.changed',
        expect.objectContaining({ action: 'activated', worldId: 'w1' }),
      );
    });

    it('elevate: ne-admin → 403', async () => {
      await expect(service.elevate('w1', hrac)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('elevate: neexistující svět → 404', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(service.elevate('missing', admin)).rejects.toBeDefined();
    });

    it('deElevate: admin → deactivate + {elevated:false}', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'w1', name: 'Svět' });
      const deactivate = service['elevationService'].deactivate as jest.Mock;
      const res = await service.deElevate('w1', admin);
      expect(res).toEqual({ elevated: false });
      expect(deactivate).toHaveBeenCalledWith('adm1', 'w1');
    });

    it('getElevationStatus: ne-admin → false bez lookupu', async () => {
      const isElevated = service['elevationService'].isElevated as jest.Mock;
      const res = await service.getElevationStatus('w1', hrac);
      expect(res).toEqual({ elevated: false });
      expect(isElevated).not.toHaveBeenCalled();
    });
  });
});
