import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
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
import { LoginTotpDto } from './dto/login-totp.dto';
import { TrustedDevicesService } from '../trusted-devices/trusted-devices.service';
import { TotpService } from './services/totp.service';
import { WorldElevationsService } from '../world-elevations/world-elevations.service';

/**
 * Login response — discriminated union (krok 1.3c).
 *
 * SP0 (2026-05-14): zatím jen `'ok'` branch.
 * SP2 přidá: `{ status: 'email_not_verified'; email: string }`.
 * SP4 přidá: `{ status: 'banned'; bannedUntil?: Date; banReason?: string }`.
 */
/** User bez citlivých polí (heslo + 2FA tajemství) — to, co smí ven na FE. */
export type SafeUser = Omit<
  User,
  'passwordHash' | 'totpSecretEnc' | 'backupCodeHashes'
>;

export type LoginResult =
  | {
      status: 'ok';
      accessToken: string;
      refreshToken: string;
      user: SafeUser;
    }
  // 1.3c (N-6b) — účet v pending self-delete: FE nabídne reaktivaci.
  | {
      status: 'deletion_pending';
      deletionRequestedAt: Date;
      scheduledHardDeleteAt: Date;
    }
  // 14.1 — účet má 2FA: heslo OK, ale chybí druhý faktor. ŽÁDNÝ token se
  // nevydává; FE pošle kód na /auth/login/totp s tímto challengeId.
  | {
      status: 'totp_required';
      challengeId: string;
    };

const DELETION_HOLD_DAYS = 30; // 1.3c — sjednotné s UsersService
const TOTP_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 14.1 — challenge mezi heslem a 2FA kódem

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  static readonly PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hodina
  static readonly EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hodin
  // F-03 (GDPR) — verze podmínek platná pro nově ukládaný souhlas. Musí sedět s
  // verzí na stránce Podmínky (FE TermsPage). Při změně textu zvyš (provozovatel
  // řeší re-souhlas existujících účtů dle potřeby).
  static readonly TERMS_VERSION = '1.0'; // Podmínky 1.0 (2026-06-18)

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
    private readonly trustedDevices: TrustedDevicesService,
    private readonly totpService: TotpService,
    private readonly elevationService: WorldElevationsService,
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
    user: SafeUser;
  }> {
    // D-011 — Cloudflare Turnstile captcha verify.
    const captchaOk = await this.captcha.verify(dto.captchaToken);
    if (!captchaOk) {
      throw new BadRequestException({
        message: 'Ověření captchy selhalo, zkus to znovu.',
        code: 'CAPTCHA_FAILED',
      });
    }

    // F-03 (GDPR) — souhlas s podmínkami vynucený i server-side (ne jen FE refine).
    if (dto.acceptedTerms !== true) {
      throw new BadRequestException({
        message: 'Pro vytvoření účtu musíš souhlasit s podmínkami.',
        code: 'TERMS_NOT_ACCEPTED',
      });
    }

    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException({
        message: 'Email již existuje',
        code: 'EMAIL_TAKEN',
      });
    }

    const existingUsername = await this.usersRepo.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException({
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
      // F-03 (GDPR) — doklad souhlasu s podmínkami.
      acceptedTermsAt: new Date(),
      termsVersion: AuthService.TERMS_VERSION,
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

  async login(dto: LoginDto, trustToken?: string): Promise<LoginResult> {
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

    // 1.3c (N-6b) — gate na stav účtu.
    if (user.isDeleted)
      throw new UnauthorizedException({
        code: 'DELETED',
        message: 'Účet byl smazán',
      });
    // R-08 — ban enforcement při loginu. Dřív se `bannedAt` nikde nečetl, takže
    // zabanovaný uživatel se normálně přihlásil a dál pracoval. FE `client.ts`
    // na kód BANNED dělá instant logout.
    if (user.bannedAt)
      throw new UnauthorizedException({
        code: 'BANNED',
        message: 'Účet byl zablokován',
      });
    if (user.deletionRequestedAt)
      return {
        status: 'deletion_pending',
        deletionRequestedAt: user.deletionRequestedAt,
        scheduledHardDeleteAt: new Date(
          user.deletionRequestedAt.getTime() + DELETION_HOLD_DAYS * DAY_MS,
        ),
      };

    // 14.1 — 2FA gate. Heslo sedí, ale účet má druhý faktor. Buď je zařízení
    // důvěryhodné (přeskoč 2FA), nebo vydáme challenge a ŽÁDNÝ token.
    if (user.totpEnabled) {
      const trusted = await this.trustedDevices.match(trustToken, user.id);
      if (trusted) {
        await this.trustedDevices.touch(trusted.id);
      } else {
        const challengeId = await this.securityTokens.issue(
          user.id,
          'totp_challenge',
          TOTP_CHALLENGE_TTL_MS,
        );
        return { status: 'totp_required', challengeId };
      }
    }

    const now = new Date();
    await this.usersRepo.updateLastSeen(user.id);
    // 1.3a — lastLoginAt (≠ lastSeenAt; ten se mění s presence pingem).
    await this.usersRepo.updateLastLogin(user.id, now);
    user.lastLoginAt = now;
    const tokens = await this.generateTokenPair(user);
    return { status: 'ok', ...tokens, user: this.sanitize(user) };
  }

  /**
   * 14.1 — dokončení loginu druhým faktorem. Challenge se ověří přes `peek`
   * (NEspotřebuje při špatném kódu), TOTP/záložní kód se ověří, teprve při
   * úspěchu se challenge spotřebuje a vydají tokeny. Vrací i `newTrustToken`
   * (když si uživatel zařízení zapamatoval) — controller ho dá do cookie.
   */
  async loginTotp(
    dto: LoginTotpDto,
    userAgent?: string,
  ): Promise<{ result: LoginResult; newTrustToken?: string }> {
    const { userId } = await this.securityTokens.peek(
      dto.challengeId,
      'totp_challenge',
    );
    const user = await this.usersRepo.findById(userId);
    if (!user)
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'Uživatel neexistuje',
      });
    // Re-check stavu účtu (mohl se mezi krokem 1 a 2 změnit).
    if (user.isDeleted)
      throw new UnauthorizedException({
        code: 'DELETED',
        message: 'Účet byl smazán',
      });
    if (user.bannedAt)
      throw new UnauthorizedException({
        code: 'BANNED',
        message: 'Účet byl zablokován',
      });
    if (!user.totpEnabled)
      throw new BadRequestException({
        code: 'TOTP_NOT_ENABLED',
        message: 'Dvoufaktorové ověření není aktivní.',
      });

    const ok = await this.totpService.verifyForLogin(user, dto.code);
    if (!ok)
      throw new UnauthorizedException({
        code: 'TOTP_INVALID_CODE',
        message: 'Neplatný kód.',
      });

    // Úspěch → spotřebuj challenge (jednorázový).
    await this.securityTokens.consume(dto.challengeId, 'totp_challenge');

    let newTrustToken: string | undefined;
    if (dto.trustDevice) {
      newTrustToken = await this.trustedDevices.createForUser(
        user.id,
        userAgent,
      );
    }

    const now = new Date();
    await this.usersRepo.updateLastSeen(user.id);
    await this.usersRepo.updateLastLogin(user.id, now);
    user.lastLoginAt = now;
    const tokens = await this.generateTokenPair(user);
    return {
      result: { status: 'ok', ...tokens, user: this.sanitize(user) },
      newTrustToken,
    };
  }

  /**
   * 1.3c (N-6b) — uživatel s pending self-delete se vrátí: ověř credentials,
   * clear deletion flagy + standardní login. (D-034b revert PJ handover = dluh.)
   */
  async reactivateDeletion(dto: LoginDto): Promise<LoginResult> {
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
    if (user.isDeleted)
      throw new UnauthorizedException({
        code: 'DELETED',
        message: 'Účet byl smazán',
      });
    if (!user.deletionRequestedAt)
      throw new BadRequestException({
        code: 'NOT_PENDING_DELETION',
        message: 'Účet nemá naplánované smazání.',
      });

    await this.usersRepo.update(user.id, {
      deletionRequestedAt: undefined,
      deletionRequestedBy: undefined,
      deletionReason: undefined,
    });
    this.banCache.invalidate(user.id);
    const now = new Date();
    await this.usersRepo.updateLastSeen(user.id);
    await this.usersRepo.updateLastLogin(user.id, now);
    const refreshed = {
      ...user,
      deletionRequestedAt: undefined,
      lastLoginAt: now,
    };
    const tokens = await this.generateTokenPair(refreshed);
    return { status: 'ok', ...tokens, user: this.sanitize(refreshed) };
  }

  /** 1.3c (N-6b) — self-delete request → revoke refresh tokenů (auto-logout). */
  @OnEvent('user.deletion.requested')
  async handleSelfDeletionRequested(payload: {
    userId: string;
  }): Promise<void> {
    await this.refreshRepo.revokeAllForUser(payload.userId);
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
      // Elevation se skládá při odhlášení — jinak by příští přihlášení bylo
      // rovnou „nahozené" (bezpečnostní překvapení). Spec-world-admin-elevation D-3.
      await this.elevationService.deactivateAllForUser(payload.sub);
    } catch {
      return;
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshRepo.revokeAllForUser(userId);
    await this.elevationService.deactivateAllForUser(userId);
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
        message: 'Token neobsahuje validní cílový email',
        code: 'INVALID_TOKEN',
      });
    }

    const normalized = newEmailRaw.toLowerCase();
    const existing = await this.usersRepo.findByEmail(normalized);
    if (existing && existing.id !== userId) {
      throw new ConflictException({
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

  /**
   * Spec 15.8 — vydá host (guest) session pro Hospodu po ověření captcha.
   * Guest NEMÁ DB účet: identita žije jen v tokenu (`sub` = náhodné anon-id,
   * `guest: true`, `role: UserRole.Guest`). Captcha je **fail-closed** — bez
   * úspěšného ověření se token nevydá. TTL z `ANON_SESSION_TTL` (default 14 d).
   */
  async createAnonSession(
    captchaToken: string | undefined,
  ): Promise<{ token: string; anonName: string; anonId: string }> {
    const captchaOk = await this.captcha.verify(captchaToken);
    if (!captchaOk) {
      throw new BadRequestException({
        code: 'CAPTCHA_FAILED',
        message: 'Ověření captcha selhalo.',
      });
    }
    const anonId = `anon_${uuid()}`;
    const anonName = `anonym${Math.floor(Math.random() * 9000) + 1000}`;
    const ttl = this.config.get<string>('ANON_SESSION_TTL') ?? '14d';
    const token = this.jwtService.sign(
      { sub: anonId, guest: true, username: anonName, role: UserRole.Guest },
      // `ttl` je env string (např. '14d'); jwtService chce StringValue → cast.
      { expiresIn: ttl } as JwtSignOptions,
    );
    return { token, anonName, anonId };
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
      this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? '3',
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

  private sanitize(user: User): SafeUser {
    const {
      passwordHash: _p,
      totpSecretEnc: _s,
      backupCodeHashes: _b,
      ...rest
    } = user;
    return rest;
  }
}
