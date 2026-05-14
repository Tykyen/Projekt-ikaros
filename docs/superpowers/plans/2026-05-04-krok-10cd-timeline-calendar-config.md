# TimelineEvent — Implementation Plan (Fáze 3.2)

> **Datum vzniku:** 2026-05-04 (původně sdružený plán 10c+10d)
> **Aktualizováno:** 2026-05-06 (timeline-only scope; calendar config přesunut do Fáze 4.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat modul `timeline` (NestJS/Mongoose) — auth-required GET `/api/timeline`, role-gated write endpointy, base64 stripping per parity. Bez calendar config (přijde v Fázi 4.1).

**Architecture:** Standalone modul `backend/src/modules/timeline/` se schématem `timeline_events`. `worldId required` (timeline je vždy per-svět). Service implementuje auth checks (Admin/Superadmin shortcut + `WorldRole≥PomocnyPJ` pro write, `>= Hrac` pro read) — pattern viz `world-news.service.ts`. Importuje `IWorldMembershipRepository` a `IWorldsRepository` z `WorldsModule`. Bez `WorldCalendarConfigService` — `celestialStates: []` placeholder.

**Tech Stack:** NestJS 11, Mongoose 9, class-validator, Jest (unit), TypeScript strict.

**Závislosti:** `WorldsModule` (exportuje `IWorldMembershipRepository`, `IWorldsRepository`).

**Spec:** [2026-05-04-krok-10cd-timeline-calendar-config-design.md](../specs/2026-05-04-krok-10cd-timeline-calendar-config-design.md)

---

## File Structure

```
backend/src/modules/timeline/
├── timeline.module.ts                         # NEW
├── timeline.controller.ts                     # NEW
├── timeline.service.ts                        # NEW
├── timeline.service.spec.ts                   # NEW
├── schemas/
│   └── timeline-event.schema.ts               # NEW
├── repositories/
│   └── timeline.repository.ts                 # NEW
├── dto/
│   ├── create-timeline-event.dto.ts           # NEW
│   ├── update-timeline-event.dto.ts           # NEW
│   └── query-timeline-event.dto.ts            # NEW
└── interfaces/
    ├── timeline-event.interface.ts            # NEW
    └── timeline-repository.interface.ts       # NEW

backend/src/app.module.ts                      # MODIFY (přidat TimelineModule)
docs/roadmap2.md                               # MODIFY (Fáze 3.2 → splněno)
```

---

## Pre-flight checks

- [ ] **Step 0.1:** Ověř baseline buildu

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check 2>&1 | tail -5
```

Expected: vše PASS, ~593 testů.

---

## Task 1: Interfaces

**Files:**
- Create: `backend/src/modules/timeline/interfaces/timeline-event.interface.ts`
- Create: `backend/src/modules/timeline/interfaces/timeline-repository.interface.ts`

- [ ] **Step 1.1:** Entity interface

`backend/src/modules/timeline/interfaces/timeline-event.interface.ts`:
```ts
export interface CelestialOverride {
  bodyId: string;
  value: string;
}

export interface TimelineEvent {
  id: string;
  worldId: string;
  year: number;
  month: number;          // 1-based
  day: number;            // 1-based
  hour?: number;          // 0..23
  title: string;
  text: string;
  imageUrl: string | null;
  link: string | null;
  celestialOverrides: CelestialOverride[];
  createdAt: Date;
  updatedAt: Date;
}

// Response s placeholder celestialStates (Fáze 4.1 ho začne plnit)
export interface CelestialState {
  bodyId: string;
  name: string;
  type: 'moon' | 'sun' | 'planet' | 'comet' | 'other';
  state: string;
  isManualOverride: boolean;
}

export interface TimelineEventResponse extends TimelineEvent {
  celestialStates: CelestialState[];   // Fáze 3.2: vždy []
}
```

- [ ] **Step 1.2:** Repository interface

`backend/src/modules/timeline/interfaces/timeline-repository.interface.ts`:
```ts
import type { TimelineEvent } from './timeline-event.interface';

export interface TimelineFindOptions {
  worldId: string;
  limit: number;          // clamped 1..500, default 100
  fromYear?: number;
  toYear?: number;
}

export interface ITimelineRepository {
  findMany(opts: TimelineFindOptions): Promise<TimelineEvent[]>;
  findById(id: string): Promise<TimelineEvent | null>;
  create(
    data: Omit<TimelineEvent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TimelineEvent>;
  update(
    id: string,
    patch: Partial<Omit<TimelineEvent, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<TimelineEvent | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 1.3:** Verify

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 1.4:** Commit

```bash
git add backend/src/modules/timeline/interfaces
git commit -m "feat(timeline): interfaces (entity + response + repository)"
```

---

## Task 2: Mongoose schema

**Files:**
- Create: `backend/src/modules/timeline/schemas/timeline-event.schema.ts`

- [ ] **Step 2.1:** Vytvoř schema

`backend/src/modules/timeline/schemas/timeline-event.schema.ts`:
```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CelestialOverride } from '../interfaces/timeline-event.interface';

export type TimelineEventDocument = HydratedDocument<TimelineEventSchemaClass>;

@Schema({ timestamps: true, collection: 'timeline_events' })
export class TimelineEventSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) year: number;
  @Prop({ required: true, min: 1 }) month: number;
  @Prop({ required: true, min: 1 }) day: number;
  @Prop({ default: null }) hour: number | null;
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 50000 }) text: string;
  @Prop({ default: null }) imageUrl: string | null;
  @Prop({ default: null }) link: string | null;
  @Prop({ type: [Object], default: [] })
  celestialOverrides: CelestialOverride[];
}

export const TimelineEventSchema = SchemaFactory.createForClass(
  TimelineEventSchemaClass,
);
TimelineEventSchema.index({ worldId: 1, year: 1, month: 1, day: 1 });
```

- [ ] **Step 2.2:** Verify

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 2.3:** Commit

```bash
git add backend/src/modules/timeline/schemas
git commit -m "feat(timeline): mongoose schema + chronological index"
```

---

## Task 3: Repository

**Files:**
- Create: `backend/src/modules/timeline/repositories/timeline.repository.ts`

- [ ] **Step 3.1:** Vytvoř repository

`backend/src/modules/timeline/repositories/timeline.repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import type {
  ITimelineRepository,
  TimelineFindOptions,
} from '../interfaces/timeline-repository.interface';
import type {
  TimelineEvent,
  CelestialOverride,
} from '../interfaces/timeline-event.interface';
import { TimelineEventSchemaClass } from '../schemas/timeline-event.schema';

@Injectable()
export class MongoTimelineRepository implements ITimelineRepository {
  constructor(
    @InjectModel(TimelineEventSchemaClass.name)
    private readonly model: Model<TimelineEventSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): TimelineEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      year: doc.year as number,
      month: doc.month as number,
      day: doc.day as number,
      hour: (doc.hour as number | null) ?? undefined,
      title: doc.title as string,
      text: doc.text as string,
      imageUrl: (doc.imageUrl as string | null) ?? null,
      link: (doc.link as string | null) ?? null,
      celestialOverrides:
        (doc.celestialOverrides as CelestialOverride[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async findMany(opts: TimelineFindOptions): Promise<TimelineEvent[]> {
    const filter: Record<string, unknown> = { worldId: opts.worldId };
    if (opts.fromYear !== undefined || opts.toYear !== undefined) {
      const yearFilter: Record<string, number> = {};
      if (opts.fromYear !== undefined) yearFilter.$gte = opts.fromYear;
      if (opts.toYear !== undefined) yearFilter.$lte = opts.toYear;
      filter.year = yearFilter;
    }
    const docs = await this.model
      .find(filter)
      .sort({ year: 1, month: 1, day: 1, hour: 1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<TimelineEvent | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(
    data: Omit<TimelineEvent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TimelineEvent> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    patch: Partial<
      Omit<TimelineEvent, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<TimelineEvent | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }
}
```

- [ ] **Step 3.2:** Verify

```bash
cd backend && npm run typecheck && npm run lint:check
```

Expected: PASS.

- [ ] **Step 3.3:** Commit

```bash
git add backend/src/modules/timeline/repositories
git commit -m "feat(timeline): mongo repository (find/create/update/delete + year-range filter)"
```

---

## Task 4: DTOs

**Files:**
- Create: `backend/src/modules/timeline/dto/create-timeline-event.dto.ts`
- Create: `backend/src/modules/timeline/dto/update-timeline-event.dto.ts`
- Create: `backend/src/modules/timeline/dto/query-timeline-event.dto.ts`

- [ ] **Step 4.1:** Create DTO

`backend/src/modules/timeline/dto/create-timeline-event.dto.ts`:
```ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

class CelestialOverrideDto {
  @IsString()
  @IsNotEmpty()
  bodyId: string;

  @IsString()
  value: string;
}

// imageUrl může být buď URL (http/https) nebo data: URI
const URL_OR_DATA = /^(https?:\/\/|data:)/;

export class CreateTimelineEventDto {
  @IsString()
  @IsNotEmpty()
  worldId: string;

  @IsInt()
  // Záporné hodnoty povoleny — fantasy "BC era" / retroaktivní dějiny.
  // Žádné @Min(0). Rozhodnutí 2026-05-06 (per dluhy.md final code review Fáze 3.2).
  year: number;

  @IsInt()
  @Min(1)
  month: number;

  @IsInt()
  @Min(1)
  day: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  text: string;

  @IsOptional()
  @IsString()
  @Matches(URL_OR_DATA, {
    message: 'imageUrl musí být http(s):// URL nebo data: URI',
  })
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\//, { message: 'link musí začínat http(s)://' })
  link?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CelestialOverrideDto)
  celestialOverrides?: CelestialOverrideDto[];
}
```

- [ ] **Step 4.2:** Update DTO

`backend/src/modules/timeline/dto/update-timeline-event.dto.ts`:
```ts
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

class CelestialOverrideDto {
  @IsString()
  @IsNotEmpty()
  bodyId: string;

  @IsString()
  value: string;
}

const URL_OR_DATA = /^(https?:\/\/|data:)/;

/**
 * worldId zde NENÍ — je immutable (defense-in-depth check v service).
 */
export class UpdateTimelineEventDto {
  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  month?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  day?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  text?: string;

  // imageUrl: null = "zachovat stávající" (per parity); jinak nahradit
  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|data:)/, {
    message: 'imageUrl musí být http(s):// URL nebo data: URI',
  })
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\//, { message: 'link musí začínat http(s)://' })
  link?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CelestialOverrideDto)
  celestialOverrides?: CelestialOverrideDto[];
}
```

> Pozn.: `imageUrl: null` projde validaci (`@IsOptional()` se aplikuje na `null` value také). Service pak rozlišuje `dto.imageUrl === null` (zachovat) vs. string (nahradit) vs. nezadané (nech nedotčené).

- [ ] **Step 4.3:** Query DTO

`backend/src/modules/timeline/dto/query-timeline-event.dto.ts`:
```ts
import { IsOptional, IsString, IsInt, Min, Max, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryTimelineEventDto {
  @IsString()
  @IsNotEmpty()
  worldId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fromYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  toYear?: number;
}
```

- [ ] **Step 4.4:** Verify

```bash
cd backend && npm run typecheck && npm run lint:check
```

Expected: PASS.

- [ ] **Step 4.5:** Commit

```bash
git add backend/src/modules/timeline/dto
git commit -m "feat(timeline): DTOs (create/update/query) s class-validator"
```

---

## Task 5: Service — read path (TDD)

**Files:**
- Create: `backend/src/modules/timeline/timeline.service.ts`
- Create: `backend/src/modules/timeline/timeline.service.spec.ts`

- [ ] **Step 5.1:** Napiš failing test

`backend/src/modules/timeline/timeline.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import type { TimelineEvent } from './interfaces/timeline-event.interface';

const mockEvent = (
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent => ({
  id: 'ev1',
  worldId: 'W1',
  year: 100,
  month: 1,
  day: 5,
  title: 'Bitva',
  text: 'Popis bitvy',
  imageUrl: null,
  link: null,
  celestialOverrides: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('TimelineService', () => {
  let service: TimelineService;

  const mockRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembership = { findByUserAndWorld: jest.fn() };
  const mockWorlds = { findById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: 'ITimelineRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
      ],
    }).compile();
    service = module.get(TimelineService);
  });

  describe('findMany (read path)', () => {
    const Hrac = { id: 'u1', role: 5, username: 'h' } as const;

    it('member světa: vrátí events s placeholder celestialStates', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u1',
        worldId: 'W1',
        role: 0, // Hrac
      });
      mockRepo.findMany.mockResolvedValue([mockEvent()]);
      const result = await service.findMany({ worldId: 'W1', limit: 100 }, Hrac);
      expect(result).toHaveLength(1);
      expect(result[0].celestialStates).toEqual([]);
    });

    it('non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findMany({ worldId: 'W1', limit: 100 }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('Pending (role -1): 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: -1 });
      await expect(
        service.findMany({ worldId: 'W1', limit: 100 }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('Admin: bez kontroly členství, vrátí events', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([mockEvent()]);
      const result = await service.findMany(
        { worldId: 'W1', limit: 100 },
        Admin,
      );
      expect(result).toHaveLength(1);
      expect(mockMembership.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('neexistující svět: 404', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.findMany({ worldId: 'fake', limit: 100 }, Hrac),
      ).rejects.toThrow(NotFoundException);
    });

    it('default limit je 100, max 500 clamp', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'W1' }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
      jest.clearAllMocks();
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'W1', limit: 999 }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
      );
    });

    it('strippe data: imageUrl v list response', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([
        mockEvent({ imageUrl: 'data:image/png;base64,abc' }),
      ]);
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result[0].imageUrl).toBeNull();
    });

    it('zachová normal URL v list response', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([
        mockEvent({ imageUrl: 'https://cdn.example.com/img.png' }),
      ]);
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result[0].imageUrl).toBe('https://cdn.example.com/img.png');
    });
  });

  describe('findById (detail)', () => {
    const Admin = { id: 'a', role: 2, username: 'a' } as const;

    it('zachová data: imageUrl v detail response', async () => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ imageUrl: 'data:image/png;base64,abc' }),
      );
      const result = await service.findById('ev1', Admin);
      expect(result.imageUrl).toBe('data:image/png;base64,abc');
      expect(result.celestialStates).toEqual([]);
    });

    it('non-existing: 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('missing', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('member světa události: 200', async () => {
      const Hrac = { id: 'u1', role: 5, username: 'h' } as const;
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 0 });
      const result = await service.findById('ev1', Hrac);
      expect(result.id).toBe('ev1');
    });

    it('non-member světa události: 403', async () => {
      const Hrac = { id: 'u1', role: 5, username: 'h' } as const;
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.findById('ev1', Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
```

- [ ] **Step 5.2:** Spusť test — musí selhat

```bash
cd backend && npx jest timeline.service.spec --no-coverage
```

Expected: FAIL — `Cannot find module './timeline.service'`.

- [ ] **Step 5.3:** Implementuj minimum service pro read path

`backend/src/modules/timeline/timeline.service.ts`:
```ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ITimelineRepository } from './interfaces/timeline-repository.interface';
import type {
  TimelineEvent,
  TimelineEventResponse,
} from './interfaces/timeline-event.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface FindManyArgs {
  worldId: string;
  limit?: number;
  fromYear?: number;
  toYear?: number;
}

export interface TimelineRequester {
  id: string;
  role: UserRole;
  username: string;
}

function stripBase64(url: string | null): string | null {
  if (typeof url === 'string' && url.startsWith('data:')) return null;
  return url;
}

function toResponse(
  event: TimelineEvent,
  preserveImageUrl: boolean,
): TimelineEventResponse {
  return {
    ...event,
    imageUrl: preserveImageUrl ? event.imageUrl : stripBase64(event.imageUrl),
    celestialStates: [], // Fáze 3.2 placeholder; Fáze 4.1 ho začne plnit
  };
}

@Injectable()
export class TimelineService {
  constructor(
    @Inject('ITimelineRepository')
    private readonly repo: ITimelineRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  async findMany(
    args: FindManyArgs,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse[]> {
    await this.assertMember(args.worldId, requester);
    const limit = Math.max(
      1,
      Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    );
    const events = await this.repo.findMany({
      worldId: args.worldId,
      limit,
      fromYear: args.fromYear,
      toYear: args.toYear,
    });
    return events.map((e) => toResponse(e, false));
  }

  async findById(
    id: string,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException('Událost nenalezena');
    await this.assertMember(event.worldId, requester);
    return toResponse(event, true);
  }

  /**
   * Read access: member světa (jakákoli role >= Hrac, tj. Pending je vyloučen).
   * Admin/Superadmin shortcut bez membership lookupu.
   * Neexistující svět = 404 (auth-required GET, leak světa není kritický).
   */
  private async assertMember(
    worldId: string,
    requester: TimelineRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nejsi členem tohoto světa');
    if (membership.role < WorldRole.Hrac) {
      throw new ForbiddenException('Pending členství nemá přístup');
    }
  }
}
```

- [ ] **Step 5.4:** Spusť test — read tests musí projít

```bash
cd backend && npx jest timeline.service.spec --no-coverage
```

Expected: read describe bloky PASS. Write tests přijdou v Tasku 6.

- [ ] **Step 5.5:** Commit

```bash
git add backend/src/modules/timeline/timeline.service.ts backend/src/modules/timeline/timeline.service.spec.ts
git commit -m "feat(timeline): service read path (findMany, findById, base64 stripping)"
```

---

## Task 6: Service — write path + autorizace (TDD)

**Files:**
- Modify: `backend/src/modules/timeline/timeline.service.ts`
- Modify: `backend/src/modules/timeline/timeline.service.spec.ts`

- [ ] **Step 6.1:** Rozšiř test o write path scénáře

Přidej **na konec** describe bloku v `timeline.service.spec.ts`:

```ts
  describe('create — autorizace', () => {
    const Superadmin = { id: 'u1', role: 1, username: 'sa' } as const;
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;
    const PJ = { id: 'u3', role: 3, username: 'pj' } as const;
    const Hrac = { id: 'u4', role: 5, username: 'h' } as const;

    const baseDto = {
      worldId: 'W1',
      year: 100,
      month: 1,
      day: 5,
      title: 'Bitva',
      text: 'Popis',
    };

    it('Admin smí vytvořit', async () => {
      mockRepo.create.mockResolvedValue(mockEvent());
      const result = await service.create(baseDto, Admin);
      expect(result.id).toBe('ev1');
    });

    it('Superadmin smí vytvořit', async () => {
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, Superadmin);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PJ světa W1 smí vytvořit v W1', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u3',
        worldId: 'W1',
        role: 3, // WorldRole.PJ
      });
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, PJ);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PomocnyPJ (role 2) smí vytvořit', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 2, // PomocnyPJ
      });
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, Hrac);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Korektor (role 1) NESMÍ vytvořit → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 1,
      });
      await expect(service.create(baseDto, Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('PJ světa W1 nesmí vytvořit v W2 → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W2' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create({ ...baseDto, worldId: 'W2' }, PJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('neexistující svět → 403 (anti-leak)', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.create({ ...baseDto, worldId: 'fake' }, PJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('default celestialOverrides je []', async () => {
      mockRepo.create.mockImplementation(async (data) => ({
        id: 'x',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }));
      await service.create(baseDto, Admin);
      expect(mockRepo.create.mock.calls[0][0].celestialOverrides).toEqual([]);
    });

    it('default imageUrl/link je null', async () => {
      mockRepo.create.mockImplementation(async (data) => ({
        id: 'x',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }));
      await service.create(baseDto, Admin);
      expect(mockRepo.create.mock.calls[0][0].imageUrl).toBeNull();
      expect(mockRepo.create.mock.calls[0][0].link).toBeNull();
    });
  });

  describe('update — partial + immutable worldId + imageUrl null preserve', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

    it('partial update — title', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockRepo.update.mockResolvedValue(mockEvent({ title: 'nový' }));
      const result = await service.update('ev1', { title: 'nový' }, Admin);
      expect(result.title).toBe('nový');
    });

    it('imageUrl: null v body → zachová stávající (per parity)', async () => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ imageUrl: 'https://cdn.example.com/img.png' }),
      );
      mockRepo.update.mockImplementation(async (id, patch) => ({
        ...mockEvent({ imageUrl: 'https://cdn.example.com/img.png' }),
        ...patch,
      }));
      await service.update('ev1', { imageUrl: null }, Admin);
      const updateCall = mockRepo.update.mock.calls[0][1];
      expect(updateCall.imageUrl).toBe('https://cdn.example.com/img.png');
    });

    it('imageUrl: nový string → nahradí', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent({ imageUrl: 'old' }));
      mockRepo.update.mockResolvedValue(mockEvent({ imageUrl: 'new' }));
      await service.update('ev1', { imageUrl: 'https://new.com/x' }, Admin);
      expect(mockRepo.update.mock.calls[0][1].imageUrl).toBe(
        'https://new.com/x',
      );
    });

    it('worldId v body → 400 (immutability)', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      await expect(
        service.update(
          'ev1',
          { worldId: 'W2' } as unknown as Parameters<typeof service.update>[1],
          Admin,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('non-existing :id → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { title: 't' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('běžný User nesmí upravit → 403', async () => {
      const Hrac = { id: 'u4', role: 5, username: 'h' } as const;
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 0 });
      await expect(
        service.update('ev1', { title: 't' }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('delete', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

    it('non-existing :id → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('missing', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Admin smí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('ev1', Admin);
      expect(mockRepo.delete).toHaveBeenCalledWith('ev1');
    });
  });
```

- [ ] **Step 6.2:** Spusť test — write tests musí FAIL

```bash
cd backend && npx jest timeline.service.spec --no-coverage
```

Expected: read PASS, write FAIL — `service.create is not a function`.

- [ ] **Step 6.3:** Rozšiř service o write path

Přepiš celý `backend/src/modules/timeline/timeline.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ITimelineRepository } from './interfaces/timeline-repository.interface';
import type {
  TimelineEvent,
  TimelineEventResponse,
} from './interfaces/timeline-event.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import type { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

interface FindManyArgs {
  worldId: string;
  limit?: number;
  fromYear?: number;
  toYear?: number;
}

export interface TimelineRequester {
  id: string;
  role: UserRole;
  username: string;
}

function stripBase64(url: string | null): string | null {
  if (typeof url === 'string' && url.startsWith('data:')) return null;
  return url;
}

function toResponse(
  event: TimelineEvent,
  preserveImageUrl: boolean,
): TimelineEventResponse {
  return {
    ...event,
    imageUrl: preserveImageUrl ? event.imageUrl : stripBase64(event.imageUrl),
    celestialStates: [], // Fáze 3.2 placeholder; 4.1 začne plnit
  };
}

@Injectable()
export class TimelineService {
  constructor(
    @Inject('ITimelineRepository')
    private readonly repo: ITimelineRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  async findMany(
    args: FindManyArgs,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse[]> {
    await this.assertMember(args.worldId, requester);
    const limit = Math.max(
      1,
      Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
    );
    const events = await this.repo.findMany({
      worldId: args.worldId,
      limit,
      fromYear: args.fromYear,
      toYear: args.toYear,
    });
    return events.map((e) => toResponse(e, false));
  }

  async findById(
    id: string,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException('Událost nenalezena');
    await this.assertMember(event.worldId, requester);
    return toResponse(event, true);
  }

  async create(
    dto: CreateTimelineEventDto,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    await this.assertCanWrite(dto.worldId, requester);
    const created = await this.repo.create({
      worldId: dto.worldId,
      year: dto.year,
      month: dto.month,
      day: dto.day,
      hour: dto.hour,
      title: dto.title,
      text: dto.text,
      imageUrl: dto.imageUrl ?? null,
      link: dto.link ?? null,
      celestialOverrides: dto.celestialOverrides ?? [],
    });
    return toResponse(created, true);
  }

  async update(
    id: string,
    dto: UpdateTimelineEventDto,
    requester: TimelineRequester,
  ): Promise<TimelineEventResponse> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Událost nenalezena');

    // Defense-in-depth proti DTO whitelist bypassu
    if ('worldId' in (dto as Record<string, unknown>)) {
      throw new BadRequestException(
        'worldId je immutable — smaž a vytvoř novou událost pro změnu světa',
      );
    }

    await this.assertCanWrite(existing.worldId, requester);

    // imageUrl: null v body znamená "zachovat stávající" (per parity).
    // Jinak (string nebo undefined) projde standardně.
    const patch: Partial<
      Omit<TimelineEvent, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>
    > = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.text !== undefined && { text: dto.text }),
      ...(dto.year !== undefined && { year: dto.year }),
      ...(dto.month !== undefined && { month: dto.month }),
      ...(dto.day !== undefined && { day: dto.day }),
      ...(dto.hour !== undefined && { hour: dto.hour }),
      ...(dto.link !== undefined && { link: dto.link }),
      ...(dto.celestialOverrides !== undefined && {
        celestialOverrides: dto.celestialOverrides,
      }),
    };
    if (dto.imageUrl !== undefined) {
      patch.imageUrl = dto.imageUrl === null ? existing.imageUrl : dto.imageUrl;
    }

    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFoundException('Událost nenalezena');
    return toResponse(updated, true);
  }

  async delete(id: string, requester: TimelineRequester): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Událost nenalezena');
    await this.assertCanWrite(existing.worldId, requester);
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Událost nenalezena');
  }

  /**
   * Read access: member světa (Hrac+, Pending vyloučen).
   * Neexistující svět = 404 (auth-required GET, leak světa není kritický).
   */
  private async assertMember(
    worldId: string,
    requester: TimelineRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nejsi členem tohoto světa');
    if (membership.role < WorldRole.Hrac) {
      throw new ForbiddenException('Pending členství nemá přístup');
    }
  }

  /**
   * Write access: Admin/Superadmin shortcut, jinak WorldRole >= PomocnyPJ.
   * Neexistující svět = 403 (anti-leak per WorldNews precedent).
   */
  private async assertCanWrite(
    worldId: string,
    requester: TimelineRequester,
  ): Promise<void> {
    if (requester.role <= UserRole.Admin) return;
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new ForbiddenException('Nedostatečná oprávnění');
    const membership = await this.membershipRepo.findByUserAndWorld(
      requester.id,
      worldId,
    );
    if (!membership) throw new ForbiddenException('Nedostatečná oprávnění');
    if (membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
  }
}
```

- [ ] **Step 6.4:** Spusť test — vše PASS

```bash
cd backend && npx jest timeline.service.spec --no-coverage
```

Expected: vše PASS.

- [ ] **Step 6.5:** Commit

```bash
git add backend/src/modules/timeline/timeline.service.ts backend/src/modules/timeline/timeline.service.spec.ts
git commit -m "feat(timeline): service write path s autorizací (Admin/Superadmin/PomocnyPJ+) + parity imageUrl null preserve"
```

---

## Task 7: Controller

**Files:**
- Create: `backend/src/modules/timeline/timeline.controller.ts`

- [ ] **Step 7.1:** Vytvoř controller

`backend/src/modules/timeline/timeline.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TimelineService } from './timeline.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { QueryTimelineEventDto } from './dto/query-timeline-event.dto';

@ApiTags('Timeline')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('timeline')
export class TimelineController {
  constructor(private readonly service: TimelineService) {}

  @Get()
  @ApiOperation({
    summary:
      'Seznam událostí světa (member světa). Sort year/month/day/hour ASC.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404, description: 'Svět neexistuje' })
  findMany(
    @Query() query: QueryTimelineEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.findMany(
      {
        worldId: query.worldId,
        limit: query.limit,
        fromYear: query.fromYear,
        toYear: query.toYear,
      },
      user,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail události (member světa)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post()
  @ApiOperation({
    summary: 'Vytvoř událost (Admin/Superadmin/PJ/PomocnyPJ světa)',
  })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(
    @Body() dto: CreateTimelineEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Aktualizuj událost (partial)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'worldId v body zakázán' })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimelineEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Smaž událost' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.delete(id, user);
  }
}
```

- [ ] **Step 7.2:** Verify

```bash
cd backend && npm run typecheck && npm run lint:check
```

Expected: PASS.

- [ ] **Step 7.3:** Commit

```bash
git add backend/src/modules/timeline/timeline.controller.ts
git commit -m "feat(timeline): controller s 5 endpointy (auth-required GET, gated write)"
```

---

## Task 8: Module wiring + AppModule

**Files:**
- Create: `backend/src/modules/timeline/timeline.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 8.1:** Vytvoř modul

`backend/src/modules/timeline/timeline.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TimelineEventSchemaClass,
  TimelineEventSchema,
} from './schemas/timeline-event.schema';
import { MongoTimelineRepository } from './repositories/timeline.repository';
import { TimelineService } from './timeline.service';
import { TimelineController } from './timeline.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TimelineEventSchemaClass.name, schema: TimelineEventSchema },
    ]),
    WorldsModule,
  ],
  controllers: [TimelineController],
  providers: [
    TimelineService,
    { provide: 'ITimelineRepository', useClass: MongoTimelineRepository },
  ],
})
export class TimelineModule {}
```

- [ ] **Step 8.2:** Přidej do `AppModule`

V `backend/src/app.module.ts`:

1. Najdi řádek `import { WorldNewsModule } from './modules/world-news/world-news.module';` a přidej **pod něj**:
```ts
import { TimelineModule } from './modules/timeline/timeline.module';
```

2. V `imports[]` array najdi `WorldNewsModule,` (přidaný v Fázi 3.1) a vlož `TimelineModule,` **za něj** (před `GatewaysModule`).

- [ ] **Step 8.3:** Verify

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check 2>&1 | tail -5
```

Expected: PASS, žádné DI errory.

- [ ] **Step 8.4:** Commit

```bash
git add backend/src/modules/timeline/timeline.module.ts backend/src/app.module.ts
git commit -m "feat(timeline): wire modul do AppModule"
```

---

## Task 9: Final verification + roadmap update

- [ ] **Step 9.1:** Spusť celou test suite

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check 2>&1 | tail -10
```

Expected: vše PASS.

- [ ] **Step 9.2:** Production build

```bash
cd backend && npm run build
```

Expected: PASS.

- [ ] **Step 9.3:** Update roadmapy

V `docs/roadmap2.md`:

1. Najdi sekci `### 3.2 TimelineEvent (Krok 10c) ⬜`. Přepiš nadpis na `### 3.2 TimelineEvent (Krok 10c) ✅ **(hotovo 2026-05-06)**`. Změň všechny `- [ ]` na `- [x]`. Aktualizuj checklist tak, aby odrážel co bylo doopravdy implementováno (path `/api/timeline`, auth required GET, role-gated write `≥PomocnyPJ`, base64 stripping, `celestialStates: []` placeholder do 4.1).
2. V tabulce "Pořadí prací" najdi řádek `| 7 | Fáze 3.2 — TimelineEvent | parity | 1–2 dny |` a přepiš na `| ✅ | Fáze 3.2 — TimelineEvent | hotovo (2026-05-06) | — |`.

- [ ] **Step 9.4:** Commit

```bash
git add docs/roadmap2.md
git commit -m "docs(roadmap): Fáze 3.2 TimelineEvent — splněno"
```

- [ ] **Step 9.5:** Verifikuj git stav

```bash
git log --oneline | head -15
git status
```

Expected: 8+ commitů z tasků, čistý working tree.

---

## Mimo scope (per spec)

- **Calendar config integration** — Fáze 4.1 přidá `WorldCalendarConfigService` a začne plnit `celestialStates` polem reálnými výpočty
- **Range validation `month` proti `months.length`** — také 4.1
- **WebSocket broadcast** nových events
- **Markdown rendering** v `text`
- **Image upload integration** — frontend pošle `data:` URI nebo URL z existing image module
- **Search/full-text** v `text`
