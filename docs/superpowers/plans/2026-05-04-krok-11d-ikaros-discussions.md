# Krok 11d — IkarosDiscussions: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit modul `ikaros-discussions` — diskuzní fórum se schvalováním, manažery, pozváním, oblíbenými a stránkovanými příspěvky. Také rozšířit User schema o `favoriteDiscussionIds`.

**Architecture:** Samostatný NestJS modul se dvěma kolekcemi: `ikaros_discussions` a `ikaros_discussion_posts`. Oblíbené se ukládají do `User.favoriteDiscussionIds` přes `IUsersRepository.update()`. Admin = `Superadmin|Admin|PJ|SpravceDisukzi` nebo username `Tyky`. Reject = hard delete diskuze + všech příspěvků.

**Tech Stack:** NestJS, Mongoose, class-validator, Jest

**Předpoklad:** Kroky 11a–11c musí být hotovy (`UserRole` enum, `IUsersRepository.findByRoles`).

---

## Přehled souborů

| Soubor | Akce | Zodpovědnost |
|--------|------|--------------|
| `backend/src/modules/users/schemas/user.schema.ts` | Upravit | Přidat `favoriteDiscussionIds: string[]` |
| `backend/src/modules/users/interfaces/user.interface.ts` | Upravit | Přidat `favoriteDiscussionIds?: string[]` do `User` interface |
| `backend/src/modules/ikaros-discussions/interfaces/ikaros-discussion.interface.ts` | Vytvořit | Interface pro Discussion + Post |
| `backend/src/modules/ikaros-discussions/interfaces/ikaros-discussions-repository.interface.ts` | Vytvořit | Repository interface pro Discussion |
| `backend/src/modules/ikaros-discussions/interfaces/ikaros-discussion-posts-repository.interface.ts` | Vytvořit | Repository interface pro Post |
| `backend/src/modules/ikaros-discussions/schemas/ikaros-discussion.schema.ts` | Vytvořit | Mongoose schema, kolekce `ikaros_discussions` |
| `backend/src/modules/ikaros-discussions/schemas/ikaros-discussion-post.schema.ts` | Vytvořit | Mongoose schema, kolekce `ikaros_discussion_posts` |
| `backend/src/modules/ikaros-discussions/repositories/ikaros-discussions.repository.ts` | Vytvořit | MongoDB implementace Discussion |
| `backend/src/modules/ikaros-discussions/repositories/ikaros-discussion-posts.repository.ts` | Vytvořit | MongoDB implementace Post |
| `backend/src/modules/ikaros-discussions/dto/create-discussion.dto.ts` | Vytvořit | Validace POST |
| `backend/src/modules/ikaros-discussions/dto/patch-discussion.dto.ts` | Vytvořit | Validace PATCH |
| `backend/src/modules/ikaros-discussions/dto/reject-discussion.dto.ts` | Vytvořit | Validace POST /reject |
| `backend/src/modules/ikaros-discussions/dto/invite-user.dto.ts` | Vytvořit | Validace POST /invite |
| `backend/src/modules/ikaros-discussions/dto/add-post.dto.ts` | Vytvořit | Validace POST /:id/posts |
| `backend/src/modules/ikaros-discussions/ikaros-discussions.service.ts` | Vytvořit | Business logika + notifikace |
| `backend/src/modules/ikaros-discussions/ikaros-discussions.service.spec.ts` | Vytvořit | Unit testy |
| `backend/src/modules/ikaros-discussions/ikaros-discussions.controller.ts` | Vytvořit | HTTP endpointy |
| `backend/src/modules/ikaros-discussions/ikaros-discussions.module.ts` | Vytvořit | NestJS modul |
| `backend/src/app.module.ts` | Upravit | Přidat `IkarosDiscussionsModule` |
| `docs/roadmap.md` | Upravit | Označit krok 11d jako ✅ |

---

## Task 1: User schema rozšíření o favoriteDiscussionIds

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts`
- Modify: `backend/src/modules/users/schemas/user.schema.ts`

- [ ] **Step 1: Přidat pole do User interface**

V `backend/src/modules/users/interfaces/user.interface.ts` přidej do interface `User`:

```typescript
export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
  avatarUrl?: string;
  profileImageUrl?: string;
  characterPath?: string;
  ikarosSkin?: string;
  themeSettings: Record<string, unknown>;
  chatPreferences: Record<string, unknown>;
  favoriteDiscussionIds: string[];
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Přidat pole do User schema**

V `backend/src/modules/users/schemas/user.schema.ts` přidej do třídy `UserSchemaClass`:

```typescript
@Prop({ type: [String], default: [] }) favoriteDiscussionIds: string[];
```

- [ ] **Step 3: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/users/interfaces/user.interface.ts backend/src/modules/users/schemas/user.schema.ts
git commit -m "feat(users): přidat favoriteDiscussionIds do User schema"
```

---

## Task 2: Interfaces + Schemas

**Files:**
- Create: `backend/src/modules/ikaros-discussions/interfaces/ikaros-discussion.interface.ts`
- Create: `backend/src/modules/ikaros-discussions/interfaces/ikaros-discussions-repository.interface.ts`
- Create: `backend/src/modules/ikaros-discussions/interfaces/ikaros-discussion-posts-repository.interface.ts`
- Create: `backend/src/modules/ikaros-discussions/schemas/ikaros-discussion.schema.ts`
- Create: `backend/src/modules/ikaros-discussions/schemas/ikaros-discussion-post.schema.ts`

- [ ] **Step 1: Vytvořit interfaces**

```typescript
// backend/src/modules/ikaros-discussions/interfaces/ikaros-discussion.interface.ts
export interface IkarosDiscussion {
  id: string;
  title: string;
  description: string;
  bulletin: string;
  creatorId: string;
  creatorName: string;
  isApproved: boolean;
  isOpen: boolean;
  managerIds: string[];
  invitedUserIds: string[];
  postCount: number;
  likeCount: number;
  createdAtUtc: Date;
  lastActivityUtc: Date;
}

export interface IkarosDiscussionPost {
  id: string;
  discussionId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAtUtc: Date;
}
```

- [ ] **Step 2: Vytvořit repository interfaces**

```typescript
// backend/src/modules/ikaros-discussions/interfaces/ikaros-discussions-repository.interface.ts
import type { IkarosDiscussion } from './ikaros-discussion.interface';

export interface IIkarosDiscussionsRepository {
  findAll(): Promise<IkarosDiscussion[]>;
  findPending(): Promise<IkarosDiscussion[]>;
  findByIds(ids: string[]): Promise<IkarosDiscussion[]>;
  findById(id: string): Promise<IkarosDiscussion | null>;
  create(data: Omit<IkarosDiscussion, 'id'>): Promise<IkarosDiscussion>;
  update(id: string, data: Partial<IkarosDiscussion>): Promise<IkarosDiscussion | null>;
  delete(id: string): Promise<boolean>;
}
```

```typescript
// backend/src/modules/ikaros-discussions/interfaces/ikaros-discussion-posts-repository.interface.ts
import type { IkarosDiscussionPost } from './ikaros-discussion.interface';

export interface IIkarosDiscussionPostsRepository {
  findByDiscussion(discussionId: string, skip: number, limit: number): Promise<IkarosDiscussionPost[]>;
  findById(id: string): Promise<IkarosDiscussionPost | null>;
  create(data: Omit<IkarosDiscussionPost, 'id'>): Promise<IkarosDiscussionPost>;
  delete(id: string): Promise<boolean>;
  deleteByDiscussion(discussionId: string): Promise<void>;
}
```

- [ ] **Step 3: Vytvořit Mongoose schémata**

```typescript
// backend/src/modules/ikaros-discussions/schemas/ikaros-discussion.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosDiscussionDocument = HydratedDocument<IkarosDiscussionSchemaClass>;

@Schema({ collection: 'ikaros_discussions' })
export class IkarosDiscussionSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: '' }) bulletin: string;
  @Prop({ required: true }) creatorId: string;
  @Prop({ required: true }) creatorName: string;
  @Prop({ default: false }) isApproved: boolean;
  @Prop({ default: true }) isOpen: boolean;
  @Prop({ type: [String], default: [] }) managerIds: string[];
  @Prop({ type: [String], default: [] }) invitedUserIds: string[];
  @Prop({ default: 0 }) postCount: number;
  @Prop({ default: 0 }) likeCount: number;
  @Prop({ required: true, default: () => new Date() }) createdAtUtc: Date;
  @Prop({ required: true, default: () => new Date() }) lastActivityUtc: Date;
}

export const IkarosDiscussionSchema = SchemaFactory.createForClass(IkarosDiscussionSchemaClass);
IkarosDiscussionSchema.index({ isApproved: 1, isOpen: 1 });
```

```typescript
// backend/src/modules/ikaros-discussions/schemas/ikaros-discussion-post.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosDiscussionPostDocument = HydratedDocument<IkarosDiscussionPostSchemaClass>;

@Schema({ collection: 'ikaros_discussion_posts' })
export class IkarosDiscussionPostSchemaClass {
  @Prop({ required: true }) discussionId: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true }) content: string;
  @Prop({ required: true, default: () => new Date() }) createdAtUtc: Date;
}

export const IkarosDiscussionPostSchema = SchemaFactory.createForClass(IkarosDiscussionPostSchemaClass);
IkarosDiscussionPostSchema.index({ discussionId: 1, createdAtUtc: 1 });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/ikaros-discussions/interfaces/ backend/src/modules/ikaros-discussions/schemas/
git commit -m "feat(ikaros-discussions): interfaces a schemata"
```

---

## Task 3: Repositories

**Files:**
- Create: `backend/src/modules/ikaros-discussions/repositories/ikaros-discussions.repository.ts`
- Create: `backend/src/modules/ikaros-discussions/repositories/ikaros-discussion-posts.repository.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// backend/src/modules/ikaros-discussions/repositories/ikaros-discussions.repository.spec.ts
import { MongoIkarosDiscussionsRepository } from './ikaros-discussions.repository';

describe('MongoIkarosDiscussionsRepository', () => {
  const mockModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    findByIdAndDelete: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  };

  it('findPending volá find s isApproved false', async () => {
    const repo = new MongoIkarosDiscussionsRepository(mockModel as never);
    await repo.findPending();
    expect(mockModel.find).toHaveBeenCalledWith({ isApproved: false });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-discussions.repository.spec --no-coverage
```
Očekáváno: FAIL.

- [ ] **Step 3: Implementovat Discussion repository**

```typescript
// backend/src/modules/ikaros-discussions/repositories/ikaros-discussions.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosDiscussionsRepository } from '../interfaces/ikaros-discussions-repository.interface';
import type { IkarosDiscussion } from '../interfaces/ikaros-discussion.interface';
import { IkarosDiscussionSchemaClass, type IkarosDiscussionDocument } from '../schemas/ikaros-discussion.schema';

@Injectable()
export class MongoIkarosDiscussionsRepository implements IIkarosDiscussionsRepository {
  constructor(
    @InjectModel(IkarosDiscussionSchemaClass.name)
    private readonly model: Model<IkarosDiscussionDocument>,
  ) {}

  private toEntity(doc: IkarosDiscussionDocument): IkarosDiscussion {
    return {
      id: (doc._id as { toString(): string }).toString(),
      title: doc.title,
      description: doc.description,
      bulletin: doc.bulletin,
      creatorId: doc.creatorId,
      creatorName: doc.creatorName,
      isApproved: doc.isApproved,
      isOpen: doc.isOpen,
      managerIds: doc.managerIds ?? [],
      invitedUserIds: doc.invitedUserIds ?? [],
      postCount: doc.postCount,
      likeCount: doc.likeCount,
      createdAtUtc: doc.createdAtUtc,
      lastActivityUtc: doc.lastActivityUtc,
    };
  }

  async findAll(): Promise<IkarosDiscussion[]> {
    const docs = await this.model.find().lean<IkarosDiscussionDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosDiscussionDocument));
  }

  async findPending(): Promise<IkarosDiscussion[]> {
    const docs = await this.model.find({ isApproved: false }).lean<IkarosDiscussionDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosDiscussionDocument));
  }

  async findByIds(ids: string[]): Promise<IkarosDiscussion[]> {
    const docs = await this.model.find({ _id: { $in: ids } }).lean<IkarosDiscussionDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosDiscussionDocument));
  }

  async findById(id: string): Promise<IkarosDiscussion | null> {
    const doc = await this.model.findById(id).lean<IkarosDiscussionDocument>();
    return doc ? this.toEntity(doc as unknown as IkarosDiscussionDocument) : null;
  }

  async create(data: Omit<IkarosDiscussion, 'id'>): Promise<IkarosDiscussion> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async update(id: string, data: Partial<IkarosDiscussion>): Promise<IkarosDiscussion | null> {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).lean<IkarosDiscussionDocument>();
    return doc ? this.toEntity(doc as unknown as IkarosDiscussionDocument) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean();
    return result !== null;
  }
}
```

- [ ] **Step 4: Implementovat Post repository**

```typescript
// backend/src/modules/ikaros-discussions/repositories/ikaros-discussion-posts.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosDiscussionPostsRepository } from '../interfaces/ikaros-discussion-posts-repository.interface';
import type { IkarosDiscussionPost } from '../interfaces/ikaros-discussion.interface';
import { IkarosDiscussionPostSchemaClass, type IkarosDiscussionPostDocument } from '../schemas/ikaros-discussion-post.schema';

@Injectable()
export class MongoIkarosDiscussionPostsRepository implements IIkarosDiscussionPostsRepository {
  constructor(
    @InjectModel(IkarosDiscussionPostSchemaClass.name)
    private readonly model: Model<IkarosDiscussionPostDocument>,
  ) {}

  private toEntity(doc: IkarosDiscussionPostDocument): IkarosDiscussionPost {
    return {
      id: (doc._id as { toString(): string }).toString(),
      discussionId: doc.discussionId,
      authorId: doc.authorId,
      authorName: doc.authorName,
      content: doc.content,
      createdAtUtc: doc.createdAtUtc,
    };
  }

  async findByDiscussion(discussionId: string, skip: number, limit: number): Promise<IkarosDiscussionPost[]> {
    const docs = await this.model
      .find({ discussionId })
      .sort({ createdAtUtc: 1 })
      .skip(skip)
      .limit(limit)
      .lean<IkarosDiscussionPostDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosDiscussionPostDocument));
  }

  async findById(id: string): Promise<IkarosDiscussionPost | null> {
    const doc = await this.model.findById(id).lean<IkarosDiscussionPostDocument>();
    return doc ? this.toEntity(doc as unknown as IkarosDiscussionPostDocument) : null;
  }

  async create(data: Omit<IkarosDiscussionPost, 'id'>): Promise<IkarosDiscussionPost> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean();
    return result !== null;
  }

  async deleteByDiscussion(discussionId: string): Promise<void> {
    await this.model.deleteMany({ discussionId });
  }
}
```

- [ ] **Step 5: Spustit test, ověřit PASS**

```bash
cd backend && npx jest ikaros-discussions.repository.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/ikaros-discussions/repositories/
git commit -m "feat(ikaros-discussions): repositories implementace"
```

---

## Task 4: DTOs

**Files:**
- Create: `backend/src/modules/ikaros-discussions/dto/create-discussion.dto.ts`
- Create: `backend/src/modules/ikaros-discussions/dto/patch-discussion.dto.ts`
- Create: `backend/src/modules/ikaros-discussions/dto/reject-discussion.dto.ts`
- Create: `backend/src/modules/ikaros-discussions/dto/invite-user.dto.ts`
- Create: `backend/src/modules/ikaros-discussions/dto/add-post.dto.ts`

- [ ] **Step 1: Vytvořit DTOs**

```typescript
// backend/src/modules/ikaros-discussions/dto/create-discussion.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateDiscussionDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  title: string;

  @IsString() @IsNotEmpty() @MaxLength(5000)
  description: string;
}
```

```typescript
// backend/src/modules/ikaros-discussions/dto/patch-discussion.dto.ts
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class PatchDiscussionDto {
  @IsString() @IsOptional() @MaxLength(200)
  title?: string;

  @IsString() @IsOptional() @MaxLength(5000)
  description?: string;

  @IsString() @IsOptional() @MaxLength(5000)
  bulletin?: string;

  @IsBoolean() @IsOptional()
  isOpen?: boolean;
}
```

```typescript
// backend/src/modules/ikaros-discussions/dto/reject-discussion.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RejectDiscussionDto {
  @IsString() @IsOptional() @MaxLength(1000)
  reason?: string;
}
```

```typescript
// backend/src/modules/ikaros-discussions/dto/invite-user.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class InviteUserDto {
  @IsString() @IsNotEmpty()
  userId: string;
}
```

```typescript
// backend/src/modules/ikaros-discussions/dto/add-post.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AddPostDto {
  @IsString() @IsNotEmpty() @MaxLength(10000)
  content: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/ikaros-discussions/dto/
git commit -m "feat(ikaros-discussions): DTOs s validací"
```

---

## Task 5: Service + testy

**Files:**
- Create: `backend/src/modules/ikaros-discussions/ikaros-discussions.service.ts`
- Create: `backend/src/modules/ikaros-discussions/ikaros-discussions.service.spec.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/ikaros-discussions/ikaros-discussions.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockDiscussion = {
  id: 'disc1',
  title: 'Diskuze',
  description: 'Popis',
  bulletin: '',
  creatorId: 'user1',
  creatorName: 'Tvůrce',
  isApproved: false,
  isOpen: true,
  managerIds: ['user1'],
  invitedUserIds: [],
  postCount: 0,
  likeCount: 0,
  createdAtUtc: new Date(),
  lastActivityUtc: new Date(),
};

const mockPost = {
  id: 'post1',
  discussionId: 'disc1',
  authorId: 'user2',
  authorName: 'Autor',
  content: 'Obsah příspěvku',
  createdAtUtc: new Date(),
};

describe('IkarosDiscussionsService', () => {
  let service: IkarosDiscussionsService;
  const mockRepo = {
    findAll: jest.fn(),
    findPending: jest.fn(),
    findByIds: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockPostsRepo = {
    findByDiscussion: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteByDiscussion: jest.fn(),
  };
  const mockUsersRepo = {
    findByRoles: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  };
  const mockMsgService = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosDiscussionsService,
        { provide: 'IIkarosDiscussionsRepository', useValue: mockRepo },
        { provide: 'IIkarosDiscussionPostsRepository', useValue: mockPostsRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
      ],
    }).compile();
    service = module.get(IkarosDiscussionsService);
  });

  describe('isAdmin', () => {
    it('SpravceDisukzi je admin', () => expect(service.isAdmin(UserRole.SpravceDisukzi, 'nekdo')).toBe(true));
    it('Tyky je admin', () => expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(true));
    it('Hráč není admin', () => expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
  });

  describe('create', () => {
    it('admin vytvoří diskuzi rovnou schválenou', async () => {
      mockRepo.create.mockResolvedValue({ ...mockDiscussion, isApproved: true });
      const result = await service.create({ title: 'X', description: 'Y' }, 'user1', 'Admin', UserRole.Admin, 'Admin');
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ isApproved: true }));
      expect(result.isApproved).toBe(true);
    });

    it('non-admin vytvoří neschválenou diskuzi a notifikuje adminy', async () => {
      mockRepo.create.mockResolvedValue(mockDiscussion);
      mockUsersRepo.findByRoles.mockResolvedValue([{ id: 'a1', username: 'Admin' }]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.create({ title: 'X', description: 'Y' }, 'user1', 'Hráč', UserRole.Hrac, 'hrac');
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ isApproved: false }));
      expect(mockMsgService.create).toHaveBeenCalled();
    });

    it('creatorId je auto-přidán do managerIds', async () => {
      mockRepo.create.mockResolvedValue(mockDiscussion);
      mockUsersRepo.findByRoles.mockResolvedValue([]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.create({ title: 'X', description: 'Y' }, 'user1', 'Hráč', UserRole.Hrac, 'hrac');
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ managerIds: ['user1'] }));
    });
  });

  describe('findAll', () => {
    it('admin vidí vše', async () => {
      const all = [mockDiscussion, { ...mockDiscussion, id: 'disc2', isApproved: false }];
      mockRepo.findAll.mockResolvedValue(all);
      const result = await service.findAll('admin', UserRole.Admin, 'Admin');
      expect(result).toHaveLength(2);
    });

    it('hráč vidí jen schválené otevřené nebo kde má přístup', async () => {
      const openApproved = { ...mockDiscussion, isApproved: true, isOpen: true };
      const closedNotInvited = { ...mockDiscussion, id: 'd2', isApproved: true, isOpen: false, invitedUserIds: [], managerIds: [], creatorId: 'other' };
      mockRepo.findAll.mockResolvedValue([openApproved, closedNotInvited]);
      const result = await service.findAll('user1', UserRole.Hrac, 'hrac');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('disc1');
    });
  });

  describe('approve', () => {
    it('admin schválí diskuzi, notifikuje tvůrce', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      mockRepo.update.mockResolvedValue({ ...mockDiscussion, isApproved: true });
      await service.approve('disc1', UserRole.Admin, 'Admin');
      expect(mockRepo.update).toHaveBeenCalledWith('disc1', { isApproved: true });
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Vaše diskuze byla schválena', recipientId: 'user1' }),
        expect.anything(),
      );
    });
  });

  describe('reject', () => {
    it('smaže diskuzi i všechny příspěvky, notifikuje tvůrce', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion);
      mockRepo.delete.mockResolvedValue(true);
      mockPostsRepo.deleteByDiscussion.mockResolvedValue(undefined);
      await service.reject('disc1', 'Nevyhovuje', UserRole.Admin, 'Admin');
      expect(mockPostsRepo.deleteByDiscussion).toHaveBeenCalledWith('disc1');
      expect(mockRepo.delete).toHaveBeenCalledWith('disc1');
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Vaše diskuze byla zamítnuta', recipientId: 'user1' }),
        expect.anything(),
      );
    });

    it('hodí ForbiddenException pro non-admina', async () => {
      await expect(service.reject('disc1', undefined, UserRole.Hrac, 'nekdo')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('toggleFavorite', () => {
    it('přidá diskuzi do oblíbených pokud tam není', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'user1', favoriteDiscussionIds: [] });
      mockUsersRepo.update.mockResolvedValue({ id: 'user1', favoriteDiscussionIds: ['disc1'] });
      const result = await service.toggleFavorite('disc1', 'user1');
      expect(result).toEqual({ isFavorite: true });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user1', { favoriteDiscussionIds: ['disc1'] });
    });

    it('odebere diskuzi z oblíbených pokud tam je', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'user1', favoriteDiscussionIds: ['disc1'] });
      mockUsersRepo.update.mockResolvedValue({ id: 'user1', favoriteDiscussionIds: [] });
      const result = await service.toggleFavorite('disc1', 'user1');
      expect(result).toEqual({ isFavorite: false });
      expect(mockUsersRepo.update).toHaveBeenCalledWith('user1', { favoriteDiscussionIds: [] });
    });
  });

  describe('addPost', () => {
    it('hodí BadRequestException pokud diskuze není schválena', async () => {
      mockRepo.findById.mockResolvedValue(mockDiscussion); // isApproved: false
      await expect(service.addPost('disc1', 'Obsah', 'user2', 'Autor')).rejects.toThrow(BadRequestException);
    });

    it('vytvoří příspěvek a inkrementuje postCount', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockDiscussion, isApproved: true });
      mockPostsRepo.create.mockResolvedValue(mockPost);
      mockRepo.update.mockResolvedValue({ ...mockDiscussion, postCount: 1 });
      const result = await service.addPost('disc1', 'Obsah', 'user2', 'Autor');
      expect(mockPostsRepo.create).toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith('disc1', expect.objectContaining({ postCount: 1 }));
      expect(result).toEqual(mockPost);
    });
  });

  describe('deletePost', () => {
    it('autor smí smazat vlastní příspěvek', async () => {
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockRepo.findById.mockResolvedValue({ ...mockDiscussion, isApproved: true });
      mockPostsRepo.delete.mockResolvedValue(true);
      mockRepo.update.mockResolvedValue({ ...mockDiscussion, postCount: 0 });
      await expect(service.deletePost('disc1', 'post1', 'user2', UserRole.Hrac, 'Autor')).resolves.toBeUndefined();
    });

    it('manager smí smazat cizí příspěvek', async () => {
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockRepo.findById.mockResolvedValue({ ...mockDiscussion, isApproved: true, managerIds: ['manager1'] });
      mockPostsRepo.delete.mockResolvedValue(true);
      mockRepo.update.mockResolvedValue({ ...mockDiscussion, postCount: 0 });
      await expect(service.deletePost('disc1', 'post1', 'manager1', UserRole.Hrac, 'Manager')).resolves.toBeUndefined();
    });

    it('cizí uživatel bez práv nesmí smazat příspěvek', async () => {
      mockPostsRepo.findById.mockResolvedValue(mockPost);
      mockRepo.findById.mockResolvedValue({ ...mockDiscussion, isApproved: true });
      await expect(service.deletePost('disc1', 'post1', 'jiny', UserRole.Hrac, 'nekdo')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-discussions.service.spec --no-coverage
```
Očekáváno: FAIL.

- [ ] **Step 3: Implementovat service**

```typescript
// backend/src/modules/ikaros-discussions/ikaros-discussions.service.ts
import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IIkarosDiscussionsRepository } from './interfaces/ikaros-discussions-repository.interface';
import type { IIkarosDiscussionPostsRepository } from './interfaces/ikaros-discussion-posts-repository.interface';
import type { IkarosDiscussion, IkarosDiscussionPost } from './interfaces/ikaros-discussion.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateDiscussionDto } from './dto/create-discussion.dto';
import type { PatchDiscussionDto } from './dto/patch-discussion.dto';

const ADMIN_ROLES = [UserRole.Superadmin, UserRole.Admin, UserRole.PJ, UserRole.SpravceDisukzi];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

@Injectable()
export class IkarosDiscussionsService {
  constructor(
    @Inject('IIkarosDiscussionsRepository') private readonly repo: IIkarosDiscussionsRepository,
    @Inject('IIkarosDiscussionPostsRepository') private readonly postsRepo: IIkarosDiscussionPostsRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IkarosMessagesService') private readonly msgService: IkarosMessagesService,
  ) {}

  isAdmin(role: UserRole, username: string): boolean {
    return ADMIN_ROLES.includes(role) || username === 'Tyky';
  }

  private assertAdmin(role: UserRole, username: string): void {
    if (!this.isAdmin(role, username)) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  private isManagerOrAdmin(discussion: IkarosDiscussion, userId: string, role: UserRole, username: string): boolean {
    return discussion.managerIds.includes(userId) || this.isAdmin(role, username);
  }

  private canAccessDiscussion(discussion: IkarosDiscussion, userId: string, role: UserRole, username: string): boolean {
    if (this.isAdmin(role, username)) return true;
    if (!discussion.isApproved) return false;
    if (discussion.isOpen) return true;
    return (
      discussion.creatorId === userId ||
      discussion.managerIds.includes(userId) ||
      discussion.invitedUserIds.includes(userId)
    );
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    const tyky = await this.usersRepo.findByUsername('Tyky');
    const recipients = [...admins];
    if (tyky && !admins.some((a) => a.id === tyky.id)) recipients.push(tyky);
    await Promise.all(
      recipients.map((r) =>
        this.msgService.create({ recipientId: r.id, recipientName: r.username, subject, body }, SYSTEM_SENDER),
      ),
    );
  }

  private async notifyUser(recipientId: string, recipientName: string, subject: string, body: string): Promise<void> {
    await this.msgService.create({ recipientId, recipientName, subject, body }, SYSTEM_SENDER);
  }

  async findAll(userId: string, role: UserRole, username: string): Promise<IkarosDiscussion[]> {
    const all = await this.repo.findAll();
    return all.filter((d) => this.canAccessDiscussion(d, userId, role, username));
  }

  async findPending(role: UserRole, username: string): Promise<IkarosDiscussion[]> {
    this.assertAdmin(role, username);
    return this.repo.findPending();
  }

  async findMyFavorites(userId: string): Promise<IkarosDiscussion[]> {
    const user = await this.usersRepo.findById(userId);
    if (!user) return [];
    const ids = user.favoriteDiscussionIds ?? [];
    if (ids.length === 0) return [];
    return this.repo.findByIds(ids);
  }

  async findById(id: string, userId: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.canAccessDiscussion(discussion, userId, role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    return discussion;
  }

  async create(dto: CreateDiscussionDto, creatorId: string, creatorName: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const isApproved = this.isAdmin(role, username);
    const discussion = await this.repo.create({
      title: dto.title,
      description: dto.description,
      bulletin: '',
      creatorId,
      creatorName,
      isApproved,
      isOpen: true,
      managerIds: [creatorId],
      invitedUserIds: [],
      postCount: 0,
      likeCount: 0,
      createdAtUtc: new Date(),
      lastActivityUtc: new Date(),
    });
    if (!isApproved) {
      await this.notifyAdmins('Nová diskuze čeká na schválení', `Uživatel ${creatorName} vytvořil novou diskuzi.`);
    }
    return discussion;
  }

  async patch(id: string, dto: PatchDiscussionDto, userId: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.isManagerOrAdmin(discussion, userId, role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    const updated = await this.repo.update(id, dto);
    return updated!;
  }

  async approve(id: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    this.assertAdmin(role, username);
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    const updated = await this.repo.update(id, { isApproved: true });
    await this.notifyUser(discussion.creatorId, discussion.creatorName, 'Vaše diskuze byla schválena', `Diskuze "${discussion.title}" byla schválena.`);
    return updated!;
  }

  async reject(id: string, reason: string | undefined, role: UserRole, username: string): Promise<void> {
    this.assertAdmin(role, username);
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    await this.postsRepo.deleteByDiscussion(id);
    await this.repo.delete(id);
    const body = reason ? `Důvod zamítnutí: ${reason}` : `Vaše diskuze "${discussion.title}" byla zamítnuta.`;
    await this.notifyUser(discussion.creatorId, discussion.creatorName, 'Vaše diskuze byla zamítnuta', body);
  }

  async invite(id: string, userId: string, invitedByUserId: string, role: UserRole, username: string): Promise<IkarosDiscussion> {
    const discussion = await this.repo.findById(id);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.isManagerOrAdmin(discussion, invitedByUserId, role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    if (discussion.invitedUserIds.includes(userId)) return discussion;
    const updated = await this.repo.update(id, { invitedUserIds: [...discussion.invitedUserIds, userId] });
    const invitedUser = await this.usersRepo.findById(userId);
    if (invitedUser) {
      await this.notifyUser(userId, invitedUser.username, 'Byl/a jsi pozván/a do diskuze', `Byl/a jsi pozván/a do diskuze "${discussion.title}".`);
    }
    return updated!;
  }

  async toggleFavorite(discussionId: string, userId: string): Promise<{ isFavorite: boolean }> {
    const user = await this.usersRepo.findById(userId);
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    const favorites = user.favoriteDiscussionIds ?? [];
    const isFavorite = favorites.includes(discussionId);
    const newFavorites = isFavorite
      ? favorites.filter((id) => id !== discussionId)
      : [...favorites, discussionId];
    await this.usersRepo.update(userId, { favoriteDiscussionIds: newFavorites });
    return { isFavorite: !isFavorite };
  }

  async getPosts(discussionId: string, userId: string, role: UserRole, username: string, skip = 0, limit = 50): Promise<IkarosDiscussionPost[]> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!this.canAccessDiscussion(discussion, userId, role, username)) throw new ForbiddenException('Přístup odepřen');
    return this.postsRepo.findByDiscussion(discussionId, skip, Math.min(limit, 100));
  }

  async addPost(discussionId: string, content: string, authorId: string, authorName: string): Promise<IkarosDiscussionPost> {
    const discussion = await this.repo.findById(discussionId);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    if (!discussion.isApproved) throw new BadRequestException('Nelze přidat příspěvek do neschválené diskuze');
    const post = await this.postsRepo.create({
      discussionId,
      authorId,
      authorName,
      content,
      createdAtUtc: new Date(),
    });
    await this.repo.update(discussionId, {
      postCount: discussion.postCount + 1,
      lastActivityUtc: new Date(),
    });
    return post;
  }

  async deletePost(discussionId: string, postId: string, userId: string, role: UserRole, username: string): Promise<void> {
    const post = await this.postsRepo.findById(postId);
    if (!post) throw new NotFoundException('Příspěvek nenalezen');
    const discussion = await this.repo.findById(discussionId);
    if (!discussion) throw new NotFoundException('Diskuze nenalezena');
    const isAuthor = post.authorId === userId;
    const isManager = discussion.managerIds.includes(userId);
    if (!isAuthor && !isManager && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    await this.postsRepo.delete(postId);
    await this.repo.update(discussionId, { postCount: Math.max(0, discussion.postCount - 1) });
  }
}
```

- [ ] **Step 4: Spustit testy, ověřit PASS**

```bash
cd backend && npx jest ikaros-discussions.service.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ikaros-discussions/ikaros-discussions.service.ts backend/src/modules/ikaros-discussions/ikaros-discussions.service.spec.ts
git commit -m "feat(ikaros-discussions): service s logikou, notifikacemi + testy"
```

---

## Task 6: Controller + Module

**Files:**
- Create: `backend/src/modules/ikaros-discussions/ikaros-discussions.controller.ts`
- Create: `backend/src/modules/ikaros-discussions/ikaros-discussions.module.ts`

- [ ] **Step 1: Vytvořit controller**

```typescript
// backend/src/modules/ikaros-discussions/ikaros-discussions.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { PatchDiscussionDto } from './dto/patch-discussion.dto';
import { RejectDiscussionDto } from './dto/reject-discussion.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AddPostDto } from './dto/add-post.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; username: string; role: UserRole }

@Controller('ikaros-discussions')
@UseGuards(JwtAuthGuard)
export class IkarosDiscussionsController {
  constructor(private readonly service: IkarosDiscussionsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.id, user.role, user.username);
  }

  @Get('pending')
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('my-favorites')
  findMyFavorites(@CurrentUser() user: RequestUser) {
    return this.service.findMyFavorites(user.id);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  create(@Body() dto: CreateDiscussionDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role, user.username);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: PatchDiscussionDto, @CurrentUser() user: RequestUser) {
    return this.service.patch(id, dto, user.id, user.role, user.username);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  @HttpCode(204)
  async reject(@Param('id') id: string, @Body() dto: RejectDiscussionDto, @CurrentUser() user: RequestUser) {
    await this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/invite')
  invite(@Param('id') id: string, @Body() dto: InviteUserDto, @CurrentUser() user: RequestUser) {
    return this.service.invite(id, dto.userId, user.id, user.role, user.username);
  }

  @Post(':id/toggle-favorite')
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.toggleFavorite(id, user.id);
  }

  @Get(':id/posts')
  getPosts(
    @Param('id') id: string,
    @Query('skip') skip: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getPosts(id, user.id, user.role, user.username, parseInt(skip ?? '0', 10), parseInt(limit ?? '50', 10));
  }

  @Post(':id/posts')
  addPost(@Param('id') id: string, @Body() dto: AddPostDto, @CurrentUser() user: RequestUser) {
    return this.service.addPost(id, dto.content, user.id, user.username);
  }

  @Delete(':id/posts/:postId')
  @HttpCode(204)
  async deletePost(@Param('id') id: string, @Param('postId') postId: string, @CurrentUser() user: RequestUser) {
    await this.service.deletePost(id, postId, user.id, user.role, user.username);
  }
}
```

- [ ] **Step 2: Vytvořit modul**

```typescript
// backend/src/modules/ikaros-discussions/ikaros-discussions.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IkarosDiscussionSchemaClass, IkarosDiscussionSchema } from './schemas/ikaros-discussion.schema';
import { IkarosDiscussionPostSchemaClass, IkarosDiscussionPostSchema } from './schemas/ikaros-discussion-post.schema';
import { MongoIkarosDiscussionsRepository } from './repositories/ikaros-discussions.repository';
import { MongoIkarosDiscussionPostsRepository } from './repositories/ikaros-discussion-posts.repository';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { IkarosDiscussionsController } from './ikaros-discussions.controller';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosDiscussionSchemaClass.name, schema: IkarosDiscussionSchema },
      { name: IkarosDiscussionPostSchemaClass.name, schema: IkarosDiscussionPostSchema },
    ]),
    IkarosMessagesModule,
  ],
  controllers: [IkarosDiscussionsController],
  providers: [
    IkarosDiscussionsService,
    { provide: 'IIkarosDiscussionsRepository', useClass: MongoIkarosDiscussionsRepository },
    { provide: 'IIkarosDiscussionPostsRepository', useClass: MongoIkarosDiscussionPostsRepository },
    { provide: 'IkarosMessagesService', useExisting: 'IkarosMessagesService' },
  ],
})
export class IkarosDiscussionsModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ikaros-discussions/ikaros-discussions.controller.ts backend/src/modules/ikaros-discussions/ikaros-discussions.module.ts
git commit -m "feat(ikaros-discussions): controller a modul"
```

---

## Task 7: Registrace + roadmapa

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Přidat `IkarosDiscussionsModule` do app.module.ts**

V `backend/src/app.module.ts` přidej:
```typescript
import { IkarosDiscussionsModule } from './modules/ikaros-discussions/ikaros-discussions.module';
```
A do pole `imports` přidej `IkarosDiscussionsModule`.

- [ ] **Step 2: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby.

- [ ] **Step 3: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 4: Aktualizovat roadmapu**

V `docs/roadmap.md` v sekci `## Krok 11d — IkarosDiscussions ⬜`:
- Změň `⬜` na `✅`, zaškrtni checkboxy
- Doplň: `**Plán:** [docs/superpowers/plans/2026-05-04-krok-11d-ikaros-discussions.md](superpowers/plans/2026-05-04-krok-11d-ikaros-discussions.md)`

V tabulce změň `| 11d | IkarosDiscussions | ⬜ |` na `| 11d | IkarosDiscussions | ✅ |`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.module.ts docs/roadmap.md
git commit -m "feat(ikaros-discussions): registrace modulu, roadmapa aktualizována"
```
