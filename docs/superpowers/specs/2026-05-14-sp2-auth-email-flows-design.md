# SP2 — AuthService Email Flows (Design)

**Datum:** 2026-05-14
**Stav:** Schváleno
**Roadmap:** [be-fix-forward-decomposition](2026-05-14-be-fix-forward-decomposition.md)
**Vychází z:** SP1 (MailerService, SecurityTokensService). Předchází SP3 (UsersService extensions) a SP4 (Admin).

---

## Cíl

Implementovat 5 nových AuthService metod pro password reset, email verify a email change confirm — vše nad SP1 infrastrukturou. Naplno odemkne `auth.service.spec.ts` (nyní v tsconfig exclude).

---

## 1. User entity rozšíření

### 1.1 Nové fields (`user.interface.ts`)

```typescript
export interface User {
  // ... existing
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
  deletionRequestedBy?: string; // userId admina (D-037 audit)
  deletionPromotions?: DeletionPromotion[]; // D-037 reverzibilní povýšení
}

export interface DeletionPromotion {
  worldId: string;
  worldName: string;
  worldSlug: string;
  promotedUserId: string;
  promotedUsername: string;
}
```

### 1.2 Schema rozšíření (`user.schema.ts`)

```typescript
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

⚠️ **Žádná migration script** — fields jsou optional/default. Existující záznamy mají `emailVerified=undefined` (effective false na auth check).

---

## 2. UserBanCacheService

### 2.1 Účel a scope

In-memory cache pro rychlé ban lookup. SP2 dodává **minimální stub** (3 metody, žádná persistence). SP4 ho rozšíří o:
- DB warmup at startup
- TTL invalidace po `bannedUntil`
- Cluster-wide invalidace přes event bus

SP2 ho dělá protože `auth.service.spec.ts` injectuje `UserBanCacheService`. Bez něj AuthModule neufne DI.

### 2.2 Interface (`user-ban-cache.service.ts`)

```typescript
import { Injectable } from '@nestjs/common';

export interface BanState {
  bannedAt: Date;
  bannedUntil?: Date; // undefined = permanent
  banReason?: string;
}

@Injectable()
export class UserBanCacheService {
  private readonly cache = new Map<string, BanState>();

  get(userId: string): BanState | null {
    const ban = this.cache.get(userId);
    if (!ban) return null;
    // Pokud expirovaný (bannedUntil < now), invalidovat a vrátit null.
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

### 2.3 Module wiring

Service patří do `UsersModule` (matchne import path `../users/services/user-ban-cache.service`). `UsersModule` exportuje, `AuthModule` ji konzumuje přes import `UsersModule`.

⚠️ **Žádný cluster sync** — SP4 doplní `@OnEvent('user.banned')` pro multi-instance deploy. SP2 single-instance stačí.

---

## 3. AuthService rozšíření

### 3.1 Static TTL konstanty

```typescript
export class AuthService {
  static readonly PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hodina
  static readonly EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hodin
  // ...
}
```

Statics — `auth.service.spec.ts` je čte přes `AuthService.PASSWORD_RESET_TTL_MS`.

### 3.2 Konstruktor — nové DI

```typescript
constructor(
  @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
  @Inject('IRefreshTokenRepository') private readonly refreshRepo: IRefreshTokenRepository,
  private readonly jwtService: JwtService,
  private readonly config: ConfigService,
  private readonly mailer: MailerService, // SP2
  private readonly securityTokens: SecurityTokensService, // SP2
  private readonly banCache: UserBanCacheService, // SP2
  private readonly events: EventEmitter2, // SP2 (audit + tokens invalidation)
) {}
```

### 3.3 `forgotPassword(email)`

Anti-enumeration: vždy vrací `{ ok: true }`. Token vydá jen pro existujícího ne-hard-deletovaného usera. Pending soft-delete user (D-037) **token DOSTANE** — reset povolí reaktivaci.

```typescript
async forgotPassword(email: string): Promise<{ ok: true }> {
  const normalized = email.toLowerCase();
  const user = await this.usersRepo.findByEmail(normalized);
  if (!user || user.isDeleted) {
    return { ok: true }; // anti-enumeration
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
    // Mailer fail → log warn, žádný throw (kontrakt z auth.service.spec.ts:599)
    this.logger.warn(
      `forgotPassword mailer fail for ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { ok: true };
}
```

💡 *Pozor:* MailerService.sendPasswordReset už interně swallows errors (SP1 dispatch). Druhý try-catch zde je redundantní, ALE auth.service.spec.ts:599 mocká `mockMailer.sendPasswordReset.mockRejectedValueOnce` přímo (ignoruje SP1 dispatcher) — takže service musí ošetřit i unwrapped reject. Bezpečnější přístup.

### 3.4 `resetPasswordByToken(token, newPassword)`

Konzumuje token, updatuje heslo, revokuje refresh tokeny, emituje `user.password.changed` event. Pokud uživatel měl pending soft-delete (D-037), reaktivuje účet a vrátí `revertablePromotions` pro UI.

```typescript
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

⚠️ **Co se NEDĚLÁ:** skutečný revert promotions — vrací jen list pro FE/audit. SP4 přidá `POST /admin/users/:id/revert-promotion/:worldId` endpoint pro per-world revoke. SP2 jen informuje.

### 3.5 `verifyEmail(token)`

```typescript
async verifyEmail(token: string): Promise<{ ok: true }> {
  const { userId } = await this.securityTokens.consume(token, 'email_verify');
  await this.usersRepo.update(userId, {
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { ok: true };
}
```

Token consume throw propaguje (INVALID_TOKEN/EXPIRED_TOKEN/ALREADY_USED).

### 3.6 `resendEmailVerification(userId)`

Pro přihlášeného usera (volá se z `/auth/resend-verification` s JWT). Pokud už verified, vrátí 400 ALREADY_VERIFIED. Pokud user neexistuje, 401.

```typescript
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

### 3.7 `confirmEmailChange(token)`

Token meta obsahuje `newEmail` (vydaný při requestu změny — SP3 `UsersService.requestEmailChange`). Před update zkontroluje race (jiný user mezitím zabral newEmail).

```typescript
async confirmEmailChange(token: string): Promise<{ ok: true }> {
  const { userId, meta } = await this.securityTokens.consume(token, 'email_change');
  const newEmail = meta?.newEmail as string | undefined;
  if (!newEmail || typeof newEmail !== 'string') {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Token neobsahuje validní cílový email',
      code: 'INVALID_TOKEN',
    });
  }

  const normalized = newEmail.toLowerCase();
  const existing = await this.usersRepo.findByEmail(normalized);
  if (existing && existing.id !== userId) {
    throw new ConflictException({
      statusCode: 409,
      message: 'Email už používá jiný uživatel',
      code: 'EMAIL_TAKEN',
    });
  }

  // Idempotent: pokud user už má cílový email, nic se nezmění — projde to.
  await this.usersRepo.update(userId, {
    email: normalized,
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { ok: true };
}
```

### 3.8 Register flow extension

Existing `register` se rozšíří o fire-and-forget email verify token. Tests neenforcují (mocky default-resolved), ale prod chování musí být to.

```typescript
async register(dto: RegisterDto): Promise<{ ... }> {
  // ... existing logic + save user ...
  
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
```

---

## 4. AuthController nové routes

| Route | DTO | Auth | Throttle |
|---|---|---|---|
| `POST /auth/forgot-password` | `{ email }` | none | 5/min |
| `POST /auth/reset-password` | `{ token, password }` | none | 5/min |
| `POST /auth/verify-email` | `{ token }` | none | 30/min |
| `POST /auth/resend-verification` | none (body) | **JWT** | 3/min |
| `POST /auth/confirm-email-change` | `{ token }` | none | 5/min |

```typescript
@Post('forgot-password')
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@HttpCode(HttpStatus.OK)
forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.authService.forgotPassword(dto.email);
}

@Post('reset-password')
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@HttpCode(HttpStatus.OK)
resetPassword(@Body() dto: ResetPasswordDto) {
  return this.authService.resetPasswordByToken(dto.token, dto.password);
}

@Post('verify-email')
@Throttle({ default: { ttl: 60_000, limit: 30 } })
@HttpCode(HttpStatus.OK)
verifyEmail(@Body() dto: VerifyEmailDto) {
  return this.authService.verifyEmail(dto.token);
}

@Post('resend-verification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { ttl: 60_000, limit: 3 } })
@HttpCode(HttpStatus.OK)
resendVerification(@CurrentUser() user: RequestUser) {
  return this.authService.resendEmailVerification(user.id);
}

@Post('confirm-email-change')
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@HttpCode(HttpStatus.OK)
confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
  return this.authService.confirmEmailChange(dto.token);
}
```

### 4.1 DTOs

```typescript
// dto/forgot-password.dto.ts
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

// dto/reset-password.dto.ts
export class ResetPasswordDto {
  @IsString()
  @MinLength(32) // SHA-256 plain je 64 hex; nižší minimum jen sanity
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

// dto/verify-email.dto.ts
export class VerifyEmailDto {
  @IsString()
  @MinLength(32)
  token: string;
}

// dto/confirm-email-change.dto.ts
export class ConfirmEmailChangeDto {
  @IsString()
  @MinLength(32)
  token: string;
}
```

⚠️ `resendVerification` nemá DTO — bere userId z JWT.

---

## 5. Module wiring

### AuthModule (`auth.module.ts`)

```typescript
@Module({
  imports: [
    UsersModule, // exports UserBanCacheService
    PassportModule,
    JwtModule.registerAsync({...}),
    MongooseModule.forFeature([...]),
    // MailerModule + SecurityTokensModule jsou @Global() → není třeba importovat
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, { provide: 'IRefreshTokenRepository', useClass: ... }],
  exports: [JwtModule],
})
export class AuthModule {}
```

### UsersModule (`users.module.ts`) — přidat UserBanCacheService

```typescript
@Module({
  // existing imports
  providers: [
    // ... existing
    UserBanCacheService,
  ],
  exports: [
    // ... existing
    UserBanCacheService,
  ],
})
export class UsersModule {}
```

---

## 6. Testing scope

### 6.1 AuthService (auth.service.spec.ts — pokrytí už existuje)

Spec contract: forgotPassword (6), resetPasswordByToken (5), verifyEmail (2), resendEmailVerification (3), confirmEmailChange (4) = **20 testů**. Plus existující register/login/refresh/checkUsername/etc.

Po SP2 musí všech 20 + existující testů projít.

### 6.2 UserBanCacheService (`user-ban-cache.service.spec.ts`) — nový

| Case | Expected |
|---|---|
| get neexistuje → null | OK |
| set + get → vrátí stav | OK |
| invalidate → následný get null | OK |
| permanent ban (bannedUntil undefined) → vždy aktivní | OK |
| temp ban v minulosti → get vrací null, automaticky invaliduje | OK |
| temp ban v budoucnosti → get vrací stav | OK |

**Cíl:** ≥ 6 testů.

### 6.3 AuthController integration (volitelné)

Nepřidáváme nyní (controller je tenký pass-through). E2e testy v `test/` přidá samostatný task pokud bude potřeba.

---

## 7. Anti-scope

**SP2 NEZAHRNUJE:**
- Login `status: 'banned'` / `'email_not_verified'` branche — login spec to neenforcují, SP4 přidá ban check
- Skutečný revert promotions (jen vrací list) — SP4 `POST /admin/users/:id/revert-promotion/:worldId`
- UserBanCacheService DB warmup / cluster sync — SP4
- UsersService.requestEmailChange (vystavuje email_change token) — SP3
- HTML/i18n email templates — Logger backend stačí, prod provider donese templates
- GET varianty endpointů (verify-email-by-query) — JS link v emailu udělá POST

---

## 8. Validation criteria

Po SP2:
- [ ] `User` interface má 4 nová pole + `DeletionPromotion` export
- [ ] `user.schema.ts` má 4 `@Prop()` decorátory (vč. nested `deletionPromotions`)
- [ ] `UserBanCacheService` ve `users/services/` + test (6 cases)
- [ ] `UsersModule` providers + exports zahrnují `UserBanCacheService`
- [ ] `AuthService` má 5 nových metod + 2 static TTL konstanty
- [ ] `AuthService` konstruktor injectuje Mailer + SecurityTokens + UserBanCache + EventEmitter2
- [ ] `AuthService.register` po save fire-and-forget vystaví email verify token + mail
- [ ] `AuthController` má 5 nových routes + 4 nové DTOs
- [ ] `tsconfig.json` exclude — odebrána `auth.service.spec.ts`
- [ ] `eslint.config.mjs` + `jest.config.ts` synchronizováno
- [ ] `npm run typecheck` projde
- [ ] `npm run lint:check` projde
- [ ] `npx jest auth user-ban-cache` projde — 20+ testů zelených
- [ ] `docs/dluhy.md` master entry: SP2 ✅, zbývá SP3–SP6

---

## Schvalovací log

- 2026-05-14 — schváleno user response "jedeme dál" po SP1 hotov.
