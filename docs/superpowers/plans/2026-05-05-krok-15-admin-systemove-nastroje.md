# Krok 15 — Admin & Systémové nástroje: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat dedikovaný AdminModule pro správu uživatelů a stránek, rozšířit world membership workflow o přiřazení role/skupiny/postavy při přijetí hráče, implementovat background joby pro údržbu a nakonfigurovat CORS + Socket.io.

**Architecture:** Dedikovaný `AdminModule` volá existující `@Global()` repozitáře. Background joby jako `.job.ts` soubory ve stávajících modulech (vzor `GameEventReminderJob`). Schema a repozitáře rozšiřujeme přidáním metod.

**Tech Stack:** NestJS, Mongoose, TypeScript, Jest, `@nestjs/schedule` (Cron), Socket.io IoAdapter

---

## Task 1: WorldMembership — pole `isFree`

**Files:**
- Modify: `backend/src/modules/worlds/schemas/world-membership.schema.ts`
- Modify: `backend/src/modules/worlds/interfaces/world-membership.interface.ts`
- Modify: `backend/src/modules/worlds/repositories/world-membership.repository.ts`
- Modify: `backend/src/modules/worlds/dto/update-member.dto.ts`
- Modify: `backend/src/modules/worlds/worlds.service.ts`
- Modify: `backend/src/modules/worlds/worlds.controller.ts`
- Test: `backend/src/modules/worlds/worlds.service.spec.ts`

- [ ] **Krok 1: Přidat `isFree` do schema**

V souboru `backend/src/modules/worlds/schemas/world-membership.schema.ts` přidej za `@Prop() group?: string;`:

```typescript
@Prop({ default: false }) isFree: boolean;
```

- [ ] **Krok 2: Přidat `isFree` do interface**

V souboru `backend/src/modules/worlds/interfaces/world-membership.interface.ts` přidej do interface `WorldMembership`:

```typescript
isFree?: boolean;
```

- [ ] **Krok 3: Přidat `isFree` do `toEntity()` v repozitáři**

V souboru `backend/src/modules/worlds/repositories/world-membership.repository.ts` v metodě `toEntity()` přidej za `akj: (doc.akj as number) ?? 0,`:

```typescript
isFree: (doc.isFree as boolean) ?? false,
```

- [ ] **Krok 4: Přidat `UpdateMemberFreeDto`**

V souboru `backend/src/modules/worlds/dto/update-member.dto.ts` přidej na konec:

```typescript
export class UpdateMemberFreeDto {
  @IsBoolean() isFree: boolean;
}
```

Přidej import `IsBoolean` do importů class-validator.

- [ ] **Krok 5: Napsat failing test pro `updateMemberFree()`**

V `backend/src/modules/worlds/worlds.service.spec.ts` přidej do describe bloku:

```typescript
describe('updateMemberFree', () => {
  it('nastaví isFree na true pokud je requester PJ', async () => {
    const pj = { id: 'pj1', role: UserRole.PJ, username: 'pj' };
    const membership = { id: 'mem1', worldId: 'w1', userId: 'u1', role: WorldRole.Hrac, isFree: false, joinedAt: new Date(), akj: 0 };
    mockMembershipRepo.findById.mockResolvedValue(membership);
    mockMembershipRepo.update.mockResolvedValue({ ...membership, isFree: true });

    const result = await service.updateMemberFree('mem1', true, pj);

    expect(mockMembershipRepo.update).toHaveBeenCalledWith('mem1', { isFree: true });
    expect(result?.isFree).toBe(true);
  });

  it('hodí ForbiddenException pokud requester není PJ+', async () => {
    const hrac = { id: 'u1', role: UserRole.Hrac, username: 'u1' };
    const membership = { id: 'mem1', worldId: 'w1', userId: 'u2', role: WorldRole.Hrac, isFree: false, joinedAt: new Date(), akj: 0 };
    mockMembershipRepo.findById.mockResolvedValue(membership);

    await expect(service.updateMemberFree('mem1', true, hrac)).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Krok 6: Spustit test — ověřit že selže**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest worlds.service.spec --no-coverage
```

Očekáváno: FAIL — `service.updateMemberFree is not a function`

- [ ] **Krok 7: Implementovat `updateMemberFree()` ve `WorldsService`**

V `backend/src/modules/worlds/worlds.service.ts` přidej metodu (vzor `updateMemberAkj`):

```typescript
async updateMemberFree(membershipId: string, isFree: boolean, requester: RequestUser): Promise<WorldMembership | null> {
  const membership = await this.membershipRepo.findById(membershipId);
  if (!membership) throw new NotFoundException('Členství nenalezeno');
  if (requester.role > UserRole.Admin && membership.worldId !== undefined) {
    const worldMembership = await this.membershipRepo.findByUserAndWorld(requester.id, membership.worldId);
    if (!worldMembership || worldMembership.role < WorldRole.PJ) {
      throw new ForbiddenException('Pouze PJ může měnit isFree');
    }
  }
  return this.membershipRepo.update(membershipId, { isFree });
}
```

- [ ] **Krok 8: Spustit testy — ověřit že projdou**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest worlds.service.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 9: Přidat endpoint do controlleru**

V `backend/src/modules/worlds/worlds.controller.ts` přidej import `UpdateMemberFreeDto` a endpoint:

```typescript
@Patch(':worldId/members/:membershipId/free')
@UseGuards(JwtAuthGuard)
updateMemberFree(
  @Param('membershipId') membershipId: string,
  @Body() dto: UpdateMemberFreeDto,
  @CurrentUser() user: RequestUser,
) {
  return this.worldsService.updateMemberFree(membershipId, dto.isFree, user);
}
```

- [ ] **Krok 10: Commit**

```bash
git add backend/src/modules/worlds/
git commit -m "feat(worlds): přidat isFree pole na WorldMembership + PATCH endpoint"
```

---

## Task 2: WorldMembers GET s filtrováním (role + group)

**Files:**
- Modify: `backend/src/modules/worlds/interfaces/world-membership-repository.interface.ts`
- Modify: `backend/src/modules/worlds/repositories/world-membership.repository.ts`
- Modify: `backend/src/modules/worlds/worlds.service.ts`
- Modify: `backend/src/modules/worlds/worlds.controller.ts`

- [ ] **Krok 1: Rozšířit interface `findByWorldId()`**

V `backend/src/modules/worlds/interfaces/world-membership-repository.interface.ts` uprav signaturu:

```typescript
findByWorldId(worldId: string, filters?: { role?: number; group?: string }): Promise<WorldMembership[]>;
```

- [ ] **Krok 2: Implementovat filtrování v repozitáři**

V `backend/src/modules/worlds/repositories/world-membership.repository.ts` uprav `findByWorldId()`:

```typescript
async findByWorldId(worldId: string, filters?: { role?: number; group?: string }): Promise<WorldMembership[]> {
  const query: Record<string, unknown> = { worldId };
  if (filters?.role !== undefined) query.role = filters.role;
  if (filters?.group !== undefined) query.group = filters.group;
  const docs = await this.model.find(query).lean().exec();
  return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
}
```

- [ ] **Krok 3: Rozšířit `getMembers()` ve WorldsService**

V `backend/src/modules/worlds/worlds.service.ts` uprav `getMembers()`:

```typescript
async getMembers(worldId: string, filters?: { role?: number; group?: string }): Promise<WorldMembership[]> {
  return this.membershipRepo.findByWorldId(worldId, filters);
}
```

- [ ] **Krok 4: Přidat query params do controlleru**

V `backend/src/modules/worlds/worlds.controller.ts` přidej `Query` do importů a uprav endpoint:

```typescript
@Get(':id/members')
getMembers(
  @Param('id') id: string,
  @Query('role') role?: string,
  @Query('group') group?: string,
) {
  const filters: { role?: number; group?: string } = {};
  if (role !== undefined) filters.role = Number(role);
  if (group !== undefined) filters.group = group;
  return this.worldsService.getMembers(id, Object.keys(filters).length ? filters : undefined);
}
```

- [ ] **Krok 5: Spustit testy**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest worlds --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 6: Commit**

```bash
git add backend/src/modules/worlds/
git commit -m "feat(worlds): GET members přidán filtr role + group"
```

---

## Task 3: Resolve endpoint — přiřazení role/group/character/isFree při přijetí

**Files:**
- Modify: `backend/src/modules/ikaros-messages/dto/resolve-ikaros-message.dto.ts`
- Modify: `backend/src/modules/ikaros-messages/ikaros-messages.service.ts`
- Test: `backend/src/modules/ikaros-messages/ikaros-messages.service.spec.ts`

- [ ] **Krok 1: Rozšířit `ResolveIkarosMessageDto`**

Nahraď obsah `backend/src/modules/ikaros-messages/dto/resolve-ikaros-message.dto.ts`:

```typescript
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveIkarosMessageDto {
  @IsBoolean()
  accept: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;

  @IsOptional() @IsNumber()
  role?: number;

  @IsOptional() @IsString()
  group?: string;

  @IsOptional() @IsString()
  characterPath?: string;

  @IsOptional() @IsBoolean()
  isFree?: boolean;
}
```

- [ ] **Krok 2: Napsat failing test**

V `backend/src/modules/ikaros-messages/ikaros-messages.service.spec.ts` přidej test (najdi describe blok pro `resolve` nebo přidej nový):

```typescript
it('resolve accept — aplikuje role/group/isFree na membership', async () => {
  const msg = {
    id: 'msg1', recipientId: 'pj1', actionType: 'world_join_request',
    actionWorldId: 'w1', actionUserId: 'player1', actionResolved: false,
  };
  const membership = { id: 'mem1', role: -1, worldId: 'w1', userId: 'player1', akj: 0, joinedAt: new Date() };
  mockMsgRepo.findById.mockResolvedValue(msg);
  mockMsgRepo.resolveIfPending.mockResolvedValue(true);
  mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
  mockMembershipRepo.update.mockResolvedValue({ ...membership, role: 1, group: 'Alpha', isFree: false });
  mockMsgRepo.save.mockResolvedValue({});

  await service.resolve('msg1', { accept: true, role: 1, group: 'Alpha', isFree: false }, 'pj1');

  expect(mockMembershipRepo.update).toHaveBeenCalledWith('mem1', {
    role: 1,
    group: 'Alpha',
    isFree: false,
  });
});
```

- [ ] **Krok 3: Spustit test — ověřit že selže**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest ikaros-messages.service.spec --no-coverage
```

Očekáváno: FAIL

- [ ] **Krok 4: Implementovat rozšíření v `resolve()` metodě**

V `backend/src/modules/ikaros-messages/ikaros-messages.service.ts`, v části kde `dto.accept === true`, nahraď blok `if (membership && membership.role === WorldRole.Pending)`:

```typescript
if (membership && membership.role === WorldRole.Pending) {
  const updates: Partial<WorldMembership> = { role: WorldRole.Hrac };
  if (dto.role !== undefined) updates.role = dto.role;
  if (dto.group !== undefined) updates.group = dto.group;
  if (dto.characterPath !== undefined) updates.characterPath = dto.characterPath;
  if (dto.isFree !== undefined) updates.isFree = dto.isFree;
  const updatedMembership = await this.membershipRepo.update(membership.id, updates);
  this.eventEmitter.emit('world.membership.changed', {
    worldId: msg.actionWorldId,
    membership: updatedMembership ?? { ...membership, ...updates },
  });
}
```

Přidej import `WorldMembership` z interface souboru pokud chybí.

- [ ] **Krok 5: Spustit testy — ověřit průchod**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest ikaros-messages.service.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 6: Commit**

```bash
git add backend/src/modules/ikaros-messages/
git commit -m "feat(ikaros-messages): resolve accept přijme role/group/characterPath/isFree"
```

---

## Task 4: Rozšíření repozitářů (users paginated, pages recent, game-events deleteOlderThan, chat-message pruneChannel)

**Files:**
- Modify: `backend/src/modules/users/interfaces/users-repository.interface.ts`
- Modify: `backend/src/modules/users/users.repository.ts`
- Modify: `backend/src/modules/pages/interfaces/pages-repository.interface.ts`
- Modify: `backend/src/modules/pages/repositories/pages.repository.ts`
- Modify: `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts`
- Modify: `backend/src/modules/game-events/repositories/game-event.repository.ts`
- Modify: `backend/src/modules/chat/interfaces/chat-message-repository.interface.ts`
- Modify: `backend/src/modules/chat/repositories/chat-message.repository.ts`

- [ ] **Krok 1: Přidat `findAllPaginated()` do `IUsersRepository`**

V `backend/src/modules/users/interfaces/users-repository.interface.ts` přidej:

```typescript
findAllPaginated(opts: { username?: string; role?: UserRole; page: number; limit: number }): Promise<{ items: User[]; total: number }>;
```

- [ ] **Krok 2: Implementovat `findAllPaginated()` v `MongoUsersRepository`**

V `backend/src/modules/users/users.repository.ts` přidej metodu:

```typescript
async findAllPaginated(opts: { username?: string; role?: UserRole; page: number; limit: number }): Promise<{ items: User[]; total: number }> {
  const query: Record<string, unknown> = {};
  if (opts.role !== undefined) query.role = opts.role;
  if (opts.username) query.username = { $regex: opts.username, $options: 'i' };
  const skip = (opts.page - 1) * opts.limit;
  const [docs, total] = await Promise.all([
    this.model.find(query).sort({ createdAt: -1 }).skip(skip).limit(opts.limit).lean().exec(),
    this.model.countDocuments(query).exec(),
  ]);
  return { items: docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>)), total };
}
```

- [ ] **Krok 3: Přidat `findRecent()` do `IPagesRepository`**

V `backend/src/modules/pages/interfaces/pages-repository.interface.ts` přidej:

```typescript
findRecent(limit: number, worldIds?: string[]): Promise<Page[]>;
```

- [ ] **Krok 4: Implementovat `findRecent()` v `MongoPagesRepository`**

V `backend/src/modules/pages/repositories/pages.repository.ts` přidej metodu (před `toEntity()`):

```typescript
async findRecent(limit: number, worldIds?: string[]): Promise<Page[]> {
  const query: Record<string, unknown> = {};
  if (worldIds && worldIds.length > 0) query.worldId = { $in: worldIds };
  const docs = await this.model
    .find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean()
    .exec();
  return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
}
```

- [ ] **Krok 5: Přidat `deleteOlderThan()` do `IGameEventRepository`**

V `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts` přidej:

```typescript
deleteOlderThan(before: Date): Promise<number>;
```

- [ ] **Krok 6: Implementovat `deleteOlderThan()` v `MongoGameEventRepository`**

V `backend/src/modules/game-events/repositories/game-event.repository.ts` přidej metodu:

```typescript
async deleteOlderThan(before: Date): Promise<number> {
  const result = await this.model
    .deleteMany({ date: { $lt: before.toISOString() } })
    .exec();
  return result.deletedCount ?? 0;
}
```

- [ ] **Krok 7: Přidat `pruneChannel()` do `IChatMessageRepository`**

V `backend/src/modules/chat/interfaces/chat-message-repository.interface.ts` přidej:

```typescript
pruneChannel(channelId: string, olderThan: Date, keepLast: number): Promise<number>;
```

- [ ] **Krok 8: Implementovat `pruneChannel()` v `MongoChatMessageRepository`**

V `backend/src/modules/chat/repositories/chat-message.repository.ts` přidej metodu:

```typescript
async pruneChannel(channelId: string, olderThan: Date, keepLast: number): Promise<number> {
  const recent = await this.model
    .find({ channelId })
    .sort({ createdAt: -1 })
    .limit(keepLast)
    .select('_id')
    .lean()
    .exec();
  const keepIds = recent.map((d) => String((d as { _id: unknown })._id));
  const result = await this.model
    .deleteMany({
      channelId,
      createdAt: { $lt: olderThan },
      _id: { $nin: keepIds },
    })
    .exec();
  return result.deletedCount ?? 0;
}
```

- [ ] **Krok 9: Spustit testy**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest --no-coverage
```

Očekáváno: PASS (žádné testy nebyly rozbity)

- [ ] **Krok 10: Commit**

```bash
git add backend/src/modules/users/ backend/src/modules/pages/ backend/src/modules/game-events/ backend/src/modules/chat/
git commit -m "feat(repos): přidat findAllPaginated, findRecent, deleteOlderThan, pruneChannel"
```

---

## Task 5: AdminModule

**Files:**
- Create: `backend/src/modules/admin/admin.module.ts`
- Create: `backend/src/modules/admin/admin.service.ts`
- Create: `backend/src/modules/admin/admin.controller.ts`
- Create: `backend/src/modules/admin/admin.service.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Krok 1: Napsat failing testy pro `AdminService`**

Vytvoř `backend/src/modules/admin/admin.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

describe('AdminService', () => {
  let service: AdminService;

  const mockUsersRepo = {
    findAllPaginated: jest.fn(),
    update: jest.fn(),
  };
  const mockPagesRepo = {
    findRecent: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserId: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(AdminService);
    jest.clearAllMocks();
  });

  describe('getUsers', () => {
    it('vrátí stránkovaný seznam uživatelů', async () => {
      mockUsersRepo.findAllPaginated.mockResolvedValue({ items: [], total: 0 });
      const result = await service.getUsers({ page: 1, limit: 20 });
      expect(mockUsersRepo.findAllPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('updateUserRole', () => {
    it('aktualizuje roli uživatele', async () => {
      const user = { id: 'u1', role: UserRole.Hrac };
      mockUsersRepo.update.mockResolvedValue({ ...user, role: UserRole.Admin });
      const result = await service.updateUserRole('u1', UserRole.Admin);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { role: UserRole.Admin });
      expect(result?.role).toBe(UserRole.Admin);
    });
  });

  describe('updateUserAkj', () => {
    it('aktualizuje AKJ flag', async () => {
      mockUsersRepo.update.mockResolvedValue({ id: 'u1', akj: true });
      const result = await service.updateUserAkj('u1', true);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { akj: true });
      expect(result?.akj).toBe(true);
    });
  });

  describe('getRecentPages', () => {
    it('Superadmin dostane stránky ze všech světů', async () => {
      const superadmin = { id: 'sa', role: UserRole.Superadmin };
      mockPagesRepo.findRecent.mockResolvedValue([]);
      await service.getRecentPages(superadmin, 20);
      expect(mockPagesRepo.findRecent).toHaveBeenCalledWith(20, undefined);
    });

    it('PJ dostane jen stránky ze světů kde je PJ', async () => {
      const pj = { id: 'pj1', role: UserRole.PJ };
      mockMembershipRepo.findByUserId.mockResolvedValue([
        { worldId: 'w1', role: WorldRole.PJ },
        { worldId: 'w2', role: WorldRole.Hrac },
      ]);
      mockPagesRepo.findRecent.mockResolvedValue([]);
      await service.getRecentPages(pj, 20);
      expect(mockPagesRepo.findRecent).toHaveBeenCalledWith(20, ['w1']);
    });
  });
});
```

- [ ] **Krok 2: Spustit test — ověřit že selže**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest admin.service.spec --no-coverage
```

Očekáváno: FAIL — `Cannot find module './admin.service'`

- [ ] **Krok 3: Implementovat `AdminService`**

Vytvoř `backend/src/modules/admin/admin.service.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

interface AdminUser { id: string; role: UserRole }

@Injectable()
export class AdminService {
  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async getUsers(opts: { username?: string; role?: UserRole; page: number; limit: number }) {
    return this.usersRepo.findAllPaginated(opts);
  }

  async updateUserRole(userId: string, role: UserRole) {
    return this.usersRepo.update(userId, { role });
  }

  async updateUserAkj(userId: string, akj: boolean) {
    return this.usersRepo.update(userId, { akj });
  }

  async getRecentPages(requester: AdminUser, limit: number) {
    if (requester.role <= UserRole.Admin) {
      return this.pagesRepo.findRecent(limit);
    }
    const memberships = await this.membershipRepo.findByUserId(requester.id);
    const pjWorldIds = memberships
      .filter((m) => m.role >= WorldRole.PJ)
      .map((m) => m.worldId);
    return this.pagesRepo.findRecent(limit, pjWorldIds);
  }
}
```

- [ ] **Krok 4: Spustit testy — ověřit průchod**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest admin.service.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Implementovat `AdminController`**

Vytvoř `backend/src/modules/admin/admin.controller.ts`:

```typescript
import {
  Controller, Get, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { IsNumber, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

class UpdateRoleDto {
  @IsNumber() role: UserRole;
}
class UpdateAkjDto {
  @IsBoolean() akj: boolean;
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @UseGuards(AdminGuard)
  getUsers(
    @Query('username') username?: string,
    @Query('role') role?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getUsers({
      username,
      role: role !== undefined ? Number(role) as UserRole : undefined,
      page: Math.max(1, Number(page)),
      limit: Math.min(100, Math.max(1, Number(limit))),
    });
  }

  @Patch('users/:id/role')
  @UseGuards(AdminGuard)
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Patch('users/:id/akj')
  @UseGuards(AdminGuard)
  updateUserAkj(@Param('id') id: string, @Body() dto: UpdateAkjDto) {
    return this.adminService.updateUserAkj(id, dto.akj);
  }

  @Get('recent-pages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Superadmin, UserRole.Admin, UserRole.PJ)
  getRecentPages(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getRecentPages(user, Math.min(100, Math.max(1, Number(limit))));
  }
}
```

- [ ] **Krok 6: Implementovat `AdminModule`**

Vytvoř `backend/src/modules/admin/admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PagesModule } from '../pages/pages.module';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [PagesModule, WorldsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```

- [ ] **Krok 7: Zaregistrovat `AdminModule` v `AppModule`**

V `backend/src/app.module.ts` přidej import:

```typescript
import { AdminModule } from './modules/admin/admin.module';
```

A do pole `imports` přidej `AdminModule`.

- [ ] **Krok 8: Spustit všechny testy**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 9: Commit**

```bash
git add backend/src/modules/admin/ backend/src/app.module.ts
git commit -m "feat(admin): AdminModule — správa uživatelů a stránek"
```

---

## Task 6: GameEventCleanupJob

**Files:**
- Create: `backend/src/modules/game-events/game-event-cleanup.job.ts`
- Modify: `backend/src/modules/game-events/game-events.module.ts`

- [ ] **Krok 1: Implementovat `GameEventCleanupJob`**

Vytvoř `backend/src/modules/game-events/game-event-cleanup.job.ts`:

```typescript
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';

@Injectable()
export class GameEventCleanupJob {
  private readonly logger = new Logger(GameEventCleanupJob.name);

  constructor(
    @Inject('IGameEventRepository')
    private readonly gameEventRepo: IGameEventRepository,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup(): Promise<void> {
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const deleted = await this.gameEventRepo.deleteOlderThan(before);
      if (deleted > 0) {
        this.logger.log(`GameEventCleanup: smazáno ${deleted} starých událostí`);
      }
    } catch (err) {
      this.logger.warn('GameEventCleanup: chyba při mazání', err);
    }
  }
}
```

- [ ] **Krok 2: Zaregistrovat job v `GameEventsModule`**

V `backend/src/modules/game-events/game-events.module.ts` přidej `GameEventCleanupJob` do `providers`:

```typescript
import { GameEventCleanupJob } from './game-event-cleanup.job';
// ...
providers: [
  GameEventReminderJob,
  GameEventCleanupJob,
  { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
],
```

- [ ] **Krok 3: Spustit testy**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest game-event --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 4: Commit**

```bash
git add backend/src/modules/game-events/
git commit -m "feat(game-events): GameEventCleanupJob — hourly mazání starých eventů"
```

---

## Task 7: GlobalChat — CleanMessages + CleanupInactiveUsers

**Files:**
- Modify: `backend/src/modules/global-chat/global-chat.gateway.ts`
- Create: `backend/src/modules/global-chat/clean-messages.job.ts`
- Create: `backend/src/modules/global-chat/cleanup-inactive-users.job.ts`
- Modify: `backend/src/modules/global-chat/global-chat.module.ts`

- [ ] **Krok 1: Přidat presence tracking do `GlobalChatGateway`**

V `backend/src/modules/global-chat/global-chat.gateway.ts` přidej do třídy:

```typescript
private readonly connectedUsers = new Map<string, { lastSeen: Date; username: string }>();

getConnectedUserCount(): number {
  return this.connectedUsers.size;
}

cleanupInactive(thresholdMs: number): number {
  const cutoff = new Date(Date.now() - thresholdMs);
  let removed = 0;
  for (const [socketId, info] of this.connectedUsers.entries()) {
    if (info.lastSeen < cutoff) {
      const socket = this.server.sockets.sockets.get(socketId);
      socket?.disconnect(true);
      this.connectedUsers.delete(socketId);
      removed++;
    }
  }
  return removed;
}
```

Uprav `handleHospodaJoin()` aby trackoval přítomnost:

```typescript
@SubscribeMessage('chat:hospoda:join')
handleHospodaJoin(
  @MessageBody() payload: { username: string },
  @ConnectedSocket() client: Socket,
): void {
  this.connectedUsers.set(client.id, { lastSeen: new Date(), username: payload.username });
  const channelId = this.globalChatService.getGlobalChannelId();
  if (!channelId) return;
  client.to(`chat:${channelId}`).emit('chat:presence', { username: payload.username, action: 'join' });
}

@SubscribeMessage('chat:hospoda:leave')
handleHospodaLeave(
  @MessageBody() payload: { username: string },
  @ConnectedSocket() client: Socket,
): void {
  this.connectedUsers.delete(client.id);
  const channelId = this.globalChatService.getGlobalChannelId();
  if (!channelId) return;
  client.to(`chat:${channelId}`).emit('chat:presence', { username: payload.username, action: 'leave' });
}
```

- [ ] **Krok 2: Implementovat `CleanMessagesJob`**

Vytvoř `backend/src/modules/global-chat/clean-messages.job.ts`:

```typescript
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import { GlobalChatService } from './global-chat.service';

@Injectable()
export class CleanMessagesJob {
  private readonly logger = new Logger(CleanMessagesJob.name);

  constructor(
    @Inject('IChatMessageRepository')
    private readonly messageRepo: IChatMessageRepository,
    private readonly globalChatService: GlobalChatService,
  ) {}

  @Cron(CronExpression.EVERY_2_HOURS)
  async clean(): Promise<void> {
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;
    const olderThan = new Date(Date.now() - 2 * 60 * 60 * 1000);
    try {
      const deleted = await this.messageRepo.pruneChannel(channelId, olderThan, 100);
      if (deleted > 0) {
        this.logger.log(`CleanMessages: smazáno ${deleted} zpráv z hospody`);
      }
    } catch (err) {
      this.logger.warn('CleanMessages: chyba při čistění', err);
    }
  }
}
```

- [ ] **Krok 3: Implementovat `CleanupInactiveUsersJob`**

Vytvoř `backend/src/modules/global-chat/cleanup-inactive-users.job.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GlobalChatGateway } from './global-chat.gateway';

@Injectable()
export class CleanupInactiveUsersJob {
  private readonly logger = new Logger(CleanupInactiveUsersJob.name);
  private static readonly THRESHOLD_MS = 45 * 60 * 1000;

  constructor(private readonly gateway: GlobalChatGateway) {}

  @Cron('0 */45 * * * *')
  cleanup(): void {
    try {
      const removed = this.gateway.cleanupInactive(CleanupInactiveUsersJob.THRESHOLD_MS);
      if (removed > 0) {
        this.logger.log(`CleanupInactiveUsers: odpojeno ${removed} neaktivních uživatelů`);
      }
    } catch (err) {
      this.logger.warn('CleanupInactiveUsers: chyba', err);
    }
  }
}
```

- [ ] **Krok 4: Zaregistrovat joby v `GlobalChatModule`**

Nahraď obsah `backend/src/modules/global-chat/global-chat.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { GlobalChatService } from './global-chat.service';
import { GlobalChatController } from './global-chat.controller';
import { GlobalChatGateway } from './global-chat.gateway';
import { CleanMessagesJob } from './clean-messages.job';
import { CleanupInactiveUsersJob } from './cleanup-inactive-users.job';

@Module({
  imports: [ChatModule],
  controllers: [GlobalChatController],
  providers: [GlobalChatService, GlobalChatGateway, CleanMessagesJob, CleanupInactiveUsersJob],
})
export class GlobalChatModule {}
```

- [ ] **Krok 5: Spustit testy**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 6: Commit**

```bash
git add backend/src/modules/global-chat/
git commit -m "feat(global-chat): CleanMessages + CleanupInactiveUsers background joby"
```

---

## Task 8: main.ts — CORS + Socket.io IoAdapter

**Files:**
- Create: `backend/src/socket-io.adapter.ts`
- Modify: `backend/src/main.ts`

- [ ] **Krok 1: Vytvořit `CustomIoAdapter`**

Vytvoř `backend/src/socket-io.adapter.ts`:

```typescript
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

export class CustomIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      maxHttpBufferSize: 5 * 1024 * 1024,
    });
  }
}
```

- [ ] **Krok 2: Aktualizovat `main.ts`**

Nahraď obsah `backend/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CustomIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useWebSocketAdapter(new CustomIoAdapter(app));
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Krok 3: Ověřit build**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx nest build
```

Očekáváno: BUILD bez chyb

- [ ] **Krok 4: Spustit testy**

```
cd c:\Matrix\ProjektIkaros\Projekt-ikaros\backend && npx jest --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commit**

```bash
git add backend/src/socket-io.adapter.ts backend/src/main.ts
git commit -m "feat(infra): CORS localhost:5174 + Socket.io maxHttpBufferSize 5MB"
```

---

## Task 9: Roadmap update

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Krok 1: Odškrtnout checkboxy v Kroku 15 a změnit stav na ✅**

V `docs/roadmap.md`:
- Změň `## Krok 15 — Admin & Systémové nástroje ⬜` na `✅`
- Zaškrtni všechny checkboxy v Kroku 15

- [ ] **Krok 2: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs(roadmap): Krok 15 Admin & Systémové nástroje označen jako ✅"
```
