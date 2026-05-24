import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { UserRole } from '../users/interfaces/user.interface';
import { MailerService } from '../mailer/mailer.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import { UserBanCacheService } from '../users/services/user-ban-cache.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));
jest.mock('uuid', () => ({ v4: jest.fn() }));
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';

const mockUser = {
  id: '1',
  email: 'a@a.com',
  username: 'user',
  passwordHash: 'hash',
  role: UserRole.Ikarus,
  displayName: undefined,
  avatarUrl: undefined,
  characterPath: 'elara',
  themeSettings: {},
  chatPreferences: {},
  isOnline: false,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  const mockUsersRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    updateLastSeen: jest.fn(),
    updateLastLogin: jest.fn(),
  };
  const mockRefreshRepo = {
    save: jest.fn(),
    findByJti: jest.fn(),
    revokeByJti: jest.fn(),
    revokeFamily: jest.fn(),
    revokeAllForUser: jest.fn(),
  };
  const mockJwt = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      if (key === 'JWT_REFRESH_TTL_DAYS') return '30';
      return undefined;
    }),
  };

  const mockMailer = {
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeConfirm: jest.fn().mockResolvedValue(undefined),
    sendEmailChangeNotice: jest.fn().mockResolvedValue(undefined),
    sendUsernameDecided: jest.fn().mockResolvedValue(undefined),
    sendAccountDeletionScheduled: jest.fn().mockResolvedValue(undefined),
  };

  // 1.7 — SecurityTokensService mock (issue → vrací plain token; consume → vrací userId)
  const mockSecurityTokens = {
    issue: jest.fn().mockResolvedValue('plain-token-123'),
    consume: jest.fn(),
    hash: jest.fn((p: string) => `hash:${p}`),
  };

  // 1.3c — banCache se invaliduje při reaktivaci pending soft-delete
  const mockBanCache = {
    invalidate: jest.fn(),
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
  };

  // D-011 — Captcha service mock (default = pass).
  const mockCaptcha = {
    verify: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IRefreshTokenRepository', useValue: mockRefreshRepo },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailerService, useValue: mockMailer },
        {
          provide: UserBanCacheService,
          useValue: mockBanCache,
        },
        // 1.3c D-035 — EventEmitter pro audit hooks
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        // 1.7 — SecurityTokensService pro reset/verify/change tokens
        { provide: SecurityTokensService, useValue: mockSecurityTokens },
        // D-011 — captcha (Cloudflare Turnstile).
        { provide: CaptchaService, useValue: mockCaptcha },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
    (uuid as jest.Mock)
      .mockReturnValueOnce('jti-1')
      .mockReturnValueOnce('family-1');
    mockJwt.sign.mockImplementation(
      (payload: any) => `signed-${JSON.stringify(payload).slice(0, 30)}`,
    );
  });

  describe('register', () => {
    it('vyhodí ConflictException s code EMAIL_TAKEN pro duplicitní email', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(mockUser);
      try {
        await service.register({
          email: 'a@a.com',
          username: 'new',
          password: 'pass123',
        });
        fail('expected ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse();
        expect(response).toMatchObject({
          statusCode: 409,
          message: 'Email již existuje',
          code: 'EMAIL_TAKEN',
        });
      }
    });

    it('vyhodí ConflictException s code USERNAME_TAKEN pro duplicitní username', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.findByUsername.mockResolvedValue(mockUser);
      try {
        await service.register({
          email: 'new@new.com',
          username: 'user',
          password: 'pass123',
        });
        fail('expected ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const response = (err as ConflictException).getResponse();
        expect(response).toMatchObject({
          statusCode: 409,
          message: 'Username již existuje',
          code: 'USERNAME_TAKEN',
        });
      }
    });

    it('vrátí accessToken + refreshToken + user pro nového uživatele', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      mockUsersRepo.save.mockResolvedValue(mockUser);
      mockRefreshRepo.save.mockResolvedValue({});
      const result = await service.register({
        email: 'a@a.com',
        username: 'new',
        password: 'pass123',
      });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockRefreshRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          jti: 'jti-1',
          familyId: 'family-1',
          userId: '1',
          revoked: false,
        }),
      );
    });

    it('1.3a — registrace ukládá lastLoginAt (první přihlášení)', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      mockUsersRepo.save.mockResolvedValue(mockUser);
      mockRefreshRepo.save.mockResolvedValue({});
      await service.register({
        email: 'a@a.com',
        username: 'new',
        password: 'pass123',
      });
      expect(mockUsersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      );
    });
  });

  describe('login', () => {
    it('vyhodí UnauthorizedException pro špatné heslo (login emailem)', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockUsersRepo.findByEmail.mockResolvedValue(mockUser);
      await expect(
        service.login({ identifier: 'a@a.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('vrátí pár tokenů pro login emailem (identifier obsahuje @)', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUsersRepo.findByEmail.mockResolvedValue(mockUser);
      const result = await service.login({
        identifier: 'a@a.com',
        password: 'pass123',
      });
      // 1.3c — union response; ok případ má `status: 'ok'`
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') fail('expected ok status');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockUsersRepo.findByEmail).toHaveBeenCalledWith('a@a.com');
      expect(mockUsersRepo.findByUsername).not.toHaveBeenCalled();
      expect(mockRefreshRepo.save).toHaveBeenCalled();
      // 1.3a — login zapisuje lastLoginAt
      expect(mockUsersRepo.updateLastLogin).toHaveBeenCalledWith(
        '1',
        expect.any(Date),
      );
    });

    it('vrátí pár tokenů pro login přezdívkou (identifier bez @)', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUsersRepo.findByUsername.mockResolvedValue(mockUser);
      const result = await service.login({
        identifier: 'user',
        password: 'pass123',
      });
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') fail('expected ok status');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockUsersRepo.findByUsername).toHaveBeenCalledWith('user');
      expect(mockUsersRepo.findByEmail).not.toHaveBeenCalled();
    });

    it('vyhodí UnauthorizedException pokud uživatel s danou přezdívkou neexistuje', async () => {
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await expect(
        service.login({ identifier: 'neexistuje', password: 'pass123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('vyhodí UnauthorizedException pokud uživatel s daným emailem neexistuje', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ identifier: 'x@x.com', password: 'pass123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const validPayload = {
      sub: '1',
      jti: 'old-jti',
      familyId: 'fam-1',
      type: 'refresh',
    };

    beforeEach(() => {
      mockUsersRepo.findById.mockResolvedValue(mockUser);
      mockJwt.verify.mockReturnValue(validPayload);
    });

    it('vyhodí UnauthorizedException pro invalid signature', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('vyhodí UnauthorizedException pokud type !== "refresh"', async () => {
      mockJwt.verify.mockReturnValue({ sub: '1', jti: 'j', familyId: 'f' });
      await expect(service.refresh('access-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('vyhodí UnauthorizedException pokud jti není v DB', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue(null);
      await expect(service.refresh('orphan')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('vrátí nový pár tokenů pro validní refresh', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti',
        userId: '1',
        familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000),
        revoked: false,
        createdAt: new Date(),
      });
      const result = await service.refresh('valid-token');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('odmítne expirovaný refresh token (TokenExpiredError → 401)', async () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      mockJwt.verify.mockImplementation(() => {
        throw err;
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockJwt.verify).toHaveBeenCalledWith('expired-token', {
        secret: expect.any(String),
      });
      // refreshRepo.findByJti se nesmí volat — verify selhal před DB lookup
      expect(mockRefreshRepo.findByJti).not.toHaveBeenCalled();
    });

    it('revokuje starý jti po úspěšném refreshi', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti',
        userId: '1',
        familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000),
        revoked: false,
        createdAt: new Date(),
      });
      await service.refresh('valid-token');
      expect(mockRefreshRepo.revokeByJti).toHaveBeenCalledWith('old-jti');
    });

    it('nový token má stejný familyId', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti',
        userId: '1',
        familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000),
        revoked: false,
        createdAt: new Date(),
      });
      await service.refresh('valid-token');
      expect(mockRefreshRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          familyId: 'fam-1',
          userId: '1',
          revoked: false,
        }),
      );
    });
  });

  describe('refresh — reuse detection', () => {
    const revokedPayload = {
      sub: '1',
      jti: 'rev-jti',
      familyId: 'fam-2',
      type: 'refresh',
    };

    beforeEach(() => {
      mockUsersRepo.findById.mockResolvedValue(mockUser);
      mockJwt.verify.mockReturnValue(revokedPayload);
    });

    it('vyhodí UnauthorizedException pokud token je již revoked', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'rev-jti',
        userId: '1',
        familyId: 'fam-2',
        expiresAt: new Date(Date.now() + 1000000),
        revoked: true,
        createdAt: new Date(),
      });
      await expect(service.refresh('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('při reuse zruší celou rodinu', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'rev-jti',
        userId: '1',
        familyId: 'fam-2',
        expiresAt: new Date(Date.now() + 1000000),
        revoked: true,
        createdAt: new Date(),
      });
      await expect(service.refresh('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockRefreshRepo.revokeFamily).toHaveBeenCalledWith('fam-2');
    });

    it('legitimní rotace nezruší rodinu', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti',
        userId: '1',
        familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000),
        revoked: false,
        createdAt: new Date(),
      });
      mockJwt.verify.mockReturnValue({
        sub: '1',
        jti: 'old-jti',
        familyId: 'fam-1',
        type: 'refresh',
      });
      await service.refresh('valid-token');
      expect(mockRefreshRepo.revokeFamily).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokuje familyId pro validní token', async () => {
      mockJwt.verify.mockReturnValue({
        sub: '1',
        jti: 'j',
        familyId: 'fam-X',
        type: 'refresh',
      });
      await service.logout('valid-token');
      expect(mockRefreshRepo.revokeFamily).toHaveBeenCalledWith('fam-X');
    });

    it('je idempotent pro neplatný token (nevyhodí)', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      await expect(service.logout('bad-token')).resolves.toBeUndefined();
      expect(mockRefreshRepo.revokeFamily).not.toHaveBeenCalled();
    });

    it('je idempotent pro token bez type=refresh', async () => {
      mockJwt.verify.mockReturnValue({ sub: '1', jti: 'j' });
      await expect(service.logout('access-token')).resolves.toBeUndefined();
      expect(mockRefreshRepo.revokeFamily).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('revokuje všechny tokeny daného userId', async () => {
      await service.logoutAll('user-99');
      expect(mockRefreshRepo.revokeAllForUser).toHaveBeenCalledWith('user-99');
    });
  });

  describe('handlePasswordChanged (OnEvent listener)', () => {
    it('zruší všechny refresh tokeny userId', async () => {
      await service.handlePasswordChanged({ userId: 'user-77' });
      expect(mockRefreshRepo.revokeAllForUser).toHaveBeenCalledWith('user-77');
    });
  });

  describe('checkUsername', () => {
    it('vrátí available=true pro neexistující validní username', async () => {
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await expect(service.checkUsername('NoveJmeno')).resolves.toEqual({
        available: true,
      });
      expect(mockUsersRepo.findByUsername).toHaveBeenCalledWith('NoveJmeno');
    });

    it('vrátí available=false pro existující username', async () => {
      mockUsersRepo.findByUsername.mockResolvedValue(mockUser);
      await expect(service.checkUsername('user')).resolves.toEqual({
        available: false,
      });
    });

    it('vrátí available=false pro prázdný řetězec (early return, žádný DB lookup)', async () => {
      await expect(service.checkUsername('')).resolves.toEqual({
        available: false,
      });
      expect(mockUsersRepo.findByUsername).not.toHaveBeenCalled();
    });

    it('vrátí available=false pro username < 3 znaky', async () => {
      await expect(service.checkUsername('ab')).resolves.toEqual({
        available: false,
      });
      expect(mockUsersRepo.findByUsername).not.toHaveBeenCalled();
    });

    it('vrátí available=false pro username > 32 znaky', async () => {
      await expect(service.checkUsername('a'.repeat(33))).resolves.toEqual({
        available: false,
      });
      expect(mockUsersRepo.findByUsername).not.toHaveBeenCalled();
    });

    it('vrátí available=false pro username obsahující @', async () => {
      await expect(service.checkUsername('user@bad')).resolves.toEqual({
        available: false,
      });
      expect(mockUsersRepo.findByUsername).not.toHaveBeenCalled();
    });
  });

  describe('checkEmail', () => {
    it('vrátí available=true pro neexistující validní e-mail', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      await expect(service.checkEmail('new@new.com')).resolves.toEqual({
        available: true,
      });
      expect(mockUsersRepo.findByEmail).toHaveBeenCalledWith('new@new.com');
    });

    it('vrátí available=false pro existující e-mail', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(mockUser);
      await expect(service.checkEmail('a@a.com')).resolves.toEqual({
        available: false,
      });
    });

    it('lookup je case-insensitive (lowercase před DB query)', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      await service.checkEmail('UPPER@CASE.COM');
      expect(mockUsersRepo.findByEmail).toHaveBeenCalledWith('upper@case.com');
    });

    it('vrátí available=false pro prázdný řetězec (early return)', async () => {
      await expect(service.checkEmail('')).resolves.toEqual({
        available: false,
      });
      expect(mockUsersRepo.findByEmail).not.toHaveBeenCalled();
    });

    it('vrátí available=false pro řetězec bez @', async () => {
      await expect(service.checkEmail('noatsign')).resolves.toEqual({
        available: false,
      });
      expect(mockUsersRepo.findByEmail).not.toHaveBeenCalled();
    });

    it('vrátí available=false pro e-mail > 255 znaků', async () => {
      const long = 'a'.repeat(251) + '@b.cc'; // 256 znaků
      await expect(service.checkEmail(long)).resolves.toEqual({
        available: false,
      });
      expect(mockUsersRepo.findByEmail).not.toHaveBeenCalled();
    });
  });

  // ── 1.7 — Password reset flow (D-006 + D-037) ────────────────────────
  describe('forgotPassword (1.7)', () => {
    beforeEach(() => {
      mockSecurityTokens.issue.mockResolvedValue('plain-token-123');
    });

    it('známý e-mail → vystaví token + pošle mail + ok', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        isDeleted: false,
        deletionRequestedAt: undefined,
      });
      const out = await service.forgotPassword('a@a.com');
      expect(out).toEqual({ ok: true });
      expect(mockSecurityTokens.issue).toHaveBeenCalledWith(
        '1',
        'password_reset',
        AuthService.PASSWORD_RESET_TTL_MS,
      );
      expect(mockMailer.sendPasswordReset).toHaveBeenCalledWith({
        to: 'a@a.com',
        username: 'user',
        token: 'plain-token-123',
      });
    });

    it('neznámý e-mail → 200 ok, žádný token, žádný mail (anti-enumeration)', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      const out = await service.forgotPassword('nobody@x.cz');
      expect(out).toEqual({ ok: true });
      expect(mockSecurityTokens.issue).not.toHaveBeenCalled();
      expect(mockMailer.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('hard-deleted user → 200 ok, žádný token, žádný mail', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        isDeleted: true,
      });
      const out = await service.forgotPassword('a@a.com');
      expect(out).toEqual({ ok: true });
      expect(mockSecurityTokens.issue).not.toHaveBeenCalled();
    });

    it('pending-deletion user → token VYSTAVEN (D-037 reset umožní reaktivaci)', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        isDeleted: false,
        deletionRequestedAt: new Date(),
      });
      await service.forgotPassword('a@a.com');
      expect(mockSecurityTokens.issue).toHaveBeenCalled();
      expect(mockMailer.sendPasswordReset).toHaveBeenCalled();
    });

    it('mailer selže → log warn, žádný throw', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        isDeleted: false,
      });
      mockMailer.sendPasswordReset.mockRejectedValueOnce(new Error('SMTP'));
      await expect(service.forgotPassword('a@a.com')).resolves.toEqual({
        ok: true,
      });
    });

    it('email se lowercase před lookupem', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      await service.forgotPassword('JAN@Example.Com');
      expect(mockUsersRepo.findByEmail).toHaveBeenCalledWith('jan@example.com');
    });
  });

  describe('resetPasswordByToken (1.7)', () => {
    it('happy path → heslo updated + refresh tokens revoked + event emitted', async () => {
      mockSecurityTokens.consume.mockResolvedValue({ userId: '1' });
      mockUsersRepo.findById.mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: undefined,
        isDeleted: false,
      });
      const out = await service.resetPasswordByToken('tok', 'NoveHeslo123');
      expect(out).toEqual({ ok: true });
      expect(bcrypt.hash).toHaveBeenCalledWith('NoveHeslo123', 10);
      expect(mockUsersRepo.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ passwordHash: 'hashed' }),
      );
      expect(mockRefreshRepo.revokeAllForUser).toHaveBeenCalledWith('1');
    });

    it('invalid token → propage 400 INVALID_TOKEN z consume', async () => {
      mockSecurityTokens.consume.mockRejectedValueOnce(
        new BadRequestException({ code: 'INVALID_TOKEN' }),
      );
      await expect(
        service.resetPasswordByToken('bad', 'NoveHeslo123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('user mezitím hard-deleted → 400 INVALID_TOKEN', async () => {
      mockSecurityTokens.consume.mockResolvedValue({ userId: '1' });
      mockUsersRepo.findById.mockResolvedValue({
        ...mockUser,
        isDeleted: true,
      });
      await expect(
        service.resetPasswordByToken('tok', 'NoveHeslo123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('D-037: pending-deletion user → reset + reaktivace + revertablePromotions', async () => {
      const pendingDate = new Date('2026-05-10');
      mockSecurityTokens.consume.mockResolvedValue({ userId: '1' });
      mockUsersRepo.findById.mockResolvedValue({
        ...mockUser,
        isDeleted: false,
        deletionRequestedAt: pendingDate,
        deletionPromotions: [
          {
            worldId: 'w1',
            worldName: 'Test svět',
            worldSlug: 'test',
            promotedUserId: 'u2',
            promotedUsername: 'pomocnik',
          },
        ],
      });
      const out = await service.resetPasswordByToken('tok', 'NoveHeslo123');
      expect(out).toEqual({
        ok: true,
        deletionReactivated: true,
        revertablePromotions: expect.arrayContaining([
          expect.objectContaining({ worldId: 'w1' }),
        ]),
      });
      // ověř že update vyčistil pending flagy
      expect(mockUsersRepo.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          passwordHash: 'hashed',
          deletionRequestedAt: undefined,
          deletionRequestedBy: undefined,
          deletionReason: undefined,
          deletionPromotions: [],
        }),
      );
      expect(mockBanCache.invalidate).toHaveBeenCalledWith('1');
    });

    it('D-037: pending-deletion bez promotions → reaktivace bez revertable', async () => {
      mockSecurityTokens.consume.mockResolvedValue({ userId: '1' });
      mockUsersRepo.findById.mockResolvedValue({
        ...mockUser,
        deletionRequestedAt: new Date(),
        deletionPromotions: [],
      });
      const out = await service.resetPasswordByToken('tok', 'NoveHeslo123');
      expect(out.deletionReactivated).toBe(true);
      expect(out.revertablePromotions).toBeUndefined();
    });
  });

  // ── 1.7 — Email verification (D-012) ─────────────────────────────────
  describe('verifyEmail (1.7)', () => {
    it('happy path → emailVerified=true + emailVerifiedAt set', async () => {
      mockSecurityTokens.consume.mockResolvedValue({ userId: '1' });
      const out = await service.verifyEmail('tok');
      expect(out).toEqual({ ok: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          emailVerified: true,
          emailVerifiedAt: expect.any(Date),
        }),
      );
    });

    it('invalid token → 400 propage', async () => {
      mockSecurityTokens.consume.mockRejectedValueOnce(
        new BadRequestException({ code: 'EXPIRED_TOKEN' }),
      );
      await expect(service.verifyEmail('bad')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('resendEmailVerification (1.7)', () => {
    it('happy path → vystaví token + pošle mail', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        ...mockUser,
        emailVerified: false,
      });
      mockSecurityTokens.issue.mockResolvedValue('new-verify-tok');
      const out = await service.resendEmailVerification('1');
      expect(out).toEqual({ ok: true });
      expect(mockSecurityTokens.issue).toHaveBeenCalledWith(
        '1',
        'email_verify',
        AuthService.EMAIL_VERIFY_TTL_MS,
      );
      expect(mockMailer.sendEmailVerification).toHaveBeenCalledWith({
        to: 'a@a.com',
        username: 'user',
        token: 'new-verify-tok',
      });
    });

    it('ALREADY_VERIFIED → 400', async () => {
      mockUsersRepo.findById.mockResolvedValue({
        ...mockUser,
        emailVerified: true,
      });
      await expect(service.resendEmailVerification('1')).rejects.toMatchObject({
        response: { code: 'ALREADY_VERIFIED' },
      });
      expect(mockMailer.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('user neexistuje → 401 NOT_FOUND', async () => {
      mockUsersRepo.findById.mockResolvedValue(null);
      await expect(
        service.resendEmailVerification('missing'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ── 1.7 — Email change confirm ──────────────────────────────────────
  describe('confirmEmailChange (1.7)', () => {
    it('happy path → email přepnut + emailVerified=true', async () => {
      mockSecurityTokens.consume.mockResolvedValue({
        userId: '1',
        meta: { newEmail: 'new@x.cz' },
      });
      mockUsersRepo.findByEmail.mockResolvedValue(null); // newEmail nezabraný
      const out = await service.confirmEmailChange('tok');
      expect(out).toEqual({ ok: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          email: 'new@x.cz',
          emailVerified: true,
          emailVerifiedAt: expect.any(Date),
        }),
      );
    });

    it('meta.newEmail chybí → 400 INVALID_TOKEN', async () => {
      mockSecurityTokens.consume.mockResolvedValue({ userId: '1', meta: {} });
      await expect(service.confirmEmailChange('tok')).rejects.toMatchObject({
        response: { code: 'INVALID_TOKEN' },
      });
    });

    it('race: jiný user mezitím má newEmail → 409 EMAIL_TAKEN', async () => {
      mockSecurityTokens.consume.mockResolvedValue({
        userId: '1',
        meta: { newEmail: 'taken@x.cz' },
      });
      mockUsersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        id: 'other-user',
      });
      await expect(service.confirmEmailChange('tok')).rejects.toMatchObject({
        response: { code: 'EMAIL_TAKEN' },
      });
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('stejný user už má cílový email (idempotent edge) → projde', async () => {
      mockSecurityTokens.consume.mockResolvedValue({
        userId: '1',
        meta: { newEmail: 'a@a.com' },
      });
      mockUsersRepo.findByEmail.mockResolvedValue({ ...mockUser });
      await expect(service.confirmEmailChange('tok')).resolves.toEqual({
        ok: true,
      });
    });
  });
});
