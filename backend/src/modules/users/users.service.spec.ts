import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
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

// 1.3c — PJ handover helper mock (kontrola blocking/promotions ve self-delete testech).
jest.mock('./helpers/pj-handover.helper', () => ({
  assessPJHandover: jest.fn(),
  executePJHandover: jest.fn(),
}));
import {
  assessPJHandover,
  executePJHandover,
} from './helpers/pj-handover.helper';

const mockEvents = { emit: jest.fn() };

// D-057 — friendship repository pro friend-only profil check
const mockFriendsRepo = {
  findActiveBetween: jest.fn().mockResolvedValue(null),
};

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
    findByIds: jest.fn().mockResolvedValue([]),
    findPublicPaginated: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    pullFavoritePageSlug: jest.fn(),
  };
  const mockUsernameRequestsRepo = {
    create: jest.fn(),
    findById: jest.fn(),
    findPendingByUserId: jest.fn(),
    findLastUnseenDecidedByUserId: jest.fn(),
    markSeen: jest.fn(),
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
  };
  // 8.3 / D-075 — cross-world character agregátor
  const mockCharactersRepo = {
    findById: jest.fn(),
    findBySlugAndWorld: jest.fn(),
    findByUserAndWorld: jest.fn(),
    findAll: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
        {
          provide: 'IFriendshipsRepository',
          useValue: mockFriendsRepo,
        },
        // 8.3 / D-075 — cross-world character agregátor
        {
          provide: 'ICharactersRepository',
          useValue: mockCharactersRepo,
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

  it('update: D-072 — chatColor projde do updateData', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ ...mockUser, chatColor: '#1a2b3c' });
    await service.update('1', { chatColor: '#1a2b3c' });
    expect(mockRepo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ chatColor: '#1a2b3c' }),
    );
  });

  it('update: D-072 — undefined chatColor nezpůsobí přepsání', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.update('1', { displayName: 'Elara' });
    expect(mockRepo.update.mock.calls[0][1]).not.toHaveProperty('chatColor');
  });

  it('update: 1.3a — profilová pole projdou do updateData', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.update('1', {
      city: 'Praha',
      bio: 'Bio text',
      characterName: 'Aragorn',
      characterBio: 'Hraničář',
      characterAvatarUrl: 'https://cdn/x.webp',
      themeId: 'sci-fi',
      defaultAvatarType: 'female',
    });
    expect(mockRepo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        city: 'Praha',
        bio: 'Bio text',
        characterName: 'Aragorn',
        characterBio: 'Hraničář',
        characterAvatarUrl: 'https://cdn/x.webp',
        themeId: 'sci-fi',
        defaultAvatarType: 'female',
      }),
    );
  });

  it('update: 1.3a — prázdný characterAvatarUrl (smazání avataru) projde', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.update('1', { characterAvatarUrl: '' });
    expect(mockRepo.update).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ characterAvatarUrl: '' }),
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

  it('changePassword: špatné staré heslo → BadRequestException (FIX-50, ne 401)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(false as never);
    await expect(
      service.changePassword('1', {
        oldPassword: 'wrong',
        newPassword: 'newpass123',
      }),
    ).rejects.toThrow(BadRequestException);
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

      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Ikarus,
      );

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

    it('§15 — platformový Admin dostane lastLoginAt (poslední přihlášení)', async () => {
      const loginDate = new Date('2026-06-09T10:00:00.000Z');
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        lastLoginAt: loginDate,
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);

      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Admin,
      );
      expect(result.lastLoginAt).toBe(loginDate.toISOString());
    });

    it('vrátí veřejná profilová pole + postavu v Campu', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        bio: 'O mně',
        city: 'Praha',
        characterName: 'Aragorn',
        characterBio: 'Hraničář ze severu.',
        characterAvatarUrl: 'char.webp',
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);

      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Ikarus,
      );

      expect(result).toMatchObject({
        bio: 'O mně',
        city: 'Praha',
        characterName: 'Aragorn',
        characterBio: 'Hraničář ze severu.',
        characterAvatarUrl: 'char.webp',
      });
    });

    it('neexistující user → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.publicProfileV14('nope', 'viewer', UserRole.Ikarus),
      ).rejects.toThrow(NotFoundException);
    });

    it('tombstone user → 404 pro Hrac, 200+deleted flag pro Admin', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseUser, isDeleted: true });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);

      await expect(
        service.publicProfileV14('u1', 'viewer', UserRole.Ikarus),
      ).rejects.toThrow(NotFoundException);

      const adminResult = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Admin,
      );
      expect(adminResult).toMatchObject({ id: 'u1', deleted: true });
    });

    it('pending-deletion user → 404 pro Hrac, 200+pendingDeletion pro Superadmin', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        deletionRequestedAt: new Date(),
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);

      await expect(
        service.publicProfileV14('u1', 'viewer', UserRole.Ikarus),
      ).rejects.toThrow(NotFoundException);

      const adminResult = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Superadmin,
      );
      expect(adminResult).toMatchObject({ id: 'u1', pendingDeletion: true });
    });

    // 1.5 D-050 — lastSeenAt
    it('lastSeenAt je vystaveno pro běžného usera', async () => {
      const seenAt = new Date('2026-05-12T10:00:00Z');
      mockRepo.findById.mockResolvedValue({ ...baseUser, lastSeenAt: seenAt });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Ikarus,
      );
      expect(result.lastSeenAt).toBe(seenAt.toISOString());
    });

    it('lastSeenAt je null pro hiddenPresence usera (D-052)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        lastSeenAt: new Date(),
        hiddenPresence: true,
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Ikarus,
      );
      expect(result.lastSeenAt).toBeNull();
    });

    it('lastSeenAt je null pro tombstone (admin výjimka)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        lastSeenAt: new Date(),
        isDeleted: true,
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Admin,
      );
      expect(result.lastSeenAt).toBeNull();
    });

    // D-057 — friend-only profil
    it('profileVisibility friends → 403 pro nepřítele', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        profileVisibility: 'friends',
      });
      mockFriendsRepo.findActiveBetween.mockResolvedValueOnce(null);
      await expect(
        service.publicProfileV14('u1', 'viewer', UserRole.Ikarus),
      ).rejects.toThrow(ForbiddenException);
    });

    it('profileVisibility friends → projde pro přítele', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        profileVisibility: 'friends',
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      mockFriendsRepo.findActiveBetween.mockResolvedValueOnce({
        status: 'accepted',
      });
      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Ikarus,
      );
      expect(result.id).toBe('u1');
    });

    it('profileVisibility friends → projde pro mě (vlastní profil)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        profileVisibility: 'friends',
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14(
        'u1',
        'u1',
        UserRole.Ikarus,
      );
      expect(result.id).toBe('u1');
      expect(mockFriendsRepo.findActiveBetween).not.toHaveBeenCalled();
    });

    it('profileVisibility friends → projde pro Admina', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        profileVisibility: 'friends',
      });
      mockMembershipRepo.countByUserId.mockResolvedValue(0);
      const result = await service.publicProfileV14(
        'u1',
        'viewer',
        UserRole.Admin,
      );
      expect(result.id).toBe('u1');
      expect(mockFriendsRepo.findActiveBetween).not.toHaveBeenCalled();
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

  describe('D-028 — username request toast', () => {
    describe('getLastUnseenDecidedRequest', () => {
      it('vrátí { request: null } když nic nezhlédnutého není', async () => {
        mockUsernameRequestsRepo.findLastUnseenDecidedByUserId.mockResolvedValue(
          null,
        );
        const res = await service.getLastUnseenDecidedRequest('u1');
        expect(res).toEqual({ request: null });
      });

      it('vrátí DTO rozhodnuté žádosti bez requestedUsernameLower', async () => {
        mockUsernameRequestsRepo.findLastUnseenDecidedByUserId.mockResolvedValue(
          {
            id: 'r1',
            userId: 'u1',
            username: 'old',
            requestedUsername: 'new',
            status: 'approved',
            requestedAt: new Date('2026-05-01'),
            decidedAt: new Date('2026-05-02'),
          },
        );
        const res = await service.getLastUnseenDecidedRequest('u1');
        expect(res.request).toMatchObject({
          id: 'r1',
          requestedUsername: 'new',
          status: 'approved',
        });
        expect(res.request).not.toHaveProperty('requestedUsernameLower');
      });
    });

    describe('markUsernameRequestSeen', () => {
      it('označí žádost za zhlédnutou', async () => {
        mockUsernameRequestsRepo.findById.mockResolvedValue({
          id: 'r1',
          userId: 'u1',
          status: 'approved',
        });
        await service.markUsernameRequestSeen('u1', 'r1');
        expect(mockUsernameRequestsRepo.markSeen).toHaveBeenCalledWith('r1');
      });

      it('404 když žádost neexistuje', async () => {
        mockUsernameRequestsRepo.findById.mockResolvedValue(null);
        await expect(
          service.markUsernameRequestSeen('u1', 'r1'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(mockUsernameRequestsRepo.markSeen).not.toHaveBeenCalled();
      });

      it('404 když žádost patří jinému uživateli', async () => {
        mockUsernameRequestsRepo.findById.mockResolvedValue({
          id: 'r1',
          userId: 'someone-else',
          status: 'approved',
        });
        await expect(
          service.markUsernameRequestSeen('u1', 'r1'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(mockUsernameRequestsRepo.markSeen).not.toHaveBeenCalled();
      });

      it('idempotentní — už zhlédnutou žádost znovu nemarkuje', async () => {
        mockUsernameRequestsRepo.findById.mockResolvedValue({
          id: 'r1',
          userId: 'u1',
          status: 'approved',
          seenAt: new Date(),
        });
        await service.markUsernameRequestSeen('u1', 'r1');
        expect(mockUsernameRequestsRepo.markSeen).not.toHaveBeenCalled();
      });
    });
  });

  // ── 8.3 / D-074 — setFavoriteCharacters ─────────────────────────────
  describe('setFavoriteCharacters (D-074)', () => {
    const VALID_WORLD = '507f1f77bcf86cd799439011';

    it('404 NotFound když user neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.setFavoriteCharacters('u1', VALID_WORLD, ['frodo']),
      ).rejects.toThrow(NotFoundException);
    });

    it('400 BadRequest pro invalid worldId tvar', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoriteCharacters: {},
      });
      await expect(
        service.setFavoriteCharacters('u1', 'not-an-objectid', ['frodo']),
      ).rejects.toThrow(BadRequestException);
    });

    it('replace-all sémantika — uloží dedupované slugy', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoriteCharacters: {},
      });
      mockRepo.update.mockResolvedValue({ ...mockUser });
      const result = await service.setFavoriteCharacters('u1', VALID_WORLD, [
        'frodo',
        'samvis',
        'frodo', // dup
      ]);
      expect(result[VALID_WORLD]).toEqual(['frodo', 'samvis']);
      expect(mockRepo.update).toHaveBeenCalledWith('u1', {
        favoriteCharacters: { [VALID_WORLD]: ['frodo', 'samvis'] },
      });
    });

    it('prázdný array smaže záznam pro daný svět', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoriteCharacters: { [VALID_WORLD]: ['frodo'], world2: ['drak'] },
      });
      mockRepo.update.mockResolvedValue({ ...mockUser });
      const result = await service.setFavoriteCharacters('u1', VALID_WORLD, []);
      expect(result[VALID_WORLD]).toBeUndefined();
      expect(result['world2']).toEqual(['drak']);
    });

    it('zachová oblíbené v ostatních světech', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoriteCharacters: { world2: ['existing'] },
      });
      mockRepo.update.mockResolvedValue({ ...mockUser });
      const result = await service.setFavoriteCharacters('u1', VALID_WORLD, [
        'frodo',
      ]);
      expect(result).toEqual({
        world2: ['existing'],
        [VALID_WORLD]: ['frodo'],
      });
    });
  });

  // ── 5.2-followup — setFavoritePages ─────────────────────────────────
  describe('setFavoritePages (5.2-followup)', () => {
    const VALID_WORLD = '507f1f77bcf86cd799439011';

    it('404 NotFound když user neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.setFavoritePages('u1', VALID_WORLD, ['domov']),
      ).rejects.toThrow(NotFoundException);
    });

    it('400 BadRequest na nevalidní worldId', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoritePageSlugs: {},
      });
      await expect(
        service.setFavoritePages('u1', 'not-an-objectid', ['domov']),
      ).rejects.toThrow(BadRequestException);
    });

    it('dedup zachová POŘADÍ vložení (reorder)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoritePageSlugs: {},
      });
      mockRepo.update.mockResolvedValue({ ...mockUser });
      const result = await service.setFavoritePages('u1', VALID_WORLD, [
        'mapa',
        'domov',
        'mapa', // dup
        'lokace',
      ]);
      // pořadí dle prvního výskytu, ne abecedně
      expect(result[VALID_WORLD]).toEqual(['mapa', 'domov', 'lokace']);
      expect(mockRepo.update).toHaveBeenCalledWith('u1', {
        favoritePageSlugs: { [VALID_WORLD]: ['mapa', 'domov', 'lokace'] },
      });
    });

    it('prázdný array smaže záznam pro daný svět', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoritePageSlugs: { [VALID_WORLD]: ['domov'], world2: ['mesto'] },
      });
      mockRepo.update.mockResolvedValue({ ...mockUser });
      const result = await service.setFavoritePages('u1', VALID_WORLD, []);
      expect(result[VALID_WORLD]).toBeUndefined();
      expect(result['world2']).toEqual(['mesto']);
    });

    it('izolace — nezasáhne favoritePageSlugs jiných světů', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        favoritePageSlugs: { world2: ['existing'] },
      });
      mockRepo.update.mockResolvedValue({ ...mockUser });
      const result = await service.setFavoritePages('u1', VALID_WORLD, [
        'domov',
      ]);
      expect(result).toEqual({
        world2: ['existing'],
        [VALID_WORLD]: ['domov'],
      });
    });
  });

  // CD-08 (cascade-delete audit) — po smazání stránky se její slug musí
  // odebrat z `favoritePageSlugs` VŠECH uživatelů (jinak mrtvý slug → broken
  // dlaždice oblíbených). Handler `onPageDeleted` reaguje na event `page.deleted`
  // a deleguje na repo `$pull` (scoped na worldId).
  describe('onPageDeleted (CD-08 — favoritePageSlugs orphan cleanup)', () => {
    it('CD-08 — odebere smazaný slug z oblíbených napříč uživateli (scoped na worldId)', async () => {
      mockRepo.pullFavoritePageSlug.mockResolvedValue(undefined);
      await service.onPageDeleted({ worldId: 'world1', slug: 'stara-stranka' });
      expect(mockRepo.pullFavoritePageSlug).toHaveBeenCalledWith(
        'world1',
        'stara-stranka',
      );
    });
  });

  // ── 8.3 / D-075 — getMyCharacters ───────────────────────────────────
  describe('getMyCharacters (D-075)', () => {
    it('prázdné memberships → prázdný array', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([]);
      const result = await service.getMyCharacters('u1');
      expect(result).toEqual([]);
    });

    it('vyfiltruje memberships bez characterPath', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { worldId: 'w1', characterPath: '' },
        { worldId: 'w2', characterPath: null },
        { worldId: 'w3', characterPath: undefined },
      ]);
      const result = await service.getMyCharacters('u1');
      expect(result).toEqual([]);
      expect(mockCharactersRepo.findBySlugAndWorld).not.toHaveBeenCalled();
    });

    it('joinuje membership × world × character a vrací entries', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { worldId: 'w1', characterPath: 'frodo' },
        { worldId: 'w2', characterPath: 'aragorn' },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([
        { id: 'w1', name: 'Matrix', slug: 'matrix', imageUrl: 'mtx.png' },
        { id: 'w2', name: 'Pán prstenů', slug: 'lotr', imageUrl: undefined },
      ]);
      mockCharactersRepo.findBySlugAndWorld
        .mockResolvedValueOnce({
          id: 'c1',
          slug: 'frodo',
          name: 'Frodo',
          imageUrl: 'f.png',
          isNpc: false,
          kind: 'persona',
        })
        .mockResolvedValueOnce({
          id: 'c2',
          slug: 'aragorn',
          name: 'Aragorn',
          imageUrl: undefined,
          isNpc: false,
          kind: 'persona',
        });
      const result = await service.getMyCharacters('u1');
      expect(result).toHaveLength(2);
      // Sort by world name (cs) — Matrix < Pán
      expect(result[0].worldName).toBe('Matrix');
      expect(result[0].characterName).toBe('Frodo');
      expect(result[1].worldName).toBe('Pán prstenů');
      expect(result[1].characterName).toBe('Aragorn');
    });

    it('preskoč postavy které neexistují (PJ smazal)', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { worldId: 'w1', characterPath: 'smazana' },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([
        { id: 'w1', name: 'Matrix', slug: 'matrix' },
      ]);
      mockCharactersRepo.findBySlugAndWorld.mockResolvedValue(null);
      const result = await service.getMyCharacters('u1');
      expect(result).toEqual([]);
    });

    it('preskoč svět který neexistuje', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { worldId: 'wDead', characterPath: 'frodo' },
      ]);
      mockWorldsRepo.findByIds.mockResolvedValue([]); // svět smazán
      const result = await service.getMyCharacters('u1');
      expect(result).toEqual([]);
      expect(mockCharactersRepo.findBySlugAndWorld).not.toHaveBeenCalled();
    });
  });

  // D-040 — batch tombstone lookup pro chat/articles/discussions/galerie.
  describe('findManyTombstoneInfo (D-040)', () => {
    beforeEach(() => {
      mockRepo.findByIds.mockReset();
    });

    it('prázdný input → prázdná map (bez DB lookupu)', async () => {
      const result = await service.findManyTombstoneInfo([]);
      expect(result.size).toBe(0);
      expect(mockRepo.findByIds).not.toHaveBeenCalled();
    });

    it('aktivní user → isDeleted: false + původní displayName/avatar', async () => {
      mockRepo.findByIds.mockResolvedValue([
        {
          id: 'u1',
          isDeleted: false,
          displayName: 'Alice',
          avatarUrl: 'https://example.com/a.jpg',
          username: 'alice',
        },
      ]);
      const result = await service.findManyTombstoneInfo(['u1']);
      expect(result.get('u1')).toEqual({
        isDeleted: false,
        displayName: 'Alice',
        avatarUrl: 'https://example.com/a.jpg',
      });
    });

    it('smazaný user → isDeleted: true + „Smazaný účet" + bez avataru', async () => {
      mockRepo.findByIds.mockResolvedValue([
        {
          id: 'u2',
          isDeleted: true,
          displayName: 'Bob',
          avatarUrl: 'https://example.com/b.jpg',
          username: 'bob',
        },
      ]);
      const result = await service.findManyTombstoneInfo(['u2']);
      expect(result.get('u2')).toEqual({
        isDeleted: true,
        displayName: 'Smazaný účet',
        avatarUrl: undefined,
      });
    });

    it('missing ID (hard cleanup před D-040) → stub isDeleted: true', async () => {
      mockRepo.findByIds.mockResolvedValue([]); // nic nenalezeno
      const result = await service.findManyTombstoneInfo(['u3']);
      expect(result.get('u3')).toEqual({
        isDeleted: true,
        displayName: 'Smazaný účet',
      });
    });

    it('cache hit — druhé volání nevolá DB znovu', async () => {
      mockRepo.findByIds.mockResolvedValue([
        {
          id: 'u4',
          isDeleted: false,
          displayName: 'Carol',
          username: 'carol',
        },
      ]);
      await service.findManyTombstoneInfo(['u4']);
      await service.findManyTombstoneInfo(['u4']);
      expect(mockRepo.findByIds).toHaveBeenCalledTimes(1);
    });

    it('invalidateTombstoneCache vynutí refresh při dalším volání', async () => {
      mockRepo.findByIds.mockResolvedValue([
        {
          id: 'u5',
          isDeleted: false,
          displayName: 'Dave',
          username: 'dave',
        },
      ]);
      await service.findManyTombstoneInfo(['u5']);
      service.invalidateTombstoneCache('u5');
      await service.findManyTombstoneInfo(['u5']);
      expect(mockRepo.findByIds).toHaveBeenCalledTimes(2);
    });
  });

  describe('username-request CRUD (1.3b / N-6b)', () => {
    beforeEach(() => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        usernameChangedAt: undefined,
      });
      mockRepo.findByUsername.mockResolvedValue(null);
      mockUsernameRequestsRepo.findPendingByUserId.mockResolvedValue(null);
      mockUsernameRequestsRepo.create.mockImplementation((i: object) =>
        Promise.resolve({
          id: 'req1',
          status: 'pending',
          requestedAt: new Date(),
          ...i,
        }),
      );
    });

    it('vytvoří pending žádost', async () => {
      const res = await service.requestUsernameChange('u1', 'NovaPrezdivka');
      expect(mockUsernameRequestsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          requestedUsername: 'NovaPrezdivka',
        }),
      );
      expect(res.request.status).toBe('pending');
    });

    it('stejná přezdívka → SAME_USERNAME', async () => {
      await expect(
        service.requestUsernameChange('u1', mockUser.username),
      ).rejects.toMatchObject({ response: { code: 'SAME_USERNAME' } });
    });

    it('obsazená přezdívka → USERNAME_TAKEN', async () => {
      mockRepo.findByUsername.mockResolvedValue({ id: 'jiny' });
      await expect(
        service.requestUsernameChange('u1', 'Obsazena'),
      ).rejects.toMatchObject({ response: { code: 'USERNAME_TAKEN' } });
    });

    it('existující pending → REQUEST_EXISTS', async () => {
      mockUsernameRequestsRepo.findPendingByUserId.mockResolvedValue({
        id: 'p1',
      });
      await expect(
        service.requestUsernameChange('u1', 'Nova'),
      ).rejects.toMatchObject({ response: { code: 'REQUEST_EXISTS' } });
    });

    it('aktivní cooldown → COOLDOWN_ACTIVE', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        usernameChangedAt: new Date(),
      });
      await expect(
        service.requestUsernameChange('u1', 'Nova'),
      ).rejects.toMatchObject({ response: { code: 'COOLDOWN_ACTIVE' } });
    });

    it('getPendingUsernameRequest vrátí null bez pending', async () => {
      const res = await service.getPendingUsernameRequest('u1');
      expect(res.request).toBeNull();
    });

    it('cancelUsernameRequest volá deletePending', async () => {
      await service.cancelUsernameRequest('u1');
      expect(mockUsernameRequestsRepo.deletePending).toHaveBeenCalledWith('u1');
    });
  });

  describe('self-deletion (1.3c / N-6b)', () => {
    const baseUser = {
      id: 'u1',
      username: 'alice',
      email: 'alice@a.com',
      passwordHash: 'h',
      role: UserRole.Ikarus,
      isDeleted: false,
    };

    it('USER_NOT_FOUND když uživatel neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.requestSelfDeletion('u1', 'alice')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ALREADY_DELETED pro tombstone', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseUser, isDeleted: true });
      await expect(service.requestSelfDeletion('u1', 'alice')).rejects.toThrow(
        ConflictException,
      );
    });

    it('ALREADY_PENDING_DELETION když už pending', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        deletionRequestedAt: new Date(),
      });
      await expect(service.requestSelfDeletion('u1', 'alice')).rejects.toThrow(
        ConflictException,
      );
    });

    it('USERNAME_MISMATCH když potvrzení nesouhlasí', async () => {
      mockRepo.findById.mockResolvedValue(baseUser);
      await expect(service.requestSelfDeletion('u1', 'WRONG')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('SOLE_PJ_BLOCK když je jediný PJ bez Pomocného', async () => {
      mockRepo.findById.mockResolvedValue(baseUser);
      (assessPJHandover as jest.Mock).mockResolvedValue({
        blocking: [{ worldId: 'w1', worldName: 'Svět', worldSlug: 'svet' }],
        promotions: [],
      });
      await expect(service.requestSelfDeletion('u1', 'alice')).rejects.toThrow(
        BadRequestException,
      );
      expect(executePJHandover).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('dryRun vrátí promotions bez zápisu a bez eventů', async () => {
      mockRepo.findById.mockResolvedValue(baseUser);
      (assessPJHandover as jest.Mock).mockResolvedValue({
        blocking: [],
        promotions: [
          {
            worldId: 'w1',
            worldName: 'Svět',
            worldSlug: 'svet',
            promotedUserId: 'u2',
            promotedUsername: 'bob',
          },
        ],
      });
      const res = await service.requestSelfDeletion('u1', 'alice', true);
      expect(res.promotions).toHaveLength(1);
      expect(res.deletionRequestedAt).toBeNull();
      expect(executePJHandover).not.toHaveBeenCalled();
      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('happy path: zápis flagů + revoke event + scheduled mail + ban invalidate', async () => {
      mockRepo.findById.mockResolvedValue(baseUser);
      (assessPJHandover as jest.Mock).mockResolvedValue({
        blocking: [],
        promotions: [],
      });
      (executePJHandover as jest.Mock).mockResolvedValue(undefined);
      mockRepo.update.mockResolvedValue(baseUser);

      const res = await service.requestSelfDeletion('u1', 'alice');

      expect(executePJHandover).toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          deletionRequestedBy: 'u1',
          deletionReason: 'self-requested',
        }),
      );
      expect(mockBanCache.invalidate).toHaveBeenCalledWith('u1');
      expect(mockEvents.emit).toHaveBeenCalledWith('user.deletion.requested', {
        userId: 'u1',
      });
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'account.deletion.scheduled',
        expect.objectContaining({ userId: 'u1', byAdmin: false }),
      );
      expect(res.deletionRequestedAt).toBeInstanceOf(Date);
      expect(res.scheduledHardDeleteAt).toBeInstanceOf(Date);
    });

    it('getSelfDeletionStatus → null bez pending', async () => {
      mockRepo.findById.mockResolvedValue(baseUser);
      const res = await service.getSelfDeletionStatus('u1');
      expect(res.deletionRequestedAt).toBeNull();
    });

    it('getSelfDeletionStatus → datumy když pending', async () => {
      const at = new Date();
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        deletionRequestedAt: at,
      });
      const res = await service.getSelfDeletionStatus('u1');
      expect(res.deletionRequestedAt).toEqual(at);
      expect(res.scheduledHardDeleteAt).toBeInstanceOf(Date);
    });

    it('cancelSelfDeletion: noop bez pending', async () => {
      mockRepo.findById.mockResolvedValue(baseUser);
      await service.cancelSelfDeletion('u1');
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('cancelSelfDeletion: clear flagů + ban invalidate když pending', async () => {
      mockRepo.findById.mockResolvedValue({
        ...baseUser,
        deletionRequestedAt: new Date(),
      });
      await service.cancelSelfDeletion('u1');
      expect(mockRepo.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ deletionRequestedAt: undefined }),
      );
      expect(mockBanCache.invalidate).toHaveBeenCalledWith('u1');
    });
  });
});
