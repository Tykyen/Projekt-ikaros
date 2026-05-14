import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IRefreshTokenRepository } from './interfaces/refresh-token-repository.interface';
import type { RefreshTokenPayload } from './interfaces/refresh-token.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User, UserRole } from '../users/interfaces/user.interface';
import { DAY_MS } from '../../common/constants/time.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IRefreshTokenRepository')
    private readonly refreshRepo: IRefreshTokenRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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
    });

    const tokens = await this.generateTokenPair(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Omit<User, 'passwordHash'>;
  }> {
    const isEmail = dto.identifier.includes('@');
    const user = isEmail
      ? await this.usersRepo.findByEmail(dto.identifier)
      : await this.usersRepo.findByUsername(dto.identifier);
    if (!user) throw new UnauthorizedException('Neplatné přihlašovací údaje');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Neplatné přihlašovací údaje');

    await this.usersRepo.updateLastSeen(user.id);
    const tokens = await this.generateTokenPair(user);
    return { ...tokens, user: this.sanitize(user) };
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
      throw new UnauthorizedException('Neplatný refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Neplatný refresh token');
    }

    const stored = await this.refreshRepo.findByJti(payload.jti);
    if (!stored) {
      throw new UnauthorizedException('Neplatný refresh token');
    }

    if (stored.revoked) {
      // Reuse detection — token byl už použit, ale přišel znovu = krádež nebo
      // klientský retry po síťovém timeoutu. V obou případech je bezpečnější
      // celou rodinu zneplatnit a donutit nového login.
      this.logger.warn(
        `Reuse detection: rodina tokenů revokována (userId=${stored.userId}, familyId=${stored.familyId})`,
      );
      await this.refreshRepo.revokeFamily(stored.familyId);
      throw new UnauthorizedException(
        'Refresh token byl zneužit, všechny relace zrušeny',
      );
    }

    const user = await this.usersRepo.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException('Uživatel neexistuje');
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
      ikarosSkin: user.ikarosSkin ?? 'default',
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
