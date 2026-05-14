# SP4 — Admin Extensions (Design)

**Datum:** 2026-05-14
**Stav:** Schváleno
**Roadmap:** [be-fix-forward-decomposition](2026-05-14-be-fix-forward-decomposition.md)
**Vychází z:** SP0 (User entity), SP1 (Mailer + SecurityTokens), SP2 (UserBanCacheService, deletionPromotions), SP3 (UsernameChangeRequest stub).

---

## Cíl

Zprovoznit `AdminModule` (dočasně disabled v SP0) implementací všech chybějících závislostí, které `admin.service.ts` importuje. Plný `admin.service.spec.ts` projde a `/api/admin/*` endpointy fungují.

---

## 1. User entity — `bannedBy`

`admin.service.ts:379,424` používá `bannedBy: string` (admin userId). Chybí v User entity. Přidat:

### Interface (`user.interface.ts`)

```typescript
  // SP4 (2026-05-14):
  bannedBy?: string;
```

### Schema (`user.schema.ts`)

```typescript
  @Prop() bannedBy?: string;
```

---

## 2. UsernameChangeRequest — reconciliace field names

⚠️ **SP3 vytvořil interface s field names: `decidedByUserId`, `createdAt`, `decisionNote`.** `admin.service.ts` ale očekává: `decidedBy`, `requestedAt`, `decisionReason`. Plus má dodatečné pole `username` (current) a `userId` (mapped to user).

Reconciliace — finální shape:

```typescript
export interface UsernameChangeRequest {
  id: string;
  userId: string;
  username: string;                  // current username at request time
  requestedUsername: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;                 // ← bylo createdAt
  decidedBy?: string;                // ← bylo decidedByUserId
  decidedAt?: Date;
  decisionReason?: string;           // ← bylo decisionNote
}
```

Schema field rename (DB migration NEzbývá — collection `username_change_requests` ještě nemá data; vznikne až SP4).

Repository interface `IUsernameChangeRequestsRepository.create` arg input:

```typescript
create(input: {
  userId: string;
  username: string;
  requestedUsername: string;
}): Promise<UsernameChangeRequest>;
```

⚠️ **Pozor na import path:** `admin.service.ts:14` importuje `IUsernameChangeRequestsRepository` z `'../users/interfaces/username-change-request.interface'` — chybný path. Správný je `'../users/interfaces/username-change-requests-repository.interface'`. **Fix v Task X.**

---

## 3. AdminAuditLog

### 3.1 Interface (`admin/interfaces/admin-audit-log.interface.ts`)

```typescript
export type AdminAuditAction =
  | 'ROLE_CHANGE'
  | 'USER_CREATE'
  | 'USERNAME_APPROVE'
  | 'USERNAME_REJECT'
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

export interface IAdminAuditLogRepository {
  record(input: {
    actorId: string;
    actorUsername: string;
    targetId: string;
    targetUsername: string;
    action: AdminAuditAction;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason: string | null;
  }): Promise<void>;

  listPaginated(opts: {
    actorId?: string;
    targetId?: string;
    action?: AdminAuditAction;
    page: number;
    limit: number;
  }): Promise<{ items: AdminAuditLogEntry[]; total: number }>;
}
```

### 3.2 Schema (`admin/schemas/admin-audit-log.schema.ts`)

```typescript
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'admin_audit_log' })
export class AdminAuditLogSchemaClass {
  @Prop({ required: true, index: true }) actorId: string;
  @Prop({ required: true }) actorUsername: string;
  @Prop({ required: true, index: true }) targetId: string;
  @Prop({ required: true }) targetUsername: string;
  @Prop({ required: true, type: String, index: true }) action: AdminAuditAction;
  @Prop({ type: Object }) before: Record<string, unknown> | null;
  @Prop({ type: Object }) after: Record<string, unknown> | null;
  @Prop() reason: string | null;
}
```

⚠️ **Bez TTL** — audit log se nemaže, slouží jako compliance důkaz. Velikost roste s objemem admin akcí; vyžaduje sledování + manuální archivaci dlouhodobě.

### 3.3 Repository

Standard Mongo impl. Provider token `'IAdminAuditLogRepository'`.

---

## 4. Hierarchy helper (`admin/helpers/hierarchy.ts`)

Centralizuje role-based authorization checks. Throws `ForbiddenException` při nedostatečném oprávnění.

```typescript
export function assertCanChangeRole(
  actor: { id: string; role: UserRole },
  target: { id: string; role: UserRole },
  newRole: UserRole,
): void {
  // Pravidla:
  // 1. Superadmin může cokoli s kýmkoli (kromě sebe — neumí degradovat sám sebe na nižší roli).
  // 2. Admin může měnit role jen Hrac↔Ikarus↔Korektor (≥ UserRole.PJ).
  //    Admin NESMÍ povýšit nikoho na Admin/Superadmin.
  //    Admin NESMÍ měnit role někoho s rolí ≤ Admin (kromě sebe — to taky ne).
  // 3. Self-change: target.id === actor.id → forbidden (musí proběhnout přes Superadmin).
  // 4. Newrole === target.role → no-op pass (idempotent).
  // ...
}

export function assertCanModerate(
  actor: { id: string; role: UserRole; adminPermissions?: AdminPermissions },
  target: { id: string; role: UserRole },
  action: 'BAN' | 'UNBAN' | 'DELETE' | 'UNDELETE',
): void {
  // Pravidla:
  // 1. Superadmin smí vše (kromě sebe).
  // 2. Admin smí jen pokud target.role > Admin (= je níž). Také pro DELETE/UNDELETE
  //    vyžaduje adminPermissions.canModerateContent.
  // 3. Self-moderation forbidden.
  // 4. Akce DELETE proti Superadmin/Admin: jen Superadmin.
}
```

📚 *Hierarchy logic je doménová — záleží na business rules. Implementuji per `admin.service.ts` use cases. Možná některé edge cases se objeví během impl.*

---

## 5. PJ handover helper (`users/helpers/pj-handover.helper.ts`)

D-037 mechanismus: když se maže/banuje účet, který je jediným PJ ve světě, systém:
- Povýší Pomocného PJ na PJ
- Pokud žádný Pomocný PJ není → BLOCKING (admin musí ručně rozhodnout)

### Signatury

```typescript
import type { IWorldMembershipRepository } from '../../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../../worlds/interfaces/worlds-repository.interface';
import type { IUsersRepository } from '../interfaces/users-repository.interface';

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

export async function assessPJHandover(
  userId: string,
  deps: HandoverDeps,
): Promise<HandoverPlan>;

export async function executePJHandover(
  plan: HandoverPlan,
  deps: { membershipRepo: IWorldMembershipRepository },
): Promise<void>;
```

### Implementace (assessPJHandover)

```typescript
1. memberships = membershipRepo.findByUserId(userId)
2. Filtruj na role === WorldRole.PJ (target je PJ ve světech X, Y, Z)
3. Pro každý takový world:
   a. allPJsInWorld = membershipRepo.findByWorldId(worldId).filter(role === PJ)
   b. helperPJs = membershipRepo.findByWorldId(worldId).filter(role === PomocnyPJ)
   c. Pokud allPJsInWorld.length > 1 → world má redundanci, žádný handover potřeba
   d. Pokud helperPJs.length === 0 → BLOCKER
   e. Jinak: vyber nejstaršího PomocnyPJ → promotion
4. Vrátí HandoverPlan
```

### Implementace (executePJHandover)

```typescript
Pro každou promotion:
  membershipRepo.update(promotedUserId, worldId, { role: WorldRole.PJ })
```

---

## 6. Admin DTOs (7 souborů)

Všechny v `admin/dto/`:

### `ban-user.dto.ts`

```typescript
export class BanUserDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3650) durationDays?: number; // 0 = trvalý
}
```

### `admin-delete-user.dto.ts`

```typescript
export class AdminDeleteUserDto {
  @IsString() @MinLength(1) @MaxLength(500) reason: string;
}
```

### `reject-request.dto.ts`

```typescript
export class RejectRequestDto {
  @IsString() @MinLength(1) @MaxLength(500) reason: string;
}
```

### `set-admin-permissions.dto.ts`

```typescript
export class SetAdminPermissionsDto {
  @IsOptional() @IsBoolean() canManageAdmins?: boolean;
  @IsOptional() @IsBoolean() canModerateContent?: boolean;
  @IsOptional() @IsBoolean() canEditPlatformPages?: boolean;
}
```

### `bulk-ban.dto.ts`

```typescript
export class BulkBanDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) userIds: string[];
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsInt() @Min(0) durationDays?: number;
}
```

### `bulk-unban.dto.ts`

```typescript
export class BulkUnbanDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) userIds: string[];
}
```

### `bulk-role-change.dto.ts`

```typescript
export class BulkRoleChangeDto {
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) userIds: string[];
  @IsEnum(UserRole) role: UserRole;
}
```

---

## 7. UserBanCacheService rozšíření — `size()`

`admin.service.spec.ts:38` mocká `size: jest.fn()`. Pravděpodobně debug endpoint pro admin dashboard. Přidat:

```typescript
size(): number {
  return this.cache.size;
}
```

---

## 8. Account cleanup cron (`users/services/account-cleanup.cron.ts`)

Existuje `account-cleanup.cron.spec.ts` ale ne impl. Cron:
- Spouštěn 1× za hodinu
- Najde users s `deletionRequestedAt + 30 dnů < now` a `isDeleted: false`
- Hard-delete: `isDeleted: true`, vymaže PII (email, passwordHash) — tombstone shape
- Emituje event `user.deletion.hard-deleted`
- Posílá mail `sendAccountDeletionScheduled` 24h předem

```typescript
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
    // SP4 stub — minimální logika pro spec compliance.
    // SP4b plnohodnotná impl: per-record sweep, batch updates, mail 24h před.
  }
}
```

⚠️ **SP4 stub:** Plnohodnotná logika (mail 24h předem, atomic hard-delete) je SP4b — minimum nyní stačí pro compile + jeden basic test.

---

## 9. AdminModule

`admin.module.ts` existuje. Update:

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdminAuditLogSchemaClass.name, schema: AdminAuditLogSchema },
    ]),
    // UsersModule + WorldsModule + PagesModule + AuthModule providery jsou
    // potřeba pro injectované repos. Pokud žádný není @Global(), forwardRef.
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    {
      provide: 'IAdminAuditLogRepository',
      useClass: MongoAdminAuditLogRepository,
    },
  ],
})
export class AdminModule {}
```

---

## 10. app.module.ts re-enable

Odkomentovat:

```typescript
import { AdminModule } from './modules/admin/admin.module';

// ... imports:
AdminModule,
```

---

## 11. admin.service.ts oprava import path

```diff
- import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-request.interface';
+ import type { IUsernameChangeRequestsRepository } from '../users/interfaces/username-change-requests-repository.interface';
```

---

## 12. Testing

### 12.1 admin.service.spec.ts (existing)

13 tests, scope: `getUsers`, `updateUserRole`, `getRecentPages`, `createUser`. Cíl: všechno projít po SP4.

### 12.2 Hierarchy helper (`admin/helpers/hierarchy.spec.ts`) — nové testy

| Case | Expected |
|---|---|
| Superadmin → may change anyone | OK |
| Admin → promote to Admin → 403 | OK |
| Admin → demote Superadmin → 403 | OK |
| Self-change → 403 | OK |
| Same role no-op → pass | OK |
| Admin BAN/UNBAN Hrac → OK | OK |
| Admin DELETE without canModerateContent → 403 | OK |
| Admin DELETE Admin → 403 | OK |

### 12.3 PJ handover (`users/helpers/pj-handover.helper.spec.ts`) — nové testy

| Case | Expected |
|---|---|
| User je PJ ve 2 světech, oba mají i jiné PJ | promotions=[], blocking=[] |
| User je sole PJ + má Pomocného PJ | 1 promotion, 0 blocking |
| User je sole PJ bez Pomocného PJ | 0 promotions, 1 blocking |
| executePJHandover updates membership.role | repo.update volaný |

### 12.4 AdminAuditLog repo (`admin/repositories/admin-audit-log.repository.spec.ts`)

| Case | Expected |
|---|---|
| record creates doc | model.create volaný |
| listPaginated bez filtru | find with {} |
| listPaginated s action filter | find s {action} |

### 12.5 account-cleanup.cron.spec.ts (existing)

Spustit + opravit. Pokud test má fixture spec, který nesedí, akceptovat dluh.

---

## 13. Anti-scope

**SP4 NEZAHRNUJE:**
- Bulk operations testing (impl exists, testy nepřidáme — SP4b)
- HardDelete email send 24h předem (zatím stub) — SP4b
- Account cleanup cron production-ready (atomic batch, retries) — SP4b
- AdminController routes mimo 4 existující (getUsers/updateUserRole/createUser/recent-pages) — SP4 ponechá existing rozsah, nepřidá ban/unban/etc.
- Admin controller endpointy pro ban/unban/delete/audit-log/bulk/permissions — admin.service.ts impl je tu, ale controller routes pro ně SP4 nepřidá. **Zůstává jako dluh "rozšíření admin controller routes" do SP4b.**

---

## 14. Validation criteria

Po SP4:
- [ ] User entity má `bannedBy`
- [ ] UsernameChangeRequest field rename (decidedBy/requestedAt/decisionReason + nový `username`)
- [ ] AdminAuditLog interface + schema + Mongo repo + provider
- [ ] Hierarchy helper + 8 testů
- [ ] PJ handover helper + 4 testy
- [ ] 7 admin DTOs
- [ ] UserBanCacheService.size() + test
- [ ] account-cleanup.cron stub
- [ ] admin.service.ts import path opraven
- [ ] AdminModule registruje audit repo + uses NEW imports
- [ ] app.module.ts AdminModule re-enabled
- [ ] tsconfig + eslint + jest: odebrány admin.* + account-cleanup z exclude
- [ ] `npm run typecheck` + `lint:check` exit 0
- [ ] `npx jest admin user-ban-cache pj-handover hierarchy account-cleanup` projde
- [ ] `docs/dluhy.md`: SP4 ✅, zbývá SP5–SP6

---

## Schvalovací log

- 2026-05-14 — schváleno user response "jedeme dál" po SP3 hotov.
