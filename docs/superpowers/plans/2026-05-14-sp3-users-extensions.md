# SP3 — UsersService Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat 3 chybějící UsersService metody (`listPublic`, `publicProfileV14`, `requestEmailChange`) podle existujícího `users.service.spec.ts` kontraktu + podpůrnou infrastrukturu (User entity `hiddenPresence`, `findPublicPaginated` repo metoda, `UsernameChangeRequest` stub module, DI extension, 3 nové controller routes).

**Architecture:** UsersService dostává 4 nové DI deps (Mailer, SecurityTokens, IWorldMembershipRepository via forwardRef, IUsernameChangeRequestsRepository). `findPublicPaginated` jde do existující UsersRepo. UsernameChangeRequest má samostatné Mongoose schema + repo + provider — flow využije SP4. Controller přidává 3 routes.

**Tech Stack:** NestJS, Mongoose, bcrypt, class-validator, Jest

**Spec:** [2026-05-14-sp3-users-extensions-design](../specs/2026-05-14-sp3-users-extensions-design.md)

---

## File Structure

**Modify:**
- `backend/src/modules/users/interfaces/user.interface.ts` — `hiddenPresence`, `PublicUserListItem`, `PublicUserProfile`
- `backend/src/modules/users/schemas/user.schema.ts` — `hiddenPresence` @Prop
- `backend/src/modules/users/interfaces/users-repository.interface.ts` — `FindPublicPaginatedOpts` + `findPublicPaginated`
- `backend/src/modules/users/users.repository.ts` — Mongo impl
- `backend/src/modules/users/users.repository.spec.ts` — 5 nových cases
- `backend/src/modules/users/users.module.ts` — register UsernameChangeRequest schema/repo + forwardRef WorldsModule
- `backend/src/modules/users/users.service.ts` — DI ext + 3 metody + EMAIL_CHANGE_TTL_MS
- `backend/src/modules/users/users.controller.ts` — 3 nové routes
- `backend/tsconfig.json` — odebrat `users.service.spec.ts` z exclude
- `backend/eslint.config.mjs` + `jest.config.ts` — synchronizovat
- `docs/dluhy.md` — odškrtnout SP3

**Create:**
- `backend/src/modules/users/interfaces/username-change-request.interface.ts`
- `backend/src/modules/users/interfaces/username-change-requests-repository.interface.ts`
- `backend/src/modules/users/schemas/username-change-request.schema.ts`
- `backend/src/modules/users/repositories/username-change-requests.repository.ts`
- `backend/src/modules/users/dto/request-email-change.dto.ts`

---

## Task 1: User entity — hiddenPresence + PublicUser types

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts`
- Modify: `backend/src/modules/users/schemas/user.schema.ts`

- [ ] **Step 1: Rozšířit User interface o hiddenPresence + přidat PublicUserListItem/PublicUserProfile**

V `user.interface.ts` přidat za SP2 rozšíření (před `}`):

```typescript
  // SP3 / D-052 (2026-05-14):
  hiddenPresence?: boolean;
```

Za `PublicUser` interface přidat (na konec souboru):

```typescript
export interface PublicUserListItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
  defaultAvatarType?: string;
  worldsCount: number;
  deleted?: boolean;
  pendingDeletion?: boolean;
}

export interface PublicUserProfile extends PublicUserListItem {
  lastSeenAt: string | null;
}
```

- [ ] **Step 2: Schema @Prop pro hiddenPresence**

V `user.schema.ts`, za `deletionPromotions?: DeletionPromotion[];` přidat:

```typescript

  // SP3 / D-052 (2026-05-14):
  @Prop({ default: false }) hiddenPresence?: boolean;
```

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 2: IUsersRepository.findPublicPaginated — interface

**Files:**
- Modify: `backend/src/modules/users/interfaces/users-repository.interface.ts`

- [ ] **Step 1: Přidat FindPublicPaginatedOpts + metodu**

Přepsat soubor:

```typescript
import { User, UserRole } from './user.interface';

export interface FindPublicPaginatedOpts {
  q?: string;
  sort?: 'new' | 'recent' | 'username';
  page: number;
  limit: number;
  includeDeleted: boolean;
}

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findFirstByRole(role: UserRole): Promise<User | null>;
  findByRoles(roles: UserRole[]): Promise<User[]>;
  findOnlineSince(since: Date): Promise<string[]>;
  findAllPaginated(opts: {
    username?: string;
    role?: UserRole;
    page: number;
    limit: number;
  }): Promise<{ items: User[]; total: number }>;
  findPublicPaginated(
    opts: FindPublicPaginatedOpts,
  ): Promise<{ items: User[]; total: number }>;
  save(user: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateLastSeen(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
  findUsernameCaseConflicts(): Promise<
    Array<{ lower: string; usernames: string[] }>
  >;
  backfillUsernameLower(): Promise<{ updated: number }>;
}
```

- [ ] **Step 2: Verify typecheck (zatím broken — chybí impl)**

Run: `cd backend && npm run typecheck 2>&1 | grep -E "users\.repository\.ts|Property 'findPublicPaginated'" | head -3`
Expected: error že `MongoUsersRepository` neimplementuje `findPublicPaginated`. To opravíme v Task 3.

---

## Task 3: IUsersRepository.findPublicPaginated — Mongo impl + test

**Files:**
- Modify: `backend/src/modules/users/users.repository.ts`
- Modify: `backend/src/modules/users/users.repository.spec.ts`

- [ ] **Step 1: Přidat import FindPublicPaginatedOpts**

V `users.repository.ts` rozšířit import:

```typescript
import type {
  IUsersRepository,
  FindPublicPaginatedOpts,
} from './interfaces/users-repository.interface';
```

- [ ] **Step 2: Implementovat metodu**

V `users.repository.ts` před `private toEntity` přidat (uvnitř MongoUsersRepository class):

```typescript

  async findPublicPaginated(
    opts: FindPublicPaginatedOpts,
  ): Promise<{ items: User[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (!opts.includeDeleted) {
      filter.isDeleted = { $ne: true };
      filter.deletionRequestedAt = { $exists: false };
    }
    if (opts.q) {
      filter.$or = [
        { username: { $regex: opts.q, $options: 'i' } },
        { displayName: { $regex: opts.q, $options: 'i' } },
      ];
    }

    const sort: Record<string, 1 | -1> = (() => {
      switch (opts.sort) {
        case 'recent':
          return { lastSeenAt: -1 };
        case 'username':
          return { usernameLower: 1 };
        case 'new':
        default:
          return { createdAt: -1 };
      }
    })();

    const skip = (opts.page - 1) * opts.limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(opts.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }
```

- [ ] **Step 3: Přidat testy do users.repository.spec.ts**

Nejdřív načti existující soubor (Read), pak rozšiř `mockModel` o nové metody pokud chybí a přidej describe blok:

```typescript
  describe('findPublicPaginated', () => {
    const setupMockChain = (docs: unknown[], total: number) => {
      mockModel.find.mockReturnValue({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              lean: () => ({ exec: jest.fn().mockResolvedValue(docs) }),
            }),
          }),
        }),
      });
      mockModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(total),
      });
    };

    it('includeDeleted=false → filter isDeleted+deletionRequestedAt', async () => {
      setupMockChain([], 0);
      await repo.findPublicPaginated({
        page: 1,
        limit: 24,
        includeDeleted: false,
      });
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: { $ne: true },
          deletionRequestedAt: { $exists: false },
        }),
      );
    });

    it('includeDeleted=true → žádný delete filter', async () => {
      setupMockChain([], 0);
      await repo.findPublicPaginated({
        page: 1,
        limit: 24,
        includeDeleted: true,
      });
      const call = mockModel.find.mock.calls[0][0] as Record<string, unknown>;
      expect(call.isDeleted).toBeUndefined();
      expect(call.deletionRequestedAt).toBeUndefined();
    });

    it('q="alice" → $or regex obě pole', async () => {
      setupMockChain([], 0);
      await repo.findPublicPaginated({
        q: 'alice',
        page: 1,
        limit: 24,
        includeDeleted: false,
      });
      const call = mockModel.find.mock.calls[0][0] as Record<string, unknown>;
      expect(call.$or).toEqual([
        { username: { $regex: 'alice', $options: 'i' } },
        { displayName: { $regex: 'alice', $options: 'i' } },
      ]);
    });

    it('sort "new" → createdAt -1', async () => {
      let capturedSort: unknown = null;
      mockModel.find.mockReturnValue({
        sort: (s: unknown) => {
          capturedSort = s;
          return {
            skip: () => ({
              limit: () => ({
                lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
              }),
            }),
          };
        },
      });
      mockModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      await repo.findPublicPaginated({
        sort: 'new',
        page: 1,
        limit: 24,
        includeDeleted: false,
      });
      expect(capturedSort).toEqual({ createdAt: -1 });
    });

    it('sort "username" → usernameLower 1', async () => {
      let capturedSort: unknown = null;
      mockModel.find.mockReturnValue({
        sort: (s: unknown) => {
          capturedSort = s;
          return {
            skip: () => ({
              limit: () => ({
                lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
              }),
            }),
          };
        },
      });
      mockModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      await repo.findPublicPaginated({
        sort: 'username',
        page: 1,
        limit: 24,
        includeDeleted: false,
      });
      expect(capturedSort).toEqual({ usernameLower: 1 });
    });
  });
```

⚠️ Pokud existující `mockModel` nemá `find`/`countDocuments`, přidat je. Inspektovat soubor a doplnit.

- [ ] **Step 4: Run testy**

Run: `cd backend && npx jest users.repository --no-coverage`
Expected: testy projdou (existující + 5 nových).

- [ ] **Step 5: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 4: UsernameChangeRequest — interface + repo interface

**Files:**
- Create: `backend/src/modules/users/interfaces/username-change-request.interface.ts`
- Create: `backend/src/modules/users/interfaces/username-change-requests-repository.interface.ts`

- [ ] **Step 1: username-change-request.interface.ts**

```typescript
export type UsernameChangeStatus = 'pending' | 'approved' | 'rejected';

export interface UsernameChangeRequest {
  id: string;
  userId: string;
  currentUsername: string;
  requestedUsername: string;
  status: UsernameChangeStatus;
  decidedByUserId?: string;
  decidedAt?: Date;
  decisionNote?: string;
  createdAt: Date;
}
```

- [ ] **Step 2: username-change-requests-repository.interface.ts**

```typescript
import type {
  UsernameChangeRequest,
  UsernameChangeStatus,
} from './username-change-request.interface';

export interface IUsernameChangeRequestsRepository {
  create(input: {
    userId: string;
    currentUsername: string;
    requestedUsername: string;
  }): Promise<UsernameChangeRequest>;

  findById(id: string): Promise<UsernameChangeRequest | null>;

  findPendingByUserId(userId: string): Promise<UsernameChangeRequest | null>;

  listPaginated(opts: {
    status?: UsernameChangeStatus;
    page: number;
    limit: number;
  }): Promise<{ items: UsernameChangeRequest[]; total: number }>;

  update(
    id: string,
    data: Partial<UsernameChangeRequest>,
  ): Promise<UsernameChangeRequest | null>;

  deletePending(userId: string): Promise<void>;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 5: UsernameChangeRequest — schema

**Files:**
- Create: `backend/src/modules/users/schemas/username-change-request.schema.ts`

- [ ] **Step 1: Vytvořit schema**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { UsernameChangeStatus } from '../interfaces/username-change-request.interface';

export type UsernameChangeRequestDocument =
  HydratedDocument<UsernameChangeRequestSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'username_change_requests',
})
export class UsernameChangeRequestSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) currentUsername: string;
  @Prop({ required: true }) requestedUsername: string;
  @Prop({ required: true, type: String, default: 'pending' })
  status: UsernameChangeStatus;
  @Prop() decidedByUserId?: string;
  @Prop({ type: Date }) decidedAt?: Date;
  @Prop() decisionNote?: string;
}

export const UsernameChangeRequestSchema = SchemaFactory.createForClass(
  UsernameChangeRequestSchemaClass,
);
UsernameChangeRequestSchema.index(
  { userId: 1, status: 1 },
  { partialFilterExpression: { status: 'pending' } },
);
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 6: UsernameChangeRequest — Mongo repository

**Files:**
- Create: `backend/src/modules/users/repositories/username-change-requests.repository.ts`

- [ ] **Step 1: Vytvořit impl**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsernameChangeRequestSchemaClass } from '../schemas/username-change-request.schema';
import type {
  UsernameChangeRequest,
  UsernameChangeStatus,
} from '../interfaces/username-change-request.interface';
import type { IUsernameChangeRequestsRepository } from '../interfaces/username-change-requests-repository.interface';

@Injectable()
export class MongoUsernameChangeRequestsRepository
  implements IUsernameChangeRequestsRepository
{
  constructor(
    @InjectModel(UsernameChangeRequestSchemaClass.name)
    private readonly model: Model<UsernameChangeRequestSchemaClass>,
  ) {}

  async create(input: {
    userId: string;
    currentUsername: string;
    requestedUsername: string;
  }): Promise<UsernameChangeRequest> {
    const doc = await this.model.create({ ...input, status: 'pending' });
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<UsernameChangeRequest | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findPendingByUserId(
    userId: string,
  ): Promise<UsernameChangeRequest | null> {
    const doc = await this.model
      .findOne({ userId, status: 'pending' })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async listPaginated(opts: {
    status?: UsernameChangeStatus;
    page: number;
    limit: number;
  }): Promise<{ items: UsernameChangeRequest[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
    const skip = (opts.page - 1) * opts.limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(opts.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  async update(
    id: string,
    data: Partial<UsernameChangeRequest>,
  ): Promise<UsernameChangeRequest | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deletePending(userId: string): Promise<void> {
    await this.model.deleteMany({ userId, status: 'pending' }).exec();
  }

  private toEntity(doc: Record<string, unknown>): UsernameChangeRequest {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      currentUsername: doc.currentUsername as string,
      requestedUsername: doc.requestedUsername as string,
      status: doc.status as UsernameChangeStatus,
      decidedByUserId: doc.decidedByUserId as string | undefined,
      decidedAt: doc.decidedAt as Date | undefined,
      decisionNote: doc.decisionNote as string | undefined,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 7: UsersModule — registrovat UsernameChangeRequest + forwardRef WorldsModule

**Files:**
- Modify: `backend/src/modules/users/users.module.ts`

- [ ] **Step 1: Přepsat users.module.ts**

```typescript
import { Global, Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchemaClass, UserSchema } from './schemas/user.schema';
import {
  UsernameChangeRequestSchemaClass,
  UsernameChangeRequestSchema,
} from './schemas/username-change-request.schema';
import { MongoUsersRepository } from './users.repository';
import { MongoUsernameChangeRequestsRepository } from './repositories/username-change-requests.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserBanCacheService } from './services/user-ban-cache.service';
import { WorldsModule } from '../worlds/worlds.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserSchemaClass.name, schema: UserSchema },
      {
        name: UsernameChangeRequestSchemaClass.name,
        schema: UsernameChangeRequestSchema,
      },
    ]),
    // WorldsModule poskytuje IWorldMembershipRepository, který UsersService potřebuje.
    // forwardRef kvůli vzájemné cirkularitě (WorldsModule importuje UsersModule taky forwardRef).
    forwardRef(() => WorldsModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserBanCacheService,
    { provide: 'IUsersRepository', useClass: MongoUsersRepository },
    {
      provide: 'IUsernameChangeRequestsRepository',
      useClass: MongoUsernameChangeRequestsRepository,
    },
  ],
  exports: [
    'IUsersRepository',
    'IUsernameChangeRequestsRepository',
    UsersService,
    UserBanCacheService,
  ],
})
export class UsersModule {}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

⚠️ **Pokud DI circular dependency runtime error vyskočí při testech**, použít WorldsModule jako @Global() alternativu — ale to je SP4+ refactor. SP3 se forwardRef obvykle vyřeší.

---

## Task 8: RequestEmailChangeDto

**Files:**
- Create: `backend/src/modules/users/dto/request-email-change.dto.ts`

- [ ] **Step 1: Vytvořit DTO**

```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestEmailChangeDto {
  @ApiProperty({ description: 'Nový e-mail uživatele' })
  @IsEmail()
  @MaxLength(255)
  newEmail: string;

  @ApiProperty({ description: 'Aktuální heslo pro ověření' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 9: UsersService — DI extension + EMAIL_CHANGE_TTL_MS

**Files:**
- Modify: `backend/src/modules/users/users.service.ts`

- [ ] **Step 1: Rozšířit importy**

V `users.service.ts` přidat:

```typescript
import { MailerService } from '../mailer/mailer.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IUsernameChangeRequestsRepository } from './interfaces/username-change-requests-repository.interface';
import {
  PublicUserListItem,
  PublicUserProfile,
  UserRole,
} from './interfaces/user.interface';
```

⚠️ `UserRole` možná už importovaný — sjednotit do jednoho importu z `./interfaces/user.interface`.

- [ ] **Step 2: Přidat EMAIL_CHANGE_TTL_MS + rozšířit konstruktor**

V class `UsersService`:

```typescript
@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  static readonly EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // 1 hodina

  constructor(
    @Inject('IUsersRepository') private readonly repo: IUsersRepository,
    private readonly eventEmitter: EventEmitter2,
    // SP3:
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IUsernameChangeRequestsRepository')
    private readonly usernameRequestsRepo: IUsernameChangeRequestsRepository,
    private readonly mailer: MailerService,
    private readonly securityTokens: SecurityTokensService,
  ) {}
```

⚠️ `usernameRequestsRepo` se nyní v SP3 metodách nepoužívá, ale spec ho v DI očekává — `mockUsernameRequestsRepo` v test setupu. SP4 ho bude volat.

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 10: UsersService.listPublic

**Files:**
- Modify: `backend/src/modules/users/users.service.ts`

- [ ] **Step 1: Přidat metodu**

Před `private` metody (na konci class) přidat:

```typescript

  // ── SP3 — Spec 1.4 ─────────────────────────────────────────────────

  async listPublic(
    query: {
      q?: string;
      sort?: 'new' | 'recent' | 'username';
      page?: number;
      limit?: number;
      includeDeleted?: boolean;
    },
    requesterRole: UserRole,
  ): Promise<{
    items: PublicUserListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const isAdmin =
      requesterRole === UserRole.Admin ||
      requesterRole === UserRole.Superadmin;
    const includeDeleted = isAdmin && !!query.includeDeleted;
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const sort = query.sort ?? 'new';

    const { items, total } = await this.repo.findPublicPaginated({
      q: query.q,
      sort,
      page,
      limit,
      includeDeleted,
    });

    const userIds = items.map((u) => u.id);
    const counts = await this.membershipRepo.countsByUserIds(userIds);

    return {
      items: items.map((u) =>
        this.toPublicListItem(u, counts.get(u.id) ?? 0, isAdmin),
      ),
      total,
      page,
      limit,
    };
  }

  private toPublicListItem(
    user: User,
    worldsCount: number,
    isAdmin: boolean,
  ): PublicUserListItem {
    const item: PublicUserListItem = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      characterPath: user.characterPath,
      role: user.role,
      createdAt: user.createdAt,
      defaultAvatarType: user.defaultAvatarType,
      worldsCount,
    };
    if (isAdmin) {
      if (user.isDeleted) item.deleted = true;
      if (user.deletionRequestedAt) item.pendingDeletion = true;
    }
    return item;
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 11: UsersService.publicProfileV14

**Files:**
- Modify: `backend/src/modules/users/users.service.ts`

- [ ] **Step 1: Přidat metodu**

Za `toPublicListItem` přidat:

```typescript

  async publicProfileV14(
    userId: string,
    requesterRole: UserRole,
  ): Promise<PublicUserProfile> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User nenalezen');

    const isAdmin =
      requesterRole === UserRole.Admin ||
      requesterRole === UserRole.Superadmin;
    const isTombstone = !!user.isDeleted;
    const isPending = !!user.deletionRequestedAt;

    if ((isTombstone || isPending) && !isAdmin) {
      throw new NotFoundException('User nenalezen');
    }

    const worldsCount = await this.membershipRepo.countByUserId(userId);

    // lastSeenAt: null pro hiddenPresence (D-052) NEBO tombstone (admin výjimka).
    let lastSeenAt: string | null;
    if (isTombstone || user.hiddenPresence) {
      lastSeenAt = null;
    } else {
      lastSeenAt = user.lastSeenAt ? user.lastSeenAt.toISOString() : null;
    }

    const profile: PublicUserProfile = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      characterPath: user.characterPath,
      role: user.role,
      createdAt: user.createdAt,
      defaultAvatarType: user.defaultAvatarType,
      worldsCount,
      lastSeenAt,
    };

    if (isAdmin) {
      if (isTombstone) profile.deleted = true;
      if (isPending) profile.pendingDeletion = true;
    }

    return profile;
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 12: UsersService.requestEmailChange + maskEmail

**Files:**
- Modify: `backend/src/modules/users/users.service.ts`

- [ ] **Step 1: Přidat metodu**

Za `publicProfileV14`:

```typescript

  // ── SP3 — Spec 1.7 ─────────────────────────────────────────────────

  async requestEmailChange(
    userId: string,
    dto: { newEmail: string; currentPassword: string },
  ): Promise<{ ok: true; sentTo: string }> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'User nenalezen',
        code: 'USER_NOT_FOUND',
      });
    }

    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Špatné aktuální heslo',
        code: 'INVALID_PASSWORD',
      });
    }

    const newEmailNormalized = dto.newEmail.toLowerCase().trim();
    if (newEmailNormalized === user.email.toLowerCase()) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Nový email je stejný jako aktuální',
        code: 'SAME_EMAIL',
      });
    }

    const existing = await this.repo.findByEmail(newEmailNormalized);
    if (existing && existing.id !== userId) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Email už používá jiný uživatel',
        code: 'EMAIL_TAKEN',
      });
    }

    const token = await this.securityTokens.issue(
      userId,
      'email_change',
      UsersService.EMAIL_CHANGE_TTL_MS,
      { newEmail: newEmailNormalized },
    );

    try {
      await this.mailer.sendEmailChangeConfirm({
        to: newEmailNormalized,
        username: user.username,
        token,
      });
    } catch (err) {
      this.logger.warn(
        `requestEmailChange confirm mailer fail for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      await this.mailer.sendEmailChangeNotice({
        to: user.email,
        username: user.username,
        oldEmail: user.email,
        newEmail: newEmailNormalized,
      });
    } catch (err) {
      this.logger.warn(
        `requestEmailChange notice mailer fail for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { ok: true, sentTo: this.maskEmail(newEmailNormalized) };
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal =
      local.length > 2 ? `${local[0]}***${local.slice(-1)}` : '***';
    return `${maskedLocal}@${domain}`;
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 13: UsersController — 3 nové routes

**Files:**
- Modify: `backend/src/modules/users/users.controller.ts`

- [ ] **Step 1: Přidat importy + DTO**

Najít existující import sekci a přidat:

```typescript
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { Throttle } from '@nestjs/throttler';
```

⚠️ Pokud `Throttle` už importovaný, sjednotit. Pokud existující kontroler nemá `@nestjs/throttler` v dependencies pro tento soubor, zachovat existující stav (nebo dovést jak je v auth.controller.ts).

- [ ] **Step 2: Přidat 3 routes**

Před `}` třídy:

```typescript

  // ── SP3 — Spec 1.4 + 1.7 ──────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Paginated public user list (spec 1.4)' })
  listPublic(
    @CurrentUser() requester: Requester,
    @Query('q') q?: string,
    @Query('sort') sort?: 'new' | 'recent' | 'username',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.usersService.listPublic(
      {
        q,
        sort,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        includeDeleted: includeDeleted === 'true',
      },
      requester.role,
    );
  }

  @Get('profile/v14/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'PublicUserProfile (spec 1.4 v14 shape)' })
  publicProfileV14(
    @Param('id') id: string,
    @CurrentUser() requester: Requester,
  ) {
    return this.usersService.publicProfileV14(id, requester.role);
  }

  @Post('me/request-email-change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Žádost o změnu emailu — vystaví token + 2 maily',
  })
  requestEmailChange(
    @CurrentUser() requester: Requester,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.usersService.requestEmailChange(requester.id, dto);
  }
```

⚠️ **Pozor na route order:** `@Get()` (listPublic) musí být před `@Get('profile/:id')` (publicProfile, existing) a `@Get('profile/v14/:id')` před `@Get(':id')` (findOne, existing) aby Nest router správně rozpoznal cesty. Pokud existující kontroler má `@Get(':id')` před statickými segmenty, přesunout.

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 14: Odebrat users.service.spec.ts z exclude + run

**Files:**
- Modify: `backend/tsconfig.json`
- Modify: `backend/eslint.config.mjs`
- Modify: `backend/jest.config.ts`

- [ ] **Step 1: Odebrat z tsconfig.json**

Odebrat řádek `"src/modules/users/users.service.spec.ts",` z exclude.

- [ ] **Step 2: Odebrat z eslint.config.mjs**

Odebrat řádek `'src/modules/users/users.service.spec.ts',` z ignores.

- [ ] **Step 3: Odebrat z jest.config.ts**

Odebrat řádek `'<rootDir>/src/modules/users/users.service.spec.ts',` z testPathIgnorePatterns.

- [ ] **Step 4: Spustit users.service.spec.ts**

Run: `cd backend && npx jest users.service.spec --no-coverage 2>&1 | tail -20`
Expected: ~50 testů projde (incl. 12 SP3 1.4/1.7 testů).

⚠️ **Pokud testy failují kvůli mock signature mismatch**, opravit per failing test:
- `mockUsernameRequestsRepo` — pokud spec očekává metodu, kterou my zatím nevoláme, mock je tam jen pro DI. OK.
- `mockMembershipRepo.countsByUserIds` musí vrátit `Map`, ne plain object. Spec setup to už dělá správně.
- `mockSecurityTokens.issue` vrací plain token string. Spec mock to dělá.

- [ ] **Step 5: Verify typecheck + lint**

Run: `cd backend && npm run typecheck && npm run lint:check`
Expected: oba exit 0.

⚠️ **Pokud lint zhltne CRLF errory v users files**, run `cd backend && npx eslint "src/**/*.ts" --fix`.

---

## Task 15: Full test suite + dluhy + commit + push

**Files:**
- Modify: `docs/dluhy.md`

- [ ] **Step 1: Full test suite**

Run: `cd backend && npm test -- --no-coverage 2>&1 | tail -8`
Expected: passes ≥ SP2 stav (852+) + ~50 z users.service. 12 D-053 pre-existing fails zůstávají.

- [ ] **Step 2: Update dluhy.md master entry**

Najít `[otevřeno 2026-05-14, SP0+SP1+SP2 hotov]` a aktualizovat na:

```markdown
### [otevřeno 2026-05-14, SP0+SP1+SP2+SP3 hotov] BE fix-forward — zbývá SP4–SP6

- **Soubor:** mnoho — viz [be-fix-forward-decomposition](superpowers/specs/2026-05-14-be-fix-forward-decomposition.md)
- **Typ:** build/CI + chybějící feature implementace (~~Mailer~~ ✅ SP1, ~~SecurityTokens~~ ✅ SP1, ~~AuthService email flows~~ ✅ SP2, ~~UsersService extensions~~ ✅ SP3, Admin extensions, Friendships, DataExport)
- **Riziko:** main na origin neprojde plným typecheck bez transitional `tsconfig.json` + `eslint.config.mjs` + `jest.config.ts` ignore. AdminModule dočasně **disabled** v `app.module.ts` — `/api/admin/*` endpointy nedostupné dokud SP4 nelandí.
- **Co vyžaduje:** SP4 (Admin extensions, AdminModule re-enable), SP5 (Friendships), SP6 (DataExport).
- **Zdroj:** Audit 2026-05-14. **SP0**, **SP1**, **SP2**. **SP3** (listPublic + publicProfileV14 + requestEmailChange + hiddenPresence + UsernameChangeRequest stub + 3 controller routes).
```

- [ ] **Step 3: Stage + commit + push**

```bash
git add backend/src/modules/users/ backend/tsconfig.json backend/eslint.config.mjs backend/jest.config.ts docs/dluhy.md docs/superpowers/specs/2026-05-14-sp3-users-extensions-design.md docs/superpowers/plans/2026-05-14-sp3-users-extensions.md
```

```bash
git commit -m "$(cat <<'EOF'
feat(SP3): UsersService extensions — listPublic, publicProfileV14, requestEmailChange

Ctvrta vrstva BE fix-forward — viz docs/superpowers/specs/2026-05-14-be-fix-forward-decomposition.md.

User entity rozsireni:
- hiddenPresence?: boolean (D-052)
- PublicUserListItem + PublicUserProfile types

IUsersRepository:
- findPublicPaginated(opts) s filter (q, sort, page, limit, includeDeleted)
- 5 novych repo unit testu

UsernameChangeRequest infrastruktura (stub pro SP4):
- Interface + status union (pending|approved|rejected)
- Mongoose schema + partial index na pending status
- Mongo repository (6 metod: create, findById, findPendingByUserId,
  listPaginated, update, deletePending)
- Provider IUsernameChangeRequestsRepository v UsersModule

UsersService rozsireni:
- EMAIL_CHANGE_TTL_MS = 1h
- DI: + IWorldMembershipRepository (forwardRef WorldsModule), MailerService,
  SecurityTokensService, IUsernameChangeRequestsRepository
- listPublic(query, role): paginated public users + worldsCount agregat,
  admin includeDeleted flag + deleted/pendingDeletion v response
- publicProfileV14(userId, role): bohaty profile shape s lastSeenAt jako
  ISO string nebo null pro hiddenPresence/tombstone (D-052). Hrac dostane
  404 pro tombstone/pending, Admin/Superadmin 200+flag.
- requestEmailChange(userId, dto): bcrypt password verify, SAME_EMAIL,
  EMAIL_TAKEN race check, idempotent self-email, issue email_change token
  s meta.newEmail, 2 maily (confirm + notice), masked email v response

UsersController routes:
- GET /users (listPublic) — JWT, 60/min
- GET /users/profile/v14/:id (publicProfileV14) — JWT, 60/min
- POST /users/me/request-email-change — JWT, 5/min

UsersModule:
- + UsernameChangeRequest schema + repo provider
- + forwardRef(WorldsModule) pro IWorldMembershipRepository

Wiring:
- tsconfig + eslint + jest: odebrana users.service.spec.ts z exclude

Testy: ~50 v users.service.spec (12 SP3 1.4/1.7) + 5 nove repo testu zelene.
Existing pre-SP3: 858+ passes zachovany. 12 D-053 numeric-role pre-existing
fails (samostatny dluh) — neovlivnuje SP3.

Co zbyva: SP4 (Admin extensions), SP5 (Friendships), SP6 (DataExport).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

```bash
git push origin main
```

⚠️ **Pokud auto-mode classifier odmítne push:** požádat uživatele o autorizaci.

---

## Self-Review

### Spec coverage

| Spec sekce | Implementuje task |
|---|---|
| 1 User entity hiddenPresence + types | Task 1 |
| 2 findPublicPaginated interface + impl | Tasks 2, 3 |
| 3.1–3.4 UsernameChangeRequest stub | Tasks 4, 5, 6 |
| 3.5 UsersModule wire | Task 7 |
| 4.1 UsersService DI | Task 9 |
| 4.2 EMAIL_CHANGE_TTL_MS | Task 9 |
| 4.3 PublicUserListItem/Profile types | Task 1 |
| 4.4 listPublic | Task 10 |
| 4.5 publicProfileV14 | Task 11 |
| 4.6 requestEmailChange + maskEmail | Task 12 |
| 5 Controller routes | Task 13 |
| 5.1 RequestEmailChangeDto | Task 8 |
| 6 Testing (repo cases) | Task 3 |
| 6.1 Existing users.service.spec.ts | Task 14 |
| 8 Validation criteria | Tasks 14, 15 |

### Placeholder scan

- ✅ Žádné "TBD" — všechny tasky mají code blocks.
- ⚠️ Task 14 Step 4 "Pokud testy failují" je instructive remediation, ne placeholder.

### Type consistency

- `FindPublicPaginatedOpts` (Task 2) used in Task 3 impl + Task 10 (via repo call).
- `PublicUserListItem`/`PublicUserProfile` (Task 1) used in Task 10/11.
- `UsernameChangeRequest`/`UsernameChangeStatus` (Task 4) used in Tasks 5, 6, 7.
- `IUsernameChangeRequestsRepository` (Task 4) used in Tasks 6, 7, 9 (via @Inject token).
- `UsersService.EMAIL_CHANGE_TTL_MS` (Task 9) used in Task 12.
- Token type `'email_change'` v Task 12 — konzistentní s SP1 `SecurityTokenType`.

---

## Plán hotov.
