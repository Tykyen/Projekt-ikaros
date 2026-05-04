# Krok 10g — WorldNews: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit modul `world-news` — CRUD API pro novinky globální i per-world, GET endpointy anonymní.

**Architecture:** Samostatný NestJS modul s kolekcí `world_news`. Jeden kontroler `GET /api/news` s query `?worldId=X`. GET endpointy bez guardu (anonymní), write endpointy s `@UseGuards(JwtAuthGuard)`. Přístupová pravidla: globální novinky = Admin/Superadmin; per-world = PJ nebo PomocnýPJ; edit/delete = vlastník nebo Admin/Superadmin.

**Tech Stack:** NestJS, Mongoose, class-validator, Jest

---

## Přehled souborů

| Soubor | Akce | Zodpovědnost |
|--------|------|--------------|
| `backend/src/modules/world-news/interfaces/news-item.interface.ts` | Vytvořit | TypeScript interface `NewsItem` |
| `backend/src/modules/world-news/interfaces/world-news-repository.interface.ts` | Vytvořit | Abstraktní interface `IWorldNewsRepository` |
| `backend/src/modules/world-news/schemas/news-item.schema.ts` | Vytvořit | Mongoose schema, kolekce `world_news`, index `(worldId, date DESC)` |
| `backend/src/modules/world-news/repositories/world-news.repository.ts` | Vytvořit | MongoDB implementace `MongoWorldNewsRepository` |
| `backend/src/modules/world-news/dto/create-news.dto.ts` | Vytvořit | Validace POST body |
| `backend/src/modules/world-news/dto/update-news.dto.ts` | Vytvořit | Validace PUT body |
| `backend/src/modules/world-news/world-news.service.ts` | Vytvořit | Business logika, autorizace |
| `backend/src/modules/world-news/world-news.service.spec.ts` | Vytvořit | Unit testy service |
| `backend/src/modules/world-news/world-news.controller.ts` | Vytvořit | HTTP endpointy |
| `backend/src/modules/world-news/world-news.module.ts` | Vytvořit | NestJS modul |
| `backend/src/app.module.ts` | Upravit | Přidat `WorldNewsModule` |
| `docs/roadmap.md` | Upravit | Označit krok 10g jako ✅ |

---

## Task 1: Interface + Schema + Repository Interface

**Files:**
- Create: `backend/src/modules/world-news/interfaces/news-item.interface.ts`
- Create: `backend/src/modules/world-news/interfaces/world-news-repository.interface.ts`
- Create: `backend/src/modules/world-news/schemas/news-item.schema.ts`

- [ ] **Step 1: Vytvořit `NewsItem` interface**

```typescript
// backend/src/modules/world-news/interfaces/news-item.interface.ts
export interface NewsItem {
  id: string;
  worldId: string | null;
  title: string;
  content: string;
  date: Date;
  type: 'info' | 'alert' | 'system';
  link?: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Vytvořit `IWorldNewsRepository` interface**

```typescript
// backend/src/modules/world-news/interfaces/world-news-repository.interface.ts
import type { NewsItem } from './news-item.interface';

export interface IWorldNewsRepository {
  findMany(worldId: string | null, limit: number): Promise<NewsItem[]>;
  findById(id: string): Promise<NewsItem | null>;
  create(data: Partial<NewsItem>): Promise<NewsItem>;
  update(id: string, data: Partial<NewsItem>): Promise<NewsItem | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Vytvořit Mongoose schema**

```typescript
// backend/src/modules/world-news/schemas/news-item.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NewsItemDocument = HydratedDocument<NewsItemSchemaClass>;

@Schema({ timestamps: true, collection: 'world_news' })
export class NewsItemSchemaClass {
  @Prop({ default: null }) worldId: string | null;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  @Prop({ required: true }) date: Date;
  @Prop({ required: true, enum: ['info', 'alert', 'system'] }) type: string;
  @Prop() link?: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
}

export const NewsItemSchema = SchemaFactory.createForClass(NewsItemSchemaClass);
NewsItemSchema.index({ worldId: 1, date: -1 });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/world-news/interfaces/ backend/src/modules/world-news/schemas/
git commit -m "feat(world-news): interfaces a schema"
```

---

## Task 2: Repository implementace

**Files:**
- Create: `backend/src/modules/world-news/repositories/world-news.repository.ts`

- [ ] **Step 1: Napsat failing test pro findMany**

```typescript
// backend/src/modules/world-news/repositories/world-news.repository.spec.ts
import { MongoWorldNewsRepository } from './world-news.repository';

describe('MongoWorldNewsRepository.findMany', () => {
  it('volá find s worldId null a limitem', async () => {
    const mockModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }),
      }),
    };
    const repo = new MongoWorldNewsRepository(mockModel as never);
    await repo.findMany(null, 10);
    expect(mockModel.find).toHaveBeenCalledWith({ worldId: null });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit že FAIL**

```bash
cd backend && npx jest world-news.repository.spec --no-coverage
```
Očekáváno: FAIL — `MongoWorldNewsRepository` neexistuje.

- [ ] **Step 3: Implementovat repository**

```typescript
// backend/src/modules/world-news/repositories/world-news.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IWorldNewsRepository } from '../interfaces/world-news-repository.interface';
import type { NewsItem } from '../interfaces/news-item.interface';
import { NewsItemSchemaClass, type NewsItemDocument } from '../schemas/news-item.schema';

@Injectable()
export class MongoWorldNewsRepository implements IWorldNewsRepository {
  constructor(
    @InjectModel(NewsItemSchemaClass.name)
    private readonly model: Model<NewsItemDocument>,
  ) {}

  private toEntity(doc: NewsItemDocument): NewsItem {
    return {
      id: (doc._id as { toString(): string }).toString(),
      worldId: doc.worldId,
      title: doc.title,
      content: doc.content,
      date: doc.date,
      type: doc.type as NewsItem['type'],
      link: doc.link,
      authorId: doc.authorId,
      authorName: doc.authorName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findMany(worldId: string | null, limit: number): Promise<NewsItem[]> {
    const docs = await this.model
      .find({ worldId: worldId })
      .sort({ date: -1 })
      .limit(limit)
      .lean<NewsItemDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as NewsItemDocument));
  }

  async findById(id: string): Promise<NewsItem | null> {
    const doc = await this.model.findById(id).lean<NewsItemDocument>();
    return doc ? this.toEntity(doc as unknown as NewsItemDocument) : null;
  }

  async create(data: Partial<NewsItem>): Promise<NewsItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async update(id: string, data: Partial<NewsItem>): Promise<NewsItem | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean<NewsItemDocument>();
    return doc ? this.toEntity(doc as unknown as NewsItemDocument) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean();
    return result !== null;
  }
}
```

- [ ] **Step 4: Spustit test, ověřit PASS**

```bash
cd backend && npx jest world-news.repository.spec --no-coverage
```
Očekáváno: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/world-news/repositories/
git commit -m "feat(world-news): repository implementace"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/world-news/dto/create-news.dto.ts`
- Create: `backend/src/modules/world-news/dto/update-news.dto.ts`

- [ ] **Step 1: Vytvořit `CreateNewsDto`**

```typescript
// backend/src/modules/world-news/dto/create-news.dto.ts
import { IsString, IsNotEmpty, IsDateString, IsIn, IsOptional, IsUrl } from 'class-validator';

export class CreateNewsDto {
  @IsString()
  @IsOptional()
  worldId?: string | null;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsDateString()
  date: string;

  @IsIn(['info', 'alert', 'system'])
  type: 'info' | 'alert' | 'system';

  @IsUrl()
  @IsOptional()
  link?: string;
}
```

- [ ] **Step 2: Vytvořit `UpdateNewsDto`**

```typescript
// backend/src/modules/world-news/dto/update-news.dto.ts
import { IsString, IsNotEmpty, IsDateString, IsIn, IsOptional, IsUrl } from 'class-validator';

export class UpdateNewsDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsDateString()
  date: string;

  @IsIn(['info', 'alert', 'system'])
  type: 'info' | 'alert' | 'system';

  @IsUrl()
  @IsOptional()
  link?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/world-news/dto/
git commit -m "feat(world-news): DTOs s validací"
```

---

## Task 4: Service + testy

**Files:**
- Create: `backend/src/modules/world-news/world-news.service.ts`
- Create: `backend/src/modules/world-news/world-news.service.spec.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/world-news/world-news.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorldNewsService } from './world-news.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockNews = {
  id: 'news1',
  worldId: 'world1',
  title: 'Novinka',
  content: 'Obsah',
  date: new Date('2026-05-01'),
  type: 'info' as const,
  authorId: 'user1',
  authorName: 'Autor',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockGlobalNews = { ...mockNews, id: 'news2', worldId: null };

describe('WorldNewsService', () => {
  let service: WorldNewsService;
  const mockRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldNewsService,
        { provide: 'IWorldNewsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(WorldNewsService);
  });

  describe('findMany', () => {
    it('vrátí novinky pro daný worldId', async () => {
      mockRepo.findMany.mockResolvedValue([mockNews]);
      const result = await service.findMany('world1', 20);
      expect(result).toEqual([mockNews]);
      expect(mockRepo.findMany).toHaveBeenCalledWith('world1', 20);
    });

    it('vrátí globální novinky když worldId je null', async () => {
      mockRepo.findMany.mockResolvedValue([mockGlobalNews]);
      const result = await service.findMany(null, 20);
      expect(mockRepo.findMany).toHaveBeenCalledWith(null, 20);
      expect(result).toEqual([mockGlobalNews]);
    });
  });

  describe('findById', () => {
    it('vrátí novinku pokud existuje', async () => {
      mockRepo.findById.mockResolvedValue(mockNews);
      expect(await service.findById('news1')).toEqual(mockNews);
    });

    it('hodí NotFoundException pokud novinka neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanCreate', () => {
    it('Admin smí vytvářet globální novinky', async () => {
      await expect(service.assertCanCreate('u1', UserRole.Admin, null)).resolves.toBeUndefined();
    });

    it('Superadmin smí vytvářet globální novinky', async () => {
      await expect(service.assertCanCreate('u1', UserRole.Superadmin, null)).resolves.toBeUndefined();
    });

    it('Hráč nesmí vytvářet globální novinky', async () => {
      await expect(service.assertCanCreate('u1', UserRole.Hrac, null)).rejects.toThrow(ForbiddenException);
    });

    it('PJ světa smí vytvářet per-world novinky', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanCreate('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('PomocnýPJ světa smí vytvářet per-world novinky', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PomocnyPJ });
      await expect(service.assertCanCreate('pj2', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('Hráč světa nesmí vytvářet per-world novinky', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertCanCreate('u1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('Admin smí vytvářet per-world novinky bez kontroly členství', async () => {
      await expect(service.assertCanCreate('u1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });
  });

  describe('assertCanModify', () => {
    it('vlastník novinky smí editovat', async () => {
      await expect(service.assertCanModify(mockNews, 'user1', UserRole.Hrac)).resolves.toBeUndefined();
    });

    it('Admin smí editovat cizí novinku', async () => {
      await expect(service.assertCanModify(mockNews, 'jiny-user', UserRole.Admin)).resolves.toBeUndefined();
    });

    it('cizí uživatel bez Admin role nesmí editovat', async () => {
      await expect(service.assertCanModify(mockNews, 'jiny-user', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('vytvoří novinku a doplní authorId/authorName ze serveru', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockRepo.create.mockResolvedValue(mockNews);
      const result = await service.create(
        { worldId: 'world1', title: 'Novinka', content: 'Obsah', date: '2026-05-01', type: 'info' },
        'user1',
        'Autor',
        UserRole.Hrac,
      );
      expect(result).toEqual(mockNews);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        authorId: 'user1',
        authorName: 'Autor',
      }));
    });
  });

  describe('update', () => {
    it('aktualizuje novinku pro vlastníka', async () => {
      mockRepo.findById.mockResolvedValue(mockNews);
      const updated = { ...mockNews, title: 'Nový titulek' };
      mockRepo.update.mockResolvedValue(updated);
      const result = await service.update('news1', { title: 'Nový titulek', content: 'Obsah', date: '2026-05-01', type: 'info' }, 'user1', UserRole.Hrac);
      expect(result).toEqual(updated);
    });

    it('hodí ForbiddenException pro cizího uživatele', async () => {
      mockRepo.findById.mockResolvedValue(mockNews);
      await expect(service.update('news1', { title: 'X', content: 'X', date: '2026-05-01', type: 'info' }, 'jiny', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('smaže novinku pro vlastníka', async () => {
      mockRepo.findById.mockResolvedValue(mockNews);
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('news1', 'user1', UserRole.Hrac)).resolves.toBeUndefined();
    });

    it('hodí NotFoundException pokud novinka neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('x', 'u1', UserRole.Hrac)).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest world-news.service.spec --no-coverage
```
Očekáváno: FAIL — `WorldNewsService` neexistuje.

- [ ] **Step 3: Implementovat service**

```typescript
// backend/src/modules/world-news/world-news.service.ts
import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { IWorldNewsRepository } from './interfaces/world-news-repository.interface';
import type { NewsItem } from './interfaces/news-item.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateNewsDto } from './dto/create-news.dto';
import type { UpdateNewsDto } from './dto/update-news.dto';

@Injectable()
export class WorldNewsService {
  constructor(
    @Inject('IWorldNewsRepository') private readonly repo: IWorldNewsRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async assertCanCreate(userId: string, userRole: UserRole, worldId: string | null): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    if (worldId === null) throw new ForbiddenException('Nedostatečná oprávnění');
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
  }

  async assertCanModify(news: NewsItem, userId: string, userRole: UserRole): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    if (news.authorId === userId) return;
    throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findMany(worldId: string | null, limit: number): Promise<NewsItem[]> {
    return this.repo.findMany(worldId, limit);
  }

  async findById(id: string): Promise<NewsItem> {
    const news = await this.repo.findById(id);
    if (!news) throw new NotFoundException('Novinka nenalezena');
    return news;
  }

  async create(
    dto: CreateNewsDto,
    userId: string,
    userName: string,
    userRole: UserRole,
  ): Promise<NewsItem> {
    const worldId = dto.worldId ?? null;
    await this.assertCanCreate(userId, userRole, worldId);
    return this.repo.create({
      worldId,
      title: dto.title,
      content: dto.content,
      date: new Date(dto.date),
      type: dto.type,
      link: dto.link,
      authorId: userId,
      authorName: userName,
    });
  }

  async update(id: string, dto: UpdateNewsDto, userId: string, userRole: UserRole): Promise<NewsItem> {
    const news = await this.repo.findById(id);
    if (!news) throw new NotFoundException('Novinka nenalezena');
    await this.assertCanModify(news, userId, userRole);
    const updated = await this.repo.update(id, {
      title: dto.title,
      content: dto.content,
      date: new Date(dto.date),
      type: dto.type,
      link: dto.link,
    });
    return updated!;
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const news = await this.repo.findById(id);
    if (!news) throw new NotFoundException('Novinka nenalezena');
    await this.assertCanModify(news, userId, userRole);
    await this.repo.delete(id);
  }
}
```

- [ ] **Step 4: Spustit testy, ověřit PASS**

```bash
cd backend && npx jest world-news.service.spec --no-coverage
```
Očekáváno: PASS, všechny testy zelené.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/world-news/world-news.service.ts backend/src/modules/world-news/world-news.service.spec.ts
git commit -m "feat(world-news): service s autorizační logikou + testy"
```

---

## Task 5: Controller + Module

**Files:**
- Create: `backend/src/modules/world-news/world-news.controller.ts`
- Create: `backend/src/modules/world-news/world-news.module.ts`

- [ ] **Step 1: Vytvořit controller**

```typescript
// backend/src/modules/world-news/world-news.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { WorldNewsService } from './world-news.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';

interface RequestUser { id: string; role: UserRole; username: string }

@Controller('news')
export class WorldNewsController {
  constructor(private readonly service: WorldNewsService) {}

  @Get()
  findMany(
    @Query('worldId') worldId?: string,
    @Query('limit') limit?: string,
  ) {
    const resolvedWorldId = worldId ?? null;
    const resolvedLimit = limit ? parseInt(limit, 10) : 20;
    return this.service.findMany(resolvedWorldId, resolvedLimit);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateNewsDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNewsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.delete(id, user.id, user.role);
  }
}
```

- [ ] **Step 2: Vytvořit modul**

```typescript
// backend/src/modules/world-news/world-news.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsItemSchemaClass, NewsItemSchema } from './schemas/news-item.schema';
import { MongoWorldNewsRepository } from './repositories/world-news.repository';
import { WorldNewsService } from './world-news.service';
import { WorldNewsController } from './world-news.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NewsItemSchemaClass.name, schema: NewsItemSchema },
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

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/world-news/world-news.controller.ts backend/src/modules/world-news/world-news.module.ts
git commit -m "feat(world-news): controller a modul"
```

---

## Task 6: Registrace v AppModule + aktualizace dokumentace

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Přidat `WorldNewsModule` do `app.module.ts`**

V souboru `backend/src/app.module.ts` přidej import:
```typescript
import { WorldNewsModule } from './modules/world-news/world-news.module';
```
A do pole `imports` přidej `WorldNewsModule`.

- [ ] **Step 2: Spustit build a ověřit kompilaci bez chyb**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby.

- [ ] **Step 3: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny testy PASS, žádná regrese.

- [ ] **Step 4: Aktualizovat roadmap**

V `docs/roadmap.md` najdi sekci `## Krok 10g — WorldNews ⬜` a:
- Změň `⬜` na `✅`
- Zaškrtni všechny checkboxy (`- [ ]` → `- [x]`)
- Doplň `**Spec:**` a `**Plán:**` odkazy:

```markdown
**Spec:** [docs/superpowers/specs/2026-05-04-krok-10g-world-news-design.md](superpowers/specs/2026-05-04-krok-10g-world-news-design.md)
**Plán:** [docs/superpowers/plans/2026-05-04-krok-10g-world-news.md](superpowers/plans/2026-05-04-krok-10g-world-news.md)
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.module.ts docs/roadmap.md
git commit -m "feat(world-news): registrace modulu, aktualizace roadmapy"
```
