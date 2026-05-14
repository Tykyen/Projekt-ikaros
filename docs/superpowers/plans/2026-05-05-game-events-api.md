# GameEvents API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doplnit HTTP+service vrstvu k existujícímu `game-events` modulu (schéma + 2 cron joby) — controller, service, DTO, role gating, viditelnostní filter, RSVP toggle, 1-úrovňové komentáře s reakcemi, push notifikace při create.

**Architecture:** NestJS modul `GameEventsModule`. Repository pattern (Mongo přes Mongoose). Role gating sjednocený s `chat.service.ts` (globální `UserRole.Admin` bypass + per-world `WorldRole.PomocnyPJ` minimum pro mutace). Push notifikace přes globální `PushService` (fire-and-forget, selhání nesmí shodit POST). Žádný WebSocket gateway — REST only.

**Tech Stack:** NestJS 10, Mongoose, class-validator, Jest + @nestjs/testing.

**Spec:** [docs/superpowers/specs/2026-05-05-game-events-api-design.md](../specs/2026-05-05-game-events-api-design.md)

---

## File Structure

**Vytvořit:**
- `backend/src/modules/game-events/game-events.controller.ts` — REST endpointy
- `backend/src/modules/game-events/game-events.service.ts` — business logika, viditelnost, role gating
- `backend/src/modules/game-events/game-events.service.spec.ts` — unit testy
- `backend/src/modules/game-events/dto/create-game-event.dto.ts`
- `backend/src/modules/game-events/dto/update-game-event.dto.ts`
- `backend/src/modules/game-events/dto/create-comment.dto.ts`
- `backend/src/modules/game-events/dto/update-comment.dto.ts`
- `backend/src/modules/game-events/dto/react-comment.dto.ts`

**Upravit:**
- `backend/src/modules/game-events/schemas/game-event.schema.ts` — doplnit fieldy + subdokumenty + compound index
- `backend/src/modules/game-events/interfaces/game-event.interface.ts` — typy fieldů + `EventConfirmation` + `EventComment`
- `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts` — CRUD + comment ops
- `backend/src/modules/game-events/repositories/game-event.repository.ts` — implementace nových metod
- `backend/src/modules/game-events/game-events.module.ts` — registrace Service + Controller
- `backend/src/modules/game-events/game-event-reminder.job.ts` — `groupOnly` filter pro recipient list

**Beze změny:**
- `backend/src/modules/game-events/game-event-cleanup.job.ts`

---

## Předpoklady

Před začátkem ověř:
- `WorldRole.Pending = -1`, `WorldRole.Hrac = 0`, `WorldRole.PomocnyPJ = 2`, `WorldRole.PJ = 3` ([world-membership.interface.ts:1-7](../../../backend/src/modules/worlds/interfaces/world-membership.interface.ts))
- `UserRole.Superadmin = 1`, `UserRole.Admin = 2` (Admin/Superadmin je `role <= 2`)
- `PushModule` je `@Global()` — `PushService` lze inject bez import modulu ([push.module.ts:8](../../../backend/src/modules/push/push.module.ts))
- `IWorldMembershipRepository.findByWorldId(worldId, filters?)` umí filtrovat dle `group` ([world-membership-repository.interface.ts:5](../../../backend/src/modules/worlds/interfaces/world-membership-repository.interface.ts))
- `IWorldsRepository.findById(id): Promise<World | null>` existuje pro získání `world.name` v push title
- Globální `ValidationPipe` se `whitelist: true, transform: true` ([main.ts:13](../../../backend/src/main.ts))

**Známý existující bug** (mimo scope, ale zmínit v PR popisu):
- [game-event-reminder.job.ts:36](../../../backend/src/modules/game-events/game-event-reminder.job.ts) filtruje `m.role !== 0 /* WorldRole.Pending */`. To je špatně — `Pending = -1`, `Hrac = 0`. Aktuálně se push reminder neposílá hráčům. **Plán to opravuje při refactoru reminder jobu (Task 9).**

---

## Task 1: Schema + interface rozšíření

**Files:**
- Modify: `backend/src/modules/game-events/schemas/game-event.schema.ts`
- Modify: `backend/src/modules/game-events/interfaces/game-event.interface.ts`

- [ ] **Step 1.1: Rozšířit interface**

Soubor: `backend/src/modules/game-events/interfaces/game-event.interface.ts`

```ts
export interface EventConfirmation {
  userId: string;
  userName: string;
}

export interface EventComment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  reactions: Record<string, string[]>;
  isDeleted: boolean;
}

export interface GameEvent {
  id: string;
  worldId: string;
  title: string;
  date: string;
  description: string;
  imageUrl: string | null;
  targetGroup: string | null;
  groupOnly: boolean;
  confirmable: boolean;
  confirmedBy: EventConfirmation[];
  comments: EventComment[];
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 1.2: Rozšířit schema o subdokumenty + compound index**

Soubor: `backend/src/modules/game-events/schemas/game-event.schema.ts`

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GameEventDocument = HydratedDocument<GameEventSchemaClass>;

@Schema({ _id: false })
export class EventConfirmationSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) userName: string;
}
export const EventConfirmationSchema = SchemaFactory.createForClass(EventConfirmationSchemaClass);

@Schema({ _id: false })
export class EventCommentSchemaClass {
  @Prop({ required: true }) id: string;
  @Prop({ default: null, type: String }) parentId: string | null;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true, default: '' }) content: string;
  @Prop({ required: true }) createdAt: Date;
  @Prop({ default: null, type: Date }) editedAt: Date | null;
  @Prop({ type: Object, default: {} }) reactions: Record<string, string[]>;
  @Prop({ default: false }) isDeleted: boolean;
}
export const EventCommentSchema = SchemaFactory.createForClass(EventCommentSchemaClass);

@Schema({ timestamps: true, collection: 'game_events' })
export class GameEventSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true, index: true }) date: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: null, type: String }) imageUrl: string | null;
  @Prop({ default: null, type: String }) targetGroup: string | null;
  @Prop({ default: false }) groupOnly: boolean;
  @Prop({ default: false }) confirmable: boolean;
  @Prop({ type: [EventConfirmationSchema], default: [] }) confirmedBy: EventConfirmationSchemaClass[];
  @Prop({ type: [EventCommentSchema], default: [] }) comments: EventCommentSchemaClass[];
  @Prop({ default: false }) reminderSent: boolean;
}

export const GameEventSchema = SchemaFactory.createForClass(GameEventSchemaClass);
GameEventSchema.index({ worldId: 1, date: 1 });
```

- [ ] **Step 1.3: Build kontrola**

Run: `cd backend && npm run build`
Expected: clean build, žádné TS chyby

- [ ] **Step 1.4: Commit**

```bash
git add backend/src/modules/game-events/schemas/game-event.schema.ts backend/src/modules/game-events/interfaces/game-event.interface.ts
git commit -m "feat(game-events): rozšířit schema o subdokumenty + compound index"
```

---

## Task 2: Repository rozšíření — interface + implementace

**Files:**
- Modify: `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts`
- Modify: `backend/src/modules/game-events/repositories/game-event.repository.ts`

- [ ] **Step 2.1: Rozšířit repository interface**

Soubor: `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts`

```ts
import type { GameEvent } from './game-event.interface';

export interface ListFilters {
  worldId: string;
  limit?: number;
  fromDate?: string;
}

export interface IGameEventRepository {
  findById(id: string): Promise<GameEvent | null>;
  findList(filters: ListFilters): Promise<GameEvent[]>;
  create(data: Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameEvent>;
  update(id: string, data: Partial<Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>>): Promise<GameEvent | null>;
  delete(id: string): Promise<boolean>;

  findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]>;
  markReminderSent(id: string): Promise<void>;
  deleteOlderThan(before: Date): Promise<number>;
}
```

- [ ] **Step 2.2: Rozšířit Mongo repository**

Soubor: `backend/src/modules/game-events/repositories/game-event.repository.ts`

```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameEventSchemaClass } from '../schemas/game-event.schema';
import type { GameEvent } from '../interfaces/game-event.interface';
import type { IGameEventRepository, ListFilters } from '../interfaces/game-event-repository.interface';

@Injectable()
export class MongoGameEventRepository implements IGameEventRepository {
  constructor(
    @InjectModel(GameEventSchemaClass.name)
    private readonly model: Model<GameEventSchemaClass>,
  ) {}

  async findById(id: string): Promise<GameEvent | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findList(filters: ListFilters): Promise<GameEvent[]> {
    const query: Record<string, unknown> = { worldId: filters.worldId };
    if (filters.fromDate) query.date = { $gte: filters.fromDate };
    const cursor = this.model.find(query).sort({ date: 1 });
    if (filters.limit && filters.limit > 0) cursor.limit(filters.limit);
    const docs = await cursor.lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async create(data: Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameEvent> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>>): Promise<GameEvent | null> {
    const doc = await this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]> {
    const from = fromDate.toISOString();
    const to = toDate.toISOString();
    const docs = await this.model
      .find({ date: { $gte: from, $lte: to }, reminderSent: false })
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async markReminderSent(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { $set: { reminderSent: true } }).exec();
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const result = await this.model
      .deleteMany({ date: { $lt: before.toISOString() } })
      .exec();
    return result.deletedCount ?? 0;
  }

  private toEntity(doc: Record<string, unknown>): GameEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      title: doc.title as string,
      date: doc.date as string,
      description: (doc.description as string) ?? '',
      imageUrl: (doc.imageUrl as string | null) ?? null,
      targetGroup: (doc.targetGroup as string | null) ?? null,
      groupOnly: (doc.groupOnly as boolean) ?? false,
      confirmable: (doc.confirmable as boolean) ?? false,
      confirmedBy: (doc.confirmedBy as Array<{ userId: string; userName: string }>) ?? [],
      comments: (doc.comments as GameEvent['comments']) ?? [],
      reminderSent: (doc.reminderSent as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 2.3: Build kontrola**

Run: `cd backend && npm run build`
Expected: clean build

- [ ] **Step 2.4: Commit**

```bash
git add backend/src/modules/game-events/interfaces/game-event-repository.interface.ts backend/src/modules/game-events/repositories/game-event.repository.ts
git commit -m "feat(game-events): repository CRUD + list filters"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/game-events/dto/create-game-event.dto.ts`
- Create: `backend/src/modules/game-events/dto/update-game-event.dto.ts`
- Create: `backend/src/modules/game-events/dto/create-comment.dto.ts`
- Create: `backend/src/modules/game-events/dto/update-comment.dto.ts`
- Create: `backend/src/modules/game-events/dto/react-comment.dto.ts`

- [ ] **Step 3.1: `create-game-event.dto.ts`**

```ts
import { IsString, IsOptional, IsBoolean, MaxLength, MinLength, Matches } from 'class-validator';

export class CreateGameEventDto {
  @IsString() @MinLength(1) @MaxLength(64)
  worldId!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, { message: 'date musí být ISO 8601 (YYYY-MM-DDTHH:mm...)' })
  date!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(2048) @Matches(/^(https?:\/\/|\/)/, { message: 'imageUrl musí být absolutní URL nebo cesta začínající /' })
  imageUrl?: string | null;

  @IsOptional() @IsString() @MaxLength(64)
  targetGroup?: string | null;

  @IsOptional() @IsBoolean()
  groupOnly?: boolean;

  @IsOptional() @IsBoolean()
  confirmable?: boolean;
}
```

- [ ] **Step 3.2: `update-game-event.dto.ts`**

```ts
import { IsString, IsOptional, IsBoolean, MaxLength, MinLength, Matches, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EventConfirmationDto {
  @IsString() @MaxLength(64)
  userId!: string;

  @IsString() @MaxLength(128)
  userName!: string;
}

export class UpdateGameEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, { message: 'date musí být ISO 8601' })
  date?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(2048) @Matches(/^(https?:\/\/|\/)/, { message: 'imageUrl musí být absolutní URL nebo cesta začínající /' })
  imageUrl?: string | null;

  @IsOptional() @IsString() @MaxLength(64)
  targetGroup?: string | null;

  @IsOptional() @IsBoolean()
  groupOnly?: boolean;

  @IsOptional() @IsBoolean()
  confirmable?: boolean;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EventConfirmationDto)
  confirmedBy?: EventConfirmationDto[] | null;
}
```

Poznámka: `comments` v UpdateDto **záměrně chybí** — komentáře se nesmí editovat hromadně přes PUT (jen přes `/comments` endpointy). Při příchozím `comments` se ignoruje (whitelist Pipe ho ořízne).

- [ ] **Step 3.3: `create-comment.dto.ts`**

```ts
import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  content!: string;

  @IsOptional() @IsString() @MaxLength(64)
  parentId?: string;
}
```

- [ ] **Step 3.4: `update-comment.dto.ts`**

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCommentDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  content!: string;
}
```

- [ ] **Step 3.5: `react-comment.dto.ts`**

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReactCommentDto {
  @IsString() @MinLength(1) @MaxLength(16)
  emoji!: string;
}
```

- [ ] **Step 3.6: Build kontrola**

Run: `cd backend && npm run build`
Expected: clean build

- [ ] **Step 3.7: Commit**

```bash
git add backend/src/modules/game-events/dto
git commit -m "feat(game-events): DTOs s class-validator pravidly"
```

---

## Task 4: Service skeleton + permission/visibility helpery (TDD)

**Files:**
- Create: `backend/src/modules/game-events/game-events.service.ts`
- Create: `backend/src/modules/game-events/game-events.service.spec.ts`

Tato úloha zavádí service prázdnou + private helpery `canManage`, `canView`, `assertView`, `assertManage`. Žádné CRUD ještě.

- [ ] **Step 4.1: Failing test pro `canManage` / `canView`**

Soubor: `backend/src/modules/game-events/game-events.service.spec.ts`

```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { GameEventsService } from './game-events.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';

const mockPJUser = { id: 'pj1', role: UserRole.PJ, username: 'pj' };
const mockHracUser = { id: 'h1', role: UserRole.Hrac, username: 'hrac' };
const mockAdminUser = { id: 'a1', role: UserRole.Admin, username: 'admin' };

const mockPJMembership = { id: 'm1', userId: 'pj1', worldId: 'w1', role: WorldRole.PJ, joinedAt: new Date(), akj: 0 };
const mockHracMembership = { id: 'm2', userId: 'h1', worldId: 'w1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0, group: 'mages' };
const mockHracOtherGroup = { id: 'm3', userId: 'h2', worldId: 'w1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0, group: 'rogues' };

const baseEvent = {
  id: 'e1', worldId: 'w1', title: 'Test', date: '2026-06-01T18:00',
  description: '', imageUrl: null, targetGroup: null, groupOnly: false,
  confirmable: false, confirmedBy: [], comments: [], reminderSent: false,
  createdAt: new Date(), updatedAt: new Date(),
};

// Flush microtasks + tick — protože create() spouští notifyOnCreate jako void fire-and-forget,
// po awaitu service.create musíme propláchnout event loop, aby se push mock skutečně volal.
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('GameEventsService', () => {
  let service: GameEventsService;
  const mockRepo = {
    findById: jest.fn(), findList: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    findUpcoming: jest.fn(), markReminderSent: jest.fn(), deleteOlderThan: jest.fn(),
  };
  const mockMembershipRepo = {
    findById: jest.fn(), findByUserAndWorld: jest.fn(), findByWorldId: jest.fn(),
    findByUserId: jest.fn(), countByWorldId: jest.fn(),
    save: jest.fn(), update: jest.fn(), delete: jest.fn(),
  };
  const mockWorldsRepo = { findById: jest.fn() };
  const mockPushService = { notifyUsers: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GameEventsService,
        { provide: 'IGameEventRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
        { provide: PushService, useValue: mockPushService },
      ],
    }).compile();
    service = moduleRef.get(GameEventsService);
    jest.clearAllMocks();
  });

  describe('viditelnost', () => {
    it('člen světa vidí ne-groupOnly event', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.findById.mockResolvedValue(baseEvent);
      const result = await service.findById('e1', mockHracUser);
      expect(result.id).toBe('e1');
    });

    it('ne-člen skupiny dostane 404 na groupOnly event', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracOtherGroup);
      mockRepo.findById.mockResolvedValue({ ...baseEvent, targetGroup: 'mages', groupOnly: true });
      await expect(service.findById('e1', { id: 'h2', role: UserRole.Hrac, username: 'h2' })).rejects.toThrow(NotFoundException);
    });

    it('PJ vidí groupOnly event i mimo skupinu', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.findById.mockResolvedValue({ ...baseEvent, targetGroup: 'mages', groupOnly: true });
      const result = await service.findById('e1', mockPJUser);
      expect(result.id).toBe('e1');
    });

    it('Admin vidí groupOnly event bez ohledu na membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue({ ...baseEvent, targetGroup: 'mages', groupOnly: true });
      const result = await service.findById('e1', mockAdminUser);
      expect(result.id).toBe('e1');
    });

    it('non-member dostane 404', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(baseEvent);
      await expect(service.findById('e1', mockHracUser)).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 4.2: Spustit test — must FAIL (service neexistuje)**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: FAIL — `Cannot find module './game-events.service'`

- [ ] **Step 4.3: Vytvořit service skeleton**

Soubor: `backend/src/modules/game-events/game-events.service.ts`

```ts
import {
  Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import type { GameEvent } from './interfaces/game-event.interface';
import type { RequestUser } from '../worlds/worlds.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole, type WorldMembership } from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';

@Injectable()
export class GameEventsService {
  private readonly logger = new Logger(GameEventsService.name);

  constructor(
    @Inject('IGameEventRepository') private readonly repo: IGameEventRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
    private readonly pushService: PushService,
  ) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private isGlobalAdmin(user: RequestUser): boolean {
    return user.role <= UserRole.Admin; // Superadmin=1, Admin=2
  }

  private async getMembership(userId: string, worldId: string): Promise<WorldMembership | null> {
    return this.membershipRepo.findByUserAndWorld(userId, worldId);
  }

  /** Kdo smí mutovat event (POST/PUT/DELETE) — Admin/Superadmin globálně, jinak PJ/PomocnýPJ světa */
  private async canManage(user: RequestUser, worldId: string): Promise<boolean> {
    if (this.isGlobalAdmin(user)) return true;
    const m = await this.getMembership(user.id, worldId);
    if (!m) return false;
    return m.role >= WorldRole.PomocnyPJ;
  }

  /** Kdo vidí event (GET, comment, RSVP) — respektuje groupOnly */
  private async canView(user: RequestUser, event: GameEvent): Promise<boolean> {
    if (this.isGlobalAdmin(user)) return true;
    const m = await this.getMembership(user.id, event.worldId);
    if (!m || m.role === WorldRole.Pending) return false;
    if (!event.groupOnly) return true;
    // groupOnly: true → musí být PJ/PomocnýPJ světa NEBO mít stejnou group jako event.targetGroup
    if (m.role >= WorldRole.PomocnyPJ) return true;
    return event.targetGroup !== null && m.group === event.targetGroup;
  }

  private async assertManage(user: RequestUser, worldId: string): Promise<void> {
    if (!(await this.canManage(user, worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
  }

  private async assertViewOrThrow(user: RequestUser, event: GameEvent): Promise<void> {
    if (!(await this.canView(user, event))) {
      throw new NotFoundException('Event nenalezen');
    }
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findById(id: string, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException('Event nenalezen');
    await this.assertViewOrThrow(user, event);
    return event;
  }
}
```

- [ ] **Step 4.4: Spustit test — must PASS**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: PASS — všech 5 testů viditelnosti

- [ ] **Step 4.5: Commit**

```bash
git add backend/src/modules/game-events/game-events.service.ts backend/src/modules/game-events/game-events.service.spec.ts
git commit -m "feat(game-events): service skeleton s viditelnost helpery + testy"
```

---

## Task 5: `findList` s viditelnostním filterem (TDD)

**Files:**
- Modify: `backend/src/modules/game-events/game-events.service.ts`
- Modify: `backend/src/modules/game-events/game-events.service.spec.ts`

- [ ] **Step 5.1: Failing testy pro `findList`**

Přidej do `describe('GameEventsService', () => { ... })` nový blok:

```ts
  describe('findList', () => {
    const eventPublic = { ...baseEvent, id: 'e1' };
    const eventGroupOnly = { ...baseEvent, id: 'e2', targetGroup: 'mages', groupOnly: true };
    const eventTargetButNotOnly = { ...baseEvent, id: 'e3', targetGroup: 'mages', groupOnly: false };

    it('člen skupiny vidí všechny tři eventy', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership); // group: mages
      mockRepo.findList.mockResolvedValue([eventPublic, eventGroupOnly, eventTargetButNotOnly]);
      const result = await service.findList({ worldId: 'w1' }, mockHracUser);
      expect(result.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    });

    it('ne-člen skupiny vidí jen ne-groupOnly eventy', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracOtherGroup); // group: rogues
      mockRepo.findList.mockResolvedValue([eventPublic, eventGroupOnly, eventTargetButNotOnly]);
      const result = await service.findList({ worldId: 'w1' }, { id: 'h2', role: UserRole.Hrac, username: 'h2' });
      expect(result.map((e) => e.id)).toEqual(['e1', 'e3']);
    });

    it('non-member dostane prázdný list', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findList.mockResolvedValue([eventPublic]);
      const result = await service.findList({ worldId: 'w1' }, mockHracUser);
      expect(result).toEqual([]);
    });

    it('Admin vidí všechny bez ohledu na membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.findList.mockResolvedValue([eventPublic, eventGroupOnly]);
      const result = await service.findList({ worldId: 'w1' }, mockAdminUser);
      expect(result.map((e) => e.id)).toEqual(['e1', 'e2']);
    });

    it('limit cap na 500', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.findList.mockResolvedValue([]);
      await service.findList({ worldId: 'w1', limit: 9999 }, mockHracUser);
      expect(mockRepo.findList).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
    });
  });
```

- [ ] **Step 5.2: Spustit testy — must FAIL**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: FAIL — `service.findList is not a function`

- [ ] **Step 5.3: Implementovat `findList`**

Přidej do `GameEventsService`:

```ts
  async findList(
    filters: { worldId: string; limit?: number; fromDate?: string },
    user: RequestUser,
  ): Promise<GameEvent[]> {
    const cappedLimit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 500) : 100;
    const events = await this.repo.findList({
      worldId: filters.worldId,
      limit: cappedLimit,
      fromDate: filters.fromDate,
    });

    if (this.isGlobalAdmin(user)) return events;
    const membership = await this.getMembership(user.id, filters.worldId);
    if (!membership || membership.role === WorldRole.Pending) return [];

    return events.filter((e) => {
      if (!e.groupOnly) return true;
      if (membership.role >= WorldRole.PomocnyPJ) return true;
      return e.targetGroup !== null && membership.group === e.targetGroup;
    });
  }
```

- [ ] **Step 5.4: Spustit testy — must PASS**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: PASS — 9 testů celkem

- [ ] **Step 5.5: Commit**

```bash
git add backend/src/modules/game-events/game-events.service.ts backend/src/modules/game-events/game-events.service.spec.ts
git commit -m "feat(game-events): findList s viditelnostním filterem"
```

---

## Task 6: `create` event + push notifikace (TDD)

**Files:**
- Modify: `backend/src/modules/game-events/game-events.service.ts`
- Modify: `backend/src/modules/game-events/game-events.service.spec.ts`

- [ ] **Step 6.1: Failing testy pro `create`**

Přidej do spec:

```ts
  describe('create', () => {
    const validInput = { worldId: 'w1', title: 'Test akce', date: '2026-06-01T18:00', description: 'Popis' };
    const mockWorld = { id: 'w1', name: 'Tamriel' };
    const created = { ...baseEvent, id: 'e1', title: 'Test akce' };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockRepo.create.mockResolvedValue(created);
    });

    it('PJ vytvoří event', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership, mockHracMembership]);
      const result = await service.create(validInput, mockPJUser);
      expect(result.id).toBe('e1');
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Hráč nemůže (403)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.create(validInput, mockHracUser)).rejects.toThrow(ForbiddenException);
    });

    it('groupOnly: true && targetGroup: null → 400', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      await expect(
        service.create({ ...validInput, groupOnly: true }, mockPJUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('push se pošle všem aktivním členům světa (ne-groupOnly)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership, mockHracMembership]);
      await service.create(validInput, mockPJUser);
      await flush();
      expect(mockPushService.notifyUsers).toHaveBeenCalledWith(
        expect.arrayContaining(['pj1', 'h1']),
        expect.objectContaining({ title: expect.stringContaining('Tamriel'), body: 'Test akce' }),
      );
    });

    it('push při groupOnly jde jen členům targetGroup + PJ/PomocnýPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership, mockHracMembership, mockHracOtherGroup]);
      mockRepo.create.mockResolvedValue({ ...created, targetGroup: 'mages', groupOnly: true });
      await service.create({ ...validInput, targetGroup: 'mages', groupOnly: true }, mockPJUser);
      await flush();
      const recipients: string[] = mockPushService.notifyUsers.mock.calls[0][0];
      expect(recipients).toContain('pj1'); // PJ — bypass
      expect(recipients).toContain('h1');  // Hrac group=mages
      expect(recipients).not.toContain('h2'); // Hrac group=rogues
    });

    it('push selhání nesmí shodit POST', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership]);
      mockPushService.notifyUsers.mockRejectedValueOnce(new Error('boom'));
      const result = await service.create(validInput, mockPJUser);
      await flush();
      expect(result.id).toBe('e1');
    });

    it('Pending členové push nedostanou', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      const pending = { ...mockHracMembership, userId: 'pending1', role: WorldRole.Pending };
      mockMembershipRepo.findByWorldId.mockResolvedValue([mockPJMembership, mockHracMembership, pending]);
      await service.create(validInput, mockPJUser);
      await flush();
      const recipients: string[] = mockPushService.notifyUsers.mock.calls[0][0];
      expect(recipients).not.toContain('pending1');
    });

    it('Admin může vytvořit i bez membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockMembershipRepo.findByWorldId.mockResolvedValue([]);
      const result = await service.create(validInput, mockAdminUser);
      expect(result.id).toBe('e1');
    });
  });
```

- [ ] **Step 6.2: Spustit testy — must FAIL**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: FAIL — `service.create is not a function`

- [ ] **Step 6.3: Implementovat `create`**

Přidej importy DTO + WorldMembership type do service souboru:

```ts
import type { CreateGameEventDto } from './dto/create-game-event.dto';
```

Přidej metody do `GameEventsService`:

```ts
  async create(dto: CreateGameEventDto, user: RequestUser): Promise<GameEvent> {
    await this.assertManage(user, dto.worldId);
    if (dto.groupOnly === true && (dto.targetGroup === null || dto.targetGroup === undefined)) {
      throw new BadRequestException('groupOnly vyžaduje targetGroup');
    }

    const event = await this.repo.create({
      worldId: dto.worldId,
      title: dto.title,
      date: dto.date,
      description: dto.description ?? '',
      imageUrl: dto.imageUrl ?? null,
      targetGroup: dto.targetGroup ?? null,
      groupOnly: dto.groupOnly ?? false,
      confirmable: dto.confirmable ?? false,
      confirmedBy: [],
      comments: [],
      reminderSent: false,
    });

    void this.notifyOnCreate(event).catch((err) => {
      this.logger.warn(`Push notify failed for event ${event.id}: ${(err as Error).message}`);
    });

    return event;
  }

  private async notifyOnCreate(event: GameEvent): Promise<void> {
    const world = await this.worldsRepo.findById(event.worldId);
    const worldName = world?.name ?? 'svět';

    const members = await this.membershipRepo.findByWorldId(event.worldId);
    const eligible = members.filter((m) => m.role !== WorldRole.Pending);

    const recipients = event.groupOnly
      ? eligible.filter(
          (m) => m.role >= WorldRole.PomocnyPJ || (event.targetGroup !== null && m.group === event.targetGroup),
        )
      : eligible;

    const userIds = recipients.map((m) => m.userId);
    if (userIds.length === 0) return;

    await this.pushService.notifyUsers(userIds, {
      title: `Nový event ve světě ${worldName}`,
      body: event.title,
    });
  }
```

- [ ] **Step 6.4: Spustit testy — must PASS**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: PASS — 17 testů celkem

Poznámka k async push: `void this.notifyOnCreate(...)` se spustí, ale `await create()` se nevrátí dokud push neproběhne (jest mockuje `notifyUsers` synchronně). V testu na "push selhání" stačí `mockRejectedValueOnce` — `void ... .catch()` to spolkne.

- [ ] **Step 6.5: Commit**

```bash
git add backend/src/modules/game-events/game-events.service.ts backend/src/modules/game-events/game-events.service.spec.ts
git commit -m "feat(game-events): create + push fire-and-forget"
```

---

## Task 7: `update` + `delete` event (TDD)

**Files:**
- Modify: `backend/src/modules/game-events/game-events.service.ts`
- Modify: `backend/src/modules/game-events/game-events.service.spec.ts`

- [ ] **Step 7.1: Failing testy**

```ts
  describe('update', () => {
    it('PJ může editovat', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockResolvedValue({ ...baseEvent, title: 'Změněno' });
      const result = await service.update('e1', { title: 'Změněno' }, mockPJUser);
      expect(result.title).toBe('Změněno');
    });

    it('Hráč nemůže (403)', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.update('e1', { title: 'X' }, mockHracUser)).rejects.toThrow(ForbiddenException);
    });

    it('confirmedBy: null v body nesmaže existující', async () => {
      const eventWithConfirmed = { ...baseEvent, confirmedBy: [{ userId: 'u1', userName: 'U1' }] };
      mockRepo.findById.mockResolvedValue(eventWithConfirmed);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...eventWithConfirmed, ...data }));
      await service.update('e1', { title: 'X', confirmedBy: null }, mockPJUser);
      const updateCall = mockRepo.update.mock.calls[0][1];
      expect(updateCall).not.toHaveProperty('confirmedBy');
    });

    it('confirmedBy: pole hodnoty se zapíše', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockResolvedValue(baseEvent);
      await service.update('e1', { confirmedBy: [{ userId: 'x', userName: 'X' }] }, mockPJUser);
      const updateCall = mockRepo.update.mock.calls[0][1];
      expect(updateCall.confirmedBy).toEqual([{ userId: 'x', userName: 'X' }]);
    });

    it('groupOnly: true && targetGroup: null → 400', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      await expect(
        service.update('e1', { groupOnly: true, targetGroup: null }, mockPJUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('groupOnly: true && existing targetGroup zůstává — OK', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, targetGroup: 'mages' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockResolvedValue({ ...baseEvent, targetGroup: 'mages', groupOnly: true });
      const result = await service.update('e1', { groupOnly: true }, mockPJUser);
      expect(result.groupOnly).toBe(true);
    });

    it('404 při neexistujícím eventu', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.update('e1', { title: 'X' }, mockPJUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('PJ může smazat', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('e1', mockPJUser);
      expect(mockRepo.delete).toHaveBeenCalledWith('e1');
    });

    it('Hráč nemůže (403)', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.delete('e1', mockHracUser)).rejects.toThrow(ForbiddenException);
    });

    it('404 při neexistujícím', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('e1', mockPJUser)).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 7.2: Spustit — must FAIL**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: FAIL na chybějící metody

- [ ] **Step 7.3: Implementovat `update` + `delete`**

Přidej import `UpdateGameEventDto`:

```ts
import type { UpdateGameEventDto } from './dto/update-game-event.dto';
```

Přidej metody do service:

```ts
  async update(id: string, dto: UpdateGameEventDto, user: RequestUser): Promise<GameEvent> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Event nenalezen');
    await this.assertManage(user, existing.worldId);

    // Spojit incoming hodnoty s existingem pro validaci groupOnly+targetGroup
    const finalGroupOnly = dto.groupOnly ?? existing.groupOnly;
    const finalTargetGroup = dto.targetGroup !== undefined ? dto.targetGroup : existing.targetGroup;
    if (finalGroupOnly === true && (finalTargetGroup === null || finalTargetGroup === undefined)) {
      throw new BadRequestException('groupOnly vyžaduje targetGroup');
    }

    // Zachovat confirmedBy pokud klient pošle null/undefined; comments vždy přeskakujeme (mutace přes /comments)
    const patch: Partial<GameEvent> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.date !== undefined) patch.date = dto.date;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.imageUrl !== undefined) patch.imageUrl = dto.imageUrl;
    if (dto.targetGroup !== undefined) patch.targetGroup = dto.targetGroup;
    if (dto.groupOnly !== undefined) patch.groupOnly = dto.groupOnly;
    if (dto.confirmable !== undefined) patch.confirmable = dto.confirmable;
    if (Array.isArray(dto.confirmedBy)) patch.confirmedBy = dto.confirmedBy;

    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFoundException('Event nenalezen');
    return updated;
  }

  async delete(id: string, user: RequestUser): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Event nenalezen');
    await this.assertManage(user, existing.worldId);
    await this.repo.delete(id);
  }
```

- [ ] **Step 7.4: Spustit — must PASS**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: PASS — 27 testů celkem

- [ ] **Step 7.5: Commit**

```bash
git add backend/src/modules/game-events/game-events.service.ts backend/src/modules/game-events/game-events.service.spec.ts
git commit -m "feat(game-events): update + delete s zachováním confirmedBy"
```

---

## Task 8: RSVP `confirm` toggle (TDD)

**Files:**
- Modify: `backend/src/modules/game-events/game-events.service.ts`
- Modify: `backend/src/modules/game-events/game-events.service.spec.ts`

- [ ] **Step 8.1: Failing testy**

```ts
  describe('confirm', () => {
    const confirmableEvent = { ...baseEvent, confirmable: true };

    it('toggle ADD pro confirmable event', async () => {
      mockRepo.findById.mockResolvedValue({ ...confirmableEvent, confirmedBy: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...confirmableEvent, ...data }));
      const result = await service.confirm('e1', mockHracUser);
      expect(result.confirmedBy).toEqual([{ userId: 'h1', userName: 'hrac' }]);
    });

    it('toggle REMOVE odebere existující', async () => {
      mockRepo.findById.mockResolvedValue({ ...confirmableEvent, confirmedBy: [{ userId: 'h1', userName: 'hrac' }] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...confirmableEvent, ...data }));
      const result = await service.confirm('e1', mockHracUser);
      expect(result.confirmedBy).toEqual([]);
    });

    it('confirmable: false → 400', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.confirm('e1', mockHracUser)).rejects.toThrow(BadRequestException);
    });

    it('non-member dostane 404 (nevidí event)', async () => {
      mockRepo.findById.mockResolvedValue(confirmableEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.confirm('e1', mockHracUser)).rejects.toThrow(NotFoundException);
    });

    it('groupOnly bez membership v group → 404', async () => {
      mockRepo.findById.mockResolvedValue({ ...confirmableEvent, targetGroup: 'mages', groupOnly: true });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracOtherGroup);
      await expect(service.confirm('e1', { id: 'h2', role: UserRole.Hrac, username: 'h2' })).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 8.2: Spustit — must FAIL**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: FAIL

- [ ] **Step 8.3: Implementovat `confirm`**

Přidej do service:

```ts
  async confirm(eventId: string, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundException('Event nenalezen');
    await this.assertViewOrThrow(user, event);
    if (!event.confirmable) {
      throw new BadRequestException('Tato akce nepodporuje potvrzení účasti');
    }

    const idx = event.confirmedBy.findIndex((c) => c.userId === user.id);
    const next = idx >= 0
      ? event.confirmedBy.filter((_, i) => i !== idx)
      : [...event.confirmedBy, { userId: user.id, userName: user.username }];

    const updated = await this.repo.update(eventId, { confirmedBy: next });
    if (!updated) throw new NotFoundException('Event nenalezen');
    return updated;
  }
```

- [ ] **Step 8.4: Spustit — must PASS**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: PASS — 32 testů

- [ ] **Step 8.5: Commit**

```bash
git add backend/src/modules/game-events/game-events.service.ts backend/src/modules/game-events/game-events.service.spec.ts
git commit -m "feat(game-events): RSVP confirm toggle"
```

---

## Task 9: Komentáře — add / edit / delete (TDD)

**Files:**
- Modify: `backend/src/modules/game-events/game-events.service.ts`
- Modify: `backend/src/modules/game-events/game-events.service.spec.ts`

- [ ] **Step 9.1: Failing testy**

```ts
  describe('comments — add', () => {
    it('člen přidá root komentář', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.addComment('e1', { content: 'Ahoj' }, mockHracUser);
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toMatchObject({
        content: 'Ahoj', authorId: 'h1', authorName: 'hrac', parentId: null, isDeleted: false,
      });
      expect(result.comments[0].id).toMatch(/^[0-9a-f-]+$/);
    });

    it('reply na root komentář OK', async () => {
      const root = { id: 'c1', parentId: null, authorId: 'pj1', authorName: 'pj', content: 'Root',
        createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [root] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.addComment('e1', { content: 'Reply', parentId: 'c1' }, mockHracUser);
      expect(result.comments).toHaveLength(2);
      expect(result.comments[1].parentId).toBe('c1');
    });

    it('reply na non-root (parentId má vlastní parentId) → 400', async () => {
      const root = { id: 'c1', parentId: null, authorId: 'pj1', authorName: 'pj', content: 'R',
        createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      const reply = { id: 'c2', parentId: 'c1', authorId: 'h1', authorName: 'hrac', content: 'X',
        createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [root, reply] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(
        service.addComment('e1', { content: 'X', parentId: 'c2' }, mockHracUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('reply na neexistující parent → 400', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(
        service.addComment('e1', { content: 'X', parentId: 'ghost' }, mockHracUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('non-member dostane 404 (nevidí event)', async () => {
      mockRepo.findById.mockResolvedValue(baseEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.addComment('e1', { content: 'X' }, mockHracUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('comments — edit', () => {
    const myComment = { id: 'c1', parentId: null, authorId: 'h1', authorName: 'hrac', content: 'Old',
      createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };

    it('vlastník edituje', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [myComment] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.editComment('e1', 'c1', { content: 'New' }, mockHracUser);
      expect(result.comments[0].content).toBe('New');
      expect(result.comments[0].editedAt).not.toBeNull();
    });

    it('cizí komentář → 403', async () => {
      const other = { ...myComment, authorId: 'someone' };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [other] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.editComment('e1', 'c1', { content: 'X' }, mockHracUser)).rejects.toThrow(ForbiddenException);
    });

    it('smazaný komentář → 400', async () => {
      const deleted = { ...myComment, isDeleted: true, content: '' };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [deleted] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.editComment('e1', 'c1', { content: 'X' }, mockHracUser)).rejects.toThrow(BadRequestException);
    });

    it('neexistující → 404', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.editComment('e1', 'ghost', { content: 'X' }, mockHracUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('comments — delete (soft)', () => {
    const myComment = { id: 'c1', parentId: null, authorId: 'h1', authorName: 'hrac', content: 'Old',
      createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
    const otherComment = { ...myComment, authorId: 'someone', authorName: 'X' };

    it('vlastník soft-delete', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [myComment] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.deleteComment('e1', 'c1', mockHracUser);
      expect(result.comments[0].isDeleted).toBe(true);
      expect(result.comments[0].content).toBe('');
      expect(result.comments[0].authorName).toBe('hrac');
    });

    it('cizí jako Hráč → 403', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [otherComment] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.deleteComment('e1', 'c1', mockHracUser)).rejects.toThrow(ForbiddenException);
    });

    it('cizí jako PJ → OK', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [otherComment] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.deleteComment('e1', 'c1', mockPJUser);
      expect(result.comments[0].isDeleted).toBe(true);
    });

    it('cizí jako globální Admin → OK', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [otherComment] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.deleteComment('e1', 'c1', mockAdminUser);
      expect(result.comments[0].isDeleted).toBe(true);
    });

    it('idempotent — smazání už smazaného nezmění nic', async () => {
      const already = { ...myComment, isDeleted: true, content: '' };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [already] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.deleteComment('e1', 'c1', mockHracUser);
      expect(result.comments[0].isDeleted).toBe(true);
    });
  });
```

- [ ] **Step 9.2: Spustit — must FAIL**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: FAIL

- [ ] **Step 9.3: Implementovat metody**

Přidej importy DTO:

```ts
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';
import { randomUUID } from 'node:crypto';
```

Přidej metody do service:

```ts
  async addComment(eventId: string, dto: CreateCommentDto, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundException('Event nenalezen');
    await this.assertViewOrThrow(user, event);

    if (dto.parentId) {
      const parent = event.comments.find((c) => c.id === dto.parentId);
      if (!parent) throw new BadRequestException('parentId neexistuje v tomto eventu');
      if (parent.parentId !== null) throw new BadRequestException('parentId musí ukazovat na root komentář');
    }

    const newComment = {
      id: randomUUID(),
      parentId: dto.parentId ?? null,
      authorId: user.id,
      authorName: user.username,
      content: dto.content,
      createdAt: new Date(),
      editedAt: null,
      reactions: {},
      isDeleted: false,
    };

    const updated = await this.repo.update(eventId, { comments: [...event.comments, newComment] });
    if (!updated) throw new NotFoundException('Event nenalezen');
    return updated;
  }

  async editComment(eventId: string, commentId: string, dto: UpdateCommentDto, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundException('Event nenalezen');
    await this.assertViewOrThrow(user, event);

    const idx = event.comments.findIndex((c) => c.id === commentId);
    if (idx < 0) throw new NotFoundException('Komentář nenalezen');
    const target = event.comments[idx];
    if (target.isDeleted) throw new BadRequestException('Smazaný komentář nelze editovat');
    if (target.authorId !== user.id) throw new ForbiddenException('Nelze editovat cizí komentář');

    const newComments = event.comments.slice();
    newComments[idx] = { ...target, content: dto.content, editedAt: new Date() };

    const updated = await this.repo.update(eventId, { comments: newComments });
    if (!updated) throw new NotFoundException('Event nenalezen');
    return updated;
  }

  async deleteComment(eventId: string, commentId: string, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundException('Event nenalezen');
    await this.assertViewOrThrow(user, event);

    const idx = event.comments.findIndex((c) => c.id === commentId);
    if (idx < 0) throw new NotFoundException('Komentář nenalezen');
    const target = event.comments[idx];

    const isOwner = target.authorId === user.id;
    const canMod = await this.canManage(user, event.worldId);
    if (!isOwner && !canMod) throw new ForbiddenException('Nelze smazat cizí komentář');

    const newComments = event.comments.slice();
    newComments[idx] = { ...target, isDeleted: true, content: '' };

    const updated = await this.repo.update(eventId, { comments: newComments });
    if (!updated) throw new NotFoundException('Event nenalezen');
    return updated;
  }
```

- [ ] **Step 9.4: Spustit — must PASS**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: PASS — 46 testů

- [ ] **Step 9.5: Commit**

```bash
git add backend/src/modules/game-events/game-events.service.ts backend/src/modules/game-events/game-events.service.spec.ts
git commit -m "feat(game-events): comments — add/edit/delete (1-level threading)"
```

---

## Task 10: Reakce na komentář (TDD)

**Files:**
- Modify: `backend/src/modules/game-events/game-events.service.ts`
- Modify: `backend/src/modules/game-events/game-events.service.spec.ts`

- [ ] **Step 10.1: Failing testy**

```ts
  describe('comments — reactions', () => {
    const myComment = { id: 'c1', parentId: null, authorId: 'pj1', authorName: 'pj', content: 'X',
      createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };

    it('toggle ADD reakce', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [myComment] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.reactToComment('e1', 'c1', { emoji: '👍' }, mockHracUser);
      expect(result.comments[0].reactions).toEqual({ '👍': ['h1'] });
    });

    it('toggle REMOVE reakce', async () => {
      const withReact = { ...myComment, reactions: { '👍': ['h1'] } };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [withReact] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.reactToComment('e1', 'c1', { emoji: '👍' }, mockHracUser);
      expect(result.comments[0].reactions['👍']).toBeUndefined();
    });

    it('REMOVE poslední reakce smaže klíč emoji', async () => {
      const withReact = { ...myComment, reactions: { '👍': ['h1'], '❤️': ['pj1'] } };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [withReact] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      mockRepo.update.mockImplementation((_id, data) => Promise.resolve({ ...baseEvent, ...data }));
      const result = await service.reactToComment('e1', 'c1', { emoji: '👍' }, mockHracUser);
      expect(result.comments[0].reactions).toEqual({ '❤️': ['pj1'] });
    });

    it('reakce na smazaný komentář → 200 bez efektu', async () => {
      const deleted = { ...myComment, isDeleted: true, content: '' };
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [deleted] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      const result = await service.reactToComment('e1', 'c1', { emoji: '👍' }, mockHracUser);
      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(result.comments[0].reactions).toEqual({});
    });

    it('non-member dostane 404', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [myComment] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.reactToComment('e1', 'c1', { emoji: '👍' }, mockHracUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('neexistující komentář → 404', async () => {
      mockRepo.findById.mockResolvedValue({ ...baseEvent, comments: [] });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(
        service.reactToComment('e1', 'ghost', { emoji: '👍' }, mockHracUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 10.2: Spustit — must FAIL**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: FAIL

- [ ] **Step 10.3: Implementovat `reactToComment`**

Přidej import:

```ts
import type { ReactCommentDto } from './dto/react-comment.dto';
```

Přidej metodu:

```ts
  async reactToComment(eventId: string, commentId: string, dto: ReactCommentDto, user: RequestUser): Promise<GameEvent> {
    const event = await this.repo.findById(eventId);
    if (!event) throw new NotFoundException('Event nenalezen');
    await this.assertViewOrThrow(user, event);

    const idx = event.comments.findIndex((c) => c.id === commentId);
    if (idx < 0) throw new NotFoundException('Komentář nenalezen');
    const target = event.comments[idx];

    // Reakce na smazaný komentář se tiše ignoruje
    if (target.isDeleted) return event;

    const reactions: Record<string, string[]> = { ...target.reactions };
    const userIds = reactions[dto.emoji] ?? [];
    const userIdx = userIds.indexOf(user.id);
    if (userIdx >= 0) {
      const next = userIds.filter((_, i) => i !== userIdx);
      if (next.length === 0) delete reactions[dto.emoji];
      else reactions[dto.emoji] = next;
    } else {
      reactions[dto.emoji] = [...userIds, user.id];
    }

    const newComments = event.comments.slice();
    newComments[idx] = { ...target, reactions };

    const updated = await this.repo.update(eventId, { comments: newComments });
    if (!updated) throw new NotFoundException('Event nenalezen');
    return updated;
  }
```

- [ ] **Step 10.4: Spustit — must PASS**

Run: `cd backend && npx jest game-events.service.spec --no-coverage`
Expected: PASS — 52 testů

- [ ] **Step 10.5: Commit**

```bash
git add backend/src/modules/game-events/game-events.service.ts backend/src/modules/game-events/game-events.service.spec.ts
git commit -m "feat(game-events): comment reakce (toggle, ignore na deleted)"
```

---

## Task 11: Controller + module wiring

**Files:**
- Create: `backend/src/modules/game-events/game-events.controller.ts`
- Modify: `backend/src/modules/game-events/game-events.module.ts`

- [ ] **Step 11.1: Vytvořit controller**

Soubor: `backend/src/modules/game-events/game-events.controller.ts`

```ts
import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GameEventsService } from './game-events.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { CreateGameEventDto } from './dto/create-game-event.dto';
import { UpdateGameEventDto } from './dto/update-game-event.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ReactCommentDto } from './dto/react-comment.dto';

@ApiTags('GameEvents')
@ApiBearerAuth()
@Controller('game-events')
@UseGuards(JwtAuthGuard)
export class GameEventsController {
  constructor(private readonly service: GameEventsService) {}

  @Get()
  @ApiOperation({ summary: 'Seznam herních eventů světa' })
  @ApiResponse({ status: 200, description: 'OK' })
  list(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId?: string,
    @Query('limit') limit?: string,
    @Query('fromDate') fromDate?: string,
  ) {
    if (!worldId) throw new BadRequestException('worldId query param je povinný');
    return this.service.findList(
      { worldId, limit: limit ? parseInt(limit, 10) : undefined, fromDate },
      user,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail eventu' })
  detail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Vytvoření eventu (PJ/Admin)' })
  @ApiResponse({ status: 201, description: 'Vytvořeno' })
  create(@Body() dto: CreateGameEventDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Editace eventu (PJ/Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateGameEventDto, @CurrentUser() user: RequestUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smazání eventu (PJ/Admin)' })
  delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.delete(id, user);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'RSVP toggle účasti' })
  confirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.confirm(id, user);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Přidat komentář (root nebo reply na root)' })
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.addComment(id, dto, user);
  }

  @Patch(':id/comments/:commentId')
  @ApiOperation({ summary: 'Editovat vlastní komentář' })
  editComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.editComment(id, commentId, dto, user);
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({ summary: 'Soft delete komentáře (vlastní nebo PJ/Admin)' })
  deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.deleteComment(id, commentId, user);
  }

  @Post(':id/comments/:commentId/react')
  @ApiOperation({ summary: 'Toggle reakce na komentář' })
  react(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: ReactCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reactToComment(id, commentId, dto, user);
  }
}
```

- [ ] **Step 11.2: Aktualizovat module**

Soubor: `backend/src/modules/game-events/game-events.module.ts`

```ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameEventSchemaClass, GameEventSchema } from './schemas/game-event.schema';
import { MongoGameEventRepository } from './repositories/game-event.repository';
import { GameEventReminderJob } from './game-event-reminder.job';
import { GameEventCleanupJob } from './game-event-cleanup.job';
import { GameEventsService } from './game-events.service';
import { GameEventsController } from './game-events.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameEventSchemaClass.name, schema: GameEventSchema },
    ]),
    WorldsModule,
  ],
  controllers: [GameEventsController],
  providers: [
    GameEventsService,
    GameEventReminderJob,
    GameEventCleanupJob,
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
  ],
  exports: [GameEventsService],
})
export class GameEventsModule {}
```

- [ ] **Step 11.3: Build**

Run: `cd backend && npm run build`
Expected: clean build

- [ ] **Step 11.4: Spustit celý test suite**

Run: `cd backend && npm test`
Expected: PASS všechny testy (vč. game-events.service.spec)

- [ ] **Step 11.5: Smoke spuštění aplikace**

Run: `cd backend && npm run start:dev` (nech 10 vteřin běžet)
Expected: žádný runtime error, log "Nest application successfully started"
Stop: Ctrl+C

- [ ] **Step 11.6: Commit**

```bash
git add backend/src/modules/game-events/game-events.controller.ts backend/src/modules/game-events/game-events.module.ts
git commit -m "feat(game-events): controller + module wiring"
```

---

## Task 12: Reminder job — `groupOnly` filter + oprava Pending bugu

**Files:**
- Modify: `backend/src/modules/game-events/game-event-reminder.job.ts`

Aktuální kód má dva problémy:
1. Filtr `m.role !== 0 /* WorldRole.Pending */` je špatně — `Pending = -1`, `Hrac = 0` → hráči nedostávají reminder
2. Neaplikuje `groupOnly` filter

- [ ] **Step 12.1: Upravit reminder job**

Soubor: `backend/src/modules/game-events/game-event-reminder.job.ts`

```ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { PushService } from '../push/push.service';

@Injectable()
export class GameEventReminderJob {
  private readonly logger = new Logger(GameEventReminderJob.name);

  constructor(
    @Inject('IGameEventRepository')
    private readonly gameEventRepo: IGameEventRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    private readonly pushService: PushService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<void> {
    const now = new Date();
    const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    let events: Awaited<ReturnType<IGameEventRepository['findUpcoming']>>;
    try {
      events = await this.gameEventRepo.findUpcoming(from, to);
    } catch (err) {
      this.logger.error('GameEventReminderJob: chyba při načítání eventů', err);
      return;
    }

    for (const event of events) {
      try {
        const members = await this.membershipRepo.findByWorldId(event.worldId);
        const eligible = members.filter((m) => m.role !== WorldRole.Pending);

        const recipients = event.groupOnly
          ? eligible.filter(
              (m) =>
                m.role >= WorldRole.PomocnyPJ ||
                (event.targetGroup !== null && m.group === event.targetGroup),
            )
          : eligible;

        const userIds = recipients.map((m) => m.userId);

        if (userIds.length > 0) {
          await this.pushService.notifyUsers(userIds, {
            title: 'Připomínka události',
            body: `${event.title} — začíná za 24 hodin`,
          });
        }

        await this.gameEventRepo.markReminderSent(event.id);
      } catch (err) {
        this.logger.warn(`GameEventReminderJob: chyba pro event ${event.id}`, err);
      }
    }
  }
}
```

- [ ] **Step 12.2: Build**

Run: `cd backend && npm run build`
Expected: clean

- [ ] **Step 12.3: Commit**

```bash
git add backend/src/modules/game-events/game-event-reminder.job.ts
git commit -m "fix(game-events): reminder job — groupOnly filter + správná Pending konstanta

Předchozí kód filtroval m.role !== 0, což ale je Hrac (Pending = -1).
Hráči tak reminder nedostávali. Opraveno na WorldRole.Pending.
Současně přidán groupOnly filter, aby ne-členové cílové skupiny
nedostávali reminder na groupOnly eventy."
```

---

## Task 13: Roadmap update

**Files:**
- Modify: `docs/roadmap2.md`

- [ ] **Step 13.1: Označit fázi 2.1 jako hotovou**

V `docs/roadmap2.md` najdi sekci `### 2.1 GameEvents API (Krok 10a) ⬜` a změň marker `⬜` na `✅`. Doplň poznámku s odkazem na spec a plán:

```markdown
### 2.1 GameEvents API (Krok 10a) ✅
**Hotovo 2026-05-05.** Plný HTTP+service stack: schema + subdokumenty, viditelnostní filter (groupOnly + targetGroup), role gating (PJ/PomocnýPJ + globální Admin/Superadmin), RSVP toggle, 1-úrovňové komentáře s reakcemi, push při create (fire-and-forget). Reminder job opraven (groupOnly filter + Pending konstanta).

Spec: [2026-05-05-game-events-api-design.md](superpowers/specs/2026-05-05-game-events-api-design.md)
Plán: [2026-05-05-game-events-api.md](superpowers/plans/2026-05-05-game-events-api.md)
```

V tabulce "Pořadí prací" změň řádek `| 3 | Fáze 2.1 — GameEvents API | největší díra | 1–2 dny |` na `| ✅ | Fáze 2.1 — GameEvents API | hotovo (2026-05-05) | — |`.

- [ ] **Step 13.2: Commit**

```bash
git add docs/roadmap2.md
git commit -m "docs(roadmap): Fáze 2.1 hotová — GameEvents API"
```

---

## Self-review checklist

Po dokončení všech tasků projeď:

- [ ] Spec coverage — každý endpoint v sekci "API" specu má controller route
- [ ] Spec testy 1-9 jsou pokryty v `game-events.service.spec.ts`
- [ ] `confirmedBy: null` v PUT body skutečně nezapíše prázdné pole (Task 7)
- [ ] `groupOnly: true && targetGroup: null` vrací 400 v POST i PUT (Task 6 + 7)
- [ ] Push fire-and-forget — `mockRejectedValue` nesnoutí test (Task 6.1, sedmý it)
- [ ] Build čistý: `cd backend && npm run build`
- [ ] Všechny testy prošly: `cd backend && npm test`
- [ ] Manuální smoke přes `npm run start:dev` proběhl bez crash
