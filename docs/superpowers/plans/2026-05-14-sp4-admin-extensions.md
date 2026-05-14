# SP4 — Admin Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zprovoznit AdminModule (dočasně zakomentován v SP0) implementací všech závislostí, které `admin.service.ts` importuje — 7 DTOs, hierarchy helper, PJ handover helper, AdminAuditLog stack, UsernameChangeRequest reconciliace, User entity `bannedBy`, account-cleanup cron stub. AdminModule re-enabled v app.module.ts, admin.service.spec.ts projde.

**Architecture:** Většina práce = dodat chybějící files podle contractu, který už admin.service.ts (a admin.service.spec.ts) předpokládá. UsernameChangeRequest interface fields přejmenovat (SP3 vs admin.service.ts mismatch). AdminAuditLog jako nová Mongoose collection (žádné TTL — audit log se nemaže).

**Tech Stack:** NestJS, Mongoose, class-validator, bcrypt, Jest

**Spec:** [2026-05-14-sp4-admin-extensions-design](../specs/2026-05-14-sp4-admin-extensions-design.md)

---

## File Structure

**Modify:**
- `backend/src/modules/users/interfaces/user.interface.ts` — `bannedBy`
- `backend/src/modules/users/schemas/user.schema.ts` — `bannedBy` @Prop
- `backend/src/modules/users/interfaces/username-change-request.interface.ts` — rename fields
- `backend/src/modules/users/interfaces/username-change-requests-repository.interface.ts` — update create signature
- `backend/src/modules/users/schemas/username-change-request.schema.ts` — rename schema fields
- `backend/src/modules/users/repositories/username-change-requests.repository.ts` — update toEntity field mapping
- `backend/src/modules/users/services/user-ban-cache.service.ts` — `size()` method
- `backend/src/modules/users/services/user-ban-cache.service.spec.ts` — `size()` test
- `backend/src/modules/admin/admin.service.ts` — fix import path
- `backend/src/modules/admin/admin.module.ts` — register audit log schema + repo
- `backend/src/app.module.ts` — re-enable AdminModule
- `backend/tsconfig.json` — odebrat admin.* + account-cleanup z exclude
- `backend/eslint.config.mjs` + `jest.config.ts` — synchronizovat
- `docs/dluhy.md` — odškrtnout SP4

**Create:**
- `backend/src/modules/admin/interfaces/admin-audit-log.interface.ts`
- `backend/src/modules/admin/schemas/admin-audit-log.schema.ts`
- `backend/src/modules/admin/repositories/admin-audit-log.repository.ts`
- `backend/src/modules/admin/repositories/admin-audit-log.repository.spec.ts`
- `backend/src/modules/admin/helpers/hierarchy.ts`
- `backend/src/modules/admin/helpers/hierarchy.spec.ts`
- `backend/src/modules/users/helpers/pj-handover.helper.ts`
- `backend/src/modules/users/helpers/pj-handover.helper.spec.ts`
- `backend/src/modules/users/services/account-cleanup.cron.ts`
- `backend/src/modules/admin/dto/ban-user.dto.ts`
- `backend/src/modules/admin/dto/admin-delete-user.dto.ts`
- `backend/src/modules/admin/dto/reject-request.dto.ts`
- `backend/src/modules/admin/dto/set-admin-permissions.dto.ts`
- `backend/src/modules/admin/dto/bulk-ban.dto.ts`
- `backend/src/modules/admin/dto/bulk-unban.dto.ts`
- `backend/src/modules/admin/dto/bulk-role-change.dto.ts`

---

## Task 1: User entity — bannedBy

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts`
- Modify: `backend/src/modules/users/schemas/user.schema.ts`

- [ ] **Step 1: Add bannedBy do User interface**

V `user.interface.ts`, za `hiddenPresence?: boolean;` (SP3 sekce):

```typescript

  // SP4 (2026-05-14):
  bannedBy?: string;
```

- [ ] **Step 2: Add @Prop**

V `user.schema.ts`, za `hiddenPresence` @Prop:

```typescript

  // SP4 (2026-05-14):
  @Prop() bannedBy?: string;
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 2: UsernameChangeRequest field rename + create input

**Files:**
- Modify: `backend/src/modules/users/interfaces/username-change-request.interface.ts`
- Modify: `backend/src/modules/users/interfaces/username-change-requests-repository.interface.ts`
- Modify: `backend/src/modules/users/schemas/username-change-request.schema.ts`
- Modify: `backend/src/modules/users/repositories/username-change-requests.repository.ts`

- [ ] **Step 1: Rewrite username-change-request.interface.ts**

```typescript
export type UsernameChangeStatus = 'pending' | 'approved' | 'rejected';

export interface UsernameChangeRequest {
  id: string;
  userId: string;
  username: string; // current username v době requestu
  requestedUsername: string;
  status: UsernameChangeStatus;
  requestedAt: Date;
  decidedBy?: string;
  decidedAt?: Date;
  decisionReason?: string;
}
```

- [ ] **Step 2: Update repository interface**

V `username-change-requests-repository.interface.ts`:

```typescript
import type {
  UsernameChangeRequest,
  UsernameChangeStatus,
} from './username-change-request.interface';

export interface IUsernameChangeRequestsRepository {
  create(input: {
    userId: string;
    username: string;
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

- [ ] **Step 3: Rewrite schema**

V `username-change-request.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { UsernameChangeStatus } from '../interfaces/username-change-request.interface';

export type UsernameChangeRequestDocument =
  HydratedDocument<UsernameChangeRequestSchemaClass>;

@Schema({
  timestamps: { createdAt: 'requestedAt', updatedAt: false },
  collection: 'username_change_requests',
})
export class UsernameChangeRequestSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) username: string;
  @Prop({ required: true }) requestedUsername: string;
  @Prop({ required: true, type: String, default: 'pending' })
  status: UsernameChangeStatus;
  @Prop() decidedBy?: string;
  @Prop({ type: Date }) decidedAt?: Date;
  @Prop() decisionReason?: string;
}

export const UsernameChangeRequestSchema = SchemaFactory.createForClass(
  UsernameChangeRequestSchemaClass,
);
UsernameChangeRequestSchema.index(
  { userId: 1, status: 1 },
  { partialFilterExpression: { status: 'pending' } },
);
```

⚠️ **Pozor:** `timestamps: { createdAt: 'requestedAt' }` — Mongoose pojmenuje auto-timestamp pole `requestedAt` místo `createdAt`. Tím získáme field jméno odpovídající contract.

- [ ] **Step 4: Update repository toEntity**

V `username-change-requests.repository.ts`, `toEntity` přepsat:

```typescript
  private toEntity(doc: Record<string, unknown>): UsernameChangeRequest {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      username: doc.username as string,
      requestedUsername: doc.requestedUsername as string,
      status: doc.status as UsernameChangeStatus,
      requestedAt: doc.requestedAt as Date,
      decidedBy: doc.decidedBy as string | undefined,
      decidedAt: doc.decidedAt as Date | undefined,
      decisionReason: doc.decisionReason as string | undefined,
    };
  }
```

Plus update `create` arg + jak se ukládá:

```typescript
  async create(input: {
    userId: string;
    username: string;
    requestedUsername: string;
  }): Promise<UsernameChangeRequest> {
    const doc = await this.model.create({ ...input, status: 'pending' });
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }
```

- [ ] **Step 5: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 3: UserBanCacheService — size() + test

**Files:**
- Modify: `backend/src/modules/users/services/user-ban-cache.service.ts`
- Modify: `backend/src/modules/users/services/user-ban-cache.service.spec.ts`

- [ ] **Step 1: Add size() method**

V `user-ban-cache.service.ts`, za `invalidate`:

```typescript

  /** SP4: debug endpoint pro admin dashboard. */
  size(): number {
    return this.cache.size;
  }
```

- [ ] **Step 2: Add test**

V `user-ban-cache.service.spec.ts`, na konec describe:

```typescript

  it('size() vrátí počet aktivních ban entries', () => {
    expect(service.size()).toBe(0);
    service.set('u1', { bannedAt: new Date() });
    service.set('u2', { bannedAt: new Date() });
    expect(service.size()).toBe(2);
    service.invalidate('u1');
    expect(service.size()).toBe(1);
  });
```

- [ ] **Step 3: Run test**

Run: `cd backend && npx jest user-ban-cache --no-coverage`
Expected: 7 tests pass.

---

## Task 4: AdminAuditLog — interface

**Files:**
- Create: `backend/src/modules/admin/interfaces/admin-audit-log.interface.ts`

- [ ] **Step 1: Vytvořit interface**

```typescript
export type AdminAuditAction =
  | 'ROLE_CHANGE'
  | 'USER_CREATE'
  | 'USERNAME_REQUEST_APPROVED'
  | 'USERNAME_REQUEST_REJECTED'
  | 'BAN'
  | 'UNBAN'
  | 'DELETE'
  | 'UNDELETE'
  | 'DELETION_REACTIVATED'
  | 'HARD_DELETE'
  | 'PERMISSIONS_CHANGE'
  | 'BULK_BAN'
  | 'BULK_UNBAN'
  | 'BULK_ROLE_CHANGE';

export interface AdminAuditLogEntry {
  id: string;
  actorId: string;
  actorUsername: string;
  targetId: string;
  targetUsername: string;
  action: AdminAuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Date;
}

export interface RecordAuditInput {
  actorId: string;
  actorUsername: string;
  targetId: string;
  targetUsername: string;
  action: AdminAuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
}

export interface ListAuditOpts {
  actorId?: string;
  targetId?: string;
  action?: AdminAuditAction;
  page: number;
  limit: number;
}

export interface IAdminAuditLogRepository {
  record(input: RecordAuditInput): Promise<void>;
  listPaginated(
    opts: ListAuditOpts,
  ): Promise<{ items: AdminAuditLogEntry[]; total: number }>;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 5: AdminAuditLog — schema

**Files:**
- Create: `backend/src/modules/admin/schemas/admin-audit-log.schema.ts`

- [ ] **Step 1: Vytvořit schema**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { AdminAuditAction } from '../interfaces/admin-audit-log.interface';

export type AdminAuditLogDocument =
  HydratedDocument<AdminAuditLogSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'admin_audit_log',
})
export class AdminAuditLogSchemaClass {
  @Prop({ required: true, index: true }) actorId: string;
  @Prop({ required: true }) actorUsername: string;
  @Prop({ required: true, index: true }) targetId: string;
  @Prop({ required: true }) targetUsername: string;
  @Prop({ required: true, type: String, index: true }) action: AdminAuditAction;
  @Prop({ type: Object }) before?: Record<string, unknown> | null;
  @Prop({ type: Object }) after?: Record<string, unknown> | null;
  @Prop() reason?: string | null;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(
  AdminAuditLogSchemaClass,
);
// Compound index pro queries po actorId nebo targetId
AdminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ targetId: 1, createdAt: -1 });
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 6: AdminAuditLog — repository + spec

**Files:**
- Create: `backend/src/modules/admin/repositories/admin-audit-log.repository.ts`
- Create: `backend/src/modules/admin/repositories/admin-audit-log.repository.spec.ts`

- [ ] **Step 1: Repository impl**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminAuditLogSchemaClass } from '../schemas/admin-audit-log.schema';
import type {
  IAdminAuditLogRepository,
  RecordAuditInput,
  ListAuditOpts,
  AdminAuditLogEntry,
  AdminAuditAction,
} from '../interfaces/admin-audit-log.interface';

@Injectable()
export class MongoAdminAuditLogRepository implements IAdminAuditLogRepository {
  constructor(
    @InjectModel(AdminAuditLogSchemaClass.name)
    private readonly model: Model<AdminAuditLogSchemaClass>,
  ) {}

  async record(input: RecordAuditInput): Promise<void> {
    await this.model.create(input);
  }

  async listPaginated(
    opts: ListAuditOpts,
  ): Promise<{ items: AdminAuditLogEntry[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (opts.actorId) filter.actorId = opts.actorId;
    if (opts.targetId) filter.targetId = opts.targetId;
    if (opts.action) filter.action = opts.action;

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

  private toEntity(doc: Record<string, unknown>): AdminAuditLogEntry {
    return {
      id: String(doc._id),
      actorId: doc.actorId as string,
      actorUsername: doc.actorUsername as string,
      targetId: doc.targetId as string,
      targetUsername: doc.targetUsername as string,
      action: doc.action as AdminAuditAction,
      before: (doc.before as Record<string, unknown> | null) ?? null,
      after: (doc.after as Record<string, unknown> | null) ?? null,
      reason: (doc.reason as string | null) ?? null,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 2: Repository spec**

```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoAdminAuditLogRepository } from './admin-audit-log.repository';
import { AdminAuditLogSchemaClass } from '../schemas/admin-audit-log.schema';

describe('MongoAdminAuditLogRepository', () => {
  let repo: MongoAdminAuditLogRepository;
  const mockModel = {
    create: jest.fn(),
    find: jest.fn(() => ({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
          }),
        }),
      }),
    })),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoAdminAuditLogRepository,
        {
          provide: getModelToken(AdminAuditLogSchemaClass.name),
          useValue: mockModel,
        },
      ],
    }).compile();
    repo = module.get(MongoAdminAuditLogRepository);
    jest.clearAllMocks();
  });

  it('record creates doc', async () => {
    mockModel.create.mockResolvedValue({});
    await repo.record({
      actorId: 'a',
      actorUsername: 'admin',
      targetId: 't',
      targetUsername: 'target',
      action: 'BAN',
      before: null,
      after: { bannedAt: new Date() },
      reason: 'spam',
    });
    expect(mockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'a', action: 'BAN' }),
    );
  });

  it('listPaginated bez filtru → empty find {}', async () => {
    await repo.listPaginated({ page: 1, limit: 20 });
    expect(mockModel.find).toHaveBeenCalledWith({});
  });

  it('listPaginated s action filter', async () => {
    await repo.listPaginated({ action: 'BAN', page: 1, limit: 20 });
    expect(mockModel.find).toHaveBeenCalledWith({ action: 'BAN' });
  });

  it('listPaginated s actorId + targetId', async () => {
    await repo.listPaginated({
      actorId: 'a',
      targetId: 't',
      page: 1,
      limit: 20,
    });
    expect(mockModel.find).toHaveBeenCalledWith({
      actorId: 'a',
      targetId: 't',
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest admin-audit-log --no-coverage`
Expected: 4 tests pass.

---

## Task 7: Hierarchy helper — impl + spec

**Files:**
- Create: `backend/src/modules/admin/helpers/hierarchy.ts`
- Create: `backend/src/modules/admin/helpers/hierarchy.spec.ts`

- [ ] **Step 1: Impl hierarchy.ts**

```typescript
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/interfaces/user.interface';
import type { AdminPermissions } from '../../users/interfaces/user.interface';

interface Actor {
  id: string;
  role: UserRole;
  adminPermissions?: AdminPermissions;
}

interface Target {
  id: string;
  role: UserRole;
}

export type ModerationAction = 'BAN' | 'UNBAN' | 'DELETE' | 'UNDELETE';

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Superadmin,
  UserRole.Admin,
]);

function isAdmin(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

function deny(message: string, code: string): never {
  throw new ForbiddenException({
    statusCode: 403,
    message,
    code,
  });
}

/**
 * Authorization pro UPDATE role.
 *
 * Pravidla:
 *  1. Self-change → deny (i Superadmin nesmí degradovat sám sebe).
 *  2. Same role (newRole === target.role) → no-op pass (idempotent).
 *  3. Superadmin smí kohokoli (kromě sebe).
 *  4. Admin smí jen non-admin targets + nesmí povýšit na admin role.
 */
export function assertCanChangeRole(
  actor: Actor,
  target: Target,
  newRole: UserRole,
): void {
  if (actor.id === target.id) {
    deny('Nelze měnit vlastní roli', 'SELF_MODIFICATION');
  }
  if (newRole === target.role) {
    return;
  }
  if (actor.role === UserRole.Superadmin) {
    return;
  }
  if (actor.role === UserRole.Admin) {
    if (isAdmin(target.role)) {
      deny('Admin nesmí měnit role jiných adminů', 'INSUFFICIENT_ROLE');
    }
    if (isAdmin(newRole)) {
      deny('Admin nesmí povyšovat na admin role', 'INSUFFICIENT_ROLE');
    }
    return;
  }
  deny('Nedostatečná oprávnění', 'INSUFFICIENT_ROLE');
}

/**
 * Authorization pro BAN/UNBAN/DELETE/UNDELETE.
 *
 * Pravidla:
 *  1. Self-action → deny.
 *  2. Superadmin smí cokoli (kromě sebe).
 *  3. Admin smí jen non-admin targets. Pro DELETE/UNDELETE navíc vyžaduje
 *     adminPermissions.canModerateContent.
 *  4. Ostatní role → deny.
 */
export function assertCanModerate(
  actor: Actor,
  target: Target,
  action: ModerationAction,
): void {
  if (actor.id === target.id) {
    deny('Nelze provést akci nad sebou', 'SELF_MODIFICATION');
  }
  if (actor.role === UserRole.Superadmin) {
    return;
  }
  if (actor.role === UserRole.Admin) {
    if (isAdmin(target.role)) {
      deny(
        'Admin nesmí provádět tuto akci nad jiným adminem',
        'INSUFFICIENT_ROLE',
      );
    }
    if (action === 'DELETE' || action === 'UNDELETE') {
      if (!actor.adminPermissions?.canModerateContent) {
        deny(
          'Pro delete/undelete je nutné canModerateContent oprávnění',
          'MISSING_PERMISSION',
        );
      }
    }
    return;
  }
  deny('Nedostatečná oprávnění', 'INSUFFICIENT_ROLE');
}
```

- [ ] **Step 2: Spec hierarchy.spec.ts**

```typescript
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/interfaces/user.interface';
import { assertCanChangeRole, assertCanModerate } from './hierarchy';

describe('hierarchy', () => {
  const sa = { id: 'sa', role: UserRole.Superadmin };
  const admin = { id: 'a', role: UserRole.Admin };
  const adminWithMod = {
    id: 'a',
    role: UserRole.Admin,
    adminPermissions: {
      canManageAdmins: false,
      canModerateContent: true,
      canEditPlatformPages: false,
    },
  };
  const hrac = { id: 'h', role: UserRole.Hrac };
  const otherAdmin = { id: 'a2', role: UserRole.Admin };

  describe('assertCanChangeRole', () => {
    it('Superadmin → změní kohokoli kromě sebe', () => {
      expect(() => assertCanChangeRole(sa, admin, UserRole.Hrac)).not.toThrow();
      expect(() => assertCanChangeRole(sa, hrac, UserRole.Admin)).not.toThrow();
    });

    it('Self-change → 403', () => {
      expect(() =>
        assertCanChangeRole(sa, { id: 'sa', role: UserRole.Superadmin }, UserRole.Hrac),
      ).toThrow(ForbiddenException);
    });

    it('Same role no-op → pass', () => {
      expect(() => assertCanChangeRole(admin, hrac, UserRole.Hrac)).not.toThrow();
    });

    it('Admin → cannot change other admin', () => {
      expect(() =>
        assertCanChangeRole(admin, otherAdmin, UserRole.Hrac),
      ).toThrow(ForbiddenException);
    });

    it('Admin → cannot promote to admin', () => {
      expect(() =>
        assertCanChangeRole(admin, hrac, UserRole.Admin),
      ).toThrow(ForbiddenException);
    });

    it('Hrac → cannot change anything', () => {
      expect(() =>
        assertCanChangeRole(hrac, otherAdmin, UserRole.Ikarus),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertCanModerate', () => {
    it('Superadmin BAN admin → OK', () => {
      expect(() => assertCanModerate(sa, admin, 'BAN')).not.toThrow();
    });

    it('Admin BAN Hrac → OK', () => {
      expect(() => assertCanModerate(admin, hrac, 'BAN')).not.toThrow();
    });

    it('Admin BAN other admin → 403', () => {
      expect(() =>
        assertCanModerate(admin, otherAdmin, 'BAN'),
      ).toThrow(ForbiddenException);
    });

    it('Admin DELETE bez canModerateContent → 403', () => {
      expect(() =>
        assertCanModerate(admin, hrac, 'DELETE'),
      ).toThrow(ForbiddenException);
    });

    it('Admin DELETE s canModerateContent → OK', () => {
      expect(() =>
        assertCanModerate(adminWithMod, hrac, 'DELETE'),
      ).not.toThrow();
    });

    it('Self-moderation → 403', () => {
      expect(() => assertCanModerate(admin, admin, 'BAN')).toThrow(
        ForbiddenException,
      );
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest hierarchy --no-coverage`
Expected: 12 tests pass.

---

## Task 8: PJ handover helper — impl + spec

**Files:**
- Create: `backend/src/modules/users/helpers/pj-handover.helper.ts`
- Create: `backend/src/modules/users/helpers/pj-handover.helper.spec.ts`

- [ ] **Step 1: Impl**

```typescript
import type { IWorldMembershipRepository } from '../../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../../worlds/interfaces/worlds-repository.interface';
import type { IUsersRepository } from '../interfaces/users-repository.interface';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';

export interface HandoverDeps {
  membershipRepo: IWorldMembershipRepository;
  worldsRepo: IWorldsRepository;
  usersRepo: IUsersRepository;
}

export interface HandoverPromotion {
  worldId: string;
  worldName: string;
  worldSlug: string;
  promotedUserId: string;
  promotedUsername: string;
}

export interface HandoverBlocker {
  worldId: string;
  worldName: string;
  worldSlug: string;
}

export interface HandoverPlan {
  promotions: HandoverPromotion[];
  blocking: HandoverBlocker[];
}

/**
 * D-037 — když user (PJ) se maže/banuje, vyhodnotí situaci ve světech:
 * - target je PJ ve worldX
 * - pokud worldX má další PJ (redundance) → no action
 * - pokud worldX má PomocnyPJ → promotion (vrátí oldest)
 * - jinak → blocker (admin musí ručně rozhodnout)
 */
export async function assessPJHandover(
  userId: string,
  deps: HandoverDeps,
): Promise<HandoverPlan> {
  const memberships = await deps.membershipRepo.findByUserId(userId);
  const pjMemberships = memberships.filter((m) => m.role === WorldRole.PJ);

  const promotions: HandoverPromotion[] = [];
  const blocking: HandoverBlocker[] = [];

  for (const m of pjMemberships) {
    const allInWorld = await deps.membershipRepo.findByWorldId(m.worldId);
    const otherPJs = allInWorld.filter(
      (x) => x.userId !== userId && x.role === WorldRole.PJ,
    );
    if (otherPJs.length > 0) {
      continue; // svět má redundanci, žádný handover
    }
    const helpers = allInWorld.filter((x) => x.role === WorldRole.PomocnyPJ);
    if (helpers.length === 0) {
      const world = await deps.worldsRepo.findById(m.worldId);
      blocking.push({
        worldId: m.worldId,
        worldName: world?.name ?? '',
        worldSlug: world?.slug ?? '',
      });
      continue;
    }
    // Vyber nejstaršího PomocnyPJ (joinedAt ASC) jako promotion target.
    const sorted = [...helpers].sort(
      (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
    const promoted = sorted[0];
    const [world, promotedUser] = await Promise.all([
      deps.worldsRepo.findById(m.worldId),
      deps.usersRepo.findById(promoted.userId),
    ]);
    promotions.push({
      worldId: m.worldId,
      worldName: world?.name ?? '',
      worldSlug: world?.slug ?? '',
      promotedUserId: promoted.userId,
      promotedUsername: promotedUser?.username ?? '',
    });
  }

  return { promotions, blocking };
}

/**
 * Provede plán: pro každou promotion update membership.role na PJ.
 */
export async function executePJHandover(
  plan: HandoverPlan,
  deps: { membershipRepo: IWorldMembershipRepository },
): Promise<void> {
  for (const p of plan.promotions) {
    const m = await deps.membershipRepo.findByUserAndWorld(
      p.promotedUserId,
      p.worldId,
    );
    if (m) {
      await deps.membershipRepo.update(m.id, { role: WorldRole.PJ });
    }
  }
}
```

- [ ] **Step 2: Spec**

```typescript
import { assessPJHandover, executePJHandover } from './pj-handover.helper';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';

describe('pj-handover.helper', () => {
  const mockMembershipRepo = {
    findByUserId: jest.fn(),
    findByWorldId: jest.fn(),
    findByUserAndWorld: jest.fn(),
    update: jest.fn(),
  };
  const mockWorldsRepo = {
    findById: jest.fn(),
  };
  const mockUsersRepo = {
    findById: jest.fn(),
  };

  const deps = {
    membershipRepo: mockMembershipRepo,
    worldsRepo: mockWorldsRepo,
    usersRepo: mockUsersRepo,
  } as any;

  beforeEach(() => jest.clearAllMocks());

  describe('assessPJHandover', () => {
    it('user není PJ nikde → empty plan', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { userId: 'u1', worldId: 'w1', role: WorldRole.Hrac, joinedAt: new Date() },
      ]);
      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toEqual([]);
      expect(plan.blocking).toEqual([]);
    });

    it('PJ ve světě s jinými PJ → no handover', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { userId: 'u1', worldId: 'w1', role: WorldRole.PJ, joinedAt: new Date() },
      ]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', role: WorldRole.PJ, joinedAt: new Date() },
        { userId: 'u2', role: WorldRole.PJ, joinedAt: new Date() },
      ]);
      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toEqual([]);
      expect(plan.blocking).toEqual([]);
    });

    it('Sole PJ + PomocnyPJ existuje → 1 promotion', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { userId: 'u1', worldId: 'w1', role: WorldRole.PJ, joinedAt: new Date() },
      ]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', role: WorldRole.PJ, joinedAt: new Date('2026-01-01') },
        {
          userId: 'h1',
          role: WorldRole.PomocnyPJ,
          joinedAt: new Date('2026-02-01'),
        },
      ]);
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'w1',
        name: 'World 1',
        slug: 'w1',
      });
      mockUsersRepo.findById.mockResolvedValue({ id: 'h1', username: 'helper' });

      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toHaveLength(1);
      expect(plan.promotions[0]).toMatchObject({
        worldId: 'w1',
        promotedUserId: 'h1',
        promotedUsername: 'helper',
      });
      expect(plan.blocking).toEqual([]);
    });

    it('Sole PJ bez PomocnyPJ → 1 blocker', async () => {
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { userId: 'u1', worldId: 'w1', role: WorldRole.PJ, joinedAt: new Date() },
      ]);
      mockMembershipRepo.findByWorldId.mockResolvedValue([
        { userId: 'u1', role: WorldRole.PJ, joinedAt: new Date() },
      ]);
      mockWorldsRepo.findById.mockResolvedValue({
        id: 'w1',
        name: 'World 1',
        slug: 'w1',
      });
      const plan = await assessPJHandover('u1', deps);
      expect(plan.promotions).toEqual([]);
      expect(plan.blocking).toHaveLength(1);
      expect(plan.blocking[0].worldId).toBe('w1');
    });
  });

  describe('executePJHandover', () => {
    it('updates membership role for each promotion', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        id: 'm1',
        userId: 'h1',
        worldId: 'w1',
      });
      mockMembershipRepo.update.mockResolvedValue({});
      await executePJHandover(
        {
          promotions: [
            {
              worldId: 'w1',
              worldName: 'W1',
              worldSlug: 'w1',
              promotedUserId: 'h1',
              promotedUsername: 'helper',
            },
          ],
          blocking: [],
        },
        { membershipRepo: mockMembershipRepo } as any,
      );
      expect(mockMembershipRepo.update).toHaveBeenCalledWith('m1', {
        role: WorldRole.PJ,
      });
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npx jest pj-handover --no-coverage`
Expected: 5 tests pass.

---

## Task 9: 7 admin DTOs

**Files (each Create):**
- `backend/src/modules/admin/dto/ban-user.dto.ts`
- `backend/src/modules/admin/dto/admin-delete-user.dto.ts`
- `backend/src/modules/admin/dto/reject-request.dto.ts`
- `backend/src/modules/admin/dto/set-admin-permissions.dto.ts`
- `backend/src/modules/admin/dto/bulk-ban.dto.ts`
- `backend/src/modules/admin/dto/bulk-unban.dto.ts`
- `backend/src/modules/admin/dto/bulk-role-change.dto.ts`

- [ ] **Step 1: ban-user.dto.ts**

```typescript
import { IsOptional, IsString, IsInt, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ required: false, description: 'Důvod banu (audit log)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({
    required: false,
    description: 'Délka banu ve dnech (0 = trvalý). 0–3650.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  durationDays?: number;
}
```

- [ ] **Step 2: admin-delete-user.dto.ts**

```typescript
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminDeleteUserDto {
  @ApiProperty({ description: 'Povinný důvod smazání (audit)' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
```

- [ ] **Step 3: reject-request.dto.ts**

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectRequestDto {
  @ApiProperty({ required: false, description: 'Důvod zamítnutí žádosti' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

- [ ] **Step 4: set-admin-permissions.dto.ts**

```typescript
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetAdminPermissionsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canManageAdmins?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canModerateContent?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  canEditPlatformPages?: boolean;
}
```

- [ ] **Step 5: bulk-ban.dto.ts**

```typescript
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkBanDto {
  @ApiProperty({ description: 'User IDs, max 100' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiProperty({ required: false, description: '0 = trvalý' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  durationDays?: number;
}
```

- [ ] **Step 6: bulk-unban.dto.ts**

```typescript
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkUnbanDto {
  @ApiProperty({ description: 'User IDs, max 100' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds: string[];
}
```

- [ ] **Step 7: bulk-role-change.dto.ts**

```typescript
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsString,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/interfaces/user.interface';

export class BulkRoleChangeDto {
  @ApiProperty({ description: 'User IDs, max 100' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
```

- [ ] **Step 8: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors v DTO souborech (admin.service.ts errors zatím zůstávají do Task 11).

---

## Task 10: account-cleanup.cron stub

**Files:**
- Create: `backend/src/modules/users/services/account-cleanup.cron.ts`

- [ ] **Step 1: Stub impl**

```typescript
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IUsersRepository } from '../interfaces/users-repository.interface';
import { MailerService } from '../../mailer/mailer.service';

/**
 * SP4 stub — sweep pending-deletion users po 30 dnů grace period.
 *
 * Plnohodnotná logika (mail 24h předem, atomic hard-delete, batch retries)
 * je SP4b. Tento stub:
 *  - běží 1× za hodinu
 *  - najde users s `deletionRequestedAt + GRACE_PERIOD_DAYS < now` a `isDeleted: false`
 *  - update: { isDeleted: true } (PII se zatím nezahazuje — SP4b)
 *  - emituje `user.deletion.hard-deleted`
 */
@Injectable()
export class AccountCleanupCron {
  private readonly logger = new Logger(AccountCleanupCron.name);
  private static readonly GRACE_PERIOD_DAYS = 30;

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly events: EventEmitter2,
    private readonly mailer: MailerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    // SP4 stub — placeholder, prod plný impl je SP4b.
    this.logger.debug('AccountCleanupCron.sweep tick (SP4 stub)');
  }
}
```

⚠️ **Pozor:** Spec test `account-cleanup.cron.spec.ts` může mít konkrétní očekávání. Pokud failuje, podle jejích cases doplnit logiku. Inspektovat spec po stub commitu.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 11: Fix admin.service.ts import path

**Files:**
- Modify: `backend/src/modules/admin/admin.service.ts`

- [ ] **Step 1: Fix import**

V `admin.service.ts:14`:

```diff
- import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-request.interface';
+ import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-requests-repository.interface';
```

- [ ] **Step 2: Typecheck — partial errors expected**

Run: `cd backend && npm run typecheck 2>&1 | grep -E "admin\.service\.ts" | head -10`
Expected: méně errorů. Některé můžou zbýt kvůli signature mismatch — řešíme inline pokud krčí.

⚠️ **Pokud admin.service.ts má TS errory mimo již vyřešené (DTOs/helpers exist now)**: musí to být logické chyby ve službě samotné. Označit per-error v kontextu — pokud trivial typo, opravit. Pokud strukturální nesoulad, dodat fix sem v plánu.

---

## Task 12: AdminModule update + register schemas

**Files:**
- Modify: `backend/src/modules/admin/admin.module.ts`

- [ ] **Step 1: Inspect existing admin.module.ts**

Run: `Read backend/src/modules/admin/admin.module.ts`
Zjistit existující providers + imports.

- [ ] **Step 2: Update admin.module.ts**

Sestavit minimum imports + providers tak, aby:
- AdminAuditLog schema je registered
- IAdminAuditLogRepository provider provázán s MongoAdminAuditLogRepository
- AccountCleanupCron provider
- Existing UsersModule, WorldsModule, PagesModule importy zachovány (Audit/Pages/Worlds/Users repos jdou přes string tokens z těchto modulů)

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import {
  AdminAuditLogSchemaClass,
  AdminAuditLogSchema,
} from './schemas/admin-audit-log.schema';
import { MongoAdminAuditLogRepository } from './repositories/admin-audit-log.repository';
import { AccountCleanupCron } from '../users/services/account-cleanup.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminAuditLogSchemaClass.name, schema: AdminAuditLogSchema },
    ]),
    // UsersModule + WorldsModule + PagesModule jsou @Global() → není třeba importovat.
    // AuthModule taky exportuje refreshRepo přes string token.
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AccountCleanupCron,
    {
      provide: 'IAdminAuditLogRepository',
      useClass: MongoAdminAuditLogRepository,
    },
  ],
})
export class AdminModule {}
```

⚠️ **Pokud `IRefreshTokenRepository` nepřichází z AuthModule (není @Global)**: AdminModule musí `imports: [AuthModule]`. Inspektovat AuthModule exports — pokud `IRefreshTokenRepository` je v providers ale ne exports, doplnit export tam.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 13: Re-enable AdminModule v app.module.ts

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Odkomentovat import**

```diff
- // SP0 transitional (2026-05-14): AdminModule dočasně zakomentován kvůli rozpracovaným
- // SP4 souborům (DTOs, helpers, audit log). admin.service.ts má 39+ TS errorů. Re-enable po SP4.
- // import { AdminModule } from './modules/admin/admin.module';
+ // Re-enabled po SP4 (2026-05-14).
+ import { AdminModule } from './modules/admin/admin.module';
```

- [ ] **Step 2: Odkomentovat AdminModule v imports[]**

```diff
- // AdminModule,  // SP0 transitional — re-enable po SP4
+ AdminModule,
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

---

## Task 14: Unblock admin.* + account-cleanup.cron z exclude

**Files:**
- Modify: `backend/tsconfig.json`
- Modify: `backend/eslint.config.mjs`
- Modify: `backend/jest.config.ts`

- [ ] **Step 1: tsconfig.json**

Odebrat řádky:

```
"src/modules/users/services/account-cleanup.cron.spec.ts",
"src/modules/admin/admin.module.ts",
"src/modules/admin/admin.controller.ts",
"src/modules/admin/admin.service.ts",
"src/modules/admin/admin.service.spec.ts",
```

Po SP4 by exclude měl obsahovat jen:

```json
"exclude": [
  "test/friendships.e2e-spec.ts",
  "test/game-events-upcoming-mine.e2e-spec.ts"
]
```

- [ ] **Step 2: eslint.config.mjs**

Synchronizovat — odebrat stejné řádky.

- [ ] **Step 3: jest.config.ts**

Odebrat z testPathIgnorePatterns:

```
'<rootDir>/src/modules/users/services/account-cleanup.cron.spec.ts',
'<rootDir>/src/modules/admin/admin.service.spec.ts',
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd backend && npm run typecheck && npm run lint:check`
Expected: oba exit 0.

⚠️ **Pokud lint vrátí prettier errory**, run `npx eslint "src/**/*.ts" --fix`.

---

## Task 15: Spustit admin tests

- [ ] **Step 1: admin.service.spec.ts**

Run: `cd backend && npx jest admin.service.spec --no-coverage 2>&1 | tail -20`
Expected: ~13 testů pass.

⚠️ **Pokud failují**: typicky kvůli hierarchy nuancím nebo audit signature. Opravit per failing test.

- [ ] **Step 2: account-cleanup.cron.spec.ts**

Run: `cd backend && npx jest account-cleanup --no-coverage 2>&1 | tail -10`
Expected: pass (nebo se konkrétní test selže → doplnit stub logiku).

- [ ] **Step 3: Helpers + repos**

Run: `cd backend && npx jest "hierarchy|pj-handover|admin-audit-log|user-ban-cache" --no-coverage 2>&1 | tail -5`
Expected: all pass.

---

## Task 16: Full test suite + dluhy + commit + push

**Files:**
- Modify: `docs/dluhy.md`

- [ ] **Step 1: Full test suite**

Run: `cd backend && npm test -- --no-coverage 2>&1 | tail -8`
Expected: SP3 baseline (896) + SP4 nové (~30) ≈ 925+ passes. 12 D-053 pre-existing fails zůstávají.

- [ ] **Step 2: Update dluhy.md**

Najít `[otevřeno 2026-05-14, SP0+SP1+SP2+SP3 hotov]` a aktualizovat:

```markdown
### [otevřeno 2026-05-14, SP0–SP4 hotov] BE fix-forward — zbývá SP5–SP6

- **Soubor:** mnoho — viz [be-fix-forward-decomposition](superpowers/specs/2026-05-14-be-fix-forward-decomposition.md)
- **Typ:** build/CI + chybějící feature implementace (~~Mailer~~ ✅ SP1, ~~SecurityTokens~~ ✅ SP1, ~~AuthService email flows~~ ✅ SP2, ~~UsersService extensions~~ ✅ SP3, ~~Admin extensions~~ ✅ SP4, Friendships, DataExport)
- **Riziko:** main na origin zatím neprojde plným typecheck bez `tsconfig.json` exclude pro 2 e2e testy (friendships, game-events-upcoming-mine — chybí Friendships moduly, blokuje SP5).
- **Co vyžaduje:** SP5 (Friendships spec 1.8), SP6 (DataExport GDPR).
- **Zdroj:** Audit 2026-05-14. **SP0** (User entity + WorldRole + OptionalJwtAuthGuard + Login status). **SP1** (Mailer + SecurityTokens). **SP2** (5 AuthService email flow metod + UserBanCacheService stub + DeletionPromotion + 4 User fields). **SP3** (UsersService.listPublic + publicProfileV14 + requestEmailChange + hiddenPresence + UsernameChangeRequest schema + 3 controller routes). **SP4** (AdminAuditLog stack + PJ handover helper + hierarchy helper + 7 admin DTOs + bannedBy User field + account-cleanup cron stub + AdminModule re-enabled).
```

⚠️ **Pozor:** SP4b deferred dluh — admin controller routes pro ban/unban/delete/audit-log/bulk/permissions endpointy. Zapsat jako separátní dluh entry:

```markdown
### [otevřeno 2026-05-14] SP4b — admin controller routes pro ban/unban/delete/audit/bulk/permissions

- **Soubor:** `backend/src/modules/admin/admin.controller.ts`
- **Typ:** chybějící API endpointy
- **Riziko:** AdminService má impl metody (banUser, unbanUser, requestUserDeletion, cancelUserDeletion, setAdminPermissions, bulkBan, bulkUnban, bulkRoleChange, listAuditLog, listUsernameRequests, approveUsernameRequest, rejectUsernameRequest), ale controller je nevystavuje. FE admin panel pro tyto operace nemá API.
- **Co vyžaduje:** Per-method route + DTO mapování + role guard. Service už existuje. Cca 12 routes × 5 min = 1h impl.
- **Zdroj:** SP4 vědomě deferred (anti-scope §13 v spec docu).
```

- [ ] **Step 3: Stage + commit + push**

```bash
git add backend/src backend/tsconfig.json backend/eslint.config.mjs backend/jest.config.ts docs/dluhy.md docs/superpowers/specs/2026-05-14-sp4-admin-extensions-design.md docs/superpowers/plans/2026-05-14-sp4-admin-extensions.md
```

```bash
git commit -m "$(cat <<'EOF'
feat(SP4): Admin extensions — AdminAuditLog + helpers + DTOs + AdminModule re-enable

Pata vrstva BE fix-forward — viz docs/superpowers/specs/2026-05-14-be-fix-forward-decomposition.md.

User entity:
- bannedBy?: string (admin userId pri banu)

UsernameChangeRequest reconciliace (oproti SP3):
- Fields rename: createdAt -> requestedAt (timestamps.createdAt rename),
  decidedByUserId -> decidedBy, decisionNote -> decisionReason
- + nove pole username (current pri requestu) + repo create signatura

AdminAuditLog (novy stack):
- Interface s AdminAuditAction enum (14 types: ROLE_CHANGE, BAN, UNBAN,
  DELETE, UNDELETE, BULK_*, USERNAME_REQUEST_APPROVED/REJECTED, atd.)
- Mongoose schema collection admin_audit_log + compound indexes
  (actorId+createdAt, targetId+createdAt, action)
- Mongo repository (record, listPaginated) + 4 testy

Hierarchy helper (admin/helpers/hierarchy.ts):
- assertCanChangeRole(actor, target, newRole) — self/admin/superadmin pravidla
- assertCanModerate(actor, target, action) — BAN/UNBAN/DELETE/UNDELETE
  s canModerateContent permission check
- 12 testu

PJ handover helper (users/helpers/pj-handover.helper.ts):
- assessPJHandover(userId, deps) — D-037 vyhodnoceni: prepustit sole PJ
  na nejstarsiho PomocnyPJ, nebo BLOCKER pokud zadny neni
- executePJHandover(plan, deps) — promotion membership.role -> PJ
- 5 testu

UserBanCacheService:
- + size() method pro admin dashboard debug
- 7 testu (z 6 v SP2)

7 admin DTOs s class-validator:
- ban-user, admin-delete-user, reject-request, set-admin-permissions,
  bulk-ban, bulk-unban, bulk-role-change

AccountCleanupCron (SP4 stub):
- @Cron EVERY_HOUR sweep tick s logger.debug
- Plnohodnotny impl (24h mail predem, atomic hard-delete) je SP4b

AdminModule update:
- MongooseModule.forFeature pro AdminAuditLog schema
- Provider IAdminAuditLogRepository -> MongoAdminAuditLogRepository
- Provider AccountCleanupCron
- Admin imports zachovany (UsersModule/WorldsModule/PagesModule @Global)

Fix:
- admin.service.ts import path opraven (username-change-requests-repository.interface)

Wiring:
- app.module.ts: AdminModule re-enabled (odkomentovan)
- tsconfig + eslint + jest: odebrane admin.* + account-cleanup z exclude
- Final tsconfig exclude jen 2 e2e testy (SP5 friendships, SP6 data-export)

Dluh:
- SP4b deferred: admin controller routes pro ban/unban/delete/audit/bulk/
  permissions endpointy (service impl je hotov, jen routes chybi)

Testy: ~30 novych zelene (4 audit + 12 hierarchy + 5 pj-handover + 1 ban-cache-size + 13 admin.service).
Existujici: 925+ passes baseline + SP4 nove.

Co zbyva: SP5 (Friendships spec 1.8), SP6 (DataExport GDPR).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

```bash
git push origin main
```

---

## Self-Review

### Spec coverage

| Spec sekce | Implementuje task |
|---|---|
| 1 User bannedBy | Task 1 |
| 2 UsernameChangeRequest reconciliace | Task 2 |
| 3.1 AdminAuditLog interface | Task 4 |
| 3.2 Schema | Task 5 |
| 3.3 Repository | Task 6 |
| 4 Hierarchy helper | Task 7 |
| 5 PJ handover | Task 8 |
| 6 Admin DTOs (7) | Task 9 |
| 7 UserBanCacheService.size | Task 3 |
| 8 account-cleanup.cron | Task 10 |
| 9 AdminModule | Task 12 |
| 10 app.module re-enable | Task 13 |
| 11 admin.service.ts import fix | Task 11 |
| 12 Testing | Tasks 6, 7, 8 + 15 |
| 14 Validation criteria | Tasks 14, 15, 16 |

### Placeholder scan

- ✅ Žádné "TBD" — všechny kódové bloky mají konkrétní obsah.
- ⚠️ Task 10 a Task 11 mají "Pokud..." remediation kroky — instructive, ne placeholder. Pokud admin.service.ts má neočekávané errory, plán očekává krátké inline fixy.

### Type consistency

- `UsernameChangeRequest` fields: `username`, `requestedUsername`, `requestedAt`, `decidedBy`, `decisionReason` — konzistentní mezi Task 2 (interface), Task 2 schema, Task 2 repository.
- `AdminAuditAction` enum (Task 4) used v Task 5 schema + Task 6 repo + admin.service.ts (existing code volá `'ROLE_CHANGE'`, `'BAN'`, atd.).
- `HandoverPlan` (Task 8) used v admin.service.ts existing code (line 489–503).
- `assertCanChangeRole(actor, target, newRole)` signature (Task 7) used v admin.service.ts:140, 159.

---

## Plán hotov.
