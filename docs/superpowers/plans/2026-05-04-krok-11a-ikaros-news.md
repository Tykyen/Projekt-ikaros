# Krok 11a — IkarosNews: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit modul `ikaros-news` — platformové novinky bez schvalovacího workflow, GET anonymní, route `/IkarosNews` (bez `api/` prefixu). Zároveň rozšířit `UserRole` enum o role `SpravceClankuu`, `SpravceGalerie`, `SpravceDisukzi` potřebné pro Kroky 11b–11d.

**Architecture:** Samostatný NestJS modul s kolekcí `ikaros_news`. Controller používá route prefix `IkarosNews` (bez `api/`). GET endpointy bez guardu (anonymní), POST/DELETE s `JwtAuthGuard`. Tento krok také přidává chybějící správcovské role do enumu — bez změny stávajících číselných hodnot (nové hodnoty 10–12).

**Tech Stack:** NestJS, Mongoose, class-validator, Jest

---

## Přehled souborů

| Soubor | Akce | Zodpovědnost |
|--------|------|--------------|
| `backend/src/modules/users/interfaces/user.interface.ts` | Upravit | Přidat SpravceClankuu=10, SpravceGalerie=11, SpravceDisukzi=12 do UserRole enumu |
| `backend/src/modules/ikaros-news/interfaces/ikaros-news.interface.ts` | Vytvořit | TypeScript interface `IkarosNewsItem` |
| `backend/src/modules/ikaros-news/interfaces/ikaros-news-repository.interface.ts` | Vytvořit | `IIkarosNewsRepository` |
| `backend/src/modules/ikaros-news/schemas/ikaros-news.schema.ts` | Vytvořit | Mongoose schema, kolekce `ikaros_news` |
| `backend/src/modules/ikaros-news/repositories/ikaros-news.repository.ts` | Vytvořit | `MongoIkarosNewsRepository` |
| `backend/src/modules/ikaros-news/dto/create-ikaros-news.dto.ts` | Vytvořit | Validace POST body |
| `backend/src/modules/ikaros-news/ikaros-news.service.ts` | Vytvořit | Business logika |
| `backend/src/modules/ikaros-news/ikaros-news.service.spec.ts` | Vytvořit | Unit testy service |
| `backend/src/modules/ikaros-news/ikaros-news.controller.ts` | Vytvořit | HTTP endpointy |
| `backend/src/modules/ikaros-news/ikaros-news.module.ts` | Vytvořit | NestJS modul |
| `backend/src/app.module.ts` | Upravit | Přidat `IkarosNewsModule` |
| `docs/roadmap.md` | Upravit | Označit krok 11a jako ✅ |

---

## Task 1: Rozšíření UserRole enumu

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts`

- [ ] **Step 1: Přidat správcovské role do enumu**

V souboru `backend/src/modules/users/interfaces/user.interface.ts` uprav enum:

```typescript
export enum UserRole {
  Superadmin = 1,
  Admin = 2,
  PJ = 3,
  Korektor = 4,
  Hrac = 5,
  Ctenar = 6,
  Zadatel = 7,
  Zakaz = 8,
  Ikarus = 9,
  SpravceClankuu = 10,
  SpravceGalerie = 11,
  SpravceDisukzi = 12,
}
```

Hodnoty 1–9 zůstávají beze změny — žádná migrace dat není potřeba.

- [ ] **Step 2: Ověřit kompilaci**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/users/interfaces/user.interface.ts
git commit -m "feat(users): přidat SpravceClankuu, SpravceGalerie, SpravceDisukzi do UserRole"
```

---

## Task 2: Interface + Schema + Repository Interface

**Files:**
- Create: `backend/src/modules/ikaros-news/interfaces/ikaros-news.interface.ts`
- Create: `backend/src/modules/ikaros-news/interfaces/ikaros-news-repository.interface.ts`
- Create: `backend/src/modules/ikaros-news/schemas/ikaros-news.schema.ts`

- [ ] **Step 1: Vytvořit `IkarosNewsItem` interface**

```typescript
// backend/src/modules/ikaros-news/interfaces/ikaros-news.interface.ts
export interface IkarosNewsItem {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAtUtc: Date;
  isActive: boolean;
}
```

- [ ] **Step 2: Vytvořit `IIkarosNewsRepository` interface**

```typescript
// backend/src/modules/ikaros-news/interfaces/ikaros-news-repository.interface.ts
import type { IkarosNewsItem } from './ikaros-news.interface';

export interface IIkarosNewsRepository {
  findActive(): Promise<IkarosNewsItem[]>;
  create(data: Omit<IkarosNewsItem, 'id'>): Promise<IkarosNewsItem>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Vytvořit Mongoose schema**

```typescript
// backend/src/modules/ikaros-news/schemas/ikaros-news.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosNewsDocument = HydratedDocument<IkarosNewsSchemaClass>;

@Schema({ collection: 'ikaros_news' })
export class IkarosNewsSchemaClass {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) content: string;
  @Prop({ required: true }) authorId: string;
  @Prop({ required: true }) authorName: string;
  @Prop({ required: true, default: () => new Date() }) createdAtUtc: Date;
  @Prop({ required: true, default: true }) isActive: boolean;
}

export const IkarosNewsSchema = SchemaFactory.createForClass(IkarosNewsSchemaClass);
IkarosNewsSchema.index({ createdAtUtc: -1 });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/ikaros-news/interfaces/ backend/src/modules/ikaros-news/schemas/
git commit -m "feat(ikaros-news): interface, repository interface, schema"
```

---

## Task 3: Repository implementace

**Files:**
- Create: `backend/src/modules/ikaros-news/repositories/ikaros-news.repository.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// backend/src/modules/ikaros-news/repositories/ikaros-news.repository.spec.ts
import { MongoIkarosNewsRepository } from './ikaros-news.repository';

describe('MongoIkarosNewsRepository.findActive', () => {
  it('dotazuje se jen na isActive=true, řazeno createdAtUtc DESC', async () => {
    const mockModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    const repo = new MongoIkarosNewsRepository(mockModel as never);
    await repo.findActive();
    expect(mockModel.find).toHaveBeenCalledWith({ isActive: true });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-news.repository.spec --no-coverage
```
Očekáváno: FAIL — `MongoIkarosNewsRepository` neexistuje.

- [ ] **Step 3: Implementovat repository**

```typescript
// backend/src/modules/ikaros-news/repositories/ikaros-news.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosNewsRepository } from '../interfaces/ikaros-news-repository.interface';
import type { IkarosNewsItem } from '../interfaces/ikaros-news.interface';
import { IkarosNewsSchemaClass, type IkarosNewsDocument } from '../schemas/ikaros-news.schema';

@Injectable()
export class MongoIkarosNewsRepository implements IIkarosNewsRepository {
  constructor(
    @InjectModel(IkarosNewsSchemaClass.name)
    private readonly model: Model<IkarosNewsDocument>,
  ) {}

  private toEntity(doc: IkarosNewsDocument): IkarosNewsItem {
    return {
      id: (doc._id as { toString(): string }).toString(),
      title: doc.title,
      content: doc.content,
      authorId: doc.authorId,
      authorName: doc.authorName,
      createdAtUtc: doc.createdAtUtc,
      isActive: doc.isActive,
    };
  }

  async findActive(): Promise<IkarosNewsItem[]> {
    const docs = await this.model.find({ isActive: true }).sort({ createdAtUtc: -1 }).lean<IkarosNewsDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosNewsDocument));
  }

  async create(data: Omit<IkarosNewsItem, 'id'>): Promise<IkarosNewsItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean();
    return result !== null;
  }
}
```

- [ ] **Step 4: Spustit test, ověřit PASS**

```bash
cd backend && npx jest ikaros-news.repository.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ikaros-news/repositories/
git commit -m "feat(ikaros-news): repository implementace"
```

---

## Task 4: DTO

**Files:**
- Create: `backend/src/modules/ikaros-news/dto/create-ikaros-news.dto.ts`

- [ ] **Step 1: Vytvořit DTO**

```typescript
// backend/src/modules/ikaros-news/dto/create-ikaros-news.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateIkarosNewsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/ikaros-news/dto/
git commit -m "feat(ikaros-news): DTO s validací"
```

---

## Task 5: Service + testy

**Files:**
- Create: `backend/src/modules/ikaros-news/ikaros-news.service.ts`
- Create: `backend/src/modules/ikaros-news/ikaros-news.service.spec.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/ikaros-news/ikaros-news.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IkarosNewsService } from './ikaros-news.service';
import { UserRole } from '../users/interfaces/user.interface';

const mockItem: import('./interfaces/ikaros-news.interface').IkarosNewsItem = {
  id: 'news1',
  title: 'Novinka',
  content: 'Obsah novinky',
  authorId: 'user1',
  authorName: 'Admin',
  createdAtUtc: new Date('2026-05-04'),
  isActive: true,
};

describe('IkarosNewsService', () => {
  let service: IkarosNewsService;
  const mockRepo = {
    findActive: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        IkarosNewsService,
        { provide: 'IIkarosNewsRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(IkarosNewsService);
  });

  describe('findAll', () => {
    it('vrátí aktivní novinky', async () => {
      mockRepo.findActive.mockResolvedValue([mockItem]);
      const result = await service.findAll();
      expect(result).toEqual([mockItem]);
    });
  });

  describe('create', () => {
    it('Superadmin smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      const result = await service.create(
        { title: 'Novinka', content: 'Obsah' },
        'user1',
        'Admin',
        UserRole.Superadmin,
      );
      expect(result).toEqual(mockItem);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        authorId: 'user1',
        authorName: 'Admin',
        isActive: true,
      }));
    });

    it('Admin smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.Admin),
      ).resolves.toBeDefined();
    });

    it('PJ smí vytvořit novinku', async () => {
      mockRepo.create.mockResolvedValue(mockItem);
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.PJ),
      ).resolves.toBeDefined();
    });

    it('Hráč nesmí vytvořit novinku', async () => {
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Korektor nesmí vytvořit novinku', async () => {
      await expect(
        service.create({ title: 'X', content: 'Y' }, 'u1', 'A', UserRole.Korektor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('PJ smí smazat novinku', async () => {
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('news1', UserRole.PJ)).resolves.toBeUndefined();
    });

    it('hodí NotFoundException pokud novinka neexistuje', async () => {
      mockRepo.delete.mockResolvedValue(false);
      await expect(service.delete('x', UserRole.Admin)).rejects.toThrow(NotFoundException);
    });

    it('Hráč nesmí smazat novinku', async () => {
      await expect(service.delete('news1', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spustit test, ověřit FAIL**

```bash
cd backend && npx jest ikaros-news.service.spec --no-coverage
```
Očekáváno: FAIL — `IkarosNewsService` neexistuje.

- [ ] **Step 3: Implementovat service**

```typescript
// backend/src/modules/ikaros-news/ikaros-news.service.ts
import { Injectable, Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { IIkarosNewsRepository } from './interfaces/ikaros-news-repository.interface';
import type { IkarosNewsItem } from './interfaces/ikaros-news.interface';
import type { CreateIkarosNewsDto } from './dto/create-ikaros-news.dto';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class IkarosNewsService {
  constructor(
    @Inject('IIkarosNewsRepository') private readonly repo: IIkarosNewsRepository,
  ) {}

  private assertCanWrite(role: UserRole): void {
    if (role > UserRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findAll(): Promise<IkarosNewsItem[]> {
    return this.repo.findActive();
  }

  async create(
    dto: CreateIkarosNewsDto,
    authorId: string,
    authorName: string,
    role: UserRole,
  ): Promise<IkarosNewsItem> {
    this.assertCanWrite(role);
    return this.repo.create({
      title: dto.title,
      content: dto.content,
      authorId,
      authorName,
      createdAtUtc: new Date(),
      isActive: true,
    });
  }

  async delete(id: string, role: UserRole): Promise<void> {
    this.assertCanWrite(role);
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Novinka nenalezena');
  }
}
```

- [ ] **Step 4: Spustit testy, ověřit PASS**

```bash
cd backend && npx jest ikaros-news.service.spec --no-coverage
```
Očekáváno: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/ikaros-news/ikaros-news.service.ts backend/src/modules/ikaros-news/ikaros-news.service.spec.ts
git commit -m "feat(ikaros-news): service s autorizací + testy"
```

---

## Task 6: Controller + Module

**Files:**
- Create: `backend/src/modules/ikaros-news/ikaros-news.controller.ts`
- Create: `backend/src/modules/ikaros-news/ikaros-news.module.ts`

- [ ] **Step 1: Vytvořit controller**

```typescript
// backend/src/modules/ikaros-news/ikaros-news.controller.ts
import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { IkarosNewsService } from './ikaros-news.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateIkarosNewsDto } from './dto/create-ikaros-news.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; username: string; role: UserRole }

@Controller('IkarosNews')
export class IkarosNewsController {
  constructor(private readonly service: IkarosNewsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateIkarosNewsDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.role);
  }
}
```

- [ ] **Step 2: Vytvořit modul**

```typescript
// backend/src/modules/ikaros-news/ikaros-news.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IkarosNewsSchemaClass, IkarosNewsSchema } from './schemas/ikaros-news.schema';
import { MongoIkarosNewsRepository } from './repositories/ikaros-news.repository';
import { IkarosNewsService } from './ikaros-news.service';
import { IkarosNewsController } from './ikaros-news.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosNewsSchemaClass.name, schema: IkarosNewsSchema },
    ]),
  ],
  controllers: [IkarosNewsController],
  providers: [
    IkarosNewsService,
    { provide: 'IIkarosNewsRepository', useClass: MongoIkarosNewsRepository },
  ],
})
export class IkarosNewsModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ikaros-news/ikaros-news.controller.ts backend/src/modules/ikaros-news/ikaros-news.module.ts
git commit -m "feat(ikaros-news): controller a modul"
```

---

## Task 7: Registrace + roadmapa

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Přidat `IkarosNewsModule` do app.module.ts**

V `backend/src/app.module.ts` přidej import:
```typescript
import { IkarosNewsModule } from './modules/ikaros-news/ikaros-news.module';
```
A do pole `imports` přidej `IkarosNewsModule`.

- [ ] **Step 2: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby.

- [ ] **Step 3: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny PASS.

- [ ] **Step 4: Aktualizovat roadmapu**

V `docs/roadmap.md` v sekci `## Krok 11a — IkarosNews ⬜`:
- Změň `⬜` na `✅`
- Zaškrtni všechny checkboxy
- Doplň odkaz na plán:
```markdown
**Plán:** [docs/superpowers/plans/2026-05-04-krok-11a-ikaros-news.md](superpowers/plans/2026-05-04-krok-11a-ikaros-news.md)
```

V tabulce přehledu stavu změň `| 11a | IkarosNews | ⬜ |` na `| 11a | IkarosNews | ✅ |`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.module.ts docs/roadmap.md
git commit -m "feat(ikaros-news): registrace modulu, roadmapa aktualizována"
```
