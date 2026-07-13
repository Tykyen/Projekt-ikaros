import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { UserRole } from '../users/interfaces/user.interface';
import { UserBanCacheService } from '../users/services/user-ban-cache.service';
import { MailerService } from '../mailer/mailer.service';

describe('AdminService', () => {
  let service: AdminService;
  let mockEvents: { emit: jest.Mock };

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
  // D-DROBNE — notifikační mail na starou adresu při admin změně e-mailu.
  const mockMailer = {
    sendEmailChangeNotice: jest.fn().mockResolvedValue(undefined),
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
  };

  // Helper: Superadmin actor (může vše, kromě sebe)
  const superadmin = {
    id: 'sa',
    role: UserRole.Superadmin,
    canManageAdmins: false,
  } as never;

  beforeEach(async () => {
    mockEvents = { emit: jest.fn() };
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
        { provide: MailerService, useValue: mockMailer },
        // 1.7 — emit eventy pro D-026 + D-036
        { provide: EventEmitter2, useValue: mockEvents },
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

  describe('setAdminPermissions (R-05 A)', () => {
    const targetAdmin = {
      id: 'adm-target',
      role: UserRole.Admin,
      adminPermissions: {
        canManageAdmins: false,
        canModerateContent: false,
      },
    };

    it('Superadmin nastaví flagy Adminovi', async () => {
      mockUsersRepo.findById.mockResolvedValue(targetAdmin);
      mockUsersRepo.update.mockResolvedValue({
        ...targetAdmin,
        adminPermissions: {
          ...targetAdmin.adminPermissions,
          canModerateContent: true,
        },
      });
      await service.setAdminPermissions(superadmin, 'adm-target', {
        canModerateContent: true,
      });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('adm-target', {
        adminPermissions: expect.objectContaining({ canModerateContent: true }),
      });
    });

    it('Admin s canManageAdmins smí spravovat jiného Admina', async () => {
      mockUsersRepo.findById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'adm-mgr'
            ? {
                id: 'adm-mgr',
                role: UserRole.Admin,
                adminPermissions: {
                  canManageAdmins: true,
                  canModerateContent: false,
                },
              }
            : targetAdmin,
        ),
      );
      mockUsersRepo.update.mockResolvedValue(targetAdmin);
      const actor = { id: 'adm-mgr', role: UserRole.Admin } as never;
      await service.setAdminPermissions(actor, 'adm-target', {
        canModerateContent: true,
      });
      expect(mockUsersRepo.update).toHaveBeenCalled();
    });

    it('Admin bez canManageAdmins → 403', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'adm-plain',
        role: UserRole.Admin,
        adminPermissions: {
          canManageAdmins: false,
          canModerateContent: false,
        },
      });
      const actor = { id: 'adm-plain', role: UserRole.Admin } as never;
      await expect(
        service.setAdminPermissions(actor, 'adm-target', {
          canModerateContent: true,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('self-target → 400', async () => {
      await expect(
        service.setAdminPermissions(superadmin, 'sa', {
          canModerateContent: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('target není Admin → 400 NOT_ADMIN', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        id: 'u1',
        role: UserRole.Ikarus,
      });
      await expect(
        service.setAdminPermissions(superadmin, 'u1', {
          canModerateContent: true,
        }),
      ).rejects.toThrow(BadRequestException);
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

  // D-NEW-INV-ADMIN-UI — přímá změna e-mailu uživatele (Superadmin-only).
  describe('updateUserEmail', () => {
    const target = {
      id: 'u1',
      role: UserRole.Ikarus,
      username: 'cil',
      email: 'stary@x.cz',
      passwordHash: 'hash',
    };

    it('happy path: normalizuje e-mail, emailVerified=false, audit + identity signál, bez passwordHash', async () => {
      mockUsersRepo.findById.mockResolvedValue(target);
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.update.mockResolvedValue({
        ...target,
        email: 'novy@x.cz',
        emailVerified: false,
      });
      const result = await service.updateUserEmail(
        superadmin,
        'u1',
        '  Novy@X.cz ',
      );
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', {
        email: 'novy@x.cz',
        emailVerified: false,
      });
      expect(mockAuditRepo.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMAIL_CHANGE',
          before: { email: 'stary@x.cz' },
          after: { email: 'novy@x.cz' },
        }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith('user.identity.changed', {
        userId: 'u1',
        kind: 'email',
      });
      // D-DROBNE — notifikace jde na STAROU adresu (obrana proti tichému převzetí).
      expect(mockMailer.sendEmailChangeNotice).toHaveBeenCalledWith({
        to: 'stary@x.cz',
        username: 'cil',
        oldEmail: 'stary@x.cz',
        newEmail: 'novy@x.cz',
      });
      expect(result.email).toBe('novy@x.cz');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('D-DROBNE — selhání maileru změnu neshodí (fire-and-forget + logWarn)', async () => {
      mockUsersRepo.findById.mockResolvedValue(target);
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.update.mockResolvedValue({
        ...target,
        email: 'novy@x.cz',
        emailVerified: false,
      });
      mockMailer.sendEmailChangeNotice.mockRejectedValueOnce(
        new Error('SMTP down'),
      );
      const result = await service.updateUserEmail(
        superadmin,
        'u1',
        'novy@x.cz',
      );
      expect(result.email).toBe('novy@x.cz');
      // změna i signál proběhly navzdory mailer failu
      expect(mockEvents.emit).toHaveBeenCalledWith('user.identity.changed', {
        userId: 'u1',
        kind: 'email',
      });
    });

    it('D-DROBNE — při odmítnuté změně (409 EMAIL_TAKEN) se mail neposílá', async () => {
      mockUsersRepo.findById.mockResolvedValue(target);
      mockUsersRepo.findByEmail.mockResolvedValue({ id: 'u2' });
      await expect(
        service.updateUserEmail(superadmin, 'u1', 'obsazeny@x.cz'),
      ).rejects.toThrow(ConflictException);
      expect(mockMailer.sendEmailChangeNotice).not.toHaveBeenCalled();
    });

    it('ne-Superadmin (Admin) → 403 EMAIL_CHANGE_REQUIRES_SUPERADMIN', async () => {
      const admin = { id: 'adm', role: UserRole.Admin } as never;
      await expect(
        service.updateUserEmail(admin, 'u1', 'novy@x.cz'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('self-target → 403 (hierarchy helper SELF_MODIFICATION)', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        ...target,
        id: 'sa',
        role: UserRole.Superadmin,
      });
      await expect(
        service.updateUserEmail(superadmin, 'sa', 'novy@x.cz'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('neexistující uživatel → 404', async () => {
      mockUsersRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateUserEmail(superadmin, 'ghost', 'novy@x.cz'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'USER_NOT_FOUND' }),
      });
    });

    it('kolize e-mailu s jiným uživatelem → 409 EMAIL_TAKEN', async () => {
      mockUsersRepo.findById.mockResolvedValue(target);
      mockUsersRepo.findByEmail.mockResolvedValue({ id: 'u2' });
      await expect(
        service.updateUserEmail(superadmin, 'u1', 'obsazeny@x.cz'),
      ).rejects.toThrow(ConflictException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('stejný e-mail jako aktuální → 400 SAME_EMAIL', async () => {
      mockUsersRepo.findById.mockResolvedValue(target);
      await expect(
        service.updateUserEmail(superadmin, 'u1', 'STARY@x.cz'),
      ).rejects.toThrow(BadRequestException);
      expect(mockUsersRepo.findByEmail).not.toHaveBeenCalled();
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
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

    // FIX-72 — createUser dřív nezapisoval audit log.
    it('zapíše audit log USER_CREATE', async () => {
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
      await service.createUser(superadmin, dto);
      expect(mockAuditRepo.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_CREATE',
          actorId: 'sa',
          targetId: 'u-new',
          targetUsername: 'newuser',
        }),
      );
    });
  });

  // FIX-A část 2 (2026-07) — ban/moderation-delete musí force-disconnectnout
  // otevřené sockety (viz UsersIdentityGateway.handleIdentityChanged).
  // Cesta k tomu je `user.identity.changed` event — testujeme, že se
  // skutečně emituje se správným `kind`, aby gateway měla co zachytit.
  describe('banUser / requestUserDeletion — force-disconnect signál', () => {
    const target = {
      id: 'u1',
      role: UserRole.Ikarus,
      username: 'alice',
      isDeleted: false,
    };

    it('banUser invaliduje ban cache a emituje user.identity.changed(kind:"ban")', async () => {
      mockUsersRepo.findById.mockResolvedValue(target);
      mockUsersRepo.update.mockResolvedValue({
        ...target,
        bannedAt: new Date(),
        bannedBy: 'sa',
      });

      await service.banUser(superadmin, 'u1', { reason: 'spam' });

      expect(mockBanCache.invalidate).toHaveBeenCalledWith('u1');
      expect(mockEvents.emit).toHaveBeenCalledWith('user.identity.changed', {
        userId: 'u1',
        kind: 'ban',
      });
    });

    it('requestUserDeletion invaliduje ban cache a emituje user.identity.changed(kind:"deletion")', async () => {
      mockUsersRepo.findById.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'u1' ? target : { id: 'sa', role: UserRole.Superadmin },
        ),
      );
      mockUsersRepo.update.mockResolvedValue({
        ...target,
        deletionRequestedAt: new Date(),
      });

      await service.requestUserDeletion(superadmin, 'u1', {
        reason: 'porušení pravidel',
      });

      expect(mockBanCache.invalidate).toHaveBeenCalledWith('u1');
      expect(mockEvents.emit).toHaveBeenCalledWith('user.identity.changed', {
        userId: 'u1',
        kind: 'deletion',
      });
    });
  });
});
