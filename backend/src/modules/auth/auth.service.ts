import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IRefreshTokenRepository } from './interfaces/refresh-token-repository.interface';
import type { RefreshTokenPayload } from './interfaces/refresh-token.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User, UserRole } from '../users/interfaces/user.interface';
import type { DeletionPromotion } from '../users/interfaces/user.interface';
import { DAY_MS } from '../../common/constants/time.constants';
import { MailerService } from '../mailer/mailer.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import { UserBanCacheService } from '../users/services/user-ban-cache.service';
import { CaptchaService } from './captcha.service';

/**
 * Login response — discriminated union (krok 1.3c).
 *
 * SP0 (2026-05-14): zatím jen `'ok'` branch.
 * SP2 přidá: `{ status: 'email_not_verified'; email: string }`.
 * SP4 přidá: `{ status: 'banned'; bannedUntil?: Date; banReason?: string }`.
 */
export type LoginResult = {
  status: 'ok';
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'passwordHash'>;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  static readonly PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hodina
  static readonly EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hodin

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IRefreshTokenRepository')
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly securityTokens: SecurityTokensService,
    private readonly banCache: UserBanCacheService,
    private readonly events: EventEmitter2,
    private readonly captcha: CaptchaService,
  ) {}

  private get refreshSecret(): string {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      (() => {
        throw new Error('JWT_REFRESH_SECRET is not set');
      })()
    );
  }

  async register(dto: RegisterDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Omit<User, 'passwordHash'>;
  }> {
    // D-011 — Cloudflare Turnstile captcha verify.
    const captchaOk = await this.captcha.verify(dto.captchaToken);
    if (!captchaOk) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Ověření captchy selhalo, zkus to znovu.',
        code: 'CAPTCHA_FAILED',
      });
    }

    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Email již existuje',
        code: 'EMAIL_TAKEN',
      });
    }

    const existingUsername = await this.usersRepo.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Username již existuje',
        code: 'USERNAME_TAKEN',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersRepo.save({
      email: dto.email.toLowerCase(),
      username: dto.username,
      passwordHash,
      role: UserRole.Hrac,
      isOnline: true,
      lastSeenAt: new Date(),
      // 1.3a — registrace je zároveň první přihlášení.
      lastLoginAt: new Date(),
    });

    // SP2: po vytvoření vystavit verify token + poslat mail (fire-and-forget).
    try {
      const verifyTok = await this.securityTokens.issue(
        user.id,
        'email_verify',
        AuthService.EMAIL_VERIFY_TTL_MS,
      );
      await this.mailer.sendEmailVerification({
        to: user.email,
        username: user.username,
        token: verifyTok,
      });
    } catch (err) {
      this.logger.warn(
        `register: verify email init failed for ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const tokens = await this.generateTokenPair(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const isEmail = dto.identifier.includes('@');
    const user = isEmail
      ? await this.usersRepo.findByEmail(dto.identifier)
      : await this.usersRepo.findByUsername(dto.identifier);
    if (!user)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Neplatné přihlašovací údaje',
      });

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Neplatné přihlašovací údaje',
      });

    const now = new Date();
    await this.usersRepo.updateLastSeen(user.id);
    // 1.3a — lastLoginAt (≠ lastSeenAt; ten se mění s presence pingem).
    await this.usersRepo.updateLastLogin(user.id, now);
    user.lastLoginAt = now;
    const tokens = await this.generateTokenPair(user);
    return { status: 'ok', ...tokens, user: this.sanitize(user) };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Neplatný refresh token',
      });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Neplatný refresh token',
      });
    }

    const stored = await this.refreshRepo.findByJti(payload.jti);
    if (!stored) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Neplatný refresh token',
      });
    }

    if (stored.revoked) {
      // Reuse detection — token byl už použit, ale přišel znovu = krádež nebo
      // klientský retry po síťovém timeoutu. V obou případech je bezpečnější
      // celou rodinu zneplatnit a donutit nového login.
      this.logger.warn(
        `Reuse detection: rodina tokenů revokována (userId=${stored.userId}, familyId=${stored.familyId})`,
      );
      await this.refreshRepo.revokeFamily(stored.familyId);
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_ABUSED',
        message: 'Refresh token byl zneužit, všechny relace zrušeny',
      });
    }

    const user = await this.usersRepo.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel neexistuje',
      });
    }

    // Race condition: dva paralelní refresh se stejným tokenem — první projde,
    // druhý narazí na revoked=true a spustí reuse detection. Akceptujeme.
    await this.refreshRepo.revokeByJti(stored.jti);
    return this.generateTokenPair(user, stored.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(
        refreshToken,
        { secret: this.refreshSecret },
      );
      if (payload.type !== 'refresh' || !payload.familyId) {
        return;
      }
      await this.refreshRepo.revokeFamily(payload.familyId);
    } catch {
      return;
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshRepo.revokeAllForUser(userId);
  }

  async checkUsername(username: string): Promise<{ available: boolean }> {
    if (
      !username ||
      username.length < 3 ||
      username.length > 32 ||
      username.includes('@')
    ) {
      return { available: false };
    }
    const existing = await this.usersRepo.findByUsername(username);
    return { available: !existing };
  }

  async checkEmail(email: string): Promise<{ available: boolean }> {
    if (!email || !email.includes('@') || email.length > 255) {
      return { available: false };
    }
    const existing = await this.usersRepo.findByEmail(email.toLowerCase());
    return { available: !existing };
  }

  @OnEvent('user.password.changed')
  async handlePasswordChanged(payload: { userId: string }): Promise<void> {
    this.logger.log(
      `Password changed pro userId=${payload.userId}, revokuji refresh tokeny`,
    );
    await this.refreshRepo.revokeAllForUser(payload.userId);
  }

  // ── SP2 — Email flows (1.7) ────────────────────────────────────────

  /**
   * Anti-enumeration: vždy vrací `{ ok: true }`. Token vydá jen pro
   * existujícího ne-hard-deletovaného usera. Pending soft-delete user (D-037)
   * token DOSTANE — reset povolí reaktivaci účtu.
   */
  async forgotPassword(email: string): Promise<{ ok: true }> {
    const normalized = email.toLowerCase();
    const user = await this.usersRepo.findByEmail(normalized);
    if (!user || user.isDeleted) {
      return { ok: true };
    }
    const token = await this.securityTokens.issue(
      user.id,
      'password_reset',
      AuthService.PASSWORD_RESET_TTL_MS,
    );
    try {
      await this.mailer.sendPasswordReset({
        to: user.email,
        username: user.username,
        token,
      });
    } catch (err) {
      this.logger.warn(
        `forgotPassword mailer fail for ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { ok: true };
  }

  /**
   * Konzumuje token, updatuje heslo, revokuje refresh tokeny, emituje
   * `user.password.changed`. Pokud byl uživatel v pending soft-delete (D-037),
   * reaktivuje účet, vyčistí pending flagy a vrátí list `revertablePromotions`.
   */
  async resetPasswordByToken(
    token: string,
    newPassword: string,
  ): Promise<{
    ok: true;
    deletionReactivated?: true;
    revertablePromotions?: DeletionPromotion[];
  }> {
    const { userId } = await this.securityTokens.consume(
      token,
      'password_reset',
    );
    const user = await this.usersRepo.findById(userId);
    if (!user || user.isDeleted) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Token je neplatný',
        code: 'INVALID_TOKEN',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const wasPending = !!user.deletionRequestedAt;
    const updates: Partial<User> = { passwordHash };

    if (wasPending) {
      updates.deletionRequestedAt = undefined;
      updates.deletionRequestedBy = undefined;
      updates.deletionReason = undefined;
      updates.deletionPromotions = [];
    }

    await this.usersRepo.update(userId, updates);
    await this.refreshRepo.revokeAllForUser(userId);
    this.events.emit('user.password.changed', { userId });

    if (wasPending) {
      this.banCache.invalidate(userId);
      const promotions = user.deletionPromotions ?? [];
      const result: {
        ok: true;
        deletionReactivated: true;
        revertablePromotions?: DeletionPromotion[];
      } = { ok: true, deletionReactivated: true };
      if (promotions.length > 0) {
        result.revertablePromotions = promotions;
      }
      return result;
    }

    return { ok: true };
  }

  /**
   * Verifikuje email přes one-time token. Throws BadRequestException
   * (INVALID/EXPIRED/ALREADY_USED) z `securityTokens.consume`.
   */
  async verifyEmail(token: string): Promise<{ ok: true }> {
    const { userId } = await this.securityTokens.consume(token, 'email_verify');
    await this.usersRepo.update(userId, {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    return { ok: true };
  }

  /**
   * Pro přihlášeného usera (z JWT). Pokud už verified, 400 ALREADY_VERIFIED.
   * Pokud user neexistuje (token revoked), 401.
   */
  async resendEmailVerification(userId: string): Promise<{ ok: true }> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User nenalezen',
      });
    }
    if (user.emailVerified) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Email je již ověřený',
        code: 'ALREADY_VERIFIED',
      });
    }
    const token = await this.securityTokens.issue(
      user.id,
      'email_verify',
      AuthService.EMAIL_VERIFY_TTL_MS,
    );
    try {
      await this.mailer.sendEmailVerification({
        to: user.email,
        username: user.username,
        token,
      });
    } catch (err) {
      this.logger.warn(
        `resendEmailVerification mailer fail for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return { ok: true };
  }

  /**
   * Token meta obsahuje `newEmail` (SP3 UsersService.requestEmailChange ho tam dá).
   * Před update zkontroluje race (jiný user mezitím zabral email). Idempotent:
   * pokud user už má cílový email, projde to bez change.
   */
  async confirmEmailChange(token: string): Promise<{ ok: true }> {
    const { userId, meta } = await this.securityTokens.consume(
      token,
      'email_change',
    );
    const newEmailRaw = meta?.newEmail;
    if (!newEmailRaw || typeof newEmailRaw !== 'string') {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Token neobsahuje validní cílový email',
        code: 'INVALID_TOKEN',
      });
    }

    const normalized = newEmailRaw.toLowerCase();
    const existing = await this.usersRepo.findByEmail(normalized);
    if (existing && existing.id !== userId) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Email už používá jiný uživatel',
        code: 'EMAIL_TAKEN',
      });
    }

    await this.usersRepo.update(userId, {
      email: normalized,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    return { ok: true };
  }

  private async generateTokenPair(
    user: User,
    familyId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      characterPath: user.characterPath ?? '',
    });

    const jti = uuid();
    const family = familyId ?? uuid();
    const ttlDays = Number(
      this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? '30',
    );
    const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);

    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti, familyId: family, type: 'refresh' },
      { secret: this.refreshSecret, expiresIn: `${ttlDays}d` },
    );

    await this.refreshRepo.save({
      jti,
      userId: user.id,
      familyId: family,
      expiresAt,
      revoked: false,
    });

    return { accessToken, refreshToken };
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }
}
