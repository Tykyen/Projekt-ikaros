# Krok 4 — Users rozšíření: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozšířit User model o AKJ flag, themeSettings, chatPreferences, přidat akj do JWT claims, automatický fire-and-forget update lastSeenAt v JwtAuthGuard a nové endpointy pro správu účtu (public profil, změna hesla, Superadmin reset hesla a smazání účtu).

**Architecture:** Rozšíření User interface + schema + toEntity o nová pole. JwtAuthGuard dostane injektovaný IUsersRepository (UsersModule je označen @Global — IUsersRepository je dostupné bez explicitního importu ve všech modulech). Deep-merge logika pro themeSettings/chatPreferences v service. Čtyři nové endpointy v controlleru, tři nové service metody. Guard odstraní isOnline z updateLastSeen — Presence modul (Krok 5) to řeší přes lastSeenAt threshold.

**Tech Stack:** NestJS 11, Mongoose 9, class-validator, bcrypt, @nestjs/passport AuthGuard, TypeScript 5

---

## Kontext projektu

```
backend/src/modules/users/
├── interfaces/user.interface.ts         ← Task 1: + akj, themeSettings, chatPreferences, PublicUser
├── schemas/user.schema.ts               ← Task 1: + @Prop akj, themeSettings, chatPreferences
├── users.repository.ts                  ← Task 1: toEntity + nová pole, updateLastSeen bez isOnline
├── users.service.ts                     ← Task 4: update merge, publicProfile, changePassword, resetPassword, delete
├── users.service.spec.ts                ← Tasks 1,4: rozšíření testů
├── users.controller.ts                  ← Task 5: nové endpointy, guard přesun na metody
├── users.module.ts                      ← Task 6: přidat @Global()
├── dto/update-user.dto.ts               ← Task 3: + themeSettings, chatPreferences, username
├── dto/change-password.dto.ts           ← Task 3: NOVÉ
└── dto/reset-password.dto.ts            ← Task 3: NOVÉ

backend/src/modules/auth/
└── auth.service.ts                      ← Task 2: + akj do JWT payload

backend/src/common/guards/
└── jwt-auth.guard.ts                    ← Task 6: inject IUsersRepository, fire-and-forget updateLastSeen
```

Testovací příkaz: `cd backend && npx jest --no-coverage`
TypeScript check: `cd backend && npx tsc --noEmit`

**Existující mockUser** (v users.service.spec.ts) chybí: `akj`, `themeSettings`, `chatPreferences` — doplníme v Task 1.

---

## Task 1: User interface + schema + repository

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts`
- Modify: `backend/src/modules/users/schemas/user.schema.ts`
- Modify: `backend/src/modules/users/users.repository.ts`
- Modify: `backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Přidej failing test do users.service.spec.ts**

Nahraď `mockUser` a přidej nový test na konec souboru (před závěrečnou `}`):

```typescript
// Nahraď existující mockUser (řádky 6–11):
const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'x', role: UserRole.Hrac,
  displayName: undefined, avatarUrl: undefined,
  characterPath: undefined, ikarosSkin: undefined,
  akj: false,
  themeSettings: {},
  chatPreferences: {},
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

// Přidej na konec describe bloku:
it('findById result should have akj and themeSettings fields', async () => {
  const userWithPrefs = { ...mockUser, akj: true, themeSettings: { theme: 'dark' } };
  mockRepo.findById.mockResolvedValue(userWithPrefs);
  const result = await service.findById('1');
  expect(result).toHaveProperty('akj', true);
  expect(result).toHaveProperty('themeSettings', { theme: 'dark' });
  expect(result).toHaveProperty('chatPreferences');
});
```

- [ ] **Step 2: Spusť test — ověř že selže**

```
cd backend && npx jest users.service.spec.ts --no-coverage 2>&1 | Select-Object -Last 15
```

Očekávaný výstup: `akj` nebo `themeSettings` není na výsledku (TS chyba nebo test fail).

- [ ] **Step 3: Uprav user.interface.ts**

Nahraď celý obsah `backend/src/modules/users/interfaces/user.interface.ts`:

```typescript
export enum UserRole {
  Superadmin = 1,
  Admin = 2,
  PJ = 3,
  Korektor = 4,
  Hrac = 5,
  Ctenar = 6,
  Zadatel = 7,
  Zakaz = 8,
  Ikarus = 9,
}

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  ikarosSkin?: string;
  akj: boolean;
  themeSettings: Record<string, unknown>;
  chatPreferences: Record<string, unknown>;
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
}
```

- [ ] **Step 4: Uprav user.schema.ts**

Nahraď celý obsah `backend/src/modules/users/schemas/user.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../interfaces/user.interface';

export type UserDocument = HydratedDocument<UserSchemaClass>;

@Schema({ timestamps: true, collection: 'users' })
export class UserSchemaClass {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: Number, enum: UserRole, default: UserRole.Hrac })
  role: UserRole;

  @Prop() displayName?: string;
  @Prop() avatarUrl?: string;
  @Prop() characterPath?: string;
  @Prop() ikarosSkin?: string;

  @Prop({ default: false }) akj: boolean;
  @Prop({ type: Object, default: {} }) themeSettings: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) chatPreferences: Record<string, unknown>;

  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: Date.now }) lastSeenAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserSchemaClass);
UserSchema.index({ role: 1 });
```

- [ ] **Step 5: Uprav toEntity a updateLastSeen v users.repository.ts**

Nahraď celý obsah `backend/src/modules/users/users.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../database/mongo/base-mongo.repository';
import { UserSchemaClass } from './schemas/user.schema';
import { User, UserRole } from './interfaces/user.interface';
import { IUsersRepository } from './interfaces/users-repository.interface';

@Injectable()
export class MongoUsersRepository
  extends BaseMongoRepository<User>
  implements IUsersRepository
{
  constructor(
    @InjectModel(UserSchemaClass.name)
    model: Model<UserSchemaClass>,
  ) {
    super(model as never);
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await this.model.findOne({ email: email.toLowerCase() }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const doc = await this.model.findOne({ username }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findFirstByRole(role: UserRole): Promise<User | null> {
    const doc = await this.model.findOne({ role }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(id, { lastSeenAt: new Date() })
      .exec();
  }

  protected toEntity(doc: Record<string, unknown>): User {
    return {
      id: String(doc._id),
      email: doc.email as string,
      username: doc.username as string,
      passwordHash: doc.passwordHash as string,
      role: doc.role as number,
      displayName: doc.displayName as string | undefined,
      avatarUrl: doc.avatarUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      ikarosSkin: doc.ikarosSkin as string | undefined,
      akj: (doc.akj as boolean) ?? false,
      themeSettings: (doc.themeSettings as Record<string, unknown>) ?? {},
      chatPreferences: (doc.chatPreferences as Record<string, unknown>) ?? {},
      isOnline: (doc.isOnline as boolean) ?? false,
      lastSeenAt: doc.lastSeenAt as Date,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 6: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest users.service.spec.ts --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 7: Commit**

```
git add backend/src/modules/users/interfaces/user.interface.ts
git add backend/src/modules/users/schemas/user.schema.ts
git add backend/src/modules/users/users.repository.ts
git add backend/src/modules/users/users.service.spec.ts
git commit -m "feat(users): add akj, themeSettings, chatPreferences to User schema and interface"
```

---

## Task 2: JWT akj claim

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Přidej failing test**

Zkontroluj jestli existuje `backend/src/modules/auth/auth.service.spec.ts`. Pokud ne, vytvoř ho:

```typescript
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'hash', role: UserRole.Hrac,
  displayName: undefined, avatarUrl: undefined,
  characterPath: 'elara', ikarosSkin: 'default',
  akj: true,
  themeSettings: {}, chatPreferences: {},
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  const mockRepo = {
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    save: jest.fn(),
    updateLastSeen: jest.fn(),
  };
  const mockJwt = { sign: jest.fn().mockReturnValue('token') };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'IUsersRepository', useValue: mockRepo },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('login token payload should include akj claim', async () => {
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(true as never);
    mockRepo.findByEmail.mockResolvedValue(mockUser);
    mockRepo.updateLastSeen.mockResolvedValue(undefined);

    await service.login({ email: 'a@a.com', password: 'pass' });

    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ akj: true }),
    );
  });

  it('register should throw ConflictException for duplicate email', async () => {
    mockRepo.findByEmail.mockResolvedValue(mockUser);
    await expect(
      service.register({ email: 'a@a.com', username: 'new', password: 'pass123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('login should throw UnauthorizedException for wrong password', async () => {
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(false as never);
    mockRepo.findByEmail.mockResolvedValue(mockUser);
    await expect(
      service.login({ email: 'a@a.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Spusť test — ověř že selže**

```
cd backend && npx jest auth.service.spec.ts --no-coverage 2>&1 | Select-Object -Last 10
```

Očekávaný výstup: test `akj claim` selže — `akj` není v payload.

- [ ] **Step 3: Uprav generateToken v auth.service.ts**

Najdi metodu `generateToken` v `backend/src/modules/auth/auth.service.ts` a nahraď ji:

```typescript
private generateToken(user: User): string {
  return this.jwtService.sign({
    sub: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    characterPath: user.characterPath ?? '',
    ikarosSkin: user.ikarosSkin ?? 'default',
    akj: user.akj ?? false,
  });
}
```

- [ ] **Step 4: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest auth.service.spec.ts --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 5: Commit**

```
git add backend/src/modules/auth/auth.service.ts
git add backend/src/modules/auth/auth.service.spec.ts
git commit -m "feat(auth): add akj claim to JWT payload"
```

---

## Task 3: DTOs

**Files:**
- Modify: `backend/src/modules/users/dto/update-user.dto.ts`
- Create: `backend/src/modules/users/dto/change-password.dto.ts`
- Create: `backend/src/modules/users/dto/reset-password.dto.ts`

- [ ] **Step 1: Nahraď update-user.dto.ts**

```typescript
import { IsString, IsOptional, MaxLength, IsUrl, Matches, IsObject } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(32) displayName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @Matches(/^[a-z0-9-]+\/[a-z0-9-]+$/) characterPath?: string;
  @IsOptional() @IsString() @MaxLength(64) ikarosSkin?: string;
  @IsOptional() @IsString() @MaxLength(32) username?: string;
  @IsOptional() @IsObject() themeSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() chatPreferences?: Record<string, unknown>;
}
```

- [ ] **Step 2: Vytvoř change-password.dto.ts**

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString() @MinLength(1) oldPassword: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}
```

- [ ] **Step 3: Vytvoř reset-password.dto.ts**

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString() @MinLength(8) @MaxLength(128) newPassword: string;
}
```

- [ ] **Step 4: Ověř TypeScript**

```
cd backend && npx tsc --noEmit
```

Očekávaný výstup: `0 errors`.

- [ ] **Step 5: Commit**

```
git add backend/src/modules/users/dto/update-user.dto.ts
git add backend/src/modules/users/dto/change-password.dto.ts
git add backend/src/modules/users/dto/reset-password.dto.ts
git commit -m "feat(users): extend UpdateUserDto, add ChangePasswordDto and ResetPasswordDto"
```

---

## Task 4: UsersService rozšíření

**Files:**
- Modify: `backend/src/modules/users/users.service.ts`
- Modify: `backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Přidej failing testy do users.service.spec.ts**

Nahraď celý obsah `backend/src/modules/users/users.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import {
  NotFoundException, ConflictException, ForbiddenException, UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole } from './interfaces/user.interface';

const mockUser = {
  id: '1', email: 'a@a.com', username: 'user',
  passwordHash: 'hashedpass', role: UserRole.Hrac,
  displayName: undefined, avatarUrl: undefined,
  characterPath: undefined, ikarosSkin: undefined,
  akj: false, themeSettings: { theme: 'light', fontSize: 14 }, chatPreferences: {},
  isOnline: false, lastSeenAt: new Date(),
  createdAt: new Date(), updatedAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;
  const mockRepo = {
    findById: jest.fn(),
    findByUsername: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: 'IUsersRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  // --- findById ---
  it('findById: throws NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
  });

  it('findById: returns user without passwordHash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    const result = await service.findById('1');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toHaveProperty('akj', false);
    expect(result).toHaveProperty('themeSettings');
  });

  // --- publicProfile ---
  it('publicProfile: throws NotFoundException for unknown user', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.publicProfile('unknown')).rejects.toThrow(NotFoundException);
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
    expect(result).not.toHaveProperty('akj');
  });

  // --- update merge logika ---
  it('update: deep-merges themeSettings (přidá nový klíč, zachová starý)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ ...mockUser, themeSettings: { theme: 'light', fontSize: 14, accentColor: 'red' } });
    const result = await service.update('1', { themeSettings: { accentColor: 'red' } });
    expect(mockRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
      themeSettings: { theme: 'light', fontSize: 14, accentColor: 'red' },
    }));
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('update: deep-merge přepíše existující klíč, zachová ostatní', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ ...mockUser, themeSettings: { theme: 'dark', fontSize: 14 } });
    await service.update('1', { themeSettings: { theme: 'dark' } });
    expect(mockRepo.update).toHaveBeenCalledWith('1', expect.objectContaining({
      themeSettings: { theme: 'dark', fontSize: 14 },
    }));
  });

  it('update: null themeSettings nezpůsobí přepsání (zachová stávající)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.update('1', { displayName: 'Elara' });
    const callArg = mockRepo.update.mock.calls[0][1];
    expect(callArg).not.toHaveProperty('themeSettings');
  });

  it('update: username conflict → ConflictException', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue({ ...mockUser, id: '999' });
    await expect(service.update('1', { username: 'taken' })).rejects.toThrow(ConflictException);
  });

  it('update: username change na vlastní username → OK (žádný conflict)', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    mockRepo.findByUsername.mockResolvedValue(mockUser); // vrátí sebe
    mockRepo.update.mockResolvedValue(mockUser);
    await expect(service.update('1', { username: 'user' })).resolves.not.toThrow();
  });

  // --- changePassword ---
  it('changePassword: správné staré heslo → uloží nový hash', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(true as never);
    jest.spyOn(bcrypt, 'hash' as never).mockResolvedValue('newhash' as never);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.changePassword('1', { oldPassword: 'old', newPassword: 'newpass123' });
    expect(mockRepo.update).toHaveBeenCalledWith('1', { passwordHash: 'newhash' });
  });

  it('changePassword: špatné staré heslo → UnauthorizedException', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'compare' as never).mockResolvedValue(false as never);
    await expect(
      service.changePassword('1', { oldPassword: 'wrong', newPassword: 'newpass123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('changePassword: neznámý user → NotFoundException', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      service.changePassword('x', { oldPassword: 'old', newPassword: 'newpass123' }),
    ).rejects.toThrow(NotFoundException);
  });

  // --- resetPassword ---
  it('resetPassword: uloží nový hash bez ověření starého hesla', async () => {
    mockRepo.findById.mockResolvedValue(mockUser);
    jest.spyOn(bcrypt, 'hash' as never).mockResolvedValue('resethash' as never);
    mockRepo.update.mockResolvedValue(mockUser);
    await service.resetPassword('1', { newPassword: 'newpass123' });
    expect(mockRepo.update).toHaveBeenCalledWith('1', { passwordHash: 'resethash' });
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
});
```

- [ ] **Step 2: Spusť testy — ověř že selžou**

```
cd backend && npx jest users.service.spec.ts --no-coverage 2>&1 | Select-Object -Last 15
```

Očekávaný výstup: většina testů selže — metody `publicProfile`, `changePassword`, `resetPassword`, `delete` neexistují.

- [ ] **Step 3: Nahraď celý users.service.ts**

```typescript
import {
  Injectable, Inject, NotFoundException, ConflictException, UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { IUsersRepository } from './interfaces/users-repository.interface';
import { User, PublicUser } from './interfaces/user.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

type SanitizedUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(
    @Inject('IUsersRepository') private readonly repo: IUsersRepository,
  ) {}

  async findById(id: string): Promise<SanitizedUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    return this.sanitize(user);
  }

  async publicProfile(id: string): Promise<PublicUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      characterPath: user.characterPath,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async update(id: string, dto: UpdateUserDto): Promise<SanitizedUser> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Uživatel nenalezen');

    if (dto.username !== undefined) {
      const taken = await this.repo.findByUsername(dto.username);
      if (taken && taken.id !== id) throw new ConflictException('Username je již obsazeno');
    }

    const updateData: Partial<User> = {};
    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) updateData.avatarUrl = dto.avatarUrl;
    if (dto.characterPath !== undefined) updateData.characterPath = dto.characterPath;
    if (dto.ikarosSkin !== undefined) updateData.ikarosSkin = dto.ikarosSkin;
    if (dto.username !== undefined) updateData.username = dto.username;
    if (dto.themeSettings != null) {
      updateData.themeSettings = { ...existing.themeSettings, ...dto.themeSettings };
    }
    if (dto.chatPreferences != null) {
      updateData.chatPreferences = { ...existing.chatPreferences, ...dto.chatPreferences };
    }

    const updated = await this.repo.update(id, updateData);
    if (!updated) throw new NotFoundException('Uživatel nenalezen');
    return this.sanitize(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Nesprávné heslo');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
  }

  async resetPassword(userId: string, dto: ResetPasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.repo.update(userId, { passwordHash });
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Uživatel nenalezen');
  }

  private sanitize(user: User): SanitizedUser {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }
}
```

- [ ] **Step 4: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest users.service.spec.ts --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 5: Commit**

```
git add backend/src/modules/users/users.service.ts
git add backend/src/modules/users/users.service.spec.ts
git commit -m "feat(users): add publicProfile, changePassword, resetPassword, delete; update merge logic"
```

---

## Task 5: UsersController nové endpointy

**Files:**
- Modify: `backend/src/modules/users/users.controller.ts`

- [ ] **Step 1: Nahraď celý users.controller.ts**

```typescript
import {
  Controller, Get, Patch, Put, Delete, Param, Body,
  UseGuards, ForbiddenException, HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from './interfaces/user.interface';

type Requester = { id: string; role: UserRole };

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: Requester) {
    return this.usersService.findById(user.id);
  }

  @Get('profile/:id')
  publicProfile(@Param('id') id: string) {
    return this.usersService.publicProfile(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    if (dto.username !== undefined && requester.role !== UserRole.Superadmin) {
      throw new ForbiddenException('Změnu username může provést jen Superadmin');
    }
    return this.usersService.update(id, dto);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() requester: Requester,
  ) {
    return this.usersService.changePassword(requester.id, dto);
  }

  @Put(':id/reset-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  resetPassword(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
    @Body() dto: ResetPasswordDto,
  ) {
    if (requester.role !== UserRole.Superadmin) {
      throw new ForbiddenException('Reset hesla může provést jen Superadmin');
    }
    return this.usersService.resetPassword(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  delete(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.usersService.delete(id);
  }
}
```

- [ ] **Step 2: Ověř TypeScript a všechny testy**

```
cd backend && npx tsc --noEmit && npx jest --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 3: Commit**

```
git add backend/src/modules/users/users.controller.ts
git commit -m "feat(users): add publicProfile, changePassword, resetPassword, delete endpoints"
```

---

## Task 6: JwtAuthGuard — lastSeenAt fire-and-forget

**Files:**
- Modify: `backend/src/modules/users/users.module.ts`
- Modify: `backend/src/common/guards/jwt-auth.guard.ts`

- [ ] **Step 1: Napiš failing test pro guard**

Vytvoř soubor `backend/src/common/guards/jwt-auth.guard.spec.ts`:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockUpdateLastSeen = jest.fn().mockResolvedValue(undefined);
const mockRepo = { updateLastSeen: mockUpdateLastSeen };

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard(mockRepo as never);
    jest.clearAllMocks();
  });

  it('calls updateLastSeen with userId after successful JWT validation', async () => {
    // spy přes prototypový řetěz — zasáhne skutečný super.canActivate
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
    const ctx = makeContext({ sub: 'user123' });

    await guard.canActivate(ctx);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockUpdateLastSeen).toHaveBeenCalledWith('user123');
  });

  it('does NOT call updateLastSeen when JWT validation fails', async () => {
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockRejectedValue(new Error('Unauthorized'));
    const ctx = makeContext(null);

    await expect(guard.canActivate(ctx)).rejects.toThrow('Unauthorized');
    await new Promise(resolve => setImmediate(resolve));

    expect(mockUpdateLastSeen).not.toHaveBeenCalled();
  });

  it('error in updateLastSeen does not break the response', async () => {
    jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate').mockResolvedValue(true);
    mockUpdateLastSeen.mockRejectedValueOnce(new Error('DB down'));
    const ctx = makeContext({ sub: 'user123' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    await new Promise(resolve => setImmediate(resolve));
  });
});
```

- [ ] **Step 2: Spusť test — ověř že selže**

```
cd backend && npx jest jwt-auth.guard.spec.ts --no-coverage 2>&1 | Select-Object -Last 10
```

Očekávaný výstup: `Cannot find module` nebo konstruktor selže — IUsersRepository není v guardu.

- [ ] **Step 3: Přidej @Global() do UsersModule**

Nahraď celý obsah `backend/src/modules/users/users.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import { MongoUsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: UserSchemaClass.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: 'IUsersRepository', useClass: MongoUsersRepository },
  ],
  exports: ['IUsersRepository', UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Nahraď jwt-auth.guard.ts**

```typescript
import { Injectable, Inject, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { IUsersRepository } from '../../modules/users/interfaces/users-repository.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    if (result) {
      const request = context.switchToHttp().getRequest<{ user?: { sub?: string } }>();
      const userId = request.user?.sub;
      if (userId) {
        void this.usersRepo.updateLastSeen(userId).catch((err: Error) => {
          this.logger.warn(`updateLastSeen failed for ${userId}: ${err.message}`);
        });
      }
    }
    return result;
  }
}
```

- [ ] **Step 5: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 6: Commit**

```
git add backend/src/modules/users/users.module.ts
git add backend/src/common/guards/jwt-auth.guard.ts
git add backend/src/common/guards/jwt-auth.guard.spec.ts
git commit -m "feat(users): @Global UsersModule, JwtAuthGuard injects IUsersRepository for lastSeenAt fire-and-forget"
```

---

## Self-review checklist (proveď před PR)

```
cd backend && npx tsc --noEmit && npx jest --no-coverage
```

Ověř:
- [ ] `User` interface má: `akj`, `themeSettings`, `chatPreferences`, `PublicUser` export
- [ ] JWT payload v `auth.service.ts` obsahuje `akj`
- [ ] `updateLastSeen` v repository **nenastavuje** `isOnline`
- [ ] PATCH s `themeSettings: { a: 1 }` na user s `themeSettings: { b: 2 }` → výsledek `{ a: 1, b: 2 }`
- [ ] `GET /api/users/profile/:id` funguje bez JWT tokenu
- [ ] `PUT /api/users/:id/reset-password` non-Superadminem → 403
- [ ] `PATCH /api/users/:id` s `username` non-Superadminem → 403
- [ ] `JwtAuthGuard` úspěšně kompiluje a testy guardu jsou zelené
