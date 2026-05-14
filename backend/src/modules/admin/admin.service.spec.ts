import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { UserRole } from '../users/interfaces/user.interface';
import { UserBanCacheService } from '../users/services/user-ban-cache.service';

describe('AdminService', () => {
  let service: AdminService;

  const mockUsersRepo = {
    findById: jest.fn(),
    findAllPaginated: jest.fn(),
    update: jest.fn(),
    findByUsername: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
  };
  const mockUsernameRequestsRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findPendingByUserId: jest.fn(),
    listPaginated: jest.fn(),
    update: jest.fn(),
    deletePending: jest.fn(),
  };
  const mockRefreshTokenRepo = {
    revokeAllForUser: jest.fn(),
  };
  const mockAuditRepo = {
    record: jest.fn(),
    listPaginated: jest.fn(),
  };
  const mockBanCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
    size: jest.fn(),
  };
  const mockPagesRepo = {
    findRecent: jest.fn(),
  };
  const mockMembershipRepo = {
    findById: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue([]),
    findByWorldId: jest.fn().mockResolvedValue([]),
    findByUserAndWorld: jest.fn(),
    countByWorldId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  // 1.3c — PJ handover potřebuje IWorldsRepository
  const mockWorldsRepo = {
    findById: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    existsBySlug: jest.fn(),
    findAll: jest.fn(),
    increment: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    updateCalendarConfig: jest.fn(),
    delete: jest.fn(),
    addFavoriteSlug: jest.fn(),
    removeFavoriteSlug: jest.fn(),
  };

  // Helper: Superadmin actor (může vše, kromě sebe)
  const superadmin = {
    id: 'sa',
    role: UserRole.Superadmin,
    canManageAdmins: false,
  } as never;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        {
          provide: 'IUsernameChangeRequestsRepository',
          useValue: mockUsernameRequestsRepo,
        },
        {
          provide: 'IRefreshTokenRepository',
          useValue: mockRefreshTokenRepo,
        },
        {
          provide: 'IAdminAuditLogRepository',
          useValue: mockAuditRepo,
        },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: UserBanCacheService, useValue: mockBanCache },
        // 1.7 — emit eventy pro D-026 + D-036
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(30) },
        },
      ],
    }).compile();
    service = module.get(AdminService);
    jest.clearAllMocks();
  });

  describe('getUsers', () => {
    it('vrátí stránkovaný seznam uživatelů', async () => {
      mockUsersRepo.findAllPaginated.mockResolvedValue({ items: [], total: 0 });
      const result = await service.getUsers({ page: 1, limit: 20 });
      expect(mockUsersRepo.findAllPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('updateUserRole', () => {
    it('Superadmin aktualizuje roli uživatele', async () => {
      const user = { id: 'u1', role: UserRole.Ikarus, canManageAdmins: false };
      mockUsersRepo.findById.mockResolvedValue(user);
      mockUsersRepo.update.mockResolvedValue({ ...user, role: UserRole.Admin });
      const result = await service.updateUserRole(
        superadmin,
        'u1',
        UserRole.Admin,
      );
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', {
        role: UserRole.Admin,
      });
      expect(result?.role).toBe(UserRole.Admin);
    });
  });

  describe('getRecentPages', () => {
    it('Superadmin dostane stránky ze všech světů', async () => {
      const superadmin = { id: 'sa', role: UserRole.Superadmin };
      mockPagesRepo.findRecent.mockResolvedValue([]);
      await service.getRecentPages(superadmin, 20);
      expect(mockPagesRepo.findRecent).toHaveBeenCalledWith(20, undefined);
    });

    // D-053 — endpoint zúžen na Sa/Admin (per @Roles na controlleru). Service vrací
    // všechny stránky pro staff; PJ-in-any-world branch byla odstraněna.
    it('Admin dostane stránky ze všech světů', async () => {
      const admin = { id: 'adm1', role: UserRole.Admin };
      mockPagesRepo.findRecent.mockResolvedValue([]);
      await service.getRecentPages(admin, 20);
      expect(mockPagesRepo.findRecent).toHaveBeenCalledWith(20, undefined);
    });
  });

  describe('createUser', () => {
    const dto = {
      email: 'new@x.cz',
      username: 'newuser',
      password: 'secret123',
    };

    it('happy path: hashuje heslo, default role Hrac, vrací safe user', async () => {
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.save.mockImplementation((u) =>
        Promise.resolve({
          id: 'u-new',
          ...u,
          isOnline: false,
          lastSeenAt: new Date(),
          favoriteDiscussionIds: [],
          themeSettings: {},
          chatPreferences: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const result = await service.createUser(superadmin, dto);
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@x.cz',
          username: 'newuser',
          role: UserRole.Ikarus,
        }),
      );
      const savedArg = mockUsersRepo.save.mock.calls[0][0];
      expect(savedArg.passwordHash).toBeDefined();
      expect(savedArg.passwordHash).not.toBe('secret123');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.username).toBe('newuser');
    });

    it('username konflikt → 409', async () => {
      mockUsersRepo.findByUsername.mockResolvedValue({ id: 'existing' });
      await expect(service.createUser(superadmin, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('email konflikt → 409', async () => {
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      mockUsersRepo.findByEmail.mockResolvedValue({ id: 'existing' });
      await expect(service.createUser(superadmin, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('explicit role respektována', async () => {
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.save.mockImplementation((u) =>
        Promise.resolve({
          id: 'u-new',
          ...u,
          isOnline: false,
          lastSeenAt: new Date(),
          favoriteDiscussionIds: [],
          themeSettings: {},
          chatPreferences: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      await service.createUser(superadmin, { ...dto, role: UserRole.Ikarus });
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.Ikarus }),
      );
    });
  });
});
