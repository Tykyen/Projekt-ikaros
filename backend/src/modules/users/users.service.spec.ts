import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole } from './interfaces/user.interface';
import { UploadService } from '../upload/upload.service';
import { UserBanCacheService } from './services/user-ban-cache.service';
import { MailerService } from '../mailer/mailer.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';

const mockEvents = { emit: jest.fn() };

const mockUploadService = {
  uploadUserAvatar: jest.fn(),
  uploadCharacterAvatar: jest.fn(),
  deleteAvatar: jest.fn(),
};

const mockUser = {
  id: '1',
  email: 'a@a.com',
  username: 'user',
  passwordHash: 'hashedpass',
  role: UserRole.Ikarus,
  displayName: undefined,
  avatarUrl: undefined,
  characterPath: undefined,
  ikarosSkin: undefined,
  themeSettings: { theme: 'light', fontSize: 14 },
  chatPreferences: {},
  isOnline: false,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  const mockRepo = {
    findById: jest.fn(),
    findByUsername: jest.fn(),
    findByEmail: jest.fn(),
    findPublicPaginated: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockUsernameRequestsRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findPendingByUserId: jest.fn(),
    listPaginated: jest.fn(),
    update: jest.fn(),
    deletePending: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(30),
  };

  // 1.3c
  const mockBanCache = {
    invalidate: jest.fn(),
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
  };
  const mockRefreshRepo = {
    revokeAllForUser: jest.fn(),
    save: jest.fn(),
    findByJti: jest.fn(),
    revokeByJti: jest.fn(),
    revokeFamily: jest.fn(),
  };
  // 1.3c — PJ handover injekce
  const mockMembershipRepo = {
    findById: jest.fn(),
    findByWorldId: jest.fn().mockResolvedValue([]),
    findByUserId: jest.fn().mockResolvedValue([]),
    findByUserAndWorld: jest.fn(),
    countByWorldId: jest.fn(),
    countByUserId: jest.fn().mockResolvedValue(0),
    countsByUserIds: jest.fn().mockResolvedValue(new Map()),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
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
  // 1.7 — mailer + securityTokens
  const mockMailer = {
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeConfirm: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeNotice: jest.fn().mockResolvedValue(undefined),
    sendUsernameDecided: jest.fn().mockResolvedValue(undefined),
    sendAccountDeletionScheduled: jest.fn().mockResolvedValue(undefined),
  };
  const mockSecurityTokens = {
    issue: jest.fn().mockResolvedValue('plain-token'),
    consume: jest.fn(),
    hash: jest.fn((p: string) => `hash:${p}`),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: 'IUsersRepository', useValue: mockRepo },
        {
          provide: 'IUsernameChangeRequestsRepository',
          useValue: mockUsernameRequestsRepo,
        },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UploadService, useValue: mockUploadService },
        {
          provide: UserBanCacheService,
          useValue: mockBanCache,
        },
        { provide: 'IRefreshTokenRepository', useValue: mockRefreshRepo },
        {
          provide: 'IWorldMembershipRepository',
          useValue: mockMembershipRepo,
        },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        // 1.7 — email change flow
        {
          provide: MailerService,
          useValue: mockMailer,
        },
        {
          provide: SecurityTokensService,
          useValue: mockSecurityTokens,
        },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
    mockUsernameRequestsRepo.findPendingByUserId.mockResolvedValue(null);
  });

  // --- findById ---
  it('findById: throws NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.findById('unknown')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findById: returns user without passwordHash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    const result = await service.findById('1');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toHaveProperty('themeSettings');
  });

  // --- publicProfile ---
  it('publicProfile: throws NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.publicProfile('unknown')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('publicProfile: returns only public fields', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    const result = await service.publicProfile('1');
    expect(result).toHaveProperty('username', 'user');
    expect(result).toHaveProperty('role');
    expect(result).toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('themeSettings');
    expect(result).not.toHaveProperty('chatPreferences');
  });

  // --- update merge logika ---
  it('update: deep-merges themeSettings (přidá nový klíč, zachová starý)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({
      ...mockUser,
      themeSettings: { theme: 'light', fontSize: 14, accentColor: 'red' },
    });
    await service.update('1', { themeSettings: { accentColor: 'red' } });
    expect(mockRepo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        themeSettings: { theme: 'light', fontSize: 14, accentColor: 'red' },
      }),
    );
  });

  it('update: deep-merge přepíše existující klíč, zachová ostatní', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({
      ...mockUser,
      themeSettings: { theme: 'dark', fontSize: 14 },
    });
    await service.update('1', { themeSettings: { theme: 'dark' } });
    expect(mockRepo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        themeSettings: { theme: 'dark', fontSize: 14 },
      }),
    );
  });

  it('update: undefined themeSettings nezpůsobí přepsání (zachová stávající)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.update('1', { displayName: 'Elara' });
    const callArg = mockRepo.update.mock.calls[0][1];
    expect(callArg).not.toHaveProperty('themeSettings');
  });

  it('update: themeSettings.themeId merge zachová ostatní theme klíče (cross-device sync)', async () => {
    mockRepo.findById.mockResolvedValue({
      ...mockUser,
      themeSettings: {
        themeId: 'modre-nebe',
        calendarMonth: { y: 2026, m: 5 },
      },
    });
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({
      ...mockUser,
      themeSettings: { themeId: 'sci-fi', calendarMonth: { y: 2026, m: 5 } },
    });
    await service.update('1', { themeSettings: { themeId: 'sci-fi' } });
    expect(mockRepo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        themeSettings: {
          themeId: 'sci-fi',
          calendarMonth: { y: 2026, m: 5 },
        },
      }),
    );
  });

  it('update: username conflict → ConflictException', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue({ ...mockUser, id: '999' });
    await expect(service.update('1', { username: 'taken' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('update: username change na vlastní username → OK (žádný conflict)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(mockUser);
    mockRepo.update.mockResolvedValue(mockUser);
    await expect(
      service.update('1', { username: 'user' }),
    ).resolves.not.toThrow();
  });

  // --- changePassword ---
  it('changePassword: správné staré heslo → uloží nový hash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash' as never).mockResolvedValue('newhash' as never);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.changePassword('1', {
      oldPassword: 'old',
      newPassword: 'newpass123',
    });
    expect(mockRepo.update).toHaveBeenCalledWith('1', {
      passwordHash: 'newhash',
    });
  });

  it('changePassword: špatné staré heslo → UnauthorizedException', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(false as never);
    await expect(
      service.changePassword('1', {
        oldPassword: 'wrong',
        newPassword: 'newpass123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('changePassword: neznámý user → NotFoundException', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      service.changePassword('x', {
        oldPassword: 'old',
        newPassword: 'newpass123',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // --- resetPassword ---
  it('resetPassword: uloží nový hash bez ověření starého hesla', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'hash' as never).mockResolvedValue('resethash' as never);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.resetPassword('1', { newPassword: 'newpass123' });
    expect(mockRepo.update).toHaveBeenCalledWith('1', {
      passwordHash: 'resethash',
    });
  });

  it('resetPassword: neznámý user → NotFoundException', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      service.resetPassword('x', { newPassword: 'newpass123' }),
    ).rejects.toThrow(NotFoundException);
  });

  // --- delete ---
  it('delete: zavolá repo.delete s userId', async () => {
    mockRepo.delete.mockResolvedValue(true);
    await service.delete('1');
    expect(mockRepo.delete).toHaveBeenCalledWith('1');
  });

  it('delete: neznámý user → NotFoundException', async () => {
    mockRepo.delete.mockResolvedValue(false);
    await expect(service.delete('x')).rejects.toThrow(NotFoundException);
  });

  describe('changePassword event', () => {
    it('emituje "user.password.changed" po úspěšné změně hesla', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.update.mockResolvedValue(mockUser);
      await service.changePassword('1', {
        oldPassword: 'old',
        newPassword: 'new',
      });
      expect(mockEvents.emit).toHaveBeenCalledWith('user.password.changed', {
        userId: '1',
      });
    });
  });

  describe('resetPassword event', () => {
    it('emituje "user.password.changed" po Superadmin resetu', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue(mockUser);
      await service.resetPassword('1', { newPassword: 'new' });
      expect(mockEvents.emit).toHaveBeenCalledWith('user.password.changed', {
        userId: '1',
      });
    });
  });

  describe('exists', () => {
    it('vrátí true když username existuje', async () => {
      mockRepo.findByUsername.mockResolvedValue({
        id: 'u1',
        username: 'Karel',
      });
      const result = await service.exists('Karel');
      expect(result).toEqual({ exists: true });
    });

    it('vrátí false když username neexistuje', async () => {
      mockRepo.findByUsername.mockResolvedValue(null);
      const result = await service.exists('nope');
      expect(result).toEqual({ exists: false });
    });

    it('case-insensitive — Karel i karel najdou same user', async () => {
      // Po migraci usernameLower je findByUsername case-insensitive
      mockRepo.findByUsername.mockImplementation((u: string) =>
        Promise.resolve(
          u.toLowerCase() === 'karel' ? { id: 'u1', username: 'Karel' } : null,
        ),
      );
      expect(await service.exists('Karel')).toEqual({ exists: true });
      expect(await service.exists('karel')).toEqual({ exists: true });
      expect(await service.exists('KAREL')).toEqual({ exists: true });
    });

    it('username delší než 64 znaků → BadRequestException', async () => {
      const long = 'x'.repeat(65);
      await expect(service.exists(long)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateTheme', () => {
    const existing = {
      id: 'u1',
      email: 'a@b.cz',
      username: 'k',
      passwordHash: 'h',
      role: UserRole.Ikarus,
      themeSettings: { calendarMonth: { y: 2026, m: 5 }, color: 'red' },
      chatPreferences: {},
      favoriteDiscussionIds: [],
      isOnline: false,
      lastSeenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('merge zachová klíče, nepřepsané v patchi', async () => {
      mockRepo.findById.mockResolvedValue(existing);
      mockRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({
          ...existing,
          ...data,
        }),
      );

      const result = await service.updateTheme('u1', {
        color: 'blue',
        font: 'Arial',
      });

      expect(mockRepo.update).toHaveBeenCalledWith('u1', {
        themeSettings: {
          calendarMonth: { y: 2026, m: 5 },
          color: 'blue',
          font: 'Arial',
        },
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('neexistující user → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateTheme('nope', { color: 'blue' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Spec 1.4 — public adresář + veřejný profil ─────────────────────────
  describe('listPublic (spec 1.4)', () => {
    const baseUser = {
      ...mockUser,
      defaultAvatarType: 'male' as const,
      isDeleted: false,
    };

    it('admin: vrací items + total + worldsCount agregát', async () => {
      mockRepo.findPublicPaginated.mockResolvedValue({
        items: [
          { ...baseUser, id: 'u1', username: 'alice' },
          { ...baseUser, id: 'u2', username: 'bob' },
        ],
        total: 2,
      });
      mockMembershipRepo.countsByUserIds.mockResolvedValue(
        new Map([
          ['u1', 3],
          ['u2', 0],
        ]),
      );

      const result = await service.listPublic({}, UserRole.Admin);

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].worldsCount).toBe(3);
      expect(result.items[1].worldsCount).toBe(0);
    });

    it('response neobsahuje citlivá pole', async () => {
      mockRepo.findPublicPaginated.mockResolvedValue({
        items: [{ ...baseUser, id: 'u1', email: 'leak@test.com' }],
        total: 1,
      });
      mockMembershipRepo.countsByUserIds.mockResolvedValue(new Map());

      const result = await service.listPublic({}, UserRole.Admin);
      const item = result.items[0] as unknown as Record<string, unknown>;
      expect(item).not.toHaveProperty('email');
      expect(item).not.toHaveProperty('passwordHash');
      expect(item).not.toHaveProperty('lastLoginAt');
      expect(item).not.toHaveProperty('themeId');
      expect(item).not.toHaveProperty('chatColor');
      expect(item).not.toHaveProperty('bannedAt');
      expect(item).not.toHaveProperty('deletionRequestedAt');
    });

    it('non-admin requester: includeDeleted je ignorován (repo dostane false)', async () => {
      mockRepo.findPublicPaginated.mockResolvedValue({ items: [], total: 0 });
      mockMembershipRepo.countsByUserIds.mockResolvedValue(new Map());

      await service.listPublic({ includeDeleted: true }, UserRole.Ikarus);

      expect(mockRepo.findPublicPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ includeDeleted: false }),
      );
    });

    it('admin: includeDeleted=true → repo dostane true a deleted/pendingDeletion flagy se vrátí', async () => {
      mockRepo.findPublicPaginated.mockResolvedValue({
        items: [
          {
            ...baseUser,
            id: 'u1',
            isDeleted: true,
          },
          {
            ...baseUser,
            id: 'u2',
            deletionRequestedAt: new Date(),
          },
        ],
        total: 2,
      });
      mockMembershipRepo.countsByUserIds.mockResolvedValue(new Map());

      const result = await service.listPublic(
        { includeDeleted: true },
        UserRole.Superadmin,
      );

      expect(mockRepo.findPublicPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ includeDeleted: true }),
      );
      expect(result.items[0]).toMatchObject({ id: 'u1', deleted: true });
      expect(result.items[1]).toMatchObject({
        id: 'u2',
        pendingDeletion: true,
      });
    });

    it('sort default = "new", page default = 1, limit default = 24', async () => {
      mockRepo.findPublicPaginated.mockResolvedValue({ items: [], total: 0 });
      mockMembershipRepo.countsByUserIds.mockResolvedValue(new Map());

      await service.listPublic({}, UserRole.Admin);

      expect(mockRepo.findPublicPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 24, sort: 'new' }),
      );
    });
  });

  describe('publicProfileV14 (spec 1.4)', () => {
    const baseUser = {
      ...mockUser,
      id: 'u1',
      defaultAvatarType: 'male' as const,
      isDeleted: false,
    };

    it('vrátí PublicUserProfile shape bez citlivých polí', async () => {
      mockRepo.findById.mockResolvedValue(baseUser);
      mockMembershipRepo.countByUserId.mockResolvedValue(4);

      const result = await service.publicProfileV14('u1', UserRole.Ikarus);

      expect(result).toMatchObject({
        id: 'u1',
        username: 'user',
        worldsCount: 4,
      });
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('themeId');
      expect(result).not.toHaveProperty('chatColor');
      expect(result).not.toHaveProperty('lastLoginAt');
      expect(result).not.toHaveProperty('bannedAt');
    });

    it('neexistující user → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.publicProfileV14('nope', UserRole.Ikarus),
      ).rejects.toThrow(NotFoundException);
    });

    it('tombstone user → 404 pro Hrac, 200+deleted flag pro Admin', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseUser, isDeleted: true });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);

      await expect(
        service.publicProfileV14('u1', UserRole.Ikarus),
      ).rejects.toThrow(NotFoundException);

      const adminResult = await service.publicProfileV14('u1', UserRole.Admin);
      expect(adminResult).toMatchObject({ id: 'u1', deleted: true });
    });

    it('pending-deletion user → 404 pro Hrac, 200+pendingDeletion pro Superadmin', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        deletionRequestedAt: new Date(),
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);

      await expect(
        service.publicProfileV14('u1', UserRole.Ikarus),
      ).rejects.toThrow(NotFoundException);

      const adminResult = await service.publicProfileV14(
        'u1',
        UserRole.Superadmin,
      );
      expect(adminResult).toMatchObject({ id: 'u1', pendingDeletion: true });
    });

    // 1.5 D-050 — lastSeenAt
    it('lastSeenAt je vystaveno pro běžného usera', async () => {
      const seenAt = new Date('2026-05-12T10:00:00Z');
      mockRepo.findById.mockResolvedValue({ ...baseUser, lastSeenAt: seenAt });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14('u1', UserRole.Ikarus);
      expect(result.lastSeenAt).toBe(seenAt.toISOString());
    });

    it('lastSeenAt je null pro hiddenPresence usera (D-052)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        lastSeenAt: new Date(),
        hiddenPresence: true,
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14('u1', UserRole.Ikarus);
      expect(result.lastSeenAt).toBeNull();
    });

    it('lastSeenAt je null pro tombstone (admin výjimka)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        lastSeenAt: new Date(),
        isDeleted: true,
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14('u1', UserRole.Admin);
      expect(result.lastSeenAt).toBeNull();
    });
  });

  // ── 1.7 — requestEmailChange ─────────────────────────────────────────
  describe('requestEmailChange (1.7)', () => {
    beforeEach(() => {
      mockSecurityTokens.issue.mockResolvedValue('plain-token');
    });

    it('happy path → token vystaven, 2 maily odeslány, vrátí maskovaný', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, email: 'a@a.com' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.findByEmail.mockResolvedValue(null);
      const out = await service.requestEmailChange('1', {
        newEmail: 'novy@example.com',
        currentPassword: 'pass',
      });
      expect(out.ok).toBe(true);
      expect(out.sentTo).toContain('@example.com');
      expect(mockSecurityTokens.issue).toHaveBeenCalledWith(
        '1',
        'email_change',
        expect.any(Number),
        { newEmail: 'novy@example.com' },
      );
      expect(mockMailer.sendEmailChangeConfirm).toHaveBeenCalledWith({
        to: 'novy@example.com',
        username: 'user',
        token: 'plain-token',
      });
      expect(mockMailer.sendEmailChangeNotice).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@a.com' }),
      );
    });

    it('špatné heslo → 400 INVALID_PASSWORD', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.requestEmailChange('1', {
          newEmail: 'x@y.cz',
          currentPassword: 'bad',
        }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_PASSWORD' } });
      expect(mockSecurityTokens.issue).not.toHaveBeenCalled();
    });

    it('shodný e-mail → 400 SAME_EMAIL', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, email: 'a@a.com' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(
        service.requestEmailChange('1', {
          newEmail: 'A@A.COM', // case-insensitive
          currentPassword: 'pass',
        }),
      ).rejects.toMatchObject({ response: { code: 'SAME_EMAIL' } });
    });

    it('newEmail obsazený jiným userem → 409 EMAIL_TAKEN', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, email: 'a@a.com' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.findByEmail.mockResolvedValue({ ...mockUser, id: 'other' });
      await expect(
        service.requestEmailChange('1', {
          newEmail: 'taken@x.cz',
          currentPassword: 'pass',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('newEmail obsazený stejným userem (idempotent edge) → projde', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, email: 'a@a.com' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.findByEmail.mockResolvedValue({ ...mockUser, id: '1' });
      await expect(
        service.requestEmailChange('1', {
          newEmail: 'samostatny@x.cz',
          currentPassword: 'pass',
        }),
      ).resolves.toMatchObject({ ok: true });
    });

    it('mailer selže → log warn, žádný throw, response stejný', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, email: 'a@a.com' });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.findByEmail.mockResolvedValue(null);
      mockMailer.sendEmailChangeConfirm.mockRejectedValueOnce(
        new Error('SMTP'),
      );
      await expect(
        service.requestEmailChange('1', {
          newEmail: 'novy@x.cz',
          currentPassword: 'pass',
        }),
      ).resolves.toMatchObject({ ok: true });
    });

    it('user neexistuje → 404 USER_NOT_FOUND', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.requestEmailChange('missing', {
          newEmail: 'x@y.cz',
          currentPassword: 'pass',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
