# SP2 — Auth Email Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat 5 AuthService metod (forgotPassword, resetPasswordByToken s D-037 reaktivací, verifyEmail, resendEmailVerification, confirmEmailChange) + UserBanCacheService stub + 4 User entity fields + 5 AuthController routes.

**Architecture:** AuthService dostává `MailerService`, `SecurityTokensService`, `UserBanCacheService` přes DI. Mailer + SecurityTokens jsou @Global() z SP1, UserBanCacheService je novinka v UsersModule (exported). Všech 5 metod používá SP1 token issue/consume + Mailer dispatch. D-037 reaktivace cleaří pending soft-delete flagy v User entity.

**Tech Stack:** NestJS, Mongoose, bcrypt, class-validator, Jest

**Spec:** [2026-05-14-sp2-auth-email-flows-design](../specs/2026-05-14-sp2-auth-email-flows-design.md)

---

## File Structure

**Modify:**
- `backend/src/modules/users/interfaces/user.interface.ts` — `DeletionPromotion` interface, 4 User fields
- `backend/src/modules/users/schemas/user.schema.ts` — 4 `@Prop()` decorátory
- `backend/src/modules/users/users.module.ts` — provide + export `UserBanCacheService`
- `backend/src/modules/auth/auth.service.ts` — DI extension, TTL statics, 5 nových metod, register extension
- `backend/src/modules/auth/auth.controller.ts` — 5 nových routes
- `backend/src/modules/auth/auth.module.ts` — žádná změna (UsersModule už importován)
- `backend/tsconfig.json` — odebrat `auth.service.spec.ts` z exclude
- `backend/eslint.config.mjs` — synchronizovat ignores
- `backend/jest.config.ts` — synchronizovat testPathIgnorePatterns
- `docs/dluhy.md` — odškrtnout SP2

**Create:**
- `backend/src/modules/users/services/user-ban-cache.service.ts` — in-memory cache
- `backend/src/modules/users/services/user-ban-cache.service.spec.ts` — 6 testů
- `backend/src/modules/auth/dto/forgot-password.dto.ts`
- `backend/src/modules/auth/dto/reset-password.dto.ts`
- `backend/src/modules/auth/dto/verify-email.dto.ts`
- `backend/src/modules/auth/dto/confirm-email-change.dto.ts`

---

## Task 1: User entity — DeletionPromotion + 4 nová pole

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts`

- [ ] **Step 1: Přidat DeletionPromotion + rozšířit User interface**

V `user.interface.ts` přidat za `AdminPermissions` interface (před `User`):

```typescript
export interface DeletionPromotion {
  worldId: string;
  worldName: string;
  worldSlug: string;
  promotedUserId: string;
  promotedUsername: string;
}
```

V `User` interface přidat za SP0 rozšíření (před `}`):

```typescript
  // SP2 rozšíření (2026-05-14):
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
  deletionRequestedBy?: string;
  deletionPromotions?: DeletionPromotion[];
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 2: User schema — 4 nové @Prop decorátory

**Files:**
- Modify: `backend/src/modules/users/schemas/user.schema.ts`

- [ ] **Step 1: Přidat import DeletionPromotion**

V `user.schema.ts` rozšířit `import type` na:

```typescript
import type {
  AdminPermissions,
  DeletionPromotion,
} from '../interfaces/user.interface';
```

- [ ] **Step 2: Přidat 4 @Prop decorátory před `}` UserSchemaClass**

Za `@Prop({ type: Date }) usernameChangedAt?: Date;` přidat:

```typescript

  // SP2 rozšíření (2026-05-14):
  @Prop({ default: false }) emailVerified?: boolean;
  @Prop({ type: Date }) emailVerifiedAt?: Date;
  @Prop() deletionRequestedBy?: string;

  @Prop({
    type: [
      {
        worldId: { type: String, required: true },
        worldName: { type: String, required: true },
        worldSlug: { type: String, required: true },
        promotedUserId: { type: String, required: true },
        promotedUsername: { type: String, required: true },
        _id: false,
      },
    ],
    default: [],
  })
  deletionPromotions?: DeletionPromotion[];
```

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 3: UserBanCacheService + test

**Files:**
- Create: `backend/src/modules/users/services/user-ban-cache.service.ts`
- Create: `backend/src/modules/users/services/user-ban-cache.service.spec.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
import { UserBanCacheService } from './user-ban-cache.service';

describe('UserBanCacheService', () => {
  let service: UserBanCacheService;

  beforeEach(() => {
    service = new UserBanCacheService();
  });

  it('get neexistujícího userId → null', () => {
    expect(service.get('u1')).toBeNull();
  });

  it('set + get vrátí stejný stav', () => {
    const ban = {
      bannedAt: new Date('2026-05-01'),
      bannedUntil: new Date('2027-05-01'),
      banReason: 'spam',
    };
    service.set('u1', ban);
    expect(service.get('u1')).toEqual(ban);
  });

  it('invalidate → následný get vrátí null', () => {
    service.set('u1', { bannedAt: new Date() });
    service.invalidate('u1');
    expect(service.get('u1')).toBeNull();
  });

  it('permanent ban (bannedUntil undefined) → vždy aktivní', () => {
    const ban = { bannedAt: new Date('2020-01-01') }; // dávno
    service.set('u1', ban);
    expect(service.get('u1')).toEqual(ban);
  });

  it('temp ban v minulosti → get vrací null + automaticky invaliduje', () => {
    service.set('u1', {
      bannedAt: new Date('2020-01-01'),
      bannedUntil: new Date('2020-01-02'),
    });
    expect(service.get('u1')).toBeNull();
    // Druhé volání také null, protože interně invalidováno
    expect(service.get('u1')).toBeNull();
  });

  it('temp ban v budoucnosti → get vrací stav', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const ban = { bannedAt: new Date(), bannedUntil: future };
    service.set('u1', ban);
    expect(service.get('u1')).toEqual(ban);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (no module)**

Run: `cd backend && npx jest user-ban-cache --no-coverage`
Expected: FAIL — `Cannot find module './user-ban-cache.service'`.

- [ ] **Step 3: Implementovat service**

```typescript
import { Injectable } from '@nestjs/common';

export interface BanState {
  bannedAt: Date;
  bannedUntil?: Date;
  banReason?: string;
}

/**
 * In-memory cache ban stavů. SP2 stub — SP4 přidá DB warmup, TTL invalidaci,
 * cluster-wide sync.
 *
 * Volání:
 *   - `set(userId, ban)` při ban admin akci
 *   - `invalidate(userId)` při unban / reset hesla (D-037 reaktivace)
 *   - `get(userId)` z AuthService.login (SP4) pro rychlý reject
 */
@Injectable()
export class UserBanCacheService {
  private readonly cache = new Map<string, BanState>();

  get(userId: string): BanState | null {
    const ban = this.cache.get(userId);
    if (!ban) return null;
    if (ban.bannedUntil && ban.bannedUntil.getTime() < Date.now()) {
      this.cache.delete(userId);
      return null;
    }
    return ban;
  }

  set(userId: string, ban: BanState): void {
    this.cache.set(userId, ban);
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd backend && npx jest user-ban-cache --no-coverage`
Expected: 6 tests pass.

---

## Task 4: UsersModule wire UserBanCacheService

**Files:**
- Modify: `backend/src/modules/users/users.module.ts`

- [ ] **Step 1: Přidat import + provide + export**

Přepsat `users.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import { MongoUsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserBanCacheService } from './services/user-ban-cache.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserSchemaClass.name, schema: UserSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserBanCacheService,
    { provide: 'IUsersRepository', useClass: MongoUsersRepository },
  ],
  exports: ['IUsersRepository', UsersService, UserBanCacheService],
})
export class UsersModule {}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 5: AuthService DTOs

**Files:**
- Create: `backend/src/modules/auth/dto/forgot-password.dto.ts`
- Create: `backend/src/modules/auth/dto/reset-password.dto.ts`
- Create: `backend/src/modules/auth/dto/verify-email.dto.ts`
- Create: `backend/src/modules/auth/dto/confirm-email-change.dto.ts`

- [ ] **Step 1: forgot-password.dto.ts**

```typescript
import { IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'E-mail uživatele', example: 'alice@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;
}
```

- [ ] **Step 2: reset-password.dto.ts**

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Plain reset token z emailu' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;

  @ApiProperty({ description: 'Nové heslo (min 8 znaků)' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
```

- [ ] **Step 3: verify-email.dto.ts**

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Plain verify token z emailu' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;
}
```

- [ ] **Step 4: confirm-email-change.dto.ts**

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailChangeDto {
  @ApiProperty({ description: 'Plain email-change token z emailu' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;
}
```

- [ ] **Step 5: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 6: AuthService — DI extension + TTL statics

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Rozšířit importy**

Na začátku souboru přidat:

```typescript
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MailerService } from '../mailer/mailer.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import { UserBanCacheService } from '../users/services/user-ban-cache.service';
import type { DeletionPromotion } from '../users/interfaces/user.interface';
```

⚠️ `BadRequestException` a `ConflictException` už možná importovány v `'@nestjs/common'` — sjednotit do jednoho importu.

- [ ] **Step 2: Přidat static TTL konstanty na začátek class**

Za `private readonly logger = new Logger(AuthService.name);` přidat:

```typescript

  static readonly PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hodina
  static readonly EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hodin
```

- [ ] **Step 3: Rozšířit konstruktor**

Nahradit konstruktor:

```typescript
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
  ) {}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors. (auth.service.spec.ts je stále v tsconfig exclude — neovlivňuje.)

---

## Task 7: AuthService — register extension (fire-and-forget verify email)

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Najít konec register metody**

Před řádkem `const tokens = await this.generateTokenPair(user);` v register (kolem řádku 74) přidat fire-and-forget block:

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 8: AuthService — forgotPassword

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Přidat metodu**

Za existující metody (před `private async generateTokenPair`) přidat:

```typescript

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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 9: AuthService — resetPasswordByToken (s D-037)

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Přidat metodu**

Za `forgotPassword` přidat:

```typescript

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
    const { userId } = await this.securityTokens.consume(token, 'password_reset');
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 10: AuthService — verifyEmail + resendEmailVerification

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Přidat obě metody**

Za `resetPasswordByToken` přidat:

```typescript

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
      throw new UnauthorizedException('User nenalezen');
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 11: AuthService — confirmEmailChange

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Přidat metodu**

Za `resendEmailVerification` přidat:

```typescript

  /**
   * Token meta obsahuje `newEmail` (SP3 UsersService.requestEmailChange ho
   * tam dá). Před update zkontroluje race (jiný user mezitím zabral email).
   * Idempotent: pokud user už má cílový email, projde to bez change.
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 12: AuthController — 5 nových routes

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: Přidat importy DTO**

Za existující DTO importy:

```typescript
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
```

- [ ] **Step 2: Přidat 5 routes za `logoutAll`**

Před `}` třídy přidat:

```typescript

  // ── SP2 — Email flows ──────────────────────────────────────────────

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Žádost o reset hesla — anti-enumeration, vždy { ok: true }',
  })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset hesla přes token + D-037 reaktivace' })
  @ApiResponse({
    status: 200,
    description: '{ ok: true, deletionReactivated?, revertablePromotions? }',
  })
  @ApiResponse({ status: 400, description: 'INVALID/EXPIRED/ALREADY_USED token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordByToken(dto.token, dto.password);
  }

  @Post('verify-email')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifikace emailu přes one-time token' })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  @ApiResponse({ status: 400, description: 'INVALID/EXPIRED/ALREADY_USED token' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend verify email pro přihlášeného usera',
  })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  @ApiResponse({ status: 400, description: 'ALREADY_VERIFIED' })
  @ApiResponse({ status: 401, description: 'Bez JWT nebo user neexistuje' })
  resendVerification(@CurrentUser() user: RequestUser) {
    return this.authService.resendEmailVerification(user.id);
  }

  @Post('confirm-email-change')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Potvrzení změny emailu přes token' })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  @ApiResponse({ status: 400, description: 'INVALID token nebo meta chybí' })
  @ApiResponse({ status: 409, description: 'EMAIL_TAKEN (race)' })
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.authService.confirmEmailChange(dto.token);
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 13: Spustit AuthService spec (nyní by měla pass)

**Files:**
- Modify: `backend/tsconfig.json`
- Modify: `backend/eslint.config.mjs`
- Modify: `backend/jest.config.ts`

- [ ] **Step 1: Odebrat `auth.service.spec.ts` z tsconfig exclude**

Odebrat řádek `"src/modules/auth/auth.service.spec.ts",` z exclude pole.

- [ ] **Step 2: Odebrat z eslint.config.mjs ignores**

Odebrat řádek `'src/modules/auth/auth.service.spec.ts',` z ignores pole.

- [ ] **Step 3: Odebrat z jest.config.ts testPathIgnorePatterns**

Odebrat řádek `'<rootDir>/src/modules/auth/auth.service.spec.ts',`.

- [ ] **Step 4: Spustit auth.service.spec.ts**

Run: `cd backend && npx jest auth.service --no-coverage 2>&1 | tail -20`
Expected: testy buď pass nebo vidět konkrétní fail, který musíme řešit. (Test vyžaduje EventEmitter2 mock, který je už v spec souboru → mělo by projít.)

⚠️ **Pokud testy failují:** typicky chybí mock nebo nesedí kontrakt — opravit per failing test. Klíčové oblasti:
- `mockSecurityTokens.consume` neaccepts `type` argument (mock signature) — služba volá s 2 args, mock ignoruje, OK.
- `mockMailer.sendPasswordReset.mockRejectedValueOnce(new Error('SMTP'))` v test forgotPassword:599 — kontrolovat že náš try-catch v service zachytí.

- [ ] **Step 5: Verify celkový typecheck + lint**

Run: `cd backend && npm run typecheck && npm run lint:check`
Expected: oba exit 0.

⚠️ **Pokud lint zhltne CRLF errory v auth files:** Run `cd backend && npx eslint "src/**/*.ts" --fix`.

---

## Task 14: Run full test suite — regression check

- [ ] **Step 1: Full test suite**

Run: `cd backend && npm test -- --no-coverage 2>&1 | tail -10`
Expected: passes nesnížené proti SP1 stavu (791 minimum), plus 20+ nových z auth.service.spec.

⚠️ **12 D-053 enum fails** (timeline, world-news, world-calendar-config, world-currencies, world-weather) **zůstávají** — pre-existing dluh, neřešíme v SP2.

---

## Task 15: Update dluhy.md + commit + push

**Files:**
- Modify: `docs/dluhy.md`

- [ ] **Step 1: Update master entry**

Najít sekci `[otevřeno 2026-05-14, SP0+SP1 hotov] BE fix-forward — zbývá SP2–SP6`. Update na:

```markdown
### [otevřeno 2026-05-14, SP0+SP1+SP2 hotov] BE fix-forward — zbývá SP3–SP6

- **Soubor:** mnoho — viz [be-fix-forward-decomposition](superpowers/specs/2026-05-14-be-fix-forward-decomposition.md)
- **Typ:** build/CI + chybějící feature implementace (~~Mailer~~ ✅ SP1, ~~SecurityTokens~~ ✅ SP1, ~~AuthService email flows~~ ✅ SP2, UsersService extensions, Admin extensions, Friendships, DataExport)
- **Riziko:** main na origin neprojde plným typecheck bez transitional `tsconfig.json` + `eslint.config.mjs` + `jest.config.ts` ignore. AdminModule dočasně **disabled** v `app.module.ts` — `/api/admin/*` endpointy nedostupné dokud SP4 nelandí.
- **Co vyžaduje:** Postupné dokončení SP3–SP6, každý vlastní spec → plán → impl cyklus. Po SP4 odkomentovat AdminModule.
- **Zdroj:** Audit 2026-05-14. **SP0** (User entity + WorldRole + OptionalJwtAuthGuard + Login status). **SP1** (Mailer + SecurityTokens). **SP2** (5 AuthService email flow metod + UserBanCacheService stub + DeletionPromotion + 4 User fields + 5 controller routes + 4 DTOs).
```

- [ ] **Step 2: Stage SP2 files**

```bash
git add backend/src/modules/users/interfaces/user.interface.ts
git add backend/src/modules/users/schemas/user.schema.ts
git add backend/src/modules/users/services/
git add backend/src/modules/users/users.module.ts
git add backend/src/modules/auth/
git add backend/tsconfig.json
git add backend/eslint.config.mjs
git add backend/jest.config.ts
git add docs/dluhy.md
git add docs/superpowers/specs/2026-05-14-sp2-auth-email-flows-design.md
git add docs/superpowers/plans/2026-05-14-sp2-auth-email-flows.md
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(SP2): AuthService email flows + UserBanCacheService

Treti vrstva BE fix-forward — viz docs/superpowers/specs/2026-05-14-be-fix-forward-decomposition.md.

User entity rozsireni (4 pole + DeletionPromotion interface):
- emailVerified, emailVerifiedAt (D-012)
- deletionRequestedBy, deletionPromotions[] (D-037 audit + reverzibilita)
- Schema decoratory vc. nested deletionPromotions subdokument

UserBanCacheService (stub pro SP4):
- In-memory Map<userId, BanState>
- get / set / invalidate, auto-expiry temp ban
- 6 testu pass

AuthService rozsireni (5 metod + 2 static TTL):
- PASSWORD_RESET_TTL_MS = 1h, EMAIL_VERIFY_TTL_MS = 24h
- forgotPassword: anti-enum, vzdy { ok: true }; mailer fail = warn log
- resetPasswordByToken: heslo update + refresh revoke + D-037 reaktivace
  (cleanup deletionRequestedAt/By/Reason/Promotions, banCache.invalidate,
  vrati revertablePromotions pro FE)
- verifyEmail: emailVerified=true + emailVerifiedAt set
- resendEmailVerification: pro JWT user, 400 ALREADY_VERIFIED, 401 missing
- confirmEmailChange: token.meta.newEmail, race check vs EMAIL_TAKEN, idempotent
- register: fire-and-forget verify email po save
- DI: MailerService + SecurityTokensService + UserBanCacheService + EventEmitter2

AuthController + DTOs:
- POST /auth/forgot-password (5/min)
- POST /auth/reset-password (5/min)
- POST /auth/verify-email (30/min)
- POST /auth/resend-verification (3/min, JWT)
- POST /auth/confirm-email-change (5/min)
- 4 DTOs s class-validator

Wiring:
- UsersModule: provide + export UserBanCacheService
- AuthModule: zadne zmeny (UsersModule + Mailer/SecurityTokens @Global)
- tsconfig + eslint + jest: odebrana auth.service.spec.ts z exclude (modul ted kompiluje)

Testy: auth.service.spec.ts (20 novych) + user-ban-cache (6) zelene.
Existujici: 791+ regression-clean.

Co zbyva: SP3 (UsersService extensions), SP4 (Admin), SP5 (Friendships), SP6 (DataExport).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: pushed.

---

## Self-Review

### Spec coverage

| Spec sekce | Implementuje task |
|---|---|
| 1.1 User interface 4 fields + DeletionPromotion | Task 1 |
| 1.2 User schema decorators | Task 2 |
| 2 UserBanCacheService | Task 3 |
| 2.3 Module wiring (UsersModule) | Task 4 |
| 3.1 Static TTL | Task 6 |
| 3.2 Konstruktor DI | Task 6 |
| 3.3 forgotPassword | Task 8 |
| 3.4 resetPasswordByToken | Task 9 |
| 3.5 verifyEmail | Task 10 |
| 3.6 resendEmailVerification | Task 10 |
| 3.7 confirmEmailChange | Task 11 |
| 3.8 Register extension | Task 7 |
| 4 Controller routes + DTOs | Tasks 5, 12 |
| 5 Module wiring (AuthModule) | (no change needed — UsersModule + @Global from SP1) |
| 6.1 AuthService tests (existing spec) | Task 13 |
| 6.2 UserBanCacheService tests | Task 3 |
| 8 Validation criteria | Tasks 13–15 |

### Placeholder scan

- ✅ Žádné "TBD" — všechny tasky mají kompletní code blocks.
- ✅ "Pokud testy failují" v Task 13 Step 4 je instruktivní (ne placeholder), ale lépe by bylo specifický.

### Type consistency

- `DeletionPromotion` interface definováno v Task 1, used v Task 2 (schema), Task 9 (resetPasswordByToken return type).
- `BanState` interface v Task 3 (UserBanCacheService), used v Task 9 (banCache.invalidate — jen .invalidate).
- `AuthService.PASSWORD_RESET_TTL_MS` / `EMAIL_VERIFY_TTL_MS` definováno v Task 6, used v Task 7 (register), Task 8 (forgotPassword), Task 10 (resendEmailVerification).
- Token types: `'password_reset'` v Task 8/9, `'email_verify'` v Task 7/10, `'email_change'` v Task 11. Konzistentní s SP1 SecurityTokenType.
- DTO field names konzistentní s controller bind: `dto.email`, `dto.token`, `dto.password`.

---

## Plán hotov.
