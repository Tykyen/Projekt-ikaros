# Krok 6a — Pages modul: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat Pages modul pro wiki stránky světa (Lokace, Noviny, Galerie...) s CRUD REST API, world-scoped slug unikátností a access control přes AKJ/Role/UserId.

**Architecture:** Repository pattern identický s worlds modulem — Interface → Schema → Repository → Service → Controller. `type` uložen jako `string` (ne enum). Access check v service vrstvě: OR logika přes `accessRequirements[]`. Žádný Gateway.

**Tech Stack:** NestJS 11, TypeScript 5, Mongoose 9, class-validator, Jest

---

## Přehled souborů

**Vytvořit:**
- `backend/src/modules/pages/interfaces/page.interface.ts`
- `backend/src/modules/pages/interfaces/pages-repository.interface.ts`
- `backend/src/modules/pages/schemas/page.schema.ts`
- `backend/src/modules/pages/repositories/pages.repository.ts`
- `backend/src/modules/pages/dto/create-page.dto.ts`
- `backend/src/modules/pages/dto/update-page.dto.ts`
- `backend/src/modules/pages/pages.service.ts`
- `backend/src/modules/pages/pages.service.spec.ts`
- `backend/src/modules/pages/pages.controller.ts`
- `backend/src/modules/pages/pages.module.ts`

**Upravit:**
- `backend/src/app.module.ts` — registrace PagesModule

---

## Kontext projektu

Vzorový modul: `backend/src/modules/worlds/`. Každý modul má:
- `interfaces/` — pure TypeScript typy (žádné Mongoose importy)
- `schemas/` — Mongoose `@Schema` třídy
- `repositories/` — `extends BaseMongoRepository<T> implements IXxxRepository`
- Service injektuje repo přes `@Inject('IXxxRepository')`
- Controller používá `@UseGuards(JwtAuthGuard)` + `@CurrentUser()`

WorldMembership má pole `akj: number` a `role: WorldRole` (Hrac=0, Korektor=1, PomocnyPJ=2, PJ=3).

---

## Task 1: Interface + Repository Interface

**Files:**
- Create: `backend/src/modules/pages/interfaces/page.interface.ts`
- Create: `backend/src/modules/pages/interfaces/pages-repository.interface.ts`

- [ ] **Step 1: Vytvořit page.interface.ts**

```typescript
// backend/src/modules/pages/interfaces/page.interface.ts

export const PAGE_TYPES = {
  Lokace: 'Lokace',
  Noviny: 'Noviny',
  Seznam: 'Seznam',
  Galerie: 'Galerie',
  Rodokmen: 'Rodokmen',
  Obrazovka: 'Obrazovka',
  Ostatni: 'Ostatní',
} as const;

export interface AccessRequirement {
  type: 'UserId' | 'AKJ' | 'Role';
  value: string;
}

export interface PageSection {
  id: string;
  title: string;
  content: string;
  order: number;
  isCollapsed: boolean;
  items: PageSectionItem[];
}

export interface PageSectionItem {
  id: string;
  text: string;
  quantity?: number;
  note?: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  caption?: string;
  order: number;
}

export interface InstructionalVideo {
  id: string;
  title: string;
  youtubeUrl: string;
  youtubeVideoId: string;
}

export interface PageTable {
  hasTable: boolean;
  title?: string;
  headers?: string[];
  values?: string[];
}

export interface Page {
  id: string;
  slug: string;
  worldId: string;
  type: string;
  title: string;
  content: string;
  imageUrl?: string;
  bigImage?: boolean;
  table?: PageTable;
  sections: PageSection[];
  galleryImages: GalleryImage[];
  videos: InstructionalVideo[];
  accessRequirements: AccessRequirement[];
  customData?: Record<string, string>;
  order: number;
  createdAt: Date;
}
```

- [ ] **Step 2: Vytvořit pages-repository.interface.ts**

```typescript
// backend/src/modules/pages/interfaces/pages-repository.interface.ts
import { Page } from './page.interface';

export interface IPagesRepository {
  findById(id: string): Promise<Page | null>;
  findBySlugAndWorld(slug: string, worldId: string): Promise<Page | null>;
  findByWorld(worldId: string, type?: string): Promise<Page[]>;
  existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean>;
  save(page: Partial<Page>): Promise<Page>;
  update(id: string, data: Partial<Page>): Promise<Page | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/pages/interfaces/
git commit -m "feat(pages): přidat Page interface a IPagesRepository"
```

---

## Task 2: Schema + Repository

**Files:**
- Create: `backend/src/modules/pages/schemas/page.schema.ts`
- Create: `backend/src/modules/pages/repositories/pages.repository.ts`

- [ ] **Step 1: Vytvořit page.schema.ts**

```typescript
// backend/src/modules/pages/schemas/page.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PageDocument = HydratedDocument<PageSchemaClass>;

@Schema({ timestamps: true, collection: 'pages' })
export class PageSchemaClass {
  @Prop({ required: true }) slug: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true, default: 'Ostatní' }) type: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) content: string;
  @Prop() imageUrl?: string;
  @Prop({ default: false }) bigImage?: boolean;
  @Prop({ type: Object }) table?: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) sections: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) galleryImages: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) videos: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) accessRequirements: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData?: Record<string, string>;
  @Prop({ default: 0 }) order: number;
}

export const PageSchema = SchemaFactory.createForClass(PageSchemaClass);
PageSchema.index({ worldId: 1, slug: 1 }, { unique: true });
PageSchema.index({ worldId: 1, type: 1 });
```

- [ ] **Step 2: Vytvořit pages.repository.ts**

```typescript
// backend/src/modules/pages/repositories/pages.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { PageSchemaClass } from '../schemas/page.schema';
import { Page, PageSection, PageSectionItem, GalleryImage, InstructionalVideo, PageTable, AccessRequirement } from '../interfaces/page.interface';
import type { IPagesRepository } from '../interfaces/pages-repository.interface';

@Injectable()
export class MongoPagesRepository
  extends BaseMongoRepository<Page>
  implements IPagesRepository
{
  constructor(@InjectModel(PageSchemaClass.name) model: Model<PageSchemaClass>) {
    super(model as never);
  }

  async findBySlugAndWorld(slug: string, worldId: string): Promise<Page | null> {
    const doc = await this.model.findOne({ slug: slug.toLowerCase(), worldId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByWorld(worldId: string, type?: string): Promise<Page[]> {
    const filter: Record<string, unknown> = { worldId };
    if (type) filter.type = type;
    const docs = await this.model.find(filter).sort({ order: 1, createdAt: -1 }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean> {
    const count = await this.model.countDocuments({ slug: slug.toLowerCase(), worldId }).exec();
    return count > 0;
  }

  protected toEntity(doc: Record<string, unknown>): Page {
    return {
      id: String(doc._id),
      slug: doc.slug as string,
      worldId: doc.worldId as string,
      type: doc.type as string,
      title: doc.title as string,
      content: (doc.content as string) ?? '',
      imageUrl: doc.imageUrl as string | undefined,
      bigImage: (doc.bigImage as boolean) ?? false,
      table: doc.table as PageTable | undefined,
      sections: ((doc.sections as Record<string, unknown>[]) ?? []).map((s) => ({
        id: s.id as string,
        title: (s.title as string) ?? '',
        content: (s.content as string) ?? '',
        order: (s.order as number) ?? 0,
        isCollapsed: (s.isCollapsed as boolean) ?? true,
        items: ((s.items as Record<string, unknown>[]) ?? []).map((i) => ({
          id: i.id as string,
          text: (i.text as string) ?? '',
          quantity: i.quantity as number | undefined,
          note: i.note as string | undefined,
        } as PageSectionItem)),
      } as PageSection)),
      galleryImages: ((doc.galleryImages as Record<string, unknown>[]) ?? []).map((g) => ({
        id: g.id as string,
        url: g.url as string,
        caption: g.caption as string | undefined,
        order: (g.order as number) ?? 0,
      } as GalleryImage)),
      videos: ((doc.videos as Record<string, unknown>[]) ?? []).map((v) => ({
        id: v.id as string,
        title: (v.title as string) ?? '',
        youtubeUrl: (v.youtubeUrl as string) ?? '',
        youtubeVideoId: (v.youtubeVideoId as string) ?? '',
      } as InstructionalVideo)),
      accessRequirements: ((doc.accessRequirements as Record<string, unknown>[]) ?? []).map((r) => ({
        type: r.type as 'UserId' | 'AKJ' | 'Role',
        value: r.value as string,
      } as AccessRequirement)),
      customData: (doc.customData as Record<string, string>) ?? {},
      order: (doc.order as number) ?? 0,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/pages/schemas/ backend/src/modules/pages/repositories/
git commit -m "feat(pages): přidat PageSchema a MongoPagesRepository"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/pages/dto/create-page.dto.ts`
- Create: `backend/src/modules/pages/dto/update-page.dto.ts`

- [ ] **Step 1: Vytvořit create-page.dto.ts**

```typescript
// backend/src/modules/pages/dto/create-page.dto.ts
import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class AccessRequirementDto {
  @IsIn(['UserId', 'AKJ', 'Role']) type: 'UserId' | 'AKJ' | 'Role';
  @IsString() value: string;
}

export class PageSectionItemDto {
  @IsString() id: string;
  @IsString() text: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() note?: string;
}

export class PageSectionDto {
  @IsString() id: string;
  @IsString() title: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isCollapsed?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PageSectionItemDto) items?: PageSectionItemDto[];
}

export class GalleryImageDto {
  @IsString() id: string;
  @IsString() url: string;
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsNumber() order?: number;
}

export class InstructionalVideoDto {
  @IsString() id: string;
  @IsString() title: string;
  @IsString() youtubeUrl: string;
  @IsString() youtubeVideoId: string;
}

export class CreatePageDto {
  @IsString() slug: string;
  @IsString() type: string;
  @IsString() title: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() bigImage?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PageSectionDto) sections?: PageSectionDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GalleryImageDto) galleryImages?: GalleryImageDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InstructionalVideoDto) videos?: InstructionalVideoDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccessRequirementDto) accessRequirements?: AccessRequirementDto[];
  @IsOptional() @IsNumber() order?: number;
}
```

- [ ] **Step 2: Vytvořit update-page.dto.ts**

```typescript
// backend/src/modules/pages/dto/update-page.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePageDto } from './create-page.dto';

export class UpdatePageDto extends PartialType(CreatePageDto) {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/pages/dto/
git commit -m "feat(pages): přidat CreatePageDto a UpdatePageDto"
```

---

## Task 4: Service + testy

**Files:**
- Create: `backend/src/modules/pages/pages.service.spec.ts`
- Create: `backend/src/modules/pages/pages.service.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/pages/pages.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PagesService } from './pages.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockPage = {
  id: 'page1', slug: 'hlavni-lokace', worldId: 'world1', type: 'Lokace',
  title: 'Hlavní lokace', content: '<p>text</p>', sections: [], galleryImages: [],
  videos: [], accessRequirements: [], order: 0, createdAt: new Date(),
};

const mockMembership = { id: 'mem1', userId: 'user1', worldId: 'world1', role: WorldRole.Hrac, akj: 5, joinedAt: new Date() };

describe('PagesService', () => {
  let service: PagesService;
  const mockPagesRepo = {
    findById: jest.fn(),
    findBySlugAndWorld: jest.fn(),
    findByWorld: jest.fn(),
    existsBySlugAndWorld: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PagesService,
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(PagesService);
  });

  describe('findByWorld', () => {
    it('vrátí stránky světa bez filtrování přístupu', async () => {
      mockPagesRepo.findByWorld.mockResolvedValue([mockPage]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockPagesRepo.findByWorld).toHaveBeenCalledWith('world1', undefined);
    });
  });

  describe('findBySlug', () => {
    it('vyhodí NotFoundException pokud stránka neexistuje', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(service.findBySlug('neexistuje', 'world1', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('vrátí stránku bez accessRequirements pro každého', async () => {
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(mockPage);
      const result = await service.findBySlug('hlavni-lokace', 'world1', 'user1');
      expect(result.id).toBe('page1');
    });

    it('vyhodí ForbiddenException pokud AKJ nestačí', async () => {
      const restricted = { ...mockPage, accessRequirements: [{ type: 'AKJ', value: '10' }] };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, akj: 5 });
      await expect(service.findBySlug('hlavni-lokace', 'world1', 'user1')).rejects.toThrow(ForbiddenException);
    });

    it('propustí pokud AKJ stačí', async () => {
      const restricted = { ...mockPage, accessRequirements: [{ type: 'AKJ', value: '5' }] };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, akj: 5 });
      const result = await service.findBySlug('hlavni-lokace', 'world1', 'user1');
      expect(result.id).toBe('page1');
    });

    it('propustí pokud UserId odpovídá', async () => {
      const restricted = { ...mockPage, accessRequirements: [{ type: 'UserId', value: 'user1' }] };
      mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
      const result = await service.findBySlug('hlavni-lokace', 'world1', 'user1');
      expect(result.id).toBe('page1');
    });
  });

  describe('create', () => {
    it('vyhodí ConflictException pokud slug v světě existuje', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(true);
      await expect(service.create({ slug: 'hlavni-lokace', type: 'Lokace', title: 'X' }, 'world1')).rejects.toThrow(ConflictException);
    });

    it('vytvoří stránku se slug lowercase', async () => {
      mockPagesRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockPagesRepo.save.mockResolvedValue({ ...mockPage, slug: 'hlavni-lokace' });
      await service.create({ slug: 'Hlavni-Lokace', type: 'Lokace', title: 'X' }, 'world1');
      expect(mockPagesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ slug: 'hlavni-lokace' }));
    });
  });

  describe('delete', () => {
    it('vyhodí NotFoundException pokud stránka neexistuje', async () => {
      mockPagesRepo.findById.mockResolvedValue(null);
      await expect(service.delete('neexistuje', 'world1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ForbiddenException pokud stránka patří jinému světu', async () => {
      mockPagesRepo.findById.mockResolvedValue({ ...mockPage, worldId: 'jiny-svet' });
      await expect(service.delete('page1', 'world1')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spustit testy — ověřit že failují**

```bash
cd backend && npx jest pages.service.spec --no-coverage
```
Očekáváno: FAIL — `Cannot find module './pages.service'`

- [ ] **Step 3: Implementovat pages.service.ts**

```typescript
// backend/src/modules/pages/pages.service.ts
import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Page } from './interfaces/page.interface';
import type { CreatePageDto } from './dto/create-page.dto';
import type { UpdatePageDto } from './dto/update-page.dto';

@Injectable()
export class PagesService {
  constructor(
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async findByWorld(worldId: string, type?: string): Promise<Page[]> {
    return this.pagesRepo.findByWorld(worldId, type);
  }

  async findBySlug(slug: string, worldId: string, userId: string): Promise<Page> {
    const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    await this.assertAccess(page, userId, worldId);
    return page;
  }

  async create(dto: CreatePageDto, worldId: string): Promise<Page> {
    const slug = dto.slug.toLowerCase();
    const exists = await this.pagesRepo.existsBySlugAndWorld(slug, worldId);
    if (exists) throw new ConflictException('Slug již existuje v tomto světě');
    return this.pagesRepo.save({
      ...dto,
      slug,
      worldId,
      content: dto.content ?? '',
      sections: dto.sections ?? [],
      galleryImages: dto.galleryImages ?? [],
      videos: dto.videos ?? [],
      accessRequirements: dto.accessRequirements ?? [],
      order: dto.order ?? 0,
    });
  }

  async update(id: string, worldId: string, dto: UpdatePageDto): Promise<Page> {
    const page = await this.pagesRepo.findById(id);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    if (page.worldId !== worldId) throw new ForbiddenException('Stránka nepatří do tohoto světa');
    const updated = await this.pagesRepo.update(id, dto);
    return updated!;
  }

  async delete(id: string, worldId: string): Promise<void> {
    const page = await this.pagesRepo.findById(id);
    if (!page) throw new NotFoundException('Stránka nenalezena');
    if (page.worldId !== worldId) throw new ForbiddenException('Stránka nepatří do tohoto světa');
    await this.pagesRepo.delete(id);
  }

  private async assertAccess(page: Page, userId: string, worldId: string): Promise<void> {
    if (!page.accessRequirements || page.accessRequirements.length === 0) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    for (const req of page.accessRequirements) {
      if (req.type === 'UserId' && req.value === userId) return;
      if (req.type === 'AKJ' && membership && membership.akj >= parseInt(req.value, 10)) return;
      if (req.type === 'Role' && membership && membership.role >= parseInt(req.value, 10)) return;
    }
    throw new ForbiddenException('Přístup odepřen');
  }
}
```

- [ ] **Step 4: Spustit testy — ověřit že prochází**

```bash
cd backend && npx jest pages.service.spec --no-coverage
```
Očekáváno: PASS — všechny testy zelené

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/pages/pages.service.ts backend/src/modules/pages/pages.service.spec.ts
git commit -m "feat(pages): přidat PagesService s access control + testy"
```

---

## Task 5: Controller

**Files:**
- Create: `backend/src/modules/pages/pages.controller.ts`

- [ ] **Step 1: Vytvořit pages.controller.ts**

```typescript
// backend/src/modules/pages/pages.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { PagesService } from './pages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('worlds/:worldId/pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Param('worldId') worldId: string,
    @Query('type') type?: string,
  ) {
    return this.pagesService.findByWorld(worldId, type);
  }

  @Get(':slug')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pagesService.findBySlug(slug, worldId, user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreatePageDto,
  ) {
    return this.pagesService.create(dto, worldId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.pagesService.update(id, worldId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    return this.pagesService.delete(id, worldId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/pages/pages.controller.ts
git commit -m "feat(pages): přidat PagesController"
```

---

## Task 6: Module + registrace v AppModule

**Files:**
- Create: `backend/src/modules/pages/pages.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvořit pages.module.ts**

```typescript
// backend/src/modules/pages/pages.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PageSchemaClass, PageSchema } from './schemas/page.schema';
import { MongoPagesRepository } from './repositories/pages.repository';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PageSchemaClass.name, schema: PageSchema }]),
    WorldsModule,
  ],
  controllers: [PagesController],
  providers: [
    PagesService,
    { provide: 'IPagesRepository', useClass: MongoPagesRepository },
  ],
  exports: [PagesService, 'IPagesRepository'],
})
export class PagesModule {}
```

- [ ] **Step 2: Přidat PagesModule do app.module.ts**

```typescript
// backend/src/app.module.ts
// Přidat import:
import { PagesModule } from './modules/pages/pages.module';

// Přidat do imports[] pole:
PagesModule,
```

- [ ] **Step 3: Spustit build — ověřit bez chyb**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 4: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny existující testy stále zelené

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/pages/pages.module.ts backend/src/app.module.ts
git commit -m "feat(pages): registrovat PagesModule v AppModule"
```
