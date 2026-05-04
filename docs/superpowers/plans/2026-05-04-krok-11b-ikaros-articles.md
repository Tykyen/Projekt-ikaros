# Krok 11b — IkarosArticles: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit modul `ikaros-articles` — platformové články se schvalovacím workflow (Draft→Pending→Published/Rejected), hodnocením 1–5 hvězd a notifikacemi přes IkarosMessages.

**Architecture:** Samostatný NestJS modul s kolekcí `ikaros_articles`. Notifikace admins: dotaz na `IUsersRepository.findByRoles()` (nová metoda přidaná v Task 1). Admin check: role `Superadmin|Admin|PJ|SpravceClankuu` nebo username `Tyky`. IkarosMessagesService injektována pro odesílání zpráv.

**Tech Stack:** NestJS, Mongoose, class-validator, Jest

**Předpoklad:** Krok 11a musí být hotov (UserRole enum obsahuje SpravceClankuu=10).

---

## Přehled souborů

| Soubor | Akce | Zodpovědnost |
|--------|------|--------------|
| `backend/src/modules/users/interfaces/users-repository.interface.ts` | Upravit | Přidat `findByRoles(roles: UserRole[]): Promise<User[]>` |
| `backend/src/modules/users/users.repository.ts` | Upravit | Implementovat `findByRoles` |
| `backend/src/modules/ikaros-articles/interfaces/ikaros-article.interface.ts` | Vytvořit | TypeScript interface |
| `backend/src/modules/ikaros-articles/interfaces/ikaros-articles-repository.interface.ts` | Vytvořit | Repository interface |
| `backend/src/modules/ikaros-articles/schemas/ikaros-article.schema.ts` | Vytvořit | Mongoose schema, kolekce `ikaros_articles` |
| `backend/src/modules/ikaros-articles/repositories/ikaros-articles.repository.ts` | Vytvořit | MongoDB implementace |
| `backend/src/modules/ikaros-articles/dto/create-article.dto.ts` | Vytvořit | Validace POST |
| `backend/src/modules/ikaros-articles/dto/update-article.dto.ts` | Vytvořit | Validace PUT |
| `backend/src/modules/ikaros-articles/dto/rate-article.dto.ts` | Vytvořit | Validace POST /rate |
| `backend/src/modules/ikaros-articles/dto/reject-article.dto.ts` | Vytvořit | Validace POST /reject |
| `backend/src/modules/ikaros-articles/ikaros-articles.service.ts` | Vytvořit | Business logika + notifikace |
| `backend/src/modules/ikaros-articles/ikaros-articles.service.spec.ts` | Vytvořit | Unit testy |
| `backend/src/modules/ikaros-articles/ikaros-articles.controller.ts` | Vytvořit | HTTP endpointy |
| `backend/src/modules/ikaros-articles/ikaros-articles.module.ts` | Vytvořit | NestJS modul |
| `backend/src/app.module.ts` | Upravit | Přidat `IkarosArticlesModule` |
| `docs/roadmap.md` | Upravit | Označit krok 11b jako ✅ |

---

## Task 1: Přidat `findByRoles` do UsersRepository

**Files:**
- Modify: `backend/src/modules/users/interfaces/users-repository.interface.ts`
- Modify: `backend/src/modules/users/users.repository.ts`

- [ ] **Step 1: Přidat metodu do interface**

V `backend/src/modules/users/interfaces/users-repository.interface.ts` přidej do `IUsersRepository`:

```typescript
findByRoles(roles: UserRole[]): Promise<User[]>;
```

Výsledný soubor:
```typescript
import { User, UserRole } from './user.interface';

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findFirstByRole(role: UserRole): Promise<User | null>;
  findByRoles(roles: UserRole[]): Promise<User[]>;
  findOnlineSince(since: Date): Promise<string[]>;
  save(user: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateLastSeen(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 2: Napsat failing test pro findByRoles**

```typescript
// backend/src/modules/users/users.repository.spec.ts
// Přidej do existujícího describe bloku nebo vytvoř nový soubor
import { MongoUsersRepository } from './users.repository';
import { UserRole } from './interfaces/user.interface';

describe('MongoUsersRepository.findByRoles', () => {
  it('volá find s $in query pro zadané role', async () => {
    const mockModel = {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    const repo = new MongoUsersRepository(mockModel as never);
    await repo.findByRoles([UserRole.Admin, UserRole.PJ]);
    expect(mockModel.find).toHaveBeenCalledWith({ role: { $in: [UserRole.Admin, UserRole.PJ] } });
  });
});
```

- [ ] **Step 3: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest users.repository.spec --no-coverage
```
Očekáváno: FAIL — metoda `findByRoles` neexistuje.

- [ ] **Step 4: Implementovat `findByRoles` v MongoUsersRepository**

V `backend/src/modules/users/users.repository.ts` přidej metodu do třídy `MongoUsersRepository`:

```typescript
async findByRoles(roles: UserRole[]): Promise<User[]> {
  const docs = await this.model
    .find({ role: { $in: roles } })
    .lean()
    .exec();
  return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
}
```

- [ ] **Step 5: Spustit test, ověřit PASS**

```bash
cd backend && npx jest users.repository.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/users/interfaces/users-repository.interface.ts backend/src/modules/users/users.repository.ts
git commit -m "feat(users): přidat findByRoles do IUsersRepository"
```

---

## Task 2: Interface + Schema + Repository Interface

**Files:**
- Create: `backend/src/modules/ikaros-articles/interfaces/ikaros-article.interface.ts`
- Create: `backend/src/modules/ikaros-articles/interfaces/ikaros-articles-repository.interface.ts`
- Create: `backend/src/modules/ikaros-articles/schemas/ikaros-article.schema.ts`

- [ ] **Step 1: Vytvořit interface**

```typescript
// backend/src/modules/ikaros-articles/interfaces/ikaros-article.interface.ts
export type ArticleStatus = 'Draft' | 'Pending' | 'Published' | 'Rejected';
export type ArticleCategory = 'Povidky' | 'Poezie' | 'Uvahy' | 'Recenze' | 'Postavy' | 'Ostatni';

export interface ArticleRating {
  userId: string;
  stars: number;
}

export interface IkarosArticle {
  id: string;
  title: string;
  content: string;
  category: ArticleCategory;
  authorId: string;
  authorName: string;
  status: ArticleStatus;
  rejectReason?: string;
  ratings: ArticleRating[];
  averageRating: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
  publishedAtUtc?: Date;
}
```

- [ ] **Step 2: Vytvořit repository interface**

```typescript
// backend/src/modules/ikaros-articles/interfaces/ikaros-articles-repository.interface.ts
import type { IkarosArticle, ArticleStatus, ArticleRating } from './ikaros-article.interface';

export interface IIkarosArticlesRepository {
  findPublished(): Promise<IkarosArticle[]>;
  findPublishedAndPending(): Promise<IkarosArticle[]>;
  findPending(): Promise<IkarosArticle[]>;
  findByAuthor(authorId: string): Promise<IkarosArticle[]>;
  findById(id: string): Promise<IkarosArticle | null>;
  create(data: Omit<IkarosArticle, 'id'>): Promise<IkarosArticle>;
  update(id: string, data: Partial<IkarosArticle>): Promise<IkarosArticle | null>;
  upsertRating(id: string, rating: ArticleRating): Promise<IkarosArticle | null>;
  delete(id: string): Promise<boolean>;
  countByAuthorAndStatus(authorId: string): Promise<Record<ArticleStatus, number>>;
}
```

- [ ] **Step 3: Vytvořit Mongoose schema**

```typescript
// backend/src/modules/ikaros-articles/schemas/ikaros-article.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

class ArticleRatingSchema {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, min: 1, max: 5 }) stars: number;
}

export type IkarosArticleDocument = HydratedDocument<IkarosArticleSchemaClass>;

@Schema({ collection: 'ikaros_articles' })
export class IkarosArticleSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  @Prop({ required: true, default: 'Ostatni' }) category: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true, default: 'Draft' }) status: string;
  @Prop() rejectReason?: string;
  @Prop({ type: [ArticleRatingSchema], default: [] }) ratings: ArticleRatingSchema[];
  @Prop({ default: 0 }) averageRating: number;
  @Prop({ required: true, default: () => new Date() }) createdAtUtc: Date;
  @Prop({ required: true, default: () => new Date() }) updatedAtUtc: Date;
  @Prop() publishedAtUtc?: Date;
}

export const IkarosArticleSchema = SchemaFactory.createForClass(IkarosArticleSchemaClass);
IkarosArticleSchema.index({ authorId: 1 });
IkarosArticleSchema.index({ status: 1, createdAtUtc: -1 });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/ikaros-articles/interfaces/ backend/src/modules/ikaros-articles/schemas/
git commit -m "feat(ikaros-articles): interfaces a schema"
```

---

## Task 3: Repository implementace

**Files:**
- Create: `backend/src/modules/ikaros-articles/repositories/ikaros-articles.repository.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// backend/src/modules/ikaros-articles/repositories/ikaros-articles.repository.spec.ts
import { MongoIkarosArticlesRepository } from './ikaros-articles.repository';

describe('MongoIkarosArticlesRepository', () => {
  const mockModel = {
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    findByIdAndDelete: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    aggregate: jest.fn().mockResolvedValue([]),
  };

  it('findPublished volá find se status Published', async () => {
    const repo = new MongoIkarosArticlesRepository(mockModel as never);
    await repo.findPublished();
    expect(mockModel.find).toHaveBeenCalledWith({ status: 'Published' });
  });

  it('findPending volá find se status Pending', async () => {
    jest.clearAllMocks();
    Object.assign(mockModel, {
      find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
    });
    const repo = new MongoIkarosArticlesRepository(mockModel as never);
    await repo.findPending();
    expect(mockModel.find).toHaveBeenCalledWith({ status: 'Pending' });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-articles.repository.spec --no-coverage
```
Očekáváno: FAIL.

- [ ] **Step 3: Implementovat repository**

```typescript
// backend/src/modules/ikaros-articles/repositories/ikaros-articles.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosArticlesRepository } from '../interfaces/ikaros-articles-repository.interface';
import type { IkarosArticle, ArticleStatus, ArticleRating } from '../interfaces/ikaros-article.interface';
import { IkarosArticleSchemaClass, type IkarosArticleDocument } from '../schemas/ikaros-article.schema';

@Injectable()
export class MongoIkarosArticlesRepository implements IIkarosArticlesRepository {
  constructor(
    @InjectModel(IkarosArticleSchemaClass.name)
    private readonly model: Model<IkarosArticleDocument>,
  ) {}

  private toEntity(doc: IkarosArticleDocument): IkarosArticle {
    return {
      id: (doc._id as { toString(): string }).toString(),
      title: doc.title,
      content: doc.content,
      category: doc.category as IkarosArticle['category'],
      authorId: doc.authorId,
      authorName: doc.authorName,
      status: doc.status as ArticleStatus,
      rejectReason: doc.rejectReason,
      ratings: (doc.ratings ?? []).map((r: { userId: string; stars: number }) => ({ userId: r.userId, stars: r.stars })),
      averageRating: doc.averageRating,
      createdAtUtc: doc.createdAtUtc,
      updatedAtUtc: doc.updatedAtUtc,
      publishedAtUtc: doc.publishedAtUtc,
    };
  }

  async findPublished(): Promise<IkarosArticle[]> {
    const docs = await this.model.find({ status: 'Published' }).sort({ createdAtUtc: -1 }).lean<IkarosArticleDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosArticleDocument));
  }

  async findPublishedAndPending(): Promise<IkarosArticle[]> {
    const docs = await this.model.find({ status: { $in: ['Published', 'Pending'] } }).sort({ createdAtUtc: -1 }).lean<IkarosArticleDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosArticleDocument));
  }

  async findPending(): Promise<IkarosArticle[]> {
    const docs = await this.model.find({ status: 'Pending' }).sort({ createdAtUtc: -1 }).lean<IkarosArticleDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosArticleDocument));
  }

  async findByAuthor(authorId: string): Promise<IkarosArticle[]> {
    const docs = await this.model.find({ authorId }).sort({ updatedAtUtc: -1 }).lean<IkarosArticleDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosArticleDocument));
  }

  async findById(id: string): Promise<IkarosArticle | null> {
    const doc = await this.model.findById(id).lean<IkarosArticleDocument>();
    return doc ? this.toEntity(doc as unknown as IkarosArticleDocument) : null;
  }

  async create(data: Omit<IkarosArticle, 'id'>): Promise<IkarosArticle> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async update(id: string, data: Partial<IkarosArticle>): Promise<IkarosArticle | null> {
    const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).lean<IkarosArticleDocument>();
    return doc ? this.toEntity(doc as unknown as IkarosArticleDocument) : null;
  }

  async upsertRating(id: string, rating: ArticleRating): Promise<IkarosArticle | null> {
    // Odstraní starý rating od userId, přidá nový
    await this.model.findByIdAndUpdate(id, { $pull: { ratings: { userId: rating.userId } } });
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $push: { ratings: rating } },
      { new: true },
    ).lean<IkarosArticleDocument>();
    if (!doc) return null;
    const entity = this.toEntity(doc as unknown as IkarosArticleDocument);
    // Přepočítat averageRating
    const avg = entity.ratings.length > 0
      ? Math.round((entity.ratings.reduce((s, r) => s + r.stars, 0) / entity.ratings.length) * 10) / 10
      : 0;
    const updated = await this.model.findByIdAndUpdate(id, { averageRating: avg }, { new: true }).lean<IkarosArticleDocument>();
    return updated ? this.toEntity(updated as unknown as IkarosArticleDocument) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean();
    return result !== null;
  }

  async countByAuthorAndStatus(authorId: string): Promise<Record<ArticleStatus, number>> {
    const agg = await this.model.aggregate([
      { $match: { authorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const result: Record<ArticleStatus, number> = { Draft: 0, Pending: 0, Published: 0, Rejected: 0 };
    for (const item of agg) {
      result[item._id as ArticleStatus] = item.count as number;
    }
    return result;
  }
}
```

- [ ] **Step 4: Spustit test, ověřit PASS**

```bash
cd backend && npx jest ikaros-articles.repository.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ikaros-articles/repositories/
git commit -m "feat(ikaros-articles): repository implementace"
```

---

## Task 4: DTOs

**Files:**
- Create: `backend/src/modules/ikaros-articles/dto/create-article.dto.ts`
- Create: `backend/src/modules/ikaros-articles/dto/update-article.dto.ts`
- Create: `backend/src/modules/ikaros-articles/dto/rate-article.dto.ts`
- Create: `backend/src/modules/ikaros-articles/dto/reject-article.dto.ts`

- [ ] **Step 1: Vytvořit DTOs**

```typescript
// backend/src/modules/ikaros-articles/dto/create-article.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsIn, MaxLength } from 'class-validator';

export class CreateArticleDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  title: string;

  @IsString() @IsNotEmpty() @MaxLength(50000)
  content: string;

  @IsIn(['Povidky', 'Poezie', 'Uvahy', 'Recenze', 'Postavy', 'Ostatni'])
  @IsOptional()
  category?: string;

  @IsBoolean() @IsOptional()
  submit?: boolean;
}
```

```typescript
// backend/src/modules/ikaros-articles/dto/update-article.dto.ts
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class UpdateArticleDto {
  @IsString() @IsOptional() @MaxLength(300)
  title?: string;

  @IsString() @IsOptional() @MaxLength(50000)
  content?: string;

  @IsIn(['Povidky', 'Poezie', 'Uvahy', 'Recenze', 'Postavy', 'Ostatni'])
  @IsOptional()
  category?: string;
}
```

```typescript
// backend/src/modules/ikaros-articles/dto/rate-article.dto.ts
import { IsInt, Min, Max } from 'class-validator';

export class RateArticleDto {
  @IsInt() @Min(1) @Max(5)
  stars: number;
}
```

```typescript
// backend/src/modules/ikaros-articles/dto/reject-article.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RejectArticleDto {
  @IsString() @IsOptional() @MaxLength(1000)
  reason?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/ikaros-articles/dto/
git commit -m "feat(ikaros-articles): DTOs s validací"
```

---

## Task 5: Service + testy

**Files:**
- Create: `backend/src/modules/ikaros-articles/ikaros-articles.service.ts`
- Create: `backend/src/modules/ikaros-articles/ikaros-articles.service.spec.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/ikaros-articles/ikaros-articles.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IkarosArticlesService } from './ikaros-articles.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockArticle = {
  id: 'art1',
  title: 'Testovací článek',
  content: 'Obsah',
  category: 'Ostatni' as const,
  authorId: 'user1',
  authorName: 'Autor',
  status: 'Draft' as const,
  ratings: [],
  averageRating: 0,
  createdAtUtc: new Date(),
  updatedAtUtc: new Date(),
};

describe('IkarosArticlesService', () => {
  let service: IkarosArticlesService;
  const mockRepo = {
    findPublished: jest.fn(),
    findPublishedAndPending: jest.fn(),
    findPending: jest.fn(),
    findByAuthor: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsertRating: jest.fn(),
    delete: jest.fn(),
    countByAuthorAndStatus: jest.fn(),
  };
  const mockUsersRepo = { findByRoles: jest.fn(), findByUsername: jest.fn() };
  const mockMsgService = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosArticlesService,
        { provide: 'IIkarosArticlesRepository', useValue: mockRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
        { provide: 'IkarosMessagesService', useValue: mockMsgService },
      ],
    }).compile();
    service = module.get(IkarosArticlesService);
  });

  describe('isAdmin', () => {
    it('PJ je admin', () => expect(service.isAdmin(UserRole.PJ, 'nekdo')).toBe(true));
    it('SpravceClankuu je admin', () => expect(service.isAdmin(UserRole.SpravceClankuu, 'nekdo')).toBe(true));
    it('Tyky je admin bez ohledu na roli', () => expect(service.isAdmin(UserRole.Hrac, 'Tyky')).toBe(true));
    it('Hráč není admin', () => expect(service.isAdmin(UserRole.Hrac, 'nekdo')).toBe(false));
  });

  describe('create', () => {
    it('vytvoří Draft článek bez submit', async () => {
      mockRepo.create.mockResolvedValue(mockArticle);
      const result = await service.create({ title: 'X', content: 'Y' }, 'user1', 'Autor', UserRole.Hrac);
      expect(result.status).toBe('Draft');
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'Draft' }));
    });

    it('vytvoří Pending článek s submit=true a pošle notifikaci', async () => {
      const pending = { ...mockArticle, status: 'Pending' as const };
      mockRepo.create.mockResolvedValue(pending);
      mockUsersRepo.findByRoles.mockResolvedValue([{ id: 'admin1', username: 'Admin' }]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.create({ title: 'X', content: 'Y', submit: true }, 'user1', 'Autor', UserRole.Hrac);
      expect(mockMsgService.create).toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('Draft → Pending, pošle notifikaci adminům', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      mockRepo.update.mockResolvedValue({ ...mockArticle, status: 'Pending' });
      mockUsersRepo.findByRoles.mockResolvedValue([{ id: 'a1', username: 'Admin' }]);
      mockUsersRepo.findByUsername.mockResolvedValue(null);
      await service.submit('art1', 'user1', UserRole.Hrac);
      expect(mockRepo.update).toHaveBeenCalledWith('art1', expect.objectContaining({ status: 'Pending' }));
      expect(mockMsgService.create).toHaveBeenCalled();
    });

    it('hodí ForbiddenException pokud není autor', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(service.submit('art1', 'jiny', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });

    it('hodí BadRequestException pokud status není Draft nebo Rejected', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockArticle, status: 'Published' });
      await expect(service.submit('art1', 'user1', UserRole.Hrac)).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('Pending → Published, nastaví publishedAtUtc, pošle notifikaci autorovi', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockArticle, status: 'Pending' });
      mockRepo.update.mockResolvedValue({ ...mockArticle, status: 'Published' });
      await service.approve('art1', UserRole.Admin, 'admin');
      expect(mockRepo.update).toHaveBeenCalledWith('art1', expect.objectContaining({ status: 'Published', publishedAtUtc: expect.any(Date) }));
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Článek schválen', recipientId: 'user1' }),
        expect.anything(),
      );
    });

    it('hodí ForbiddenException pro non-admina', async () => {
      await expect(service.approve('art1', UserRole.Hrac, 'nekdo')).rejects.toThrow(ForbiddenException);
    });

    it('hodí BadRequestException pokud status není Pending', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(service.approve('art1', UserRole.Admin, 'admin')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('→ Rejected s důvodem, pošle notifikaci autorovi', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockArticle, status: 'Pending' });
      mockRepo.update.mockResolvedValue({ ...mockArticle, status: 'Rejected' });
      await service.reject('art1', 'Nevyhovuje', UserRole.Admin, 'admin');
      expect(mockRepo.update).toHaveBeenCalledWith('art1', { status: 'Rejected', rejectReason: 'Nevyhovuje', updatedAtUtc: expect.any(Date) });
      expect(mockMsgService.create).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Článek zamítnut', recipientId: 'user1' }),
        expect.anything(),
      );
    });
  });

  describe('rate', () => {
    it('upsertuje hodnocení a vrátí averageRating + totalRatings', async () => {
      const rated = { ...mockArticle, ratings: [{ userId: 'user2', stars: 4 }], averageRating: 4 };
      mockRepo.findById.mockResolvedValue({ ...mockArticle, status: 'Published' });
      mockRepo.upsertRating.mockResolvedValue(rated);
      const result = await service.rate('art1', 4, 'user2', UserRole.Hrac);
      expect(result).toEqual({ averageRating: 4, totalRatings: 1 });
    });

    it('hodí ForbiddenException pokud autor hodnotí vlastní článek', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockArticle, status: 'Published' });
      await expect(service.rate('art1', 5, 'user1', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });

    it('hodí BadRequestException pokud článek není Published', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(service.rate('art1', 5, 'user2', UserRole.Hrac)).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('autor smí smazat vlastní článek', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('art1', 'user1', UserRole.Hrac, 'autor')).resolves.toBeUndefined();
    });

    it('admin smí smazat cizí článek', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('art1', 'jiny', UserRole.Admin, 'admin')).resolves.toBeUndefined();
    });

    it('cizí uživatel bez admin práv nesmí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockArticle);
      await expect(service.delete('art1', 'jiny', UserRole.Hrac, 'nekdo')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-articles.service.spec --no-coverage
```
Očekáváno: FAIL — `IkarosArticlesService` neexistuje.

- [ ] **Step 3: Implementovat service**

```typescript
// backend/src/modules/ikaros-articles/ikaros-articles.service.ts
import { Injectable, Inject, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IIkarosArticlesRepository } from './interfaces/ikaros-articles-repository.interface';
import type { IkarosArticle } from './interfaces/ikaros-article.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateArticleDto } from './dto/create-article.dto';
import type { UpdateArticleDto } from './dto/update-article.dto';

const ADMIN_ROLES = [UserRole.Superadmin, UserRole.Admin, UserRole.PJ, UserRole.SpravceClankuu];
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };

@Injectable()
export class IkarosArticlesService {
  constructor(
    @Inject('IIkarosArticlesRepository') private readonly repo: IIkarosArticlesRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    @Inject('IkarosMessagesService') private readonly msgService: IkarosMessagesService,
  ) {}

  isAdmin(role: UserRole, username: string): boolean {
    return ADMIN_ROLES.includes(role) || username === 'Tyky';
  }

  private assertAdmin(role: UserRole, username: string): void {
    if (!this.isAdmin(role, username)) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  private async notifyAdmins(subject: string, body: string): Promise<void> {
    const admins = await this.usersRepo.findByRoles(ADMIN_ROLES);
    const tyky = await this.usersRepo.findByUsername('Tyky');
    const recipients = [...admins];
    if (tyky && !admins.some((a) => a.id === tyky.id)) recipients.push(tyky);
    await Promise.all(
      recipients.map((r) =>
        this.msgService.create(
          { recipientId: r.id, recipientName: r.username, subject, body },
          SYSTEM_SENDER,
        ),
      ),
    );
  }

  private async notifyUser(recipientId: string, recipientName: string, subject: string, body: string): Promise<void> {
    await this.msgService.create(
      { recipientId, recipientName, subject, body },
      SYSTEM_SENDER,
    );
  }

  async findAll(role: UserRole, username: string): Promise<IkarosArticle[]> {
    if (this.isAdmin(role, username)) return this.repo.findPublishedAndPending();
    return this.repo.findPublished();
  }

  async findMy(authorId: string): Promise<IkarosArticle[]> {
    return this.repo.findByAuthor(authorId);
  }

  async findPending(role: UserRole, username: string): Promise<IkarosArticle[]> {
    this.assertAdmin(role, username);
    return this.repo.findPending();
  }

  async findStats(authorId: string): Promise<{ draft: number; pending: number; published: number; rejected: number; totalRatings: number; averageRating: number }> {
    const [counts, articles] = await Promise.all([
      this.repo.countByAuthorAndStatus(authorId),
      this.repo.findByAuthor(authorId),
    ]);
    const published = articles.filter((a) => a.status === 'Published');
    const totalRatings = published.reduce((s, a) => s + a.ratings.length, 0);
    const avgSum = published.reduce((s, a) => s + a.averageRating * a.ratings.length, 0);
    const averageRating = totalRatings > 0 ? Math.round((avgSum / totalRatings) * 10) / 10 : 0;
    return { draft: counts.Draft, pending: counts.Pending, published: counts.Published, rejected: counts.Rejected, totalRatings, averageRating };
  }

  async findById(id: string, userId: string, role: UserRole, username: string): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.status !== 'Published' && article.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    return article;
  }

  async create(dto: CreateArticleDto, authorId: string, authorName: string, role: UserRole): Promise<IkarosArticle> {
    const status = dto.submit ? 'Pending' : 'Draft';
    const article = await this.repo.create({
      title: dto.title,
      content: dto.content,
      category: (dto.category ?? 'Ostatni') as IkarosArticle['category'],
      authorId,
      authorName,
      status,
      ratings: [],
      averageRating: 0,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    });
    if (status === 'Pending') {
      await this.notifyAdmins('Článek čeká na schválení', `/ikaros/clanky/${article.id}`);
    }
    return article;
  }

  async update(id: string, dto: UpdateArticleDto, userId: string, role: UserRole, username: string): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.authorId !== userId) throw new ForbiddenException('Přístup odepřen');
    if (article.status !== 'Draft' && article.status !== 'Rejected') {
      throw new BadRequestException('Editovat lze jen Draft nebo Rejected článek');
    }
    const updated = await this.repo.update(id, { ...dto, updatedAtUtc: new Date() });
    return updated!;
  }

  async delete(id: string, userId: string, role: UserRole, username: string): Promise<void> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.authorId !== userId && !this.isAdmin(role, username)) {
      throw new ForbiddenException('Přístup odepřen');
    }
    await this.repo.delete(id);
  }

  async submit(id: string, userId: string, role: UserRole): Promise<IkarosArticle> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.authorId !== userId) throw new ForbiddenException('Přístup odepřen');
    if (article.status !== 'Draft' && article.status !== 'Rejected') {
      throw new BadRequestException('Odeslat lze jen Draft nebo Rejected článek');
    }
    const updated = await this.repo.update(id, { status: 'Pending', updatedAtUtc: new Date() });
    await this.notifyAdmins('Článek čeká na schválení', `/ikaros/clanky/${id}`);
    return updated!;
  }

  async approve(id: string, role: UserRole, username: string): Promise<IkarosArticle> {
    this.assertAdmin(role, username);
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.status !== 'Pending') throw new BadRequestException('Schválit lze jen Pending článek');
    const updated = await this.repo.update(id, { status: 'Published', publishedAtUtc: new Date(), updatedAtUtc: new Date() });
    await this.notifyUser(article.authorId, article.authorName, 'Článek schválen', `Tvůj článek "${article.title}" byl schválen.`);
    return updated!;
  }

  async reject(id: string, reason: string | undefined, role: UserRole, username: string): Promise<IkarosArticle> {
    this.assertAdmin(role, username);
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.status !== 'Pending') throw new BadRequestException('Zamítnout lze jen Pending článek');
    const updated = await this.repo.update(id, { status: 'Rejected', rejectReason: reason, updatedAtUtc: new Date() });
    const body = reason ? `Důvod zamítnutí: ${reason}` : `Tvůj článek "${article.title}" byl zamítnut.`;
    await this.notifyUser(article.authorId, article.authorName, 'Článek zamítnut', body);
    return updated!;
  }

  async rate(id: string, stars: number, userId: string, role: UserRole): Promise<{ averageRating: number; totalRatings: number }> {
    const article = await this.repo.findById(id);
    if (!article) throw new NotFoundException('Článek nenalezen');
    if (article.status !== 'Published') throw new BadRequestException('Hodnotit lze jen Published článek');
    if (article.authorId === userId) throw new ForbiddenException('Autor nemůže hodnotit vlastní článek');
    const updated = await this.repo.upsertRating(id, { userId, stars });
    return {
      averageRating: updated?.averageRating ?? 0,
      totalRatings: updated?.ratings.length ?? 0,
    };
  }
}
```

- [ ] **Step 4: Spustit testy, ověřit PASS**

```bash
cd backend && npx jest ikaros-articles.service.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ikaros-articles/ikaros-articles.service.ts backend/src/modules/ikaros-articles/ikaros-articles.service.spec.ts
git commit -m "feat(ikaros-articles): service s workflow, notifikacemi + testy"
```

---

## Task 6: Controller + Module

**Files:**
- Create: `backend/src/modules/ikaros-articles/ikaros-articles.controller.ts`
- Create: `backend/src/modules/ikaros-articles/ikaros-articles.module.ts`

- [ ] **Step 1: Vytvořit controller**

```typescript
// backend/src/modules/ikaros-articles/ikaros-articles.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { IkarosArticlesService } from './ikaros-articles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { RateArticleDto } from './dto/rate-article.dto';
import { RejectArticleDto } from './dto/reject-article.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; username: string; role: UserRole }

@Controller('ikaros-articles')
@UseGuards(JwtAuthGuard)
export class IkarosArticlesController {
  constructor(private readonly service: IkarosArticlesService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.role, user.username);
  }

  @Get('my')
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('stats')
  findStats(@CurrentUser() user: RequestUser) {
    return this.service.findStats(user.id);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.update(id, dto, user.id, user.role, user.username);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role, user.username);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submit(id, user.id, user.role);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/rate')
  rate(@Param('id') id: string, @Body() dto: RateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.rate(id, dto.stars, user.id, user.role);
  }
}
```

- [ ] **Step 2: Vytvořit modul**

```typescript
// backend/src/modules/ikaros-articles/ikaros-articles.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IkarosArticleSchemaClass, IkarosArticleSchema } from './schemas/ikaros-article.schema';
import { MongoIkarosArticlesRepository } from './repositories/ikaros-articles.repository';
import { IkarosArticlesService } from './ikaros-articles.service';
import { IkarosArticlesController } from './ikaros-articles.controller';
import { IkarosMessagesModule } from '../ikaros-messages/ikaros-messages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosArticleSchemaClass.name, schema: IkarosArticleSchema },
    ]),
    IkarosMessagesModule,
  ],
  controllers: [IkarosArticlesController],
  providers: [
    IkarosArticlesService,
    { provide: 'IIkarosArticlesRepository', useClass: MongoIkarosArticlesRepository },
    { provide: 'IkarosMessagesService', useExisting: 'IkarosMessagesService' },
  ],
})
export class IkarosArticlesModule {}
```

Pozn.: `IUsersRepository` je dostupné globálně (UsersModule je `@Global()`), proto ho není třeba explicitně importovat. Token `IkarosMessagesService` je exportován z `IkarosMessagesModule`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ikaros-articles/ikaros-articles.controller.ts backend/src/modules/ikaros-articles/ikaros-articles.module.ts
git commit -m "feat(ikaros-articles): controller a modul"
```

---

## Task 7: Registrace + roadmapa

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Přidat `IkarosArticlesModule` do app.module.ts**

V `backend/src/app.module.ts` přidej:
```typescript
import { IkarosArticlesModule } from './modules/ikaros-articles/ikaros-articles.module';
```
A do pole `imports` přidej `IkarosArticlesModule`.

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

V `docs/roadmap.md` v sekci `## Krok 11b — IkarosArticles ⬜`:
- Změň `⬜` na `✅`, zaškrtni checkboxy
- Doplň: `**Plán:** [docs/superpowers/plans/2026-05-04-krok-11b-ikaros-articles.md](superpowers/plans/2026-05-04-krok-11b-ikaros-articles.md)`

V tabulce změň `| 11b | IkarosArticles | ⬜ |` na `| 11b | IkarosArticles | ✅ |`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.module.ts docs/roadmap.md
git commit -m "feat(ikaros-articles): registrace modulu, roadmapa aktualizována"
```
