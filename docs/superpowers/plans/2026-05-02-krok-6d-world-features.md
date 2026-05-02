# Krok 6d — World Features: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat AKJ typy a menu šablony do WorldSettings, rozšířit Matrix seed o AKJ skupiny, a implementovat PopulateProfileImages service.

**Architecture:** `WorldSettings` interface/schema/DTO rozšíření sleduje existující pattern (přidat interface typy, @Prop do schématu, validaci do DTO). `PopulateProfileImages` je injectable service v `CharactersModule` který reaguje na EventEmitter2 eventy a při startu aplikace spustí backfill přes `OnApplicationBootstrap`.

**Tech Stack:** NestJS 11, TypeScript 5, Mongoose 9, class-validator, @nestjs/event-emitter, Jest

---

## Přehled souborů

**Upravit:**
- `backend/src/modules/worlds/interfaces/world-settings.interface.ts` — přidat `AkjType`, `MenuTemplate`, `MenuTemplateItem`
- `backend/src/modules/worlds/schemas/world-settings.schema.ts` — přidat `@Prop` pro `akjTypes`, `menuTemplates`
- `backend/src/modules/worlds/dto/update-world-settings.dto.ts` — přidat `AkjTypeDto`, `MenuTemplateItemDto`, `MenuTemplateDto`
- `backend/src/modules/worlds/repositories/world-settings.repository.ts` — rozšířit `toEntity`
- `backend/src/database/seed/matrix-world.seed.ts` — přidat AKJ typy pro Matrix

**Vytvořit:**
- `backend/src/modules/characters/populate-profile-images.service.ts`

**Upravit:**
- `backend/src/modules/characters/characters.module.ts` — registrovat `PopulateProfileImagesService`

---

## Task 1: AKJ typy a menu šablony — interface + schema + DTO

**Files:**
- Modify: `backend/src/modules/worlds/interfaces/world-settings.interface.ts`
- Modify: `backend/src/modules/worlds/schemas/world-settings.schema.ts`
- Modify: `backend/src/modules/worlds/dto/update-world-settings.dto.ts`

- [ ] **Step 1: Rozšířit world-settings.interface.ts**

Přidat před existující `WorldSettings` interface:
```typescript
export interface AkjType {
  key: string;    // interní identifikátor, např. 'woodwide'
  name: string;   // zobrazený název, např. 'Wood Wide Web'
  level: number;  // numerický level, např. 7
}

export interface MenuTemplateItem {
  label: string;
  href: string;
  order: number;
}

export interface MenuTemplate {
  name: string;
  items: MenuTemplateItem[];
}
```

Přidat do `WorldSettings` interface za `hideDefaultWeather`:
```typescript
akjTypes: AkjType[];
menuTemplates: MenuTemplate[];
```

- [ ] **Step 2: Rozšířit world-settings.schema.ts**

Přidat do `WorldSettingsSchemaClass` za `hideDefaultWeather`:
```typescript
@Prop({ type: [Object], default: [] }) akjTypes: Record<string, unknown>[];
@Prop({ type: [Object], default: [] }) menuTemplates: Record<string, unknown>[];
```

- [ ] **Step 3: Rozšířit update-world-settings.dto.ts**

Přidat před `UpdateWorldSettingsDto`:
```typescript
export class AkjTypeDto {
  @IsString() key: string;
  @IsString() name: string;
  @IsNumber() @Min(0) level: number;
}

export class MenuTemplateItemDto {
  @IsString() label: string;
  @IsString() href: string;
  @IsOptional() @IsNumber() order?: number;
}

export class MenuTemplateDto {
  @IsString() name: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => MenuTemplateItemDto) items: MenuTemplateItemDto[];
}
```

Přidat do `UpdateWorldSettingsDto` za `hideDefaultWeather`:
```typescript
@IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AkjTypeDto) akjTypes?: AkjTypeDto[];
@IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MenuTemplateDto) menuTemplates?: MenuTemplateDto[];
```

Přidat do importů na vrchu souboru `Min` a `IsNumber` pokud chybí (jsou již tam).

- [ ] **Step 4: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/worlds/interfaces/world-settings.interface.ts backend/src/modules/worlds/schemas/world-settings.schema.ts backend/src/modules/worlds/dto/update-world-settings.dto.ts
git commit -m "feat(worlds): přidat AKJ typy a menu šablony do WorldSettings"
```

---

## Task 2: Rozšířit WorldSettings repository toEntity

**Files:**
- Modify: `backend/src/modules/worlds/repositories/world-settings.repository.ts`

- [ ] **Step 1: Zkontrolovat existující toEntity**

Přečíst `backend/src/modules/worlds/repositories/world-settings.repository.ts` a najít `toEntity` metodu.

- [ ] **Step 2: Přidat mapování nových polí do toEntity**

Přidat za existující mapování `hideDefaultWeather`:
```typescript
akjTypes: ((doc.akjTypes as Record<string, unknown>[]) ?? []).map((a) => ({
  key: a.key as string,
  name: a.name as string,
  level: (a.level as number) ?? 0,
})),
menuTemplates: ((doc.menuTemplates as Record<string, unknown>[]) ?? []).map((t) => ({
  name: t.name as string,
  items: ((t.items as Record<string, unknown>[]) ?? []).map((i) => ({
    label: i.label as string,
    href: i.href as string,
    order: (i.order as number) ?? 0,
  })),
})),
```

Přidat `AkjType, MenuTemplate` do importu z `'../interfaces/world-settings.interface'`.

- [ ] **Step 3: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 4: Spustit testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny zelené

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/worlds/repositories/world-settings.repository.ts
git commit -m "feat(worlds): rozšířit WorldSettings toEntity o akjTypes a menuTemplates"
```

---

## Task 3: Matrix seed — AKJ typy

**Files:**
- Modify: `backend/src/database/seed/matrix-world.seed.ts`

- [ ] **Step 1: Přidat AKJ typy do Matrix seandu**

Aktuální seed vytváří jen World dokument. Potřebujeme po vytvoření světa také upsertovat WorldSettings s AKJ typy.

Přidat import `IWorldSettingsRepository`:
```typescript
import type { IWorldSettingsRepository } from '../../modules/worlds/interfaces/world-settings-repository.interface';
```

Přidat do konstruktoru:
```typescript
@Inject('IWorldSettingsRepository') private readonly settingsRepo: IWorldSettingsRepository,
```

Za `this.logger.log('Matrix World seeded.');` přidat:
```typescript
await this.settingsRepo.upsert(MATRIX_WORLD_ID, {
  akjTypes: [
    { key: 'akj',      name: 'AKJ',           level: 5 },
    { key: 'woodwide', name: 'Wood Wide Web',  level: 7 },
  ],
});
this.logger.log('Matrix World AKJ types seeded.');
```

- [ ] **Step 2: Ověřit že IWorldSettingsRepository.upsert akceptuje Partial**

Zkontrolovat `backend/src/modules/worlds/interfaces/world-settings-repository.interface.ts` — upsert by měl mít signaturu `upsert(worldId: string, data: Partial<WorldSettings>): Promise<WorldSettings>`.

Pokud `akjTypes` není v `Partial<WorldSettings>` (TypeScript), ověřit že je pole exportováno z interface — je, Step 1 Tasku 1 to přidal.

- [ ] **Step 3: Ověřit přístup k IWorldSettingsRepository**

`MatrixWorldSeed` je provider přímo v `AppModule` (`providers: [MatrixWorldSeed]`). `AppModule` importuje `WorldsModule` který exportuje `IWorldSettingsRepository`. Injekce v kroku 1 proto funguje bez dalších změn — žádný nový import v `AppModule` není potřeba.

- [ ] **Step 4: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/seed/matrix-world.seed.ts
git commit -m "feat(seed): přidat AKJ typy pro Matrix svět"
```

---

## Task 4: PopulateProfileImages service

> **⚠️ Prerekvizita:** Tento task vyžaduje dokončení **krok-6b** (Characters modul). `CharactersModule`, `ICharactersRepository` a `Character` interface musí existovat. Implementuj až po krok-6b.

**Files:**
- Create: `backend/src/modules/characters/populate-profile-images.service.ts`
- Create: `backend/src/modules/characters/populate-profile-images.service.spec.ts`
- Modify: `backend/src/modules/characters/characters.module.ts`

- [ ] **Step 1: Zkontrolovat Character a User interface**

Přečíst:
- `backend/src/modules/characters/interfaces/character.interface.ts`
- `backend/src/modules/users/interfaces/user.interface.ts`

Ověřit že:
- `Character` má pole `userId?: string` a `imageUrl: string`
- `User` má pole `profileImageUrl?: string` nebo podobné
- Existuje `ICharactersRepository` s metodou `findByWorld` nebo `findAll`
- Existuje `IUsersRepository` s metodou `update`

Pokud `User` nemá `profileImageUrl`, přidat ho do user interface a user schema jako optional string.

- [ ] **Step 2: Napsat failing test**

```typescript
// backend/src/modules/characters/populate-profile-images.service.spec.ts
import { Test } from '@nestjs/testing';
import { PopulateProfileImagesService } from './populate-profile-images.service';

describe('PopulateProfileImagesService', () => {
  let service: PopulateProfileImagesService;

  const mockCharactersRepo = {
    findAll: jest.fn(),
  };
  const mockUsersRepo = {
    findById: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PopulateProfileImagesService,
        { provide: 'ICharactersRepository', useValue: mockCharactersRepo },
        { provide: 'IUsersRepository', useValue: mockUsersRepo },
      ],
    }).compile();
    service = module.get(PopulateProfileImagesService);
  });

  describe('populateFromCharacter', () => {
    it('nastaví profileImageUrl pokud user ho nemá', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'u1', profileImageUrl: undefined });
      mockUsersRepo.update.mockResolvedValue({});
      await service.populateFromCharacter({ userId: 'u1', imageUrl: 'https://img.example.com/a.jpg', isNpc: false } as any);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { profileImageUrl: 'https://img.example.com/a.jpg' });
    });

    it('nepřepíše profileImageUrl pokud user ho má', async () => {
      mockUsersRepo.findById.mockResolvedValue({ id: 'u1', profileImageUrl: 'https://img.example.com/existing.jpg' });
      await service.populateFromCharacter({ userId: 'u1', imageUrl: 'https://img.example.com/new.jpg', isNpc: false } as any);
      expect(mockUsersRepo.update).not.toHaveBeenCalled();
    });

    it('přeskočí NPC (bez userId)', async () => {
      await service.populateFromCharacter({ userId: undefined, imageUrl: 'https://img.example.com/npc.jpg', isNpc: true } as any);
      expect(mockUsersRepo.findById).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Spustit test — ověřit že failuje**

```bash
cd backend && npx jest populate-profile-images --no-coverage
```
Očekáváno: FAIL — `Cannot find module './populate-profile-images.service'`

- [ ] **Step 4: Implementovat PopulateProfileImagesService**

```typescript
// backend/src/modules/characters/populate-profile-images.service.ts
import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ICharactersRepository } from './interfaces/characters-repository.interface';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';
import type { Character } from './interfaces/character.interface';

@Injectable()
export class PopulateProfileImagesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PopulateProfileImagesService.name);

  constructor(
    @Inject('ICharactersRepository') private readonly charactersRepo: ICharactersRepository,
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const characters = await this.charactersRepo.findAll();
      const cps = characters.filter((c) => c.userId && !c.isNpc);
      for (const cp of cps) {
        await this.populateFromCharacter(cp);
      }
      this.logger.log(`PopulateProfileImages backfill: zpracováno ${cps.length} CP`);
    } catch (err) {
      this.logger.error('PopulateProfileImages backfill selhal', err);
    }
  }

  @OnEvent('character.created')
  async handleCharacterCreated(character: Character): Promise<void> {
    await this.populateFromCharacter(character);
  }

  @OnEvent('character.updated')
  async handleCharacterUpdated(character: Character): Promise<void> {
    await this.populateFromCharacter(character);
  }

  async populateFromCharacter(character: Pick<Character, 'userId' | 'imageUrl' | 'isNpc'>): Promise<void> {
    if (!character.userId || character.isNpc) return;
    if (!character.imageUrl) return;

    const user = await this.usersRepo.findById(character.userId);
    if (!user) return;
    if (user.profileImageUrl) return;

    await this.usersRepo.update(character.userId, { profileImageUrl: character.imageUrl });
  }
}
```

- [ ] **Step 5: Spustit test — ověřit že prochází**

```bash
cd backend && npx jest populate-profile-images --no-coverage
```
Očekáváno: PASS — 3 testy zelené

- [ ] **Step 6: Ověřit ICharactersRepository.findAll existuje**

Přečíst `backend/src/modules/characters/interfaces/characters-repository.interface.ts`.

Pokud `findAll()` metoda chybí, přidat do interface:
```typescript
findAll(): Promise<Character[]>;
```

A implementovat v `MongoCharactersRepository`:
```typescript
async findAll(): Promise<Character[]> {
  const docs = await this.model.find().lean().exec();
  return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
}
```

- [ ] **Step 7: Ověřit IUsersRepository.update a profileImageUrl na User**

Přečíst `backend/src/modules/users/interfaces/user.interface.ts`.

Pokud `profileImageUrl` chybí na `User` interface, přidat:
```typescript
profileImageUrl?: string;
```

Přečíst `backend/src/modules/users/schemas/user.schema.ts` — přidat @Prop pokud chybí:
```typescript
@Prop() profileImageUrl?: string;
```

- [ ] **Step 8: Registrovat service v characters.module.ts**

Přidat import:
```typescript
import { PopulateProfileImagesService } from './populate-profile-images.service';
```

Přidat do `providers[]`:
```typescript
PopulateProfileImagesService,
```

Ověřit že `CharactersModule` exportuje nebo importuje `UsersModule` (pro `IUsersRepository`). Pokud ne, přidat do `imports[]`:
```typescript
UsersModule,
```

- [ ] **Step 9: Build check**

```bash
cd backend && npx tsc --noEmit
```
Očekáváno: žádné chyby

- [ ] **Step 10: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny zelené

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/characters/populate-profile-images.service.ts backend/src/modules/characters/populate-profile-images.service.spec.ts backend/src/modules/characters/characters.module.ts
git commit -m "feat(characters): přidat PopulateProfileImages service"
```

---

## Task 5: AKJType v AccessRequirement

> **⚠️ Prerekvizita:** Vyžaduje dokončení krok-6a-rozsireni (PagesService s access checkem) a krok-6d Task 1 (AKJ typy v WorldSettings).

**Files:**
- Modify: `backend/src/modules/pages/interfaces/page.interface.ts`
- Modify: `backend/src/modules/pages/pages.service.ts`

Spec zmiňuje nový typ v `AccessRequirement`: `{ type: 'AKJType', value: 'woodwide' }`. Při access checku se klíč dohledá v `WorldSettings.akjTypes`, vezme se `group.level` a porovná s `membership.akj`.

- [ ] **Step 1: Rozšířit AccessRequirement typ**

V `page.interface.ts` změnit:
```typescript
export interface AccessRequirement {
  type: 'UserId' | 'AKJ' | 'Role' | 'AKJType';
  value: string;
}
```

- [ ] **Step 2: Napsat failing test**

Do `pages.service.spec.ts` přidat:
```typescript
describe('findBySlug — AKJType access', () => {
  it('propustí pokud hráč má správnou AKJ skupinu', async () => {
    const restricted = { ...mockPage, accessRequirements: [{ type: 'AKJType', value: 'woodwide' }] };
    mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, akj: 7 });
    // settingsRepo vrátí woodwide group s level 7
    const mockSettingsRepo = { findByWorldId: jest.fn().mockResolvedValue({
      akjTypes: [{ key: 'woodwide', name: 'Wood Wide Web', level: 7 }],
    }) };
    // Přidat mockSettingsRepo do module providers v beforeEach — viz níže
    const result = await service.findBySlug('hlavni-lokace', 'world1', 'user1');
    expect(result.id).toBe('page1');
  });

  it('zamítne pokud hráč nemá dostatečný AKJ pro skupinu', async () => {
    const restricted = { ...mockPage, accessRequirements: [{ type: 'AKJType', value: 'woodwide' }] };
    mockPagesRepo.findBySlugAndWorld.mockResolvedValue(restricted);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, akj: 5 });
    await expect(service.findBySlug('hlavni-lokace', 'world1', 'user1')).rejects.toThrow(ForbiddenException);
  });
});
```

Přidat `mockSettingsRepo` do `providers[]` v `beforeEach` test setupu:
```typescript
const mockSettingsRepo = { findByWorldId: jest.fn() };
// Do providers přidat:
{ provide: 'IWorldSettingsRepository', useValue: mockSettingsRepo },
```

- [ ] **Step 3: Spustit test — ověřit že failuje**

```bash
cd backend && npx jest pages.service.spec --no-coverage
```
Očekáváno: FAIL — `AKJType` není zpracován v `assertAccess`

- [ ] **Step 4: Rozšířit PagesService o IWorldSettingsRepository a AKJType check**

V `pages.service.ts` přidat import:
```typescript
import type { IWorldSettingsRepository } from '../worlds/interfaces/world-settings-repository.interface';
```

Do konstruktoru přidat (pokud není):
```typescript
@Inject('IWorldSettingsRepository') private readonly settingsRepo: IWorldSettingsRepository,
```

V metodě `assertAccess` přidat větev pro `AKJType` za větví pro `AKJ`:
```typescript
if (req.type === 'AKJType') {
  const settings = await this.settingsRepo.findByWorldId(worldId);
  const group = settings?.akjTypes?.find((g) => g.key === req.value);
  if (group && membership && membership.akj >= group.level) return;
}
```

- [ ] **Step 5: Přidat IWorldSettingsRepository do PagesModule providers**

V `pages.module.ts` ověřit že `WorldsModule` je v `imports[]` — je (přidán v krok-6a). `WorldsModule` exportuje `IWorldSettingsRepository`, takže injekce funguje.

- [ ] **Step 6: Spustit testy — ověřit že prochází**

```bash
cd backend && npx jest pages.service.spec --no-coverage
```
Očekáváno: PASS

- [ ] **Step 7: Build check + všechny testy**

```bash
cd backend && npx tsc --noEmit && npx jest --no-coverage
```
Očekáváno: žádné chyby, všechny zelené

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/pages/interfaces/page.interface.ts backend/src/modules/pages/pages.service.ts backend/src/modules/pages/pages.service.spec.ts
git commit -m "feat(pages): přidat AKJType do AccessRequirement access checku"
```
