# Auth refresh tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat `POST /auth/refresh` s rotací a detekcí reuse přes `familyId`, `POST /auth/logout` (per-session), `POST /auth/logout-all` (per-user). Login/register vrátí oba tokeny. Změna hesla revokuje všechny refresh tokeny uživatele přes EventEmitter.

**Architecture:** Refresh token je JWT signovaný oddělentým secretem (`JWT_REFRESH_SECRET`), trackovaný v MongoDB kolekci `refresh_tokens` s TTL indexem. Při každém refreshi se starý jti zrevokuje a vystaví se nový s tím samým `familyId`. Reuse revokovaného tokenu zruší celou rodinu (security). EventEmitter (`user.password.changed`) odděluje UsersModule od AuthModule.

**Tech Stack:** NestJS 10, TypeScript, Mongoose 8, @nestjs/jwt, @nestjs/event-emitter, Jest, uuid.

Spec: [2026-05-05-auth-refresh-design.md](../specs/2026-05-05-auth-refresh-design.md)

---

## File Structure

**Nové soubory:**
- `backend/src/modules/auth/schemas/refresh-token.schema.ts` — Mongoose schema + indexy
- `backend/src/modules/auth/interfaces/refresh-token.interface.ts` — `RefreshToken` entity, `RefreshTokenPayload`
- `backend/src/modules/auth/interfaces/refresh-token-repository.interface.ts` — `IRefreshTokenRepository`
- `backend/src/modules/auth/repositories/refresh-token.repository.ts` — Mongo implementace
- `backend/src/modules/auth/repositories/refresh-token.repository.spec.ts` — repo testy
- `backend/src/modules/auth/dto/refresh.dto.ts` — `RefreshDto { refreshToken: string }`
- `backend/src/modules/auth/dto/logout.dto.ts` — `LogoutDto { refreshToken: string }`

**Modifikované soubory:**
- `backend/src/modules/auth/auth.service.ts` — `generateTokenPair`, `refresh`, `logout`, `logoutAll`, `revokeFamily`, `revokeAllForUser`, `@OnEvent('user.password.changed')`. Register/login vrací `{ accessToken, refreshToken, user }`.
- `backend/src/modules/auth/auth.service.spec.ts` — ~14 nových testů, aktualizace existujících 2 testů
- `backend/src/modules/auth/auth.controller.ts` — `+3 endpointy` se Swaggery
- `backend/src/modules/auth/auth.module.ts` — `MongooseModule.forFeature(RefreshToken)`, `IRefreshTokenRepository` provider
- `backend/src/modules/users/users.service.ts` — `changePassword` a `resetPassword` emitují `user.password.changed`
- `backend/src/modules/users/users.service.spec.ts` — 2 nové testy
- `backend/src/modules/users/users.module.ts` — inject `EventEmitter2` (může už být dostupný globálně, ověřit)
- `.env.example` — přidat `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL_DAYS`
- `docs/roadmap.md` — Krok 1 zaškrtnout `/auth/refresh`
- `docs/roadmap2.md` — Fáze 1.3 ✅

**EventEmitter:** existující projekt už použivá `@nestjs/event-emitter` v `worlds.service.ts` a `ikaros-messages.service.ts` — `EventEmitterModule.forRoot()` je v `app.module.ts`. Žádná nová module registrace.

---

## Task 1: Schema, interfaces a DTO

**Files:**
- Create: `backend/src/modules/auth/schemas/refresh-token.schema.ts`
- Create: `backend/src/modules/auth/interfaces/refresh-token.interface.ts`
- Create: `backend/src/modules/auth/interfaces/refresh-token-repository.interface.ts`
- Create: `backend/src/modules/auth/dto/refresh.dto.ts`
- Create: `backend/src/modules/auth/dto/logout.dto.ts`

- [ ] **Step 1: Vytvořit `refresh-token.interface.ts`**

```ts
export interface RefreshToken {
  jti: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

export interface RefreshTokenPayload {
  sub: string;       // userId
  jti: string;
  familyId: string;
  type: 'refresh';
}
```

- [ ] **Step 2: Vytvořit `refresh-token-repository.interface.ts`**

```ts
import { RefreshToken } from './refresh-token.interface';

export interface IRefreshTokenRepository {
  save(token: Omit<RefreshToken, 'createdAt'> & { createdAt?: Date }): Promise<RefreshToken>;
  findByJti(jti: string): Promise<RefreshToken | null>;
  revokeByJti(jti: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
```

- [ ] **Step 3: Vytvořit `refresh-token.schema.ts`**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RefreshTokenDocument = HydratedDocument<RefreshTokenSchemaClass>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'refresh_tokens' })
export class RefreshTokenSchemaClass {
  @Prop({ required: true, unique: true }) jti: string;
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) familyId: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ default: false }) revoked: boolean;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshTokenSchemaClass);
RefreshTokenSchema.index({ userId: 1 });
RefreshTokenSchema.index({ familyId: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

- [ ] **Step 4: Vytvořit `refresh.dto.ts`**

```ts
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @IsString() @IsNotEmpty() refreshToken: string;
}
```

- [ ] **Step 5: Vytvořit `logout.dto.ts`**

```ts
import { IsString, IsNotEmpty } from 'class-validator';

export class LogoutDto {
  @IsString() @IsNotEmpty() refreshToken: string;
}
```

- [ ] **Step 6: TypeScript build**

Run: `cd backend && npx tsc --noEmit`
Expected: clean (žádné chyby).

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/auth/schemas/refresh-token.schema.ts \
        backend/src/modules/auth/interfaces/refresh-token.interface.ts \
        backend/src/modules/auth/interfaces/refresh-token-repository.interface.ts \
        backend/src/modules/auth/dto/refresh.dto.ts \
        backend/src/modules/auth/dto/logout.dto.ts

git commit -m "$(cat <<'EOF'
feat(auth): RefreshToken schema, interfaces a DTO

Foundation pro auth refresh tokens. Schema má TTL index na expiresAt
(automatická Mongo cleanup), unique index na jti, indexy na userId
a familyId pro revokační operace.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: RefreshToken repository

**Files:**
- Create: `backend/src/modules/auth/repositories/refresh-token.repository.ts`
- Create: `backend/src/modules/auth/repositories/refresh-token.repository.spec.ts`

- [ ] **Step 1: Vytvořit testy nejdřív (TDD)**

`refresh-token.repository.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoRefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenSchemaClass } from '../schemas/refresh-token.schema';

describe('MongoRefreshTokenRepository', () => {
  let repo: MongoRefreshTokenRepository;
  const mockModel = {
    create: jest.fn(),
    findOne: jest.fn(() => ({ lean: () => ({ exec: jest.fn() }) })),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoRefreshTokenRepository,
        { provide: getModelToken(RefreshTokenSchemaClass.name), useValue: mockModel },
      ],
    }).compile();
    repo = module.get(MongoRefreshTokenRepository);
    jest.clearAllMocks();
  });

  it('save vytvoří záznam', async () => {
    const expiresAt = new Date();
    mockModel.create.mockResolvedValue({
      _id: 'doc1', jti: 'j1', userId: 'u1', familyId: 'f1',
      expiresAt, revoked: false, createdAt: new Date(),
    });
    const result = await repo.save({
      jti: 'j1', userId: 'u1', familyId: 'f1', expiresAt, revoked: false,
    });
    expect(mockModel.create).toHaveBeenCalledWith(expect.objectContaining({ jti: 'j1', userId: 'u1', familyId: 'f1' }));
    expect(result.jti).toBe('j1');
  });

  it('findByJti vrátí null pokud neexistuje', async () => {
    mockModel.findOne.mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(null) }) });
    const result = await repo.findByJti('missing');
    expect(result).toBeNull();
  });

  it('findByJti vrátí entity pro existující záznam', async () => {
    const doc = {
      _id: 'd', jti: 'j1', userId: 'u1', familyId: 'f1',
      expiresAt: new Date(), revoked: false, createdAt: new Date(),
    };
    mockModel.findOne.mockReturnValue({ lean: () => ({ exec: jest.fn().mockResolvedValue(doc) }) });
    const result = await repo.findByJti('j1');
    expect(result?.jti).toBe('j1');
    expect(result?.revoked).toBe(false);
  });

  it('revokeByJti volá updateOne s revoked=true', async () => {
    mockModel.findOneAndUpdate.mockResolvedValue({});
    await repo.revokeByJti('j1');
    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith({ jti: 'j1' }, { revoked: true });
  });

  it('revokeFamily volá updateMany na všechny tokeny familyId', async () => {
    mockModel.updateMany.mockResolvedValue({ modifiedCount: 3 });
    await repo.revokeFamily('f1');
    expect(mockModel.updateMany).toHaveBeenCalledWith({ familyId: 'f1' }, { revoked: true });
  });

  it('revokeAllForUser volá updateMany na všechny tokeny userId', async () => {
    mockModel.updateMany.mockResolvedValue({ modifiedCount: 5 });
    await repo.revokeAllForUser('u1');
    expect(mockModel.updateMany).toHaveBeenCalledWith({ userId: 'u1' }, { revoked: true });
  });
});
```

- [ ] **Step 2: Spustit testy — verify FAIL**

Run: `cd backend && npx jest src/modules/auth/repositories/refresh-token.repository.spec.ts`
Expected: FAIL — `MongoRefreshTokenRepository` neexistuje.

- [ ] **Step 3: Vytvořit `refresh-token.repository.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RefreshTokenSchemaClass } from '../schemas/refresh-token.schema';
import { RefreshToken } from '../interfaces/refresh-token.interface';
import { IRefreshTokenRepository } from '../interfaces/refresh-token-repository.interface';

@Injectable()
export class MongoRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectModel(RefreshTokenSchemaClass.name)
    private readonly model: Model<RefreshTokenSchemaClass>,
  ) {}

  async save(token: Omit<RefreshToken, 'createdAt'> & { createdAt?: Date }): Promise<RefreshToken> {
    const doc = await this.model.create(token);
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findByJti(jti: string): Promise<RefreshToken | null> {
    const doc = await this.model.findOne({ jti }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async revokeByJti(jti: string): Promise<void> {
    await this.model.findOneAndUpdate({ jti }, { revoked: true });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.model.updateMany({ familyId }, { revoked: true });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.model.updateMany({ userId }, { revoked: true });
  }

  private toEntity(doc: Record<string, unknown>): RefreshToken {
    return {
      jti: doc.jti as string,
      userId: doc.userId as string,
      familyId: doc.familyId as string,
      expiresAt: doc.expiresAt as Date,
      revoked: (doc.revoked as boolean) ?? false,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 4: Spustit testy — verify PASS**

Run: `cd backend && npx jest src/modules/auth/repositories/refresh-token.repository.spec.ts`
Expected: 6 testů PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/repositories/refresh-token.repository.ts \
        backend/src/modules/auth/repositories/refresh-token.repository.spec.ts

git commit -m "$(cat <<'EOF'
feat(auth): MongoRefreshTokenRepository s 6 metodami

save, findByJti, revokeByJti, revokeFamily, revokeAllForUser. Plné
unit pokrytí (6 testů, mock model).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: AuthService — token generation a aktualizace register/login

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts` — přidat `generateTokenPair`, upravit `register` a `login` aby vraceli oba tokeny
- Modify: `backend/src/modules/auth/auth.service.spec.ts` — aktualizovat existující 2 testy + přidat 2 nové

- [ ] **Step 1: Aktualizovat existující testy a přidat nové (TDD)**

V `auth.service.spec.ts` přepsat mock setup na verzi se vším potřebným:

```ts
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '../users/interfaces/user.interface';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
}));
jest.mock('uuid', () => ({ v4: jest.fn() }));
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';

const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'hash', role: UserRole.Hrac,
  displayName: undefined, avatarUrl: undefined,
  characterPath: 'elara', ikarosSkin: 'default',
  themeSettings: {}, chatPreferences: {},
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  const mockUsersRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    save: jest.fn(),
    updateLastSeen: jest.fn(),
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
  const mockEvents = { emit: jest.fn() };

  beforeEach(async () => {
    (uuid as jest.Mock).mockReturnValueOnce('jti-1').mockReturnValueOnce('family-1');
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IRefreshTokenRepository', useValue: mockRefreshRepo },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
    (uuid as jest.Mock).mockReturnValueOnce('jti-1').mockReturnValueOnce('family-1');
    mockJwt.sign.mockImplementation((payload: any) => `signed-${JSON.stringify(payload).slice(0, 30)}`);
  });

  describe('register', () => {
    it('vyhodí ConflictException pro duplicitní email', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(mockUser);
      await expect(
        service.register({ email: 'a@a.com', username: 'new', password: 'pass123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('vrátí accessToken + refreshToken + user pro nového uživatele', async () => {
      mockUsersRepo.findByEmail.mockResolvedValue(null);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      mockUsersRepo.save.mockResolvedValue(mockUser);
      mockRefreshRepo.save.mockResolvedValue({});
      const result = await service.register({ email: 'a@a.com', username: 'new', password: 'pass123' });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockRefreshRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        jti: 'jti-1', familyId: 'family-1', userId: '1', revoked: false,
      }));
    });
  });

  describe('login', () => {
    it('vyhodí UnauthorizedException pro špatné heslo', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockUsersRepo.findByEmail.mockResolvedValue(mockUser);
      await expect(
        service.login({ email: 'a@a.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('vrátí accessToken + refreshToken + user pro správné heslo', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUsersRepo.findByEmail.mockResolvedValue(mockUser);
      const result = await service.login({ email: 'a@a.com', password: 'pass123' });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockRefreshRepo.save).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Spustit — verify FAIL**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: FAIL — `IRefreshTokenRepository` provider neexistuje, `register/login` nevrací refreshToken.

- [ ] **Step 3: Aktualizovat `auth.service.ts`**

Plná nová verze:

```ts
import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcrypt';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IRefreshTokenRepository } from './interfaces/refresh-token-repository.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User, UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class AuthService {
  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IRefreshTokenRepository') private readonly refreshRepo: IRefreshTokenRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string; user: Omit<User, 'passwordHash'> }> {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email již existuje');

    const existingUsername = await this.usersRepo.findByUsername(dto.username);
    if (existingUsername) throw new ConflictException('Username již existuje');

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

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: Omit<User, 'passwordHash'> }> {
    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Neplatné přihlašovací údaje');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Neplatné přihlašovací údaje');

    await this.usersRepo.updateLastSeen(user.id);
    const tokens = await this.generateTokenPair(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  private async generateTokenPair(user: User, familyId?: string): Promise<{ accessToken: string; refreshToken: string }> {
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
    const ttlDays = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? '30');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti, familyId: family, type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? (() => { throw new Error('JWT_REFRESH_SECRET is not set'); })(),
        expiresIn: `${ttlDays}d`,
      },
    );

    await this.refreshRepo.save({ jti, userId: user.id, familyId: family, expiresAt, revoked: false });

    return { accessToken, refreshToken };
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }
}
```

- [ ] **Step 4: Spustit testy — verify PASS**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: 4 testy PASS.

- [ ] **Step 5: Spustit celý suite (kvůli regresi)**

Run: `cd backend && npm test`
Expected: PASS, ale build může selhat kvůli `auth.module.ts` (žádný provider pro `IRefreshTokenRepository`). To řeší Task 8. Pokud testy projdou ale build dropne, **OK pokračovat** — modul se opraví v Task 8.

Pokud `npm test` selže nebo dropne, zkontroluj — některé testy mohou inject `AuthService` bez nového providera.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts \
        backend/src/modules/auth/auth.service.spec.ts

git commit -m "$(cat <<'EOF'
feat(auth): generateTokenPair, register/login vrací oba tokeny

Refresh token se signuje JWT_REFRESH_SECRET s TTL JWT_REFRESH_TTL_DAYS
(default 30). Při registraci/loginu se založí nový familyId a jti,
záznam jde do RefreshToken kolekce.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: AuthService.refresh + reuse detection

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts` — přidat `refresh(refreshToken: string)`
- Modify: `backend/src/modules/auth/auth.service.spec.ts` — přidat ~10 testů

- [ ] **Step 1: Přidat testy `describe('refresh')` a `describe('refresh — reuse detection')`**

Vlož na konec `auth.service.spec.ts` (před závěrečné `});` souboru):

```ts
  describe('refresh', () => {
    const validPayload = { sub: '1', jti: 'old-jti', familyId: 'fam-1', type: 'refresh' };

    beforeEach(() => {
      mockUsersRepo.findById.mockResolvedValue(mockUser);
      mockJwt.verify.mockReturnValue(validPayload);
    });

    it('vyhodí UnauthorizedException pro invalid signature', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('vyhodí UnauthorizedException pokud type !== "refresh"', async () => {
      mockJwt.verify.mockReturnValue({ sub: '1', jti: 'j', familyId: 'f' /* no type */ });
      await expect(service.refresh('access-token')).rejects.toThrow(UnauthorizedException);
    });

    it('vyhodí UnauthorizedException pokud jti není v DB', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue(null);
      await expect(service.refresh('orphan')).rejects.toThrow(UnauthorizedException);
    });

    it('vrátí nový pár tokenů pro validní refresh', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti', userId: '1', familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000), revoked: false, createdAt: new Date(),
      });
      const result = await service.refresh('valid-token');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('revokuje starý jti po úspěšném refreshi', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti', userId: '1', familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000), revoked: false, createdAt: new Date(),
      });
      await service.refresh('valid-token');
      expect(mockRefreshRepo.revokeByJti).toHaveBeenCalledWith('old-jti');
    });

    it('nový token má stejný familyId', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti', userId: '1', familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000), revoked: false, createdAt: new Date(),
      });
      await service.refresh('valid-token');
      expect(mockRefreshRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ familyId: 'fam-1', userId: '1', revoked: false }),
      );
    });
  });

  describe('refresh — reuse detection', () => {
    const validPayload = { sub: '1', jti: 'rev-jti', familyId: 'fam-2', type: 'refresh' };

    beforeEach(() => {
      mockUsersRepo.findById.mockResolvedValue(mockUser);
      mockJwt.verify.mockReturnValue(validPayload);
    });

    it('vyhodí UnauthorizedException pokud token je již revoked', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'rev-jti', userId: '1', familyId: 'fam-2',
        expiresAt: new Date(Date.now() + 1000000), revoked: true, createdAt: new Date(),
      });
      await expect(service.refresh('reused-token')).rejects.toThrow(UnauthorizedException);
    });

    it('při reuse zruší celou rodinu', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'rev-jti', userId: '1', familyId: 'fam-2',
        expiresAt: new Date(Date.now() + 1000000), revoked: true, createdAt: new Date(),
      });
      await expect(service.refresh('reused-token')).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshRepo.revokeFamily).toHaveBeenCalledWith('fam-2');
    });

    it('legitimní rotace nezruší rodinu', async () => {
      mockRefreshRepo.findByJti.mockResolvedValue({
        jti: 'old-jti', userId: '1', familyId: 'fam-1',
        expiresAt: new Date(Date.now() + 1000000), revoked: false, createdAt: new Date(),
      });
      mockJwt.verify.mockReturnValue({ sub: '1', jti: 'old-jti', familyId: 'fam-1', type: 'refresh' });
      await service.refresh('valid-token');
      expect(mockRefreshRepo.revokeFamily).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Spustit testy — verify FAIL**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: FAIL — metoda `refresh` neexistuje.

- [ ] **Step 3: Implementovat `refresh` v `auth.service.ts`**

Přidat na konec třídy `AuthService` (před `private sanitize`):

```ts
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: { sub: string; jti: string; familyId: string; type?: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? (() => { throw new Error('JWT_REFRESH_SECRET is not set'); })(),
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
      // Reuse detection — útočník nebo legitimní omyl. Zrušit celou rodinu.
      await this.refreshRepo.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token byl zneužit, všechny relace zrušeny');
    }

    const user = await this.usersRepo.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException('Uživatel neexistuje');
    }

    await this.refreshRepo.revokeByJti(stored.jti);
    return this.generateTokenPair(user, stored.familyId);
  }
```

Také přidat import `findById` ve `IUsersRepository` — zkontrolovat, že existuje. Pokud ano, OK; pokud ne, doplnit do interface.

Run: `grep -n "findById" backend/src/modules/users/interfaces/users-repository.interface.ts`
Expected: existuje. (Pokud ne, přidat: `findById(id: string): Promise<User | null>;` — ale s vysokou pravděpodobností existuje.)

- [ ] **Step 4: Spustit testy — verify PASS**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: 13 testů PASS (4 z Task 3 + 9 nových).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts \
        backend/src/modules/auth/auth.service.spec.ts

git commit -m "$(cat <<'EOF'
feat(auth): refresh metoda s rotací a detekcí reuse

Verify JWT podpis (JWT_REFRESH_SECRET), check type='refresh', lookup jti
v DB, pokud revoked → revokuj celou rodinu (security). Při validním
flow revokuje starý jti a vystaví nový pár se stejným familyId.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: AuthService.logout + logoutAll

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: Přidat testy `describe('logout')` a `describe('logoutAll')`**

Vlož před závěrečné `});` v `auth.service.spec.ts`:

```ts
  describe('logout', () => {
    it('revokuje familyId pro validní token', async () => {
      mockJwt.verify.mockReturnValue({ sub: '1', jti: 'j', familyId: 'fam-X', type: 'refresh' });
      await service.logout('valid-token');
      expect(mockRefreshRepo.revokeFamily).toHaveBeenCalledWith('fam-X');
    });

    it('je idempotent pro neplatný token (nevyhodí)', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.logout('bad-token')).resolves.toBeUndefined();
      expect(mockRefreshRepo.revokeFamily).not.toHaveBeenCalled();
    });

    it('je idempotent pro token bez type=refresh', async () => {
      mockJwt.verify.mockReturnValue({ sub: '1', jti: 'j' /* no type */ });
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
```

- [ ] **Step 2: Spustit testy — verify FAIL**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: FAIL — `logout` a `logoutAll` neexistují.

- [ ] **Step 3: Implementovat metody v `auth.service.ts`**

Přidat před `private sanitize`:

```ts
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? (() => { throw new Error('JWT_REFRESH_SECRET is not set'); })(),
      }) as { jti?: string; familyId?: string; type?: string };

      if (payload.type !== 'refresh' || !payload.familyId) {
        return; // idempotent — neplatný formát neprozradíme
      }
      await this.refreshRepo.revokeFamily(payload.familyId);
    } catch {
      // idempotent — invalid token nereportujeme
      return;
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshRepo.revokeAllForUser(userId);
  }
```

- [ ] **Step 4: Spustit testy — verify PASS**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: 17 testů PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts \
        backend/src/modules/auth/auth.service.spec.ts

git commit -m "$(cat <<'EOF'
feat(auth): logout (per-session) a logoutAll (per-user)

logout je idempotent — neplatný token vrátí void bez chyby. logoutAll
revokuje všechny tokeny userId napříč rodinami (volá se i z password
change handleru v dalším tasku).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: EventEmitter integrace — change password invaliduje tokeny

**Files:**
- Modify: `backend/src/modules/users/users.service.ts` — emit `user.password.changed`
- Modify: `backend/src/modules/users/users.service.spec.ts` — 2 nové testy
- Modify: `backend/src/modules/users/users.module.ts` — pokud netřeba EventEmitterModule, nic
- Modify: `backend/src/modules/auth/auth.service.ts` — `@OnEvent('user.password.changed')` listener
- Modify: `backend/src/modules/auth/auth.service.spec.ts` — 1 nový test

- [ ] **Step 1: Test pro emit v `users.service.spec.ts`**

Najít existující `users.service.spec.ts`. Aktualizovat mock setup, aby měl `EventEmitter2`:

```ts
import { EventEmitter2 } from '@nestjs/event-emitter';
// ... existující importy

const mockEvents = { emit: jest.fn() };
```

V `Test.createTestingModule({ providers: [...] })` přidat:
```ts
{ provide: EventEmitter2, useValue: mockEvents },
```

A přidat 2 nové testy:

```ts
  describe('changePassword', () => {
    it('emituje "user.password.changed" po úspěšné změně hesla', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.update.mockResolvedValue(mockUser);
      await service.changePassword('1', { oldPassword: 'old', newPassword: 'new' });
      expect(mockEvents.emit).toHaveBeenCalledWith('user.password.changed', { userId: '1' });
    });
  });

  describe('resetPassword', () => {
    it('emituje "user.password.changed" po Superadmin resetu', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue(mockUser);
      await service.resetPassword('1', { newPassword: 'new' });
      expect(mockEvents.emit).toHaveBeenCalledWith('user.password.changed', { userId: '1' });
    });
  });
```

(Existující test `mockUser`, `mockRepo` jsou v souboru — opětovně použít.)

- [ ] **Step 2: Spustit — verify FAIL**

Run: `cd backend && npx jest src/modules/users/users.service.spec.ts`
Expected: FAIL — `EventEmitter2` není injectován v `UsersService`.

- [ ] **Step 3: Aktualizovat `users.service.ts`**

Přidat import:
```ts
import { EventEmitter2 } from '@nestjs/event-emitter';
```

Přidat do constructoru:
```ts
constructor(
  @Inject('IUsersRepository') private readonly repo: IUsersRepository,
  private readonly eventEmitter: EventEmitter2,
) {}
```

Aktualizovat `changePassword` a `resetPassword`:

```ts
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Nesprávné heslo');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
    this.eventEmitter.emit('user.password.changed', { userId });
  }

  async resetPassword(userId: string, dto: ResetPasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
    this.eventEmitter.emit('user.password.changed', { userId });
  }
```

- [ ] **Step 4: Spustit users testy — verify PASS**

Run: `cd backend && npx jest src/modules/users/users.service.spec.ts`
Expected: PASS (existující + 2 nové).

- [ ] **Step 5: Test pro listener v `auth.service.spec.ts`**

Vlož před závěrečné `});`:

```ts
  describe('handlePasswordChanged (OnEvent listener)', () => {
    it('zruší všechny refresh tokeny userId', async () => {
      await service.handlePasswordChanged({ userId: 'user-77' });
      expect(mockRefreshRepo.revokeAllForUser).toHaveBeenCalledWith('user-77');
    });
  });
```

- [ ] **Step 6: Spustit — verify FAIL**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: FAIL — `handlePasswordChanged` neexistuje.

- [ ] **Step 7: Přidat listener v `auth.service.ts`**

Importy:
```ts
import { OnEvent } from '@nestjs/event-emitter';
```

Přidat metodu (např. před `private sanitize`):

```ts
  @OnEvent('user.password.changed')
  async handlePasswordChanged(payload: { userId: string }): Promise<void> {
    await this.refreshRepo.revokeAllForUser(payload.userId);
  }
```

- [ ] **Step 8: Spustit — verify PASS**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts src/modules/users/users.service.spec.ts`
Expected: PASS všech.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/users/users.service.ts \
        backend/src/modules/users/users.service.spec.ts \
        backend/src/modules/auth/auth.service.ts \
        backend/src/modules/auth/auth.service.spec.ts

git commit -m "$(cat <<'EOF'
feat(auth,users): EventEmitter integrace pro invalidaci po change password

UsersService.changePassword a resetPassword emitují user.password.changed.
AuthService má @OnEvent listener, který revokuje všechny refresh tokeny
daného uživatele. Vyhýbá se circular dependency mezi moduly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Auth controller — 3 nové endpointy

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`

- [ ] **Step 1: Aktualizovat controller**

Plná nová verze:

```ts
import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrace nového uživatele' })
  @ApiResponse({ status: 201, description: 'Uživatel vytvořen, vrací accessToken + refreshToken' })
  @ApiResponse({ status: 400, description: 'Validační chyba nebo username již existuje' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Přihlášení — vrátí accessToken + refreshToken' })
  @ApiResponse({ status: 200, description: 'Tokeny + user' })
  @ApiResponse({ status: 401, description: 'Nesprávné přihlašovací údaje' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotace refresh tokenu — vrátí nový pár tokenů' })
  @ApiResponse({ status: 200, description: 'Nový accessToken + refreshToken' })
  @ApiResponse({ status: 401, description: 'Token invalid, expired, nebo zneužit (rodina zrušena)' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Odhlášení dané relace (rodina tokenů). Idempotentní.' })
  @ApiResponse({ status: 204, description: 'OK (i pro neplatný token)' })
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Odhlášení všech relací uživatele (forced logout)' })
  @ApiResponse({ status: 204, description: 'OK' })
  @ApiResponse({ status: 401, description: 'Bez JWT' })
  async logoutAll(@CurrentUser() user: RequestUser): Promise<void> {
    await this.authService.logoutAll(user.id);
  }
}
```

- [ ] **Step 2: TypeScript build (modul ještě nebude wired, build dropne)**

Run: `cd backend && npx tsc --noEmit`
Expected: nemělo by failovat na controlleru. Pokud failovat na auth.module.ts kvůli chybějícímu providers, OK — řeší Task 8.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/auth/auth.controller.ts

git commit -m "$(cat <<'EOF'
feat(auth): controller s endpointy /refresh, /logout, /logout-all

Včetně Swagger anotací (status kódy + popis). /logout-all chrání
JwtAuthGuard. /logout je anon a idempotent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Auth module wiring

**Files:**
- Modify: `backend/src/modules/auth/auth.module.ts`

- [ ] **Step 1: Aktualizovat `auth.module.ts`**

Plná nová verze:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { RefreshTokenSchemaClass, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { MongoRefreshTokenRepository } from './repositories/refresh-token.repository';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? (() => { throw new Error('JWT_SECRET is not set'); })(),
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as `${number}${'s'|'m'|'h'|'d'|'w'|'y'}` },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: RefreshTokenSchemaClass.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: 'IRefreshTokenRepository', useClass: MongoRefreshTokenRepository },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
```

- [ ] **Step 2: TypeScript build**

Run: `cd backend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Plný test suite**

Run: `cd backend && npm test`
Expected: PASS všech.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/auth/auth.module.ts

git commit -m "$(cat <<'EOF'
feat(auth): module wiring — RefreshToken schema a repository provider

MongooseModule.forFeature registruje RefreshToken schema. IRefreshTokenRepository
provider mapuje na MongoRefreshTokenRepository (DI vzor zbytku projektu).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Env proměnné a final verifikace

**Files:**
- Modify: `backend/.env.example` (pokud existuje, jinak přeskočit)

- [ ] **Step 1: Najít `.env.example`**

Run: `ls backend/.env.example backend/.env.sample 2>&1 || ls backend/*.env.* 2>&1`

Pokud existuje, přidat na konec:
```
JWT_REFRESH_SECRET=change-me-to-32-chars-or-more-random
JWT_REFRESH_TTL_DAYS=30
```

Pokud `.env.example` neexistuje, přeskočit step.

- [ ] **Step 2: Final TypeScript build**

Run: `cd backend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Final test suite**

Run: `cd backend && npm test`
Expected: 51+ test suites, 470+ tests, všechny zelené (původně 451, plus ~17 v auth a ~2 v users a ~6 v refresh-token-repository).

- [ ] **Step 4: Grep — žádné stará volání `register` nebo `login` neočekávají starý return shape**

Run: `cd backend && git grep -n "\.register\|\.login" src/ | grep -v "spec\|interface\|module" | head -20`

Manuálně projít — pokud něco volá `service.register()` nebo `service.login()` a destructuruje jen `{ accessToken }`, je to potenciální problém. Pokud není nikde (kromě testů), OK.

- [ ] **Step 5: Commit env (pokud byl změněn)**

```bash
# pouze pokud .env.example změněn:
git add backend/.env.example

git commit -m "$(cat <<'EOF'
docs(env): JWT_REFRESH_SECRET + JWT_REFRESH_TTL_DAYS

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Roadmap docs update

**Files:**
- Modify: `docs/roadmap.md` — Krok 1 zaškrtnout `/auth/refresh`
- Modify: `docs/roadmap2.md` — Fáze 1.3 ✅

- [ ] **Step 1: `roadmap.md` Krok 1**

Najdi blok pod `## Krok 1 — Základ & Auth 🚧`. Aktuálně:

```markdown
## Krok 1 — Základ & Auth 🚧

> AUDIT (po fázi 1.1): `akj` claim ze starého systému se nepřidává — AKJ je v novém systému per-world (rozhodnutí 2026-05-05, viz spec AKJ cleanup). Zbývá pouze `POST /api/auth/refresh` (řešeno ve fázi 1.3 v roadmap2).

- [x] Auth modul: POST /api/auth/login (bcrypt verify → JWT)
- [ ] **POST /api/auth/refresh** — chybí
```

Změnit na:

```markdown
## Krok 1 — Základ & Auth ✅

> AUDIT (po fázi 1.1 + 1.3): `akj` claim ze starého systému se nepřidává — AKJ je per-world. `POST /auth/refresh` implementován s rotací + blacklist (familyId), navíc `POST /auth/logout` a `POST /auth/logout-all`.

- [x] Auth modul: POST /api/auth/login (bcrypt verify → JWT)
- [x] **POST /api/auth/refresh** — rotace + blacklist (familyId), reuse detection
- [x] **POST /api/auth/logout** — per-session, idempotent
- [x] **POST /api/auth/logout-all** — per-user, vyžaduje JWT
```

A v souhrnné tabulce na konci souboru:
```
| 1 | Základ & Auth | 🚧 | ...
```
změnit na:
```
| 1 | Základ & Auth | ✅ | refresh + logout + logout-all hotové |
```

- [ ] **Step 2: `roadmap2.md` Fáze 1.3**

Najít blok `### 1.3 \`POST /auth/refresh\` ⬜`. Nahradit za:

```markdown
### 1.3 Auth refresh tokens ✅
**Hotovo 2026-05-05.** `POST /auth/refresh` s rotací a detekcí reuse přes familyId, `POST /auth/logout` (per-session), `POST /auth/logout-all` (per-user). Login/register vrací oba tokeny. Změna hesla revokuje všechny refresh tokeny přes EventEmitter.

- [x] `RefreshToken` schema s TTL indexem (Mongo auto-cleanup)
- [x] Refresh token JWT s `JWT_REFRESH_SECRET`, TTL 30 dní
- [x] Rotace + reuse detection (familyId)
- [x] `/logout` idempotent, `/logout-all` vyžaduje JWT
- [x] EventEmitter `user.password.changed` invaliduje všechny tokeny userId
- [x] ~17 testů v auth.service + 2 v users.service + 6 v repository

Spec: [2026-05-05-auth-refresh-design.md](superpowers/specs/2026-05-05-auth-refresh-design.md)
Plán: [2026-05-05-auth-refresh.md](superpowers/plans/2026-05-05-auth-refresh.md)
```

A v tabulce „Pořadí prací" změnit:
```
| 2 | Fáze 1.3 — refresh + blacklist | kontrakt + UX | 1 den |
```
za:
```
| ✅ | Fáze 1.3 — Auth refresh tokens | hotovo (2026-05-05) | — |
```

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap.md docs/roadmap2.md

git commit -m "$(cat <<'EOF'
docs(roadmap): Fáze 1.3 hotová — auth refresh tokens

Krok 1 v roadmap.md povýšen na ✅ (refresh + logout + logout-all
implementovány). Fáze 1.3 v roadmap2 přepsána s checklistem hotových
součástí.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Hotovo když

- [ ] `POST /api/auth/refresh` funguje, rotuje, detekuje reuse (≥9 testů)
- [ ] `POST /api/auth/logout` funguje, idempotent (≥3 testy)
- [ ] `POST /api/auth/logout-all` funguje, vyžaduje JWT (≥1 test)
- [ ] `register` a `login` vrací `{ accessToken, refreshToken, user }` (4 testy)
- [ ] `changePassword` a `resetPassword` emitují `user.password.changed` (2 testy v users)
- [ ] `@OnEvent('user.password.changed')` zruší všechny refresh tokeny userId (1 test)
- [ ] `MongoRefreshTokenRepository` má 6 testů
- [ ] `npm test` zelený
- [ ] `npx tsc --noEmit` čistý
- [ ] roadmap.md Krok 1 ✅
- [ ] roadmap2.md Fáze 1.3 ✅
- [ ] 9–10 commitů (1 per task, řazené chronologicky)
