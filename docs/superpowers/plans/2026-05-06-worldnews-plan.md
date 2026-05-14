# WorldNews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat modul `world-news` (NestJS/Mongoose) — anonymní GET `/api/news`, role-gated write endpointy, plus jednorázový migrační skript ze staré .NET DB.

**Architecture:** Standalone modul `backend/src/modules/world-news/` se schématem `worldnews` collection. `worldId` nullable rozlišuje globální vs. per-world novinky. Service implementuje auth checks v metodách (ne separátní guard — projekt pattern viz `world-currencies.service.ts`). Importuje `IWorldMembershipRepository` a `IWorldsRepository` z `WorldsModule`. Migrace = standalone TS skript napojený přes Mongoose connection z `.env`.

**Tech Stack:** NestJS 11, Mongoose 9, class-validator, Jest (unit), TypeScript strict, Node 20+.

**Závislosti:** `WorldsModule` (exportuje `IWorldMembershipRepository`, `IWorldsRepository`).

**Spec:** [docs/superpowers/specs/2026-05-04-krok-10g-world-news-design.md](../specs/2026-05-04-krok-10g-world-news-design.md)

---

## File Structure

```
backend/src/modules/world-news/
├── world-news.module.ts                              # NEW
├── world-news.controller.ts                          # NEW
├── world-news.service.ts                             # NEW
├── world-news.service.spec.ts                        # NEW (testy)
├── schemas/
│   └── world-news.schema.ts                          # NEW
├── repositories/
│   └── world-news.repository.ts                      # NEW
├── dto/
│   ├── create-world-news.dto.ts                      # NEW
│   ├── update-world-news.dto.ts                      # NEW
│   └── query-world-news.dto.ts                       # NEW
└── interfaces/
    ├── world-news.interface.ts                       # NEW
    └── world-news-repository.interface.ts            # NEW

backend/scripts/migrate-world-news/
├── index.ts                                          # NEW (CLI entrypoint)
├── mapper.ts                                         # NEW (PascalCase→camelCase, normalize worldId)
├── mapper.spec.ts                                    # NEW (testy mapperu)
└── README.md                                         # NEW (jak spustit)

backend/src/app.module.ts                             # MODIFY (přidat WorldNewsModule)
backend/package.json                                  # MODIFY (npm script "migrate:news")
```

**Boundary rationale:**
- Schema + repo + service jsou tři vrstvy projekt-standardu (viz [ikaros-news](../../../backend/src/modules/ikaros-news/), [world-currencies](../../../backend/src/modules/world-currencies/))
- Migrate skript v separátním adresáři (`backend/scripts/`) per pattern [parity-check](../../../backend/scripts/parity-check/) — testovatelná logika v `mapper.ts`, IO v `index.ts`

---

## Pre-flight checks

- [ ] **Step 0.1:** Ověř, že jsi v isolation worktree (per `superpowers:using-git-worktrees`). Pokud ne, vytvoř worktree pro tento plán
- [ ] **Step 0.2:** Ověř baseline buildu

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --passWithNoTests
```

Expected: vše PASS bez errorů. Pokud baseline nefunguje, nepokračuj.

---

## Task 1: Interface a entity typ

**Files:**
- Create: `backend/src/modules/world-news/interfaces/world-news.interface.ts`
- Create: `backend/src/modules/world-news/interfaces/world-news-repository.interface.ts`

- [ ] **Step 1.1:** Vytvoř entity interface

`backend/src/modules/world-news/interfaces/world-news.interface.ts`:
```ts
export type WorldNewsType = 'info' | 'alert' | 'system';

export interface WorldNewsItem {
  id: string;
  worldId: string | null;        // null = globální
  title: string;
  content: string;
  date: string;                  // ISO 8601 v UTC (...Z)
  type: WorldNewsType;
  link?: string;
  createdBy?: string;            // userId; undefined u legacy migrovaných
}
```

- [ ] **Step 1.2:** Vytvoř repository interface

`backend/src/modules/world-news/interfaces/world-news-repository.interface.ts`:
```ts
import type { WorldNewsItem } from './world-news.interface';

export interface FindOptions {
  /** undefined = bez filtru (vše); string = svět + globální (union) */
  worldId?: string;
  /** clamped 1..200, default 50 — repo dostane už hotové číslo */
  limit: number;
}

export interface IWorldNewsRepository {
  findMany(opts: FindOptions): Promise<WorldNewsItem[]>;
  findById(id: string): Promise<WorldNewsItem | null>;
  create(data: Omit<WorldNewsItem, 'id'>): Promise<WorldNewsItem>;
  update(
    id: string,
    patch: Partial<Omit<WorldNewsItem, 'id' | 'worldId'>>,
  ): Promise<WorldNewsItem | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 1.3:** Ověř typecheck

```bash
cd backend && npm run typecheck
```

Expected: PASS (žádné importy zatím nezávisí na něčem co neexistuje).

- [ ] **Step 1.4:** Commit

```bash
git add backend/src/modules/world-news/interfaces
git commit -m "feat(world-news): interfaces (entity + repository)"
```

---

## Task 2: Mongoose schema

**Files:**
- Create: `backend/src/modules/world-news/schemas/world-news.schema.ts`

- [ ] **Step 2.1:** Vytvoř schema

`backend/src/modules/world-news/schemas/world-news.schema.ts`:
```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { WorldNewsType } from '../interfaces/world-news.interface';

export type WorldNewsDocument = HydratedDocument<WorldNewsSchemaClass>;

@Schema({ collection: 'worldnews', timestamps: false })
export class WorldNewsSchemaClass {
  @Prop({ type: String, default: null }) worldId: string | null;
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 10000 }) content: string;
  @Prop({ required: true }) date: string;
  @Prop({
    type: String,
    enum: ['info', 'alert', 'system'],
    default: 'info',
  })
  type: WorldNewsType;
  @Prop() link?: string;
  @Prop() createdBy?: string;
}

export const WorldNewsSchema = SchemaFactory.createForClass(
  WorldNewsSchemaClass,
);
WorldNewsSchema.index({ worldId: 1, date: -1 });
```

- [ ] **Step 2.2:** Ověř typecheck

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 2.3:** Commit

```bash
git add backend/src/modules/world-news/schemas
git commit -m "feat(world-news): mongoose schema + compound index"
```

---

## Task 3: Repository implementation

**Files:**
- Create: `backend/src/modules/world-news/repositories/world-news.repository.ts`

- [ ] **Step 3.1:** Vytvoř repository

`backend/src/modules/world-news/repositories/world-news.repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import type {
  IWorldNewsRepository,
  FindOptions,
} from '../interfaces/world-news-repository.interface';
import type {
  WorldNewsItem,
  WorldNewsType,
} from '../interfaces/world-news.interface';
import { WorldNewsSchemaClass } from '../schemas/world-news.schema';

@Injectable()
export class MongoWorldNewsRepository implements IWorldNewsRepository {
  constructor(
    @InjectModel(WorldNewsSchemaClass.name)
    private readonly model: Model<WorldNewsSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): WorldNewsItem {
    return {
      id: String(doc._id),
      worldId: (doc.worldId as string | null) ?? null,
      title: doc.title as string,
      content: doc.content as string,
      date: doc.date as string,
      type: doc.type as WorldNewsType,
      link: doc.link as string | undefined,
      createdBy: doc.createdBy as string | undefined,
    };
  }

  async findMany(opts: FindOptions): Promise<WorldNewsItem[]> {
    const filter =
      opts.worldId === undefined
        ? {}
        : { worldId: { $in: [opts.worldId, null] } };
    const docs = await this.model
      .find(filter)
      .sort({ date: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<WorldNewsItem | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(data: Omit<WorldNewsItem, 'id'>): Promise<WorldNewsItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    patch: Partial<Omit<WorldNewsItem, 'id' | 'worldId'>>,
  ): Promise<WorldNewsItem | null> {
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

- [ ] **Step 3.2:** Ověř typecheck + lint

```bash
cd backend && npm run typecheck && npm run lint:check
```

Expected: PASS.

- [ ] **Step 3.3:** Commit

```bash
git add backend/src/modules/world-news/repositories
git commit -m "feat(world-news): mongo repository (find/create/update/delete)"
```

---

## Task 4: DTOs

**Files:**
- Create: `backend/src/modules/world-news/dto/create-world-news.dto.ts`
- Create: `backend/src/modules/world-news/dto/update-world-news.dto.ts`
- Create: `backend/src/modules/world-news/dto/query-world-news.dto.ts`

- [ ] **Step 4.1:** Create DTO

`backend/src/modules/world-news/dto/create-world-news.dto.ts`:
```ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export class CreateWorldNewsDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  worldId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_UTC, { message: 'date musí být ISO 8601 v UTC (např. 2026-05-06T10:00:00.000Z)' })
  date?: string;

  @IsOptional()
  @IsIn(['info', 'alert', 'system'])
  type?: 'info' | 'alert' | 'system';

  @IsOptional()
  @IsUrl({ require_protocol: true })
  link?: string;
}
```

- [ ] **Step 4.2:** Update DTO (PUT)

`backend/src/modules/world-news/dto/update-world-news.dto.ts`:
```ts
import {
  IsString,
  IsOptional,
  IsIn,
  IsUrl,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * worldId zde NENÍ — je immutable. Pokud klient pošle, service vrátí 400.
 * createdBy také není — server-side audit field, klient nesmí nastavovat.
 */
export class UpdateWorldNewsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_UTC, { message: 'date musí být ISO 8601 v UTC' })
  date?: string;

  @IsOptional()
  @IsIn(['info', 'alert', 'system'])
  type?: 'info' | 'alert' | 'system';

  @IsOptional()
  @IsUrl({ require_protocol: true })
  link?: string;
}
```

- [ ] **Step 4.3:** Query DTO

`backend/src/modules/world-news/dto/query-world-news.dto.ts`:
```ts
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryWorldNewsDto {
  @IsOptional()
  @IsString()
  worldId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
```

- [ ] **Step 4.4:** Ověř typecheck + lint

```bash
cd backend && npm run typecheck && npm run lint:check
```

Expected: PASS.

- [ ] **Step 4.5:** Commit

```bash
git add backend/src/modules/world-news/dto
git commit -m "feat(world-news): DTOs (create/update/query) s validací"
```

---

## Task 5: Service — read path (TDD)

**Files:**
- Create: `backend/src/modules/world-news/world-news.service.ts`
- Create: `backend/src/modules/world-news/world-news.service.spec.ts`

- [ ] **Step 5.1:** Napiš failing test

`backend/src/modules/world-news/world-news.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorldNewsService } from './world-news.service';
import type { WorldNewsItem } from './interfaces/world-news.interface';

const mockItem = (overrides: Partial<WorldNewsItem> = {}): WorldNewsItem => ({
  id: 'n1',
  worldId: null,
  title: 'Globální oznámení',
  content: 'Obsah',
  date: '2026-05-06T10:00:00.000Z',
  type: 'info',
  ...overrides,
});

describe('WorldNewsService', () => {
  let service: WorldNewsService;

  const mockRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembership = {
    findByUserAndWorld: jest.fn(),
  };
  const mockWorlds = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldNewsService,
        { provide: 'IWorldNewsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
      ],
    }).compile();
    service = module.get(WorldNewsService);
  });

  describe('findMany (read path)', () => {
    it('bez worldId vrátí vše s default limitem 50', async () => {
      mockRepo.findMany.mockResolvedValue([mockItem()]);
      const result = await service.findMany({});
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: undefined,
        limit: 50,
      });
      expect(result).toHaveLength(1);
    });

    it('s worldId předá filter (svět + globální union v repo)', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'w1', limit: 10 });
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: 'w1',
        limit: 10,
      });
    });

    it('limit nad 200 se klampuje na 200', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ limit: 999 });
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: undefined,
        limit: 200,
      });
    });
  });

  describe('findById', () => {
    it('vrátí položku', async () => {
      mockRepo.findById.mockResolvedValue(mockItem());
      const result = await service.findById('n1');
      expect(result).toEqual(mockItem());
    });

    it('hází 404 když neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
```

- [ ] **Step 5.2:** Spusť test — musí selhat

```bash
cd backend && npx jest world-news.service.spec --no-coverage
```

Expected: FAIL — `Cannot find module './world-news.service'`.

- [ ] **Step 5.3:** Implementuj minimum service pro read path

`backend/src/modules/world-news/world-news.service.ts`:
```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IWorldNewsRepository } from './interfaces/world-news-repository.interface';
import type { WorldNewsItem } from './interfaces/world-news.interface';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface FindManyArgs {
  worldId?: string;
  limit?: number;
}

@Injectable()
export class WorldNewsService {
  constructor(
    @Inject('IWorldNewsRepository')
    private readonly repo: IWorldNewsRepository,
  ) {}

  async findMany(args: FindManyArgs): Promise<WorldNewsItem[]> {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return this.repo.findMany({ worldId: args.worldId, limit });
  }

  async findById(id: string): Promise<WorldNewsItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Novinka nenalezena');
    return item;
  }
}
```

> Poznámka: Service zatím injectuje jen repository. Membership + worlds repo přijde v Tasku 6 (write path). Test mocky pro ně už ale jsou předem (test setup).

- [ ] **Step 5.4:** Spusť test — musí projít

```bash
cd backend && npx jest world-news.service.spec --no-coverage
```

Expected: PASS pro `findMany` a `findById` testy. (Write path testy v Tasku 6.)

- [ ] **Step 5.5:** Commit

```bash
git add backend/src/modules/world-news/world-news.service.ts backend/src/modules/world-news/world-news.service.spec.ts
git commit -m "feat(world-news): service read path (findMany, findById)"
```

---

## Task 6: Service — write path + autorizace (TDD)

**Files:**
- Modify: `backend/src/modules/world-news/world-news.service.ts`
- Modify: `backend/src/modules/world-news/world-news.service.spec.ts`

- [ ] **Step 6.1:** Rozšiř test o write path scénáře

Přidej **na konec** `describe('WorldNewsService', ...)` v `world-news.service.spec.ts` (před uzavírací `});` celého describe):

```ts
  describe('create — autorizace', () => {
    const Superadmin = { id: 'u1', role: 1, username: 'sa' } as const; // UserRole.Superadmin
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;
    const PJ = { id: 'u3', role: 3, username: 'pj' } as const;
    const RegularUser = { id: 'u4', role: 5, username: 'h' } as const; // Hrac

    it('Superadmin smí vytvořit globální (worldId=null)', async () => {
      mockRepo.create.mockResolvedValue(
        mockItem({ id: 'new', worldId: null }),
      );
      await service.create(
        { title: 't', content: 'c', worldId: null },
        Superadmin,
      );
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Admin smí vytvořit globální', async () => {
      mockRepo.create.mockResolvedValue(mockItem({ id: 'new' }));
      await service.create({ title: 't', content: 'c' }, Admin);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('běžný User nesmí vytvořit globální → 403', async () => {
      await expect(
        service.create({ title: 't', content: 'c' }, RegularUser),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PJ světa W1 smí vytvořit per-world novinku v W1', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u3',
        worldId: 'W1',
        role: 3, // WorldRole.PJ
      });
      mockRepo.create.mockResolvedValue(mockItem({ worldId: 'W1' }));
      await service.create(
        { title: 't', content: 'c', worldId: 'W1' },
        PJ,
      );
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PomocnyPJ (role 2) smí vytvořit per-world novinku', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 2, // WorldRole.PomocnyPJ
      });
      mockRepo.create.mockResolvedValue(mockItem({ worldId: 'W1' }));
      await service.create(
        { title: 't', content: 'c', worldId: 'W1' },
        { id: 'u4', role: 5, username: 'pp' },
      );
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Korektor (role 1) NESMÍ vytvořit per-world → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 1,
      });
      await expect(
        service.create({ title: 't', content: 'c', worldId: 'W1' }, RegularUser),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PJ světa W1 nesmí vytvořit per-world v W2 (cross-world isolation) → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W2' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create({ title: 't', content: 'c', worldId: 'W2' }, PJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('worldId odkazuje na neexistující svět → 403 (anti-leak)', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.create({ title: 't', content: 'c', worldId: 'fake' }, PJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('default date je nastaven na server-side ISO UTC', async () => {
      mockRepo.create.mockImplementation(async (data) => ({
        id: 'x',
        ...data,
      }));
      await service.create({ title: 't', content: 'c' }, Admin);
      const callArg = mockRepo.create.mock.calls[0][0];
      expect(callArg.date).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    });

    it('createdBy je naplněn z requestera', async () => {
      mockRepo.create.mockImplementation(async (data) => ({ id: 'x', ...data }));
      await service.create({ title: 't', content: 'c' }, Admin);
      expect(mockRepo.create.mock.calls[0][0].createdBy).toBe('u2');
    });

    it('default type je info', async () => {
      mockRepo.create.mockImplementation(async (data) => ({ id: 'x', ...data }));
      await service.create({ title: 't', content: 'c' }, Admin);
      expect(mockRepo.create.mock.calls[0][0].type).toBe('info');
    });
  });

  describe('update — partial + immutable worldId', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

    it('partial update zachová ostatní pole', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ id: 'x', worldId: null }));
      mockRepo.update.mockResolvedValue(
        mockItem({ id: 'x', title: 'nový' }),
      );
      const result = await service.update('x', { title: 'nový' }, Admin);
      expect(mockRepo.update).toHaveBeenCalledWith('x', { title: 'nový' });
      expect(result.title).toBe('nový');
    });

    it('hází 404 když news neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { title: 't' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('Admin smí upravit globální news', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      mockRepo.update.mockResolvedValue(mockItem());
      await service.update('x', { title: 't' }, Admin);
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('běžný User nesmí upravit globální → 403', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      const RegularUser = { id: 'u4', role: 5, username: 'h' } as const;
      await expect(
        service.update('x', { title: 't' }, RegularUser),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PUT s worldId v body → 400 (defense-in-depth, i kdyby DTO whitelist selhal)', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      // Cast přes `any` simuluje case kdy by class-validator whitelist propustil cizí field.
      // Service to musí zachytit nezávisle.
      await expect(
        service.update(
          'x',
          { worldId: 'changed', title: 't' } as unknown as Parameters<
            typeof service.update
          >[1],
          Admin,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('delete', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

    it('hází 404 když news neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('missing', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Admin smí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('x', Admin);
      expect(mockRepo.delete).toHaveBeenCalledWith('x');
    });
  });
```

> Pozn.: `NotFoundException` z @nestjs/common už je naimportovaný z Tasku 5. Pokud `import` chybí — doplň.

- [ ] **Step 6.2:** Spusť test — write path testy MUSÍ selhat

```bash
cd backend && npx jest world-news.service.spec --no-coverage
```

Expected: read testy PASS, write testy FAIL — `service.create is not a function` (a podobně).

- [ ] **Step 6.3:** Rozšiř service o write path

Přepiš `backend/src/modules/world-news/world-news.service.ts`:
```ts
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IWorldNewsRepository } from './interfaces/world-news-repository.interface';
import type { WorldNewsItem } from './interfaces/world-news.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateWorldNewsDto } from './dto/create-world-news.dto';
import type { UpdateWorldNewsDto } from './dto/update-world-news.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface FindManyArgs {
  worldId?: string;
  limit?: number;
}

export interface WorldNewsRequester {
  id: string;
  role: UserRole;
  username: string;
}

@Injectable()
export class WorldNewsService {
  constructor(
    @Inject('IWorldNewsRepository')
    private readonly repo: IWorldNewsRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository')
    private readonly worldsRepo: IWorldsRepository,
  ) {}

  async findMany(args: FindManyArgs): Promise<WorldNewsItem[]> {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    return this.repo.findMany({ worldId: args.worldId, limit });
  }

  async findById(id: string): Promise<WorldNewsItem> {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException('Novinka nenalezena');
    return item;
  }

  async create(
    dto: CreateWorldNewsDto,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    const worldId = dto.worldId ?? null;
    await this.assertCanWrite(worldId, requester);

    return this.repo.create({
      worldId,
      title: dto.title,
      content: dto.content,
      date: dto.date ?? new Date().toISOString(),
      type: dto.type ?? 'info',
      link: dto.link,
      createdBy: requester.id,
    });
  }

  async update(
    id: string,
    dto: UpdateWorldNewsDto,
    requester: WorldNewsRequester,
  ): Promise<WorldNewsItem> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Novinka nenalezena');

    // Immutable worldId — pokud klient pošle (i identicky), 400.
    // class-validator ten field nepouští dál; tahle kontrola je defense-in-depth
    // pro případ že DTO whitelist selže.
    if ('worldId' in (dto as Record<string, unknown>)) {
      throw new BadRequestException(
        'worldId je immutable — smaž a vytvoř novou novinku pro změnu scope',
      );
    }

    await this.assertCanWrite(existing.worldId, requester);

    const updated = await this.repo.update(id, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.content !== undefined && { content: dto.content }),
      ...(dto.date !== undefined && { date: dto.date }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.link !== undefined && { link: dto.link }),
    });
    if (!updated) throw new NotFoundException('Novinka nenalezena');
    return updated;
  }

  async delete(id: string, requester: WorldNewsRequester): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Novinka nenalezena');

    await this.assertCanWrite(existing.worldId, requester);

    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Novinka nenalezena');
  }

  /**
   * Auth pravidla:
   * - Admin/Superadmin smí vždy (role 1 nebo 2; nižší = vyšší)
   * - worldId === null → jen Admin/Superadmin
   * - worldId !== null → Admin/Superadmin NEBO WorldRole >= PomocnyPJ
   * - Anti-leak: neexistující svět = 403 (ne 404), aby anonymní spoofing
   *   neodhalil existenci
   */
  private async assertCanWrite(
    worldId: string | null,
    requester: WorldNewsRequester,
  ): Promise<void> {
    // UserRole.Superadmin = 1, UserRole.Admin = 2 (menší číslo = vyšší role)
    if (requester.role <= UserRole.Admin) return;

    if (worldId === null) {
      throw new ForbiddenException('Pouze Admin/Superadmin smí měnit globální novinky');
    }

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

- [ ] **Step 6.4:** Spusť test — všechno musí projít

```bash
cd backend && npx jest world-news.service.spec --no-coverage
```

Expected: všechny `describe` bloky PASS.

- [ ] **Step 6.5:** Commit

```bash
git add backend/src/modules/world-news/world-news.service.ts backend/src/modules/world-news/world-news.service.spec.ts
git commit -m "feat(world-news): service write path s autorizací (Admin/Superadmin/PJ/PomocnyPJ)"
```

---

## Task 7: Controller

**Files:**
- Create: `backend/src/modules/world-news/world-news.controller.ts`

- [ ] **Step 7.1:** Vytvoř controller

`backend/src/modules/world-news/world-news.controller.ts`:
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
import { WorldNewsService } from './world-news.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CreateWorldNewsDto } from './dto/create-world-news.dto';
import { UpdateWorldNewsDto } from './dto/update-world-news.dto';
import { QueryWorldNewsDto } from './dto/query-world-news.dto';

@ApiTags('World News')
@Controller('news')
export class WorldNewsController {
  constructor(private readonly service: WorldNewsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Seznam novinek (anonymní). Bez worldId = vše. S worldId = svět + globální.',
  })
  @ApiResponse({ status: 200 })
  findMany(@Query() query: QueryWorldNewsDto) {
    return this.service.findMany({
      worldId: query.worldId,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail novinky (anonymní)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vytvoř novinku (Admin/Superadmin/PJ/PomocnyPJ)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(
    @Body() dto: CreateWorldNewsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aktualizuj novinku (partial)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'worldId v body zakázán' })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorldNewsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Smaž novinku' })
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

- [ ] **Step 7.2:** Ověř typecheck + lint

```bash
cd backend && npm run typecheck && npm run lint:check
```

Expected: PASS.

- [ ] **Step 7.3:** Commit

```bash
git add backend/src/modules/world-news/world-news.controller.ts
git commit -m "feat(world-news): controller s 5 endpointy (anon GET, gated write)"
```

---

## Task 8: Module wiring + registrace

**Files:**
- Create: `backend/src/modules/world-news/world-news.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 8.1:** Vytvoř modul

`backend/src/modules/world-news/world-news.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  WorldNewsSchemaClass,
  WorldNewsSchema,
} from './schemas/world-news.schema';
import { MongoWorldNewsRepository } from './repositories/world-news.repository';
import { WorldNewsService } from './world-news.service';
import { WorldNewsController } from './world-news.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldNewsSchemaClass.name, schema: WorldNewsSchema },
    ]),
    WorldsModule,
  ],
  controllers: [WorldNewsController],
  providers: [
    WorldNewsService,
    { provide: 'IWorldNewsRepository', useClass: MongoWorldNewsRepository },
  ],
})
export class WorldNewsModule {}
```

> Pozn.: `WorldsModule` exportuje `IWorldMembershipRepository` a `'IWorldsRepository'` (viz [worlds.module.ts:45](../../../backend/src/modules/worlds/worlds.module.ts#L45)) — tím dostaneme oba repo do DI.

- [ ] **Step 8.2:** Přidej modul do `AppModule`

`backend/src/app.module.ts`:

Najdi řádek `import { WorldCurrenciesModule } from './modules/world-currencies/world-currencies.module';` a **pod něj** přidej:

```ts
import { WorldNewsModule } from './modules/world-news/world-news.module';
```

V `imports: [...]` přidej `WorldNewsModule` na konec seznamu modulů (před `GatewaysModule`):

```ts
    AdminModule,
    WorldNewsModule,
    GatewaysModule,
```

- [ ] **Step 8.3:** Ověř, že aplikace nastartuje

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check --passWithNoTests
```

Expected: PASS, žádné dependency injection errory v jest output.

- [ ] **Step 8.4:** Commit

```bash
git add backend/src/modules/world-news/world-news.module.ts backend/src/app.module.ts
git commit -m "feat(world-news): wire modul do AppModule"
```

---

## Task 9: Migrate skript — mapper (TDD)

**Files:**
- Create: `backend/scripts/migrate-world-news/mapper.ts`
- Create: `backend/scripts/migrate-world-news/mapper.spec.ts`

- [ ] **Step 9.1:** Napiš failing testy mapperu

`backend/scripts/migrate-world-news/mapper.spec.ts`:
```ts
import { mapLegacyItem, normalizeWorldId, MapResult } from './mapper';

describe('mapLegacyItem', () => {
  const valid = {
    _id: { $oid: '65a1b2c3d4e5f60123456789' },
    WorldId: 'world1',
    Title: 'Titulek',
    Content: 'Obsah',
    Date: '2025-01-15T10:00:00.000Z',
    Type: 'info',
    Link: 'https://example.com',
  };

  it('mapuje PascalCase → camelCase', () => {
    const result = mapLegacyItem(valid) as MapResult & { ok: true };
    expect(result.ok).toBe(true);
    expect(result.data.title).toBe('Titulek');
    expect(result.data.content).toBe('Obsah');
    expect(result.data.date).toBe('2025-01-15T10:00:00.000Z');
    expect(result.data.type).toBe('info');
    expect(result.data.link).toBe('https://example.com');
    expect(result.data.worldId).toBe('world1');
  });

  it('zachová _id', () => {
    const result = mapLegacyItem(valid) as MapResult & { ok: true };
    expect(result.data._id).toBe('65a1b2c3d4e5f60123456789');
  });

  it('chybějící Title → ok=false s důvodem', () => {
    const result = mapLegacyItem({ ...valid, Title: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/title/i);
  });

  it('chybějící Content → ok=false', () => {
    const result = mapLegacyItem({ ...valid, Content: '' });
    expect(result.ok).toBe(false);
  });

  it('neplatný Type → ok=false', () => {
    const result = mapLegacyItem({ ...valid, Type: 'xxx' });
    expect(result.ok).toBe(false);
  });

  it('Type undefined → default info', () => {
    const result = mapLegacyItem({ ...valid, Type: undefined }) as MapResult & {
      ok: true;
    };
    expect(result.data.type).toBe('info');
  });

  it('Link undefined → vynechané v output', () => {
    const result = mapLegacyItem({ ...valid, Link: undefined }) as MapResult & {
      ok: true;
    };
    expect(result.data.link).toBeUndefined();
  });
});

describe('normalizeWorldId', () => {
  it('"MatrixWorldId" → null', () => {
    expect(normalizeWorldId('MatrixWorldId')).toBeNull();
  });
  it('null → null', () => {
    expect(normalizeWorldId(null)).toBeNull();
  });
  it('undefined → null', () => {
    expect(normalizeWorldId(undefined)).toBeNull();
  });
  it('prázdný string → null', () => {
    expect(normalizeWorldId('')).toBeNull();
  });
  it('skutečné ID → ponechané', () => {
    expect(normalizeWorldId('abc123')).toBe('abc123');
  });
});
```

- [ ] **Step 9.2:** Spusť test — selže

```bash
cd backend && npx jest migrate-world-news/mapper.spec --no-coverage
```

Expected: FAIL — `Cannot find module './mapper'`.

- [ ] **Step 9.3:** Implementuj mapper

`backend/scripts/migrate-world-news/mapper.ts`:
```ts
const VALID_TYPES = ['info', 'alert', 'system'] as const;
type WorldNewsType = (typeof VALID_TYPES)[number];

export interface MappedNews {
  _id: string;
  worldId: string | null;
  title: string;
  content: string;
  date: string;
  type: WorldNewsType;
  link?: string;
}

export type MapResult =
  | { ok: true; data: MappedNews }
  | { ok: false; reason: string };

export function normalizeWorldId(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw === '' || raw === 'MatrixWorldId') return null;
  return raw;
}

interface LegacyItem {
  _id?: { $oid?: string } | string;
  WorldId?: string | null;
  Title?: string;
  Content?: string;
  Date?: string;
  Type?: string;
  Link?: string;
}

function extractOid(id: LegacyItem['_id']): string | null {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && '$oid' in id && typeof id.$oid === 'string') {
    return id.$oid;
  }
  return null;
}

export function mapLegacyItem(raw: unknown): MapResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'item není objekt' };
  }
  const item = raw as LegacyItem;

  const _id = extractOid(item._id);
  if (!_id) return { ok: false, reason: '_id chybí nebo má neplatný formát' };

  if (!item.Title || typeof item.Title !== 'string') {
    return { ok: false, reason: 'Title chybí nebo není string' };
  }
  if (!item.Content || typeof item.Content !== 'string') {
    return { ok: false, reason: 'Content chybí nebo není string' };
  }
  if (!item.Date || typeof item.Date !== 'string') {
    return { ok: false, reason: 'Date chybí nebo není string' };
  }

  const type: WorldNewsType =
    item.Type === undefined
      ? 'info'
      : VALID_TYPES.includes(item.Type as WorldNewsType)
        ? (item.Type as WorldNewsType)
        : (null as unknown as WorldNewsType);
  if (item.Type !== undefined && !VALID_TYPES.includes(type)) {
    return {
      ok: false,
      reason: `Type '${item.Type}' není povoleno (info|alert|system)`,
    };
  }

  return {
    ok: true,
    data: {
      _id,
      worldId: normalizeWorldId(item.WorldId),
      title: item.Title,
      content: item.Content,
      date: item.Date,
      type,
      ...(item.Link ? { link: item.Link } : {}),
    },
  };
}
```

- [ ] **Step 9.4:** Spusť test — projde

```bash
cd backend && npx jest migrate-world-news/mapper.spec --no-coverage
```

Expected: PASS.

- [ ] **Step 9.5:** Commit

```bash
git add backend/scripts/migrate-world-news/mapper.ts backend/scripts/migrate-world-news/mapper.spec.ts
git commit -m "feat(scripts): WorldNews migrate mapper (PascalCase→camelCase, validate)"
```

---

## Task 10: Migrate skript — IO entrypoint

**Files:**
- Create: `backend/scripts/migrate-world-news/index.ts`
- Create: `backend/scripts/migrate-world-news/README.md`
- Modify: `backend/package.json`

- [ ] **Step 10.1:** Vytvoř entrypoint

`backend/scripts/migrate-world-news/index.ts`:
```ts
/* eslint-disable no-console */
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { mapLegacyItem } from './mapper';

// Env loading: skript NEčte .env automaticky.
// Spouštěj jako: `MONGODB_URI=... npm run migrate:news -- --input=...`
// nebo: `node --env-file=.env -r ts-node/register scripts/migrate-world-news/index.ts ...`

interface CliArgs {
  input: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let input = '';
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--input=')) input = arg.slice('--input='.length);
    else if (arg === '--dry-run') dryRun = true;
  }
  if (!input) {
    console.error('Použití: ts-node index.ts --input=<path.json> [--dry-run]');
    process.exit(1);
  }
  return { input, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`Vstupní soubor neexistuje: ${inputPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as unknown[];
  if (!Array.isArray(raw)) {
    console.error('Vstup musí být JSON pole');
    process.exit(1);
  }

  console.log(`📄 Načteno ${raw.length} položek z ${inputPath}`);
  if (args.dryRun) console.log('🧪 DRY RUN — žádný zápis do DB');

  const mapped: { _id: string; doc: Record<string, unknown> }[] = [];
  const skipped: { index: number; reason: string }[] = [];

  for (let i = 0; i < raw.length; i++) {
    const result = mapLegacyItem(raw[i]);
    if (result.ok) {
      const { _id, ...doc } = result.data;
      mapped.push({ _id, doc });
    } else {
      skipped.push({ index: i, reason: result.reason });
    }
  }

  console.log(`✅ Validních: ${mapped.length}`);
  console.log(`⏭️  Skipnutých: ${skipped.length}`);
  for (const s of skipped) {
    console.log(`   [${s.index}] ${s.reason}`);
  }

  if (args.dryRun || mapped.length === 0) {
    console.log('Hotovo (dry-run nebo nic k importu).');
    return;
  }

  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  console.log(`🔌 Připojuji k Mongo: ${uri.replace(/:[^@]+@/, ':***@')}`);
  await mongoose.connect(uri);

  try {
    const collection = mongoose.connection.collection('worldnews');
    const ops = mapped.map((m) => ({
      replaceOne: {
        filter: { _id: new mongoose.Types.ObjectId(m._id) },
        replacement: { ...m.doc, _id: new mongoose.Types.ObjectId(m._id) },
        upsert: true,
      },
    }));

    const result = await collection.bulkWrite(ops, { ordered: false });
    console.log(
      `✨ Import OK — upserts: ${result.upsertedCount}, modified: ${result.modifiedCount}, matched: ${result.matchedCount}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 10.2:** Vytvoř README

`backend/scripts/migrate-world-news/README.md`:
````markdown
# Migrate WorldNews

Jednorázový import news ze starého .NET produkčního systému.

## Použití

```bash
# Z backend/ adresáře — env var inline (preferováno)
MONGODB_URI=mongodb://localhost:27017/ikaros npx ts-node scripts/migrate-world-news/index.ts --input=./data/news-export.json --dry-run

# Nebo přes Node --env-file (Node 20+, čte backend/.env)
node --env-file=.env -r ts-node/register scripts/migrate-world-news/index.ts --input=./data/news-export.json

# Nebo přes npm script (spoléhá na shell env)
MONGODB_URI=mongodb://... npm run migrate:news -- --input=./data/news-export.json
```

> **Pozn.:** Skript NEčte `.env` automaticky (žádný `dotenv` import — vyhýbáme se závislosti). Pokud `MONGODB_URI` není v env, skript použije fallback `mongodb://localhost:27017/ikaros`.

## Vstupní formát

JSON pole s objekty (formát `mongoexport --jsonArray` ze staré DB):

```json
[
  {
    "_id": { "$oid": "65a1b2c3d4e5f60123456789" },
    "WorldId": "65a1...",  // null nebo "MatrixWorldId" → globální
    "Title": "...",
    "Content": "...",
    "Date": "2025-01-15T10:00:00.000Z",
    "Type": "info",
    "Link": "https://..."
  }
]
```

## Chování

- **Idempotentní:** `bulkWrite replaceOne` s `upsert: true` per `_id`. Re-run nevytvoří duplicity.
- **Skip on error:** položky bez `Title`/`Content`/`Date` nebo s neplatným `Type` se logují a skipnou. Migrace nepadne.
- **`MatrixWorldId` / null / "" → null** (globální).
- **`--dry-run`:** validuje a počítá, žádný zápis.
- **Connection:** čte `MONGODB_URI` z `backend/.env`.
````

- [ ] **Step 10.3:** Přidej npm script

V `backend/package.json` najdi sekci `"scripts"` a přidej řádek:

```json
"migrate:news": "ts-node scripts/migrate-world-news/index.ts",
```

(Vlož ho mezi `"parity"` a `"prepare"` — abecední pořadí není striktní, ale udržuj konzistenci.)

- [ ] **Step 10.4:** Ověř typecheck + lint + testy

```bash
cd backend && npm run typecheck && npm run lint:check && npx jest migrate-world-news --no-coverage
```

Expected: PASS.

- [ ] **Step 10.5:** Smoke test skriptu — dry-run s vymyšleným inputem

Vytvoř dočasný `c:\tmp\news-test.json` (per environment additional working dir; mimo repo, neriskujeme commit):
```json
[
  {
    "_id": { "$oid": "65a1b2c3d4e5f60123456789" },
    "WorldId": null,
    "Title": "Test smoke",
    "Content": "Smoke test content",
    "Date": "2026-05-06T10:00:00.000Z",
    "Type": "info"
  },
  {
    "_id": { "$oid": "65a1b2c3d4e5f60123456790" },
    "Title": "Bez Content",
    "Date": "2026-05-06T10:00:00.000Z"
  }
]
```

Spusť:
```bash
cd backend && npx ts-node scripts/migrate-world-news/index.ts --input=c:/tmp/news-test.json --dry-run
```

Expected output: `Načteno 2`, `Validních: 1`, `Skipnutých: 1`, žádné DB connection (dry-run).

Smaž testovací soubor:
```bash
rm c:/tmp/news-test.json
```

- [ ] **Step 10.6:** Commit

```bash
git add backend/scripts/migrate-world-news/index.ts backend/scripts/migrate-world-news/README.md backend/package.json
git commit -m "feat(scripts): WorldNews migrate CLI (idempotent upsert, dry-run)"
```

---

## Task 11: Smoke test celého modulu (manuální e2e)

**Cíl:** Ověřit, že modul funguje při běžícím serveru. Žádná kódová změna; jen ověření pre-merge.

- [ ] **Step 11.1:** Spusť dev server

```bash
cd backend && npm run start:dev
```

V dalším terminálu (server musí běžet):

- [ ] **Step 11.2:** Anon GET na prázdnou kolekci

```bash
curl -s http://localhost:3000/api/news
```

Expected: `[]`.

- [ ] **Step 11.3:** Anon POST → 401

```bash
curl -s -X POST http://localhost:3000/api/news -H "Content-Type: application/json" -d '{"title":"x","content":"y"}'
```

Expected: HTTP 401 nebo error JSON s `Unauthorized`.

- [ ] **Step 11.4:** Build production bundle

```bash
cd backend && npm run build
```

Expected: PASS bez TS chyb.

- [ ] **Step 11.5:** Zastav dev server (Ctrl+C v termu kde běží)

- [ ] **Step 11.6:** Update roadmapy (zaškrtni splnění)

V `docs/roadmap2.md`:

1. V sekci `### 3.1 WorldNews (Krok 10g) ⬜ **(nejjednodušší — start zde)**` změň `⬜` na `✅` v nadpisu a u všech `- [ ]` checkboxů na `- [x]`
2. V tabulce "Pořadí prací" najdi řádek `| 6 | Fáze 3.1 — WorldNews | nejjednodušší modul | 0,5 dne |` a přepiš na pattern předchozích hotových: `| ✅ | Fáze 3.1 — WorldNews | hotovo (2026-05-06) | — |`

- [ ] **Step 11.7:** Commit

```bash
git add docs/roadmap2.md
git commit -m "docs(roadmap): Fáze 3.1 WorldNews — splněno"
```

---

## Task 12: Final verification

- [ ] **Step 12.1:** Spusť celou test suite

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check
```

Expected: vše PASS.

- [ ] **Step 12.2:** Verifikuj git stav

```bash
git log --oneline -15
git status
```

Expected: 11+ commitů z tasků, čistý working tree.

- [ ] **Step 12.3:** Hotovo

Pokud je vše zelené, předej výsledek uživateli k review (per `superpowers:finishing-a-development-branch` nebo `superpowers:requesting-code-review`).

---

## Mimo scope (per spec)

- World-private news (per-world viditelnost jen členům)
- WebSocket broadcast nových news
- Markdown rendering v `content`
- Image attachments
- Migrace dat ze staré DB **bez** přístupu (skript je hotový, samotný import dat udělá uživatel až bude mít export soubor)
