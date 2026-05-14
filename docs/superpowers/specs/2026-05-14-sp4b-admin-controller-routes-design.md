# SP4b — Admin controller routes (HTTP surface pro AdminService)

**Status:** Schváleno (2026-05-14)
**Předchůdce:** [SP4 spec](./2026-05-14-sp4-admin-extensions-design.md) §13 — controller routes vědomě deferred
**Dluh log:** `docs/dluhy.md` — "SP4b — admin controller routes"

## Cíl

Doplnit chybějící HTTP surface pro 12 existujících metod `AdminService`. Service je hotová a otestovaná (unit testy passují), controller exposuje jen 4 ze 14 metod — FE admin panel proto nemá endpointy pro ban/unban/delete/audit/bulk/admin-permissions/username-requests.

Po dokončení SP4b je AdminService kompletně dostupná přes `/admin/*` REST API a admin panel FE může být napojen bez dalšího BE work.

## Non-goals

- FE změny — admin panel napojení je samostatný task (po SP4b dostane jasný route contract)
- Refactor existujících 4 routes (`getUsers`, `updateUserRole`, `createUser`, `getRecentPages`)
- Per-route rate limiting (default global throttler stačí)
- E2E happy-path testy nad rámec smoke checku (service má unit testy)
- Nové DTO, guardy, hierarchy helpers — vše existuje

## Architektonické principy

1. **Controller-level guards = baseline + výjimky.** `JwtAuthGuard + AdminGuard` pro všechny routes, `@Roles(UserRole.Superadmin)` navíc jen tam, kde service vyžaduje Superadmin (`setAdminPermissions`).
2. **Hierarchy / business checks = service.** `assertCanModerate`, `assertCanChangeRole`, recipe `SOLE_PJ_BLOCK` zůstávají ve service. Controller je tenká HTTP fasáda.
3. **Error contract.** Service hází `NestJS` exceptions s `{ statusCode, code, message }` shape. Controller propaguje beze změny.
4. **Action-style routes** (`POST /:id/approve` apod.) — konzistentní s zbytkem projektu (`ikaros-articles`, `worlds/:id/join`, `npc-templates/:id/import`, atd.).
5. **Zero new DTOs.** `BanUserDto`, `AdminDeleteUserDto`, `RejectRequestDto`, `SetAdminPermissionsDto`, `BulkBanDto`, `BulkUnbanDto`, `BulkRoleChangeDto` jsou napsané v `admin/dto/`.

## Route mapping

### Per-user moderation (#1-4)

| HTTP | Path | Service | DTO | Guard |
|---|---|---|---|---|
| `POST` | `/admin/users/:id/ban` | `banUser(actor, id, dto)` | `BanUserDto` | Admin |
| `POST` | `/admin/users/:id/unban` | `unbanUser(actor, id)` | — | Admin |
| `POST` | `/admin/users/:id/request-deletion` | `requestUserDeletion(actor, id, dto)` | `AdminDeleteUserDto` | Admin |
| `POST` | `/admin/users/:id/cancel-deletion` | `cancelUserDeletion(actor, id)` | — | Admin |

**Response shape:** `{ user: SafeUser }` (`SafeUser` = User minus `passwordHash`).

**Error codes** (z service): `USER_NOT_FOUND`, `ALREADY_BANNED`, `NOT_BANNED`, `ALREADY_DELETED`, `ALREADY_PENDING_DELETION`, `SOLE_PJ_BLOCK` (400 s `worlds: [...]` payloadem), `NO_PENDING_DELETION`, `INSUFFICIENT_HIERARCHY` (z hierarchy helpers).

### Admin permissions toggle (#5)

| HTTP | Path | Service | DTO | Guard |
|---|---|---|---|---|
| `PATCH` | `/admin/users/:id/admin-permissions` | `setAdminPermissions(actor, id, dto)` | `SetAdminPermissionsDto` | **Superadmin** (`@Roles(UserRole.Superadmin)`) |

Service navíc dělá:
- `INSUFFICIENT_ROLE` pokud aktor není Superadmin (defense — i kdyby guard selhal)
- `SELF_FORBIDDEN` pokud `actor.id === userId`
- `NOT_ADMIN` pokud target nemá `role === Admin`

**`PATCH` místo POST** — semantika "partial update permission flags", D-033 granular merge.

### Username change requests (#6-8)

| HTTP | Path | Service | DTO | Guard |
|---|---|---|---|---|
| `GET` | `/admin/username-requests` | `listUsernameRequests(opts)` | query: `status?`, `page=1`, `limit=20` | Admin |
| `POST` | `/admin/username-requests/:id/approve` | `approveUsernameRequest(actor, id)` | — | Admin |
| `POST` | `/admin/username-requests/:id/reject` | `rejectUsernameRequest(actor, id, dto)` | `RejectRequestDto` | Admin |

**Top-level path** (`/admin/username-requests`, ne `/admin/users/username-requests`) — username request je entity sám o sobě, ne sub-resource konkrétního usera. Service `listUsernameRequests` filtruje napříč userami.

**Response:**
- list: `{ items: [...], total }` (each item má embedded `user` + `decidedBy` snippety)
- approve: `{ request, user }`
- reject: `{ request }`

### Bulk actions (#9-11)

| HTTP | Path | Service | DTO | Guard |
|---|---|---|---|---|
| `POST` | `/admin/users/bulk-ban` | `bulkBan(actor, dto)` | `BulkBanDto` | Admin |
| `POST` | `/admin/users/bulk-unban` | `bulkUnban(actor, dto)` | `BulkUnbanDto` | Admin |
| `POST` | `/admin/users/bulk-role-change` | `bulkRoleChange(actor, dto)` | `BulkRoleChangeDto` | Admin |

**Pod `/admin/users/`** (ne `/admin/bulk/`) — sémanticky jsou to akce nad collection users.

**Per-user hierarchy** se aplikuje v service — jeden hráč může selhat (`INSUFFICIENT_HIERARCHY`), zbytek projde. Atomicita: žádná, batch je best-effort.

**Response shape:** `{ successful: string[], failed: Array<{ userId, code, message }> }`.

### Audit log (#12)

| HTTP | Path | Service | Query | Guard |
|---|---|---|---|---|
| `GET` | `/admin/audit-log` | `listAuditLog(opts)` | `action?`, `actorId?`, `targetId?`, `page=1`, `limit=50` | Admin (+ Superadmin) |

**Decision:** Audit log čte **Admin + Superadmin** (otevřený mezi adminy). Žádná Admin-only filtrace na `actorId === actor.id`. Důvod: peer review je hodnotnější než silo informací.

**Response:** `{ items: AdminAuditLogEntry[], total }`.

## Guard a permission check matrix

| Route | `JwtAuthGuard` | `AdminGuard` | `@Roles(...)` | Service-level navíc |
|---|---|---|---|---|
| #1-4 (moderation) | ✓ baseline | ✓ | — | `assertCanModerate` / `assertCanChangeRole` |
| #5 (admin-permissions) | ✓ baseline | ✓ | `Superadmin` | `INSUFFICIENT_ROLE`, `SELF_FORBIDDEN`, `NOT_ADMIN` |
| #6-8 (username requests) | ✓ baseline | ✓ | — | Race recheck v approve |
| #9-11 (bulk) | ✓ baseline | ✓ | — | Per-user hierarchy v cyklu |
| #12 (audit) | ✓ baseline | ✓ | — | — |

`JwtAuthGuard` zajistí přihlášení. `AdminGuard` zajistí `actor.role <= UserRole.Admin` (Superadmin=1, Admin=2). `@Roles(Superadmin)` přidá fast-fail pro #5.

## DTO contract (referenční)

Všechny DTOs existují, zde jen scope reminder:

- `BanUserDto`: `reason?: string`, `durationDays?: number` (0/undefined = trvalý)
- `AdminDeleteUserDto`: `reason: string` (povinný)
- `RejectRequestDto`: `reason?: string`
- `SetAdminPermissionsDto`: `canManageAdmins?`, `canModerateContent?`, `canEditPlatformPages?` (granular merge)
- `BulkBanDto`: `userIds: string[]`, `reason?`, `durationDays?`
- `BulkUnbanDto`: `userIds: string[]`
- `BulkRoleChangeDto`: `userIds: string[]`, `role: UserRole`

## Acceptance criteria

1. `admin.controller.ts` exposuje 12 nových route handlers (kompletní mapping výše).
2. `npm run typecheck` ✓ (0 errors)
3. `npm run lint:check` ✓ (0 nových errors; pre-existing warning v `response.interceptor.ts` zůstává)
4. `npm test` ✓ (938/938 — žádný regress)
5. Swagger (`@ApiTags('Admin')`) má pro každou route `@ApiOperation` + `@ApiResponse` 200/403/404 minimálně. Bonus: 409 pro state conflicts (banned/already-deleted).
6. Žádné nové DTO, žádné nové guardy, žádné service změny. Pouze controller code.

## Rizika a alternativy

⚠️ **Alternativa #1: defensive `@Roles` per-route navíc.** Tj. ban routes mají `@Roles(Admin, Superadmin)` explicitně, ne jen `AdminGuard`. **Odmítnuto:** `AdminGuard` už filtruje `role <= Admin`, duplicate decorator je noise.

⚠️ **Alternativa #2: DELETE /admin/users/:id pro request-deletion.** **Odmítnuto:** DELETE je idempotentní + semanticky = hard delete; soft-delete s 30-day reversion je víc honest jako `POST :id/request-deletion`.

⚠️ **Alternativa #3: nested `/admin/users/:id/username-request`.** **Odmítnuto:** username request je samostatná entity (vlastní `id`, lifecycle, audit). Top-level path je honest.

⚠️ **Riziko bulk routes:** klient pošle 1000 userIds → service iteruje synchronně. Per-user latence × 1000 = klidně 30s+ request. **Mitigation:** Service spec uvádí 100 jako rozumný limit; DTO `class-validator` má `@ArrayMaxSize(100)`. Server timeout je 60s. Pokud uživatel zjistí, že 100 nestačí, otevře dluh pro queue-based bulk (out of scope SP4b).

## Implementační poznámky

- `CurrentUser` decorator vrací `RequestUser` (`{ id, role, username }`) — pro service metody, které čekají `User`, cast `actor as unknown as User` (pattern už existuje v `updateUserRole`, `createUser` v aktuálním controlleru).
- Query parsing pattern: `page = '1'`, `limit = '20'` → `Math.max(1, Number(page))` + `Math.min(100, Number(limit))` (per `getUsers` precedent).
- Audit log paginace: default `limit = 50`, max 100 (audit záznamy jsou těžší než user records).
