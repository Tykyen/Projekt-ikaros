# Krok 6a Rozšíření — Pages doplňky: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozšířit existující Pages modul o pole `menu`/`plainText`/`isWoodWide`, TipTapExtractor service, 4 extra endpointy, FavoritePages a seed šablon stránek při world.created.

**Architecture:** Rozšíření na existující `PagesModule` z krok-6a. TipTapExtractor je injectable service volaný ze `PagesService`. Seed šablon stránek používá `@OnEvent('world.created')` listener. FavoritePages ukládá `favoritePageSlugs[]` přímo na World dokument; favorite endpointy jsou rozděleny — `POST/DELETE /:slug/favorite` na PagesController, `GET /favorites` na WorldsController.

**Tech Stack:** NestJS 11, TypeScript 5, Mongoose 9, class-validator, @nestjs/event-emitter, Jest

---

## Přehled souborů

**Upravit:**
- `backend/src/modules/pages/interfaces/page.interface.ts` — přidat `MenuItem`, `menu`, `plainText`, `isWoodWide`
- `backend/src/modules/pages/interfaces/pages-repository.interface.ts` — přidat `findDirectory`, `findAllSlugs`, `findRandom`, `findBySlugs`
- `backend/src/modules/pages/schemas/page.schema.ts` — přidat `@Prop` pro nová pole
- `backend/src/modules/pages/dto/create-page.dto.ts` — přidat `MenuItemDto`, `menu` pole (bez `plainText`)
- `backend/src/modules/pages/repositories/pages.repository.ts` — přidat nové repo metody + toEntity rozšíření
- `backend/src/modules/pages/pages.service.ts` — volat TipTapExtractor, přidat metody directory/slugs/random/favorites
- `backend/src/modules/pages/pages.service.spec.ts` — přidat testy nových metod
- `backend/src/modules/pages/pages.controller.ts` — přidat 4 extra GET + POST/DELETE favorite
- `backend/src/modules/pages/pages.module.ts` — registrovat TipTapExtractor + WorldSeedListener
- `backend/src/modules/worlds/interfaces/world.interface.ts` — přidat `favoritePageSlugs`
- `backend/src/modules/worlds/interfaces/worlds-repository.interface.ts` — přidat `addFavoriteSlug`, `removeFavoriteSlug`
- `backend/src/modules/worlds/schemas/world.schema.ts` — přidat `favoritePageSlugs`
- `backend/src/modules/worlds/repositories/worlds.repository.ts` — přidat nové metody + toEntity rozšíření
- `backend/src/modules/worlds/worlds.controller.ts` — přidat `GET /worlds/:worldId/favorites`

**Vytvořit:**
- `backend/src/modules/pages/tiptap-extractor.service.ts`
- `backend/src/modules/pages/tiptap-extractor.service.spec.ts`
- `backend/src/modules/pages/pages-world-seed.listener.ts`

---

## Task 1: Nová pole na Page interface + schema + DTO

**Files:**
- Modify: `backend/src/modules/pages/interfaces/page.interface.ts`
- Modify: `backend/src/modules/pages/schemas/page.schema.ts`
- Modify: `backend/src/modules/pages/dto/create-page.dto.ts`

- [ ] **Step 1: Rozšířit page.interface.ts**

Přidat za existující `InstructionalVideo` interface:

```typescript
export interface MenuItem {
  label: string;
  href: string;
  order: number;
}
```

Přidat do `Page` interface za `videos`:
```typescript
menu: MenuItem[];
plainText: string;
isWoodWide: boolean;
```

- [ ] **Step 2: Rozšířit page.schema.ts**

Přidat do `PageSchemaClass` za `@Prop({ type: [Object], default: [] }) videos`:
```typescript
@Prop({ type: [Object], default: [] }) menu: Record<string, unknown>[];
@Prop({ default: '' }) plainText: string;
@Prop({ default: false }) isWoodWide: boolean;
```

- [ ] **Step 3: Rozšířit create-page.dto.ts**

Přidat třídu `MenuItemDto` za existující `InstructionalVideoDto`:
```typescript
export class MenuItemDto {
  @IsString() label: string;
  @IsString() href: string;
  @IsOptional() @IsNumber() order?: number;
}
```

Přidat do `CreatePageDto` za `videos`:
```typescript
@IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MenuItemDto) menu?: MenuItemDto[];
@IsOptional() @IsBoolean() isWoodWide?: boolean;
```

(Žádné `plainText` — generuje se automaticky)

- [ ] **Step 4: Rozšířit toEntity v pages.repository.ts**

V metodě `toEntity` přidat za mapování `videos`:
```typescript
menu: ((doc.menu as Record<string, unknown>[]) ?? []).map((m) => ({
  label: m.label as string,
  href: m.href as string,
  order: (m.order as number) ?? 0,
} as MenuItem)),
plainText: (doc.plainText as string) ?? '',
isWoodWide: (doc.isWoodWide as boolean) ?? false,
```

Přidat `MenuItem` do importu z `'../interfaces/page.interface'`.

- [ ] **Step 5: Rozšířit create v pages.service.ts**

V metodě `create` přidat do `pagesRepo.save({...})`:
```typescript
menu: dto.menu ?? [],
isWoodWide: dto.isWoodWide ?? false,
```

A do `update` přidat do `pagesRepo.update(id, dto)` — PartialType to pokryje automaticky.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/pages/interfaces/page.interface.ts backend/src/modules/pages/schemas/page.schema.ts backend/src/modules/pages/dto/create-page.dto.ts backend/src/modules/pages/repositories/pages.repository.ts backend/src/modules/pages/pages.service.ts
git commit -m "feat(pages): přidat menu, plainText, isWoodWide pole"
```

---

## Task 2: TipTapExtractor service

**Files:**
- Create: `backend/src/modules/pages/tiptap-extractor.service.spec.ts`
- Create: `backend/src/modules/pages/tiptap-extractor.service.ts`

- [ ] **Step 1: Napsat failing test**

```typescript
// backend/src/modules/pages/tiptap-extractor.service.spec.ts
import { TipTapExtractor } from './tiptap-extractor.service';

describe('TipTapExtractor', () => {
  let extractor: TipTapExtractor;

  beforeEach(() => {
    extractor = new TipTapExtractor();
  });

  it('odstraní HTML tagy a vrátí čistý text', () => {
    const result = extractor.extract('<p>Agent byl v <strong>Tokiu</strong></p>');
    expect(result).toBe('Agent byl v Tokiu');
  });

  it('sloučí vícenásobné mezery', () => {
    const result = extractor.extract('<p>Slovo</p><p>Druhé</p>');
    expect(result).toBe('Slovo Druhé');
  });

  it('vrátí prázdný string pro prázdný vstup', () => {
    expect(extractor.extract('')).toBe('');
  });

  it('vrátí prázdný string pro vstup jen s tagy', () => {
    expect(extractor.extract('<p></p><br/>')).toBe('');
  });
});
```

- [ ] **Step 2: Spustit test — ověřit že failuje**

```bash
cd backend && npx jest tiptap-extractor.service.spec --no-coverage
```
Očekáváno: FAIL — `Cannot find module './tiptap-extractor.service'`

- [ ] **Step 3: Implementovat TipTapExtractor**

```typescript
// backend/src/modules/pages/tiptap-extractor.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class TipTapExtractor {
  extract(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
```

- [ ] **Step 4: Spustit test — ověřit že prochází**

```bash
cd backend && npx jest tiptap-extractor.service.spec --no-coverage
```
Očekáváno: PASS — 4 testy zelené

- [ ] **Step 5: Napojit TipTapExtractor do PagesService**

V `pages.service.ts` přidat import a constructor injection:
```typescript
import { TipTapExtractor } from './tiptap-extractor.service';
```

Do konstruktoru přidat:
```typescript
private readonly tipTapExtractor: TipTapExtractor,
```

V metodě `create` před `pagesRepo.save(...)` přidat:
```typescript
const plainText = this.tipTapExtractor.extract(dto.content ?? '');
```

A do `pagesRepo.save({...})` přidat:
```typescript
plainText,
```

V metodě `update` přidat podmíněný přepočet:
```typescript
const extra: Partial<Page> = {};
if (dto.content !== undefined) {
  extra.plainText = this.tipTapExtractor.extract(dto.content);
}
const updated = await this.pagesRepo.update(id, { ...dto, ...extra });
```

- [ ] **Step 6: Registrovat TipTapExtractor v pages.module.ts**

Přidat do `providers[]`:
```typescript
TipTapExtractor,
```

- [ ] **Step 7: Aktualizovat test PagesService — přidat mock TipTapExtractor**

V `pages.service.spec.ts` přidat do `providers[]`:
```typescript
{ provide: TipTapExtractor, useValue: { extract: jest.fn().mockReturnValue('plain text') } },
```

- [ ] **Step 8: Spustit testy**

```bash
cd backend && npx jest pages.service.spec tiptap-extractor --no-coverage
```
Očekáváno: PASS — všechny testy zelené

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/pages/tiptap-extractor.service.ts backend/src/modules/pages/tiptap-extractor.service.spec.ts backend/src/modules/pages/pages.service.ts backend/src/modules/pages/pages.module.ts backend/src/modules/pages/pages.service.spec.ts
git commit -m "feat(pages): přidat TipTapExtractor — auto-generování plainText"
```

---

## Task 3: Extra repository metody

**Files:**
- Modify: `backend/src/modules/pages/interfaces/pages-repository.interface.ts`
- Modify: `backend/src/modules/pages/repositories/pages.repository.ts`

- [ ] **Step 1: Rozšířit IPagesRepository interface**

Přidat za `delete`:
```typescript
findDirectory(worldId: string): Promise<Pick<Page, 'id' | 'slug' | 'title' | 'type' | 'order'>[]>;
findAllSlugs(worldId: string): Promise<string[]>;
findRandom(worldId: string, count: number): Promise<Page[]>;
findBySlugs(slugs: string[], worldId: string): Promise<Page[]>;
```

- [ ] **Step 2: Implementovat metody v MongoPagesRepository**

Přidat za `existsBySlugAndWorld`:

```typescript
async findDirectory(worldId: string): Promise<Pick<Page, 'id' | 'slug' | 'title' | 'type' | 'order'>[]> {
  const docs = await this.model
    .find({ worldId }, { _id: 1, slug: 1, title: 1, type: 1, order: 1 })
    .sort({ order: 1 })
    .lean()
    .exec();
  return docs.map((doc) => ({
    id: String(doc._id),
    slug: doc.slug as string,
    title: doc.title as string,
    type: doc.type as string,
    order: (doc.order as number) ?? 0,
  }));
}

async findAllSlugs(worldId: string): Promise<string[]> {
  const docs = await this.model.find({ worldId }, { slug: 1 }).lean().exec();
  return docs.map((doc) => doc.slug as string);
}

async findRandom(worldId: string, count: number): Promise<Page[]> {
  const docs = await this.model.aggregate([
    { $match: { worldId } },
    { $sample: { size: count } },
  ]);
  return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
}

async findBySlugs(slugs: string[], worldId: string): Promise<Page[]> {
  if (slugs.length === 0) return [];
  const docs = await this.model.find({ worldId, slug: { $in: slugs } }).lean().exec();
  return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
}
```

- [ ] **Step 3: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/pages/interfaces/pages-repository.interface.ts backend/src/modules/pages/repositories/pages.repository.ts
git commit -m "feat(pages): přidat findDirectory, findAllSlugs, findRandom, findBySlugs do repository"
```

---

## Task 4: Extra service metody + testy

**Files:**
- Modify: `backend/src/modules/pages/pages.service.ts`
- Modify: `backend/src/modules/pages/pages.service.spec.ts`

- [ ] **Step 1: Napsat failing testy**

Přidat do `pages.service.spec.ts` (za existující describe bloky):

```typescript
describe('findDirectory', () => {
  it('vrátí zkrácené stránky bez access filtru', async () => {
    const dirItem = { id: 'p1', slug: 'lokace', title: 'Lokace', type: 'Lokace', order: 0 };
    mockPagesRepo.findDirectory = jest.fn().mockResolvedValue([dirItem]);
    const result = await service.findDirectory('world1');
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('content');
    expect(mockPagesRepo.findDirectory).toHaveBeenCalledWith('world1');
  });
});

describe('findAllSlugs', () => {
  it('vrátí seznam slugů', async () => {
    mockPagesRepo.findAllSlugs = jest.fn().mockResolvedValue(['lokace', 'faq']);
    const result = await service.findAllSlugs('world1');
    expect(result).toEqual(['lokace', 'faq']);
  });
});

describe('findRandom', () => {
  it('vrátí N náhodných stránek s default 5', async () => {
    mockPagesRepo.findRandom = jest.fn().mockResolvedValue([mockPage]);
    const result = await service.findRandom('world1', 5);
    expect(mockPagesRepo.findRandom).toHaveBeenCalledWith('world1', 5);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Spustit testy — ověřit že failují**

```bash
cd backend && npx jest pages.service.spec --no-coverage
```
Očekáváno: FAIL — `service.findDirectory is not a function`

- [ ] **Step 3: Implementovat nové metody v PagesService**

Přidat za `delete`:
```typescript
async findDirectory(worldId: string) {
  return this.pagesRepo.findDirectory(worldId);
}

async findAllSlugs(worldId: string): Promise<string[]> {
  return this.pagesRepo.findAllSlugs(worldId);
}

async findRandom(worldId: string, count: number): Promise<Page[]> {
  return this.pagesRepo.findRandom(worldId, Math.max(1, Math.min(count, 50)));
}
```

- [ ] **Step 4: Spustit testy — ověřit že prochází**

```bash
cd backend && npx jest pages.service.spec --no-coverage
```
Očekáváno: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/pages/pages.service.ts backend/src/modules/pages/pages.service.spec.ts
git commit -m "feat(pages): přidat findDirectory, findAllSlugs, findRandom do service"
```

---

## Task 5: Extra endpointy v controlleru

**Files:**
- Modify: `backend/src/modules/pages/pages.controller.ts`

- [ ] **Step 1: Přidat 4 extra GET endpointy**

Do `PagesController` přidat před existující `@Get(':slug')` (pořadí důležité — specifické routes musí být před `:slug`):

```typescript
@Get('directory')
@UseGuards(JwtAuthGuard)
getDirectory(@Param('worldId') worldId: string) {
  return this.pagesService.findDirectory(worldId);
}

@Get('dataSlugs')
@UseGuards(JwtAuthGuard)
getDataSlugs(@Param('worldId') worldId: string) {
  return this.pagesService.findAllSlugs(worldId);
}

@Get('data')
@UseGuards(JwtAuthGuard)
getData(
  @Param('worldId') worldId: string,
  @Query('number') number?: string,
) {
  return this.pagesService.findRandom(worldId, number ? parseInt(number, 10) : 5);
}

@Get('meta/:slug')
@UseGuards(JwtAuthGuard)
getMeta(
  @Param('worldId') worldId: string,
  @Param('slug') slug: string,
) {
  return this.pagesService.findMeta(slug, worldId);
}
```

- [ ] **Step 2: Implementovat findMeta v PagesService**

Přidat do `pages.service.ts`:
```typescript
async findMeta(slug: string, worldId: string): Promise<{ isWoodWide: boolean }> {
  const page = await this.pagesRepo.findBySlugAndWorld(slug, worldId);
  if (!page) throw new NotFoundException('Stránka nenalezena');
  return { isWoodWide: page.isWoodWide ?? false };
}
```

- [ ] **Step 3: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/pages/pages.controller.ts backend/src/modules/pages/pages.service.ts
git commit -m "feat(pages): přidat /directory, /dataSlugs, /data, /meta/:slug endpointy"
```

---

## Task 6: FavoritePages — datový model

**Files:**
- Modify: `backend/src/modules/worlds/interfaces/world.interface.ts`
- Modify: `backend/src/modules/worlds/interfaces/worlds-repository.interface.ts`
- Modify: `backend/src/modules/worlds/schemas/world.schema.ts`
- Modify: `backend/src/modules/worlds/repositories/worlds.repository.ts`

- [ ] **Step 1: Přidat favoritePageSlugs do world.interface.ts**

Přidat do `World` interface za `calendarConfig`:
```typescript
favoritePageSlugs: string[];
```

- [ ] **Step 2: Přidat metody do IWorldsRepository**

Přidat za `delete`:
```typescript
addFavoriteSlug(worldId: string, slug: string): Promise<void>;
removeFavoriteSlug(worldId: string, slug: string): Promise<void>;
```

- [ ] **Step 3: Přidat @Prop do world.schema.ts**

Přidat za `calendarConfig`:
```typescript
@Prop({ type: [String], default: [] }) favoritePageSlugs: string[];
```

- [ ] **Step 4: Aktualizovat toEntity v worlds.repository.ts**

Přidat za `calendarConfig` řádek:
```typescript
favoritePageSlugs: (doc.favoritePageSlugs as string[]) ?? [],
```

- [ ] **Step 5: Implementovat nové metody v MongoWorldsRepository**

Přidat za `existsBySlug`:
```typescript
async addFavoriteSlug(worldId: string, slug: string): Promise<void> {
  if (!Types.ObjectId.isValid(worldId)) return;
  await this.model.findByIdAndUpdate(worldId, { $addToSet: { favoritePageSlugs: slug } }).exec();
}

async removeFavoriteSlug(worldId: string, slug: string): Promise<void> {
  if (!Types.ObjectId.isValid(worldId)) return;
  await this.model.findByIdAndUpdate(worldId, { $pull: { favoritePageSlugs: slug } }).exec();
}
```

- [ ] **Step 6: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/worlds/interfaces/world.interface.ts backend/src/modules/worlds/interfaces/worlds-repository.interface.ts backend/src/modules/worlds/schemas/world.schema.ts backend/src/modules/worlds/repositories/worlds.repository.ts
git commit -m "feat(worlds): přidat favoritePageSlugs pole a repo metody"
```

---

## Task 7: FavoritePages — service metody a endpointy

**Files:**
- Modify: `backend/src/modules/pages/pages.service.ts`
- Modify: `backend/src/modules/pages/pages.controller.ts`
- Modify: `backend/src/modules/worlds/worlds.controller.ts`
- Modify: `backend/src/modules/worlds/worlds.service.ts`

- [ ] **Step 1: Přidat getFavoritePages do WorldsService**

V `worlds.service.ts` přidat import PagesService nebo použít přímý inject `IPagesRepository`. Protože WorldsModule nemůže importovat PagesModule (circular), přidáme metodu do `WorldsService` která vrátí jen slugs, a GET /favorites endpoint vyřídíme v `PagesController` s inject `IWorldsRepository`.

Do `pages.service.ts` přidat inject `IWorldsRepository` — PagesModule již importuje WorldsModule:

```typescript
@Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
```

Import přidat:
```typescript
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
```

Přidat metody:

```typescript
async addFavorite(worldId: string, slug: string): Promise<void> {
  const exists = await this.pagesRepo.existsBySlugAndWorld(slug, worldId);
  if (!exists) throw new NotFoundException('Stránka nenalezena');
  await this.worldsRepo.addFavoriteSlug(worldId, slug);
}

async removeFavorite(worldId: string, slug: string): Promise<void> {
  await this.worldsRepo.removeFavoriteSlug(worldId, slug);
}

async findFavorites(worldId: string): Promise<Page[]> {
  const world = await this.worldsRepo.findById(worldId);
  if (!world) throw new NotFoundException('Svět nenalezen');
  return this.pagesRepo.findBySlugs(world.favoritePageSlugs, worldId);
}
```

- [ ] **Step 2: Přidat favorite endpointy do PagesController**

Přidat za existující `@Delete(':id')`:

```typescript
@Post(':slug/favorite')
@UseGuards(JwtAuthGuard)
addFavorite(
  @Param('worldId') worldId: string,
  @Param('slug') slug: string,
) {
  return this.pagesService.addFavorite(worldId, slug);
}

@Delete(':slug/favorite')
@UseGuards(JwtAuthGuard)
removeFavorite(
  @Param('worldId') worldId: string,
  @Param('slug') slug: string,
) {
  return this.pagesService.removeFavorite(worldId, slug);
}
```

- [ ] **Step 3: Přidat GET /favorites do WorldsController**

V `worlds.controller.ts` přidat import `PagesService`:
```typescript
import { PagesService } from '../pages/pages.service';
```

Do konstruktoru WorldsController přidat:
```typescript
private readonly pagesService: PagesService,
```

Přidat endpoint:
```typescript
@Get(':worldId/favorites')
@UseGuards(JwtAuthGuard)
getFavorites(@Param('worldId') worldId: string) {
  return this.pagesService.findFavorites(worldId);
}
```

- [ ] **Step 4: Registrovat PagesService export v PagesModule (pokud není)**

Ověřit že `pages.module.ts` má v `exports[]`:
```typescript
PagesService,
```

V `worlds.module.ts` přidat import `PagesModule`:
```typescript
import { PagesModule } from '../pages/pages.module';
// do imports[]:
PagesModule,
```

Pozor na circular dependency — ověřit že PagesModule importuje WorldsModule a WorldsModule importuje PagesModule. Pokud by došlo k circular, použít `forwardRef()`:
```typescript
imports: [forwardRef(() => WorldsModule)]
// resp.
imports: [forwardRef(() => PagesModule)]
```

- [ ] **Step 5: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 6: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny zelené

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/pages/pages.service.ts backend/src/modules/pages/pages.controller.ts backend/src/modules/worlds/worlds.controller.ts backend/src/modules/worlds/worlds.module.ts backend/src/modules/pages/pages.module.ts
git commit -m "feat(pages): přidat FavoritePages endpointy"
```

---

## Task 8: Seed šablon stránek při world.created

**Files:**
- Create: `backend/src/modules/pages/pages-world-seed.listener.ts`
- Modify: `backend/src/modules/pages/pages.module.ts`

- [ ] **Step 1: Vytvořit pages-world-seed.listener.ts**

```typescript
// backend/src/modules/pages/pages-world-seed.listener.ts
import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { IPagesRepository } from './interfaces/pages-repository.interface';
import type { World } from '../worlds/interfaces/world.interface';

const PAGE_TEMPLATES = [
  { slug: 'pravidla',       type: 'Ostatní',   title: 'Pravidla',          order: 0 },
  { slug: 'magicky-system', type: 'Ostatní',   title: 'Magický systém',    order: 1 },
  { slug: 'technologie',    type: 'Ostatní',   title: 'Technologie',       order: 2 },
  { slug: 'faq',            type: 'Ostatní',   title: 'FAQ',               order: 3 },
  { slug: 'videa',          type: 'Obrazovka', title: 'Instruktážní videa', order: 4 },
];

@Injectable()
export class PagesWorldSeedListener {
  constructor(
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
  ) {}

  @OnEvent('world.created')
  async handleWorldCreated(world: World): Promise<void> {
    for (const template of PAGE_TEMPLATES) {
      const exists = await this.pagesRepo.existsBySlugAndWorld(template.slug, world.id);
      if (exists) continue;
      await this.pagesRepo.save({
        ...template,
        worldId: world.id,
        content: '',
        plainText: '',
        menu: [],
        sections: [],
        galleryImages: [],
        videos: [],
        accessRequirements: [],
        isWoodWide: false,
      });
    }
  }
}
```

- [ ] **Step 2: Registrovat listener v pages.module.ts**

Přidat import:
```typescript
import { PagesWorldSeedListener } from './pages-world-seed.listener';
```

Přidat do `providers[]`:
```typescript
PagesWorldSeedListener,
```

- [ ] **Step 3: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 4: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny zelené

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/pages/pages-world-seed.listener.ts backend/src/modules/pages/pages.module.ts
git commit -m "feat(pages): seed 5 šablon stránek při world.created"
```
