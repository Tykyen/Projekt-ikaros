# Krok 7a — Characters RPG rozšíření — Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozšířit existující Character modul o systém deníků (diaryData + extraBlocks), world diary template (diarySchema na WorldSettings) a nové endpointy /players + /directory.

**Architecture:** SchemaBlock je volný JSON definující blok deníku; world template žije v WorldSettings.diarySchema; každá postava ukládá data v Character.diaryData (merge při PATCH) a může mít additivní bloky v Character.extraBlocks. getPlayerCharacters filtruje postavy s isNpc=false + userId set — čistší než starý cross-collection Page přístup.

**Tech Stack:** NestJS, Mongoose, class-validator, Jest

---

## Přehled souborů

| Soubor | Akce | Co se mění |
|--------|------|------------|
| `backend/src/modules/characters/interfaces/character.interface.ts` | Modify | + SchemaBlock, PlayerCharacter, CharacterDirectoryEntry; Character + diaryData/extraBlocks |
| `backend/src/modules/worlds/interfaces/world-settings.interface.ts` | Modify | import SchemaBlock; WorldSettings + diarySchema |
| `backend/src/modules/worlds/schemas/world-settings.schema.ts` | Modify | + diarySchema Prop |
| `backend/src/modules/worlds/repositories/world-settings.repository.ts` | Modify | toEntity + diarySchema |
| `backend/src/modules/worlds/dto/update-world-settings.dto.ts` | Modify | + diarySchema field |
| `backend/src/modules/characters/schemas/character.schema.ts` | Modify | + diaryData, extraBlocks Props |
| `backend/src/modules/characters/interfaces/characters-repository.interface.ts` | Modify | + findDirectory |
| `backend/src/modules/characters/repositories/characters.repository.ts` | Modify | + findDirectory, toEntity + nová pole |
| `backend/src/modules/characters/dto/update-character.dto.ts` | Modify | + diaryData, extraBlocks |
| `backend/src/modules/characters/characters.service.ts` | Modify | + getPlayerCharacters, getDirectory; update merge diaryData |
| `backend/src/modules/characters/characters.controller.ts` | Modify | + GET /players, GET /directory |
| `backend/src/modules/characters/characters.service.spec.ts` | Modify | + testy pro nové metody |

---

## Task 1: SchemaBlock + Character interface rozšíření

**Files:**
- Modify: `backend/src/modules/characters/interfaces/character.interface.ts`

- [ ] **Step 1: Přidat nové typy do character.interface.ts**

Nahraď celý soubor:

```typescript
import type { AccessRequirement } from '../../pages/interfaces/page.interface';

export interface InfoBlock {
  label: string;
  value: string;
}

export interface SchemaBlock {
  key: string;
  label: string;
  type: string;
  config?: Record<string, unknown>;
  order: number;
}

export interface PlayerCharacter {
  name: string;
  slug: string;
}

export interface CharacterDirectoryEntry {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string;
  isNpc: boolean;
}

export interface Character {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  userId?: string;
  isNpc: boolean;
  imageUrl?: string;

  // Veřejná část
  publicBio: string;
  publicInfoBlocks: InfoBlock[];

  // Soukromá část
  privateBio: string;
  privateInfoBlocks: InfoBlock[];

  // Deník
  diaryData: Record<string, unknown>;
  extraBlocks: SchemaBlock[];

  // Společné
  campaignSubjectId?: string;
  accessRequirements: AccessRequirement[];
  customData?: Record<string, unknown>;
  createdAt: Date;
}

export interface CharacterPublicView {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  isNpc: boolean;
  imageUrl?: string;
  publicBio: string;
  publicInfoBlocks: InfoBlock[];
}
```

- [ ] **Step 2: Ověř TypeScript kompilaci**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: chyby pouze o chybějících implementacích (přijde v dalších taskech), ne o typech.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/characters/interfaces/character.interface.ts
git commit -m "feat(characters): přidat SchemaBlock, PlayerCharacter, CharacterDirectoryEntry typy"
```

---

## Task 2: WorldSettings — diarySchema

**Files:**
- Modify: `backend/src/modules/worlds/interfaces/world-settings.interface.ts`
- Modify: `backend/src/modules/worlds/schemas/world-settings.schema.ts`
- Modify: `backend/src/modules/worlds/repositories/world-settings.repository.ts`
- Modify: `backend/src/modules/worlds/dto/update-world-settings.dto.ts`

- [ ] **Step 1: Přidat diarySchema do WorldSettings interface**

V `backend/src/modules/worlds/interfaces/world-settings.interface.ts` přidej import a pole:

```typescript
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface AkjType {
  key: string;
  name: string;
  level: number;
}

export interface MenuTemplateItem {
  label: string;
  href: string;
  order?: number;
}

export interface MenuTemplate {
  name: string;
  items: MenuTemplateItem[];
}

export interface HeadlineNode {
  id: string;
  label: string;
  isGroup: boolean;
  to?: string;
  children?: HeadlineNode[];
}

export interface WorldCurrencyItem {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

export interface WorldSettings {
  id: string;
  worldId: string;
  hiddenNavItems: string[];
  customGroups: string[];
  groupColors: Record<string, string>;
  customHeadline: HeadlineNode[];
  currencies: WorldCurrencyItem[];
  hideDefaultWeather: boolean;
  akjTypes: AkjType[];
  menuTemplates: MenuTemplate[];
  diarySchema: SchemaBlock[];
  updatedAt: Date;
}
```

- [ ] **Step 2: Přidat diarySchema do Mongoose schema**

V `backend/src/modules/worlds/schemas/world-settings.schema.ts` přidej prop:

```typescript
@Prop({ type: [Object], default: [] }) diarySchema: Record<string, unknown>[];
```

Celý soubor po změně:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldSettingsDocument = HydratedDocument<WorldSettingsSchemaClass>;

@Schema({ collection: 'worldsettings' })
export class WorldSettingsSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ type: [String], default: [] }) hiddenNavItems: string[];
  @Prop({ type: [String], default: [] }) customGroups: string[];
  @Prop({ type: Object, default: {} }) groupColors: Record<string, string>;
  @Prop({ type: [Object], default: [] }) customHeadline: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) currencies: Record<string, unknown>[];
  @Prop({ default: false }) hideDefaultWeather: boolean;
  @Prop({ type: [Object], default: [] }) akjTypes: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) menuTemplates: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) diarySchema: Record<string, unknown>[];
  @Prop({ default: Date.now }) updatedAt: Date;
}

export const WorldSettingsSchema = SchemaFactory.createForClass(WorldSettingsSchemaClass);
```

- [ ] **Step 3: Přidat diarySchema do toEntity v repository**

V `backend/src/modules/worlds/repositories/world-settings.repository.ts` rozšiř `toEntity`:

```typescript
private toEntity(doc: Record<string, unknown>): WorldSettings {
  return {
    id: String(doc._id),
    worldId: doc.worldId as string,
    hiddenNavItems: (doc.hiddenNavItems as string[]) ?? [],
    customGroups: (doc.customGroups as string[]) ?? [],
    groupColors: (doc.groupColors as Record<string, string>) ?? {},
    customHeadline: (doc.customHeadline as WorldSettings['customHeadline']) ?? [],
    currencies: (doc.currencies as WorldSettings['currencies']) ?? [],
    hideDefaultWeather: (doc.hideDefaultWeather as boolean) ?? false,
    akjTypes: (doc.akjTypes as WorldSettings['akjTypes']) ?? [],
    menuTemplates: (doc.menuTemplates as WorldSettings['menuTemplates']) ?? [],
    diarySchema: (doc.diarySchema as WorldSettings['diarySchema']) ?? [],
    updatedAt: doc.updatedAt as Date,
  };
}
```

- [ ] **Step 4: Přidat diarySchema do UpdateWorldSettingsDto**

V `backend/src/modules/worlds/dto/update-world-settings.dto.ts` přidej na konec třídy `UpdateWorldSettingsDto`:

```typescript
@IsOptional() @IsArray() diarySchema?: Record<string, unknown>[];
```

Celá třída po změně:

```typescript
export class UpdateWorldSettingsDto {
  @IsOptional() @IsArray() hiddenNavItems?: string[];
  @IsOptional() @IsArray() customGroups?: string[];
  @IsOptional() @IsObject() groupColors?: Record<string, string>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorldCurrencyItemDto) currencies?: WorldCurrencyItemDto[];
  @IsOptional() @IsBoolean() hideDefaultWeather?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AkjTypeDto) akjTypes?: AkjTypeDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MenuTemplateDto) menuTemplates?: MenuTemplateDto[];
  @IsOptional() @IsArray() diarySchema?: Record<string, unknown>[];
}
```

- [ ] **Step 5: Ověř kompilaci**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/worlds/interfaces/world-settings.interface.ts \
        backend/src/modules/worlds/schemas/world-settings.schema.ts \
        backend/src/modules/worlds/repositories/world-settings.repository.ts \
        backend/src/modules/worlds/dto/update-world-settings.dto.ts
git commit -m "feat(worlds): přidat diarySchema do WorldSettings"
```

---

## Task 3: Character schema + repository rozšíření

**Files:**
- Modify: `backend/src/modules/characters/schemas/character.schema.ts`
- Modify: `backend/src/modules/characters/interfaces/characters-repository.interface.ts`
- Modify: `backend/src/modules/characters/repositories/characters.repository.ts`

- [ ] **Step 1: Přidat diaryData + extraBlocks do Mongoose schema**

Nahraď `backend/src/modules/characters/schemas/character.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterDocument = HydratedDocument<CharacterSchemaClass>;

@Schema({ timestamps: true, collection: 'characters' })
export class CharacterSchemaClass {
  @Prop({ required: true }) slug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) worldId: string;
  @Prop() userId?: string;
  @Prop({ default: false }) isNpc: boolean;
  @Prop() imageUrl?: string;
  @Prop({ default: '' }) publicBio: string;
  @Prop({ type: [Object], default: [] }) publicInfoBlocks: Record<string, unknown>[];
  @Prop({ default: '' }) privateBio: string;
  @Prop({ type: [Object], default: [] }) privateInfoBlocks: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) diaryData: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) extraBlocks: Record<string, unknown>[];
  @Prop() campaignSubjectId?: string;
  @Prop({ type: [Object], default: [] }) accessRequirements: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData?: Record<string, unknown>;
}

export const CharacterSchema = SchemaFactory.createForClass(CharacterSchemaClass);
CharacterSchema.index({ worldId: 1, slug: 1 }, { unique: true });
CharacterSchema.index({ worldId: 1, userId: 1 });
```

- [ ] **Step 2: Přidat findDirectory do repository interface**

Nahraď `backend/src/modules/characters/interfaces/characters-repository.interface.ts`:

```typescript
import { Character, CharacterDirectoryEntry } from './character.interface';

export interface ICharactersRepository {
  findAll(): Promise<Character[]>;
  findById(id: string): Promise<Character | null>;
  findBySlugAndWorld(slug: string, worldId: string): Promise<Character | null>;
  findByWorld(worldId: string): Promise<Character[]>;
  findByUserAndWorld(userId: string, worldId: string): Promise<Character | null>;
  findPlayerCharacters(worldId: string): Promise<Character[]>;
  findDirectory(worldId: string): Promise<CharacterDirectoryEntry[]>;
  existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean>;
  save(character: Partial<Character>): Promise<Character>;
  update(id: string, data: Partial<Character>): Promise<Character | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Implementovat nové metody v repository**

Nahraď `backend/src/modules/characters/repositories/characters.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CharacterSchemaClass } from '../schemas/character.schema';
import { Character, CharacterDirectoryEntry, InfoBlock, SchemaBlock } from '../interfaces/character.interface';
import { AccessRequirement } from '../../pages/interfaces/page.interface';
import type { ICharactersRepository } from '../interfaces/characters-repository.interface';

@Injectable()
export class MongoCharactersRepository
  extends BaseMongoRepository<Character>
  implements ICharactersRepository
{
  constructor(@InjectModel(CharacterSchemaClass.name) model: Model<CharacterSchemaClass>) {
    super(model as never);
  }

  async findAll(): Promise<Character[]> {
    const docs = await this.model.find().lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findBySlugAndWorld(slug: string, worldId: string): Promise<Character | null> {
    const doc = await this.model.findOne({ slug: slug.toLowerCase(), worldId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByWorld(worldId: string): Promise<Character[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findByUserAndWorld(userId: string, worldId: string): Promise<Character | null> {
    const doc = await this.model.findOne({ userId, worldId, isNpc: false }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findPlayerCharacters(worldId: string): Promise<Character[]> {
    const docs = await this.model.find({ worldId, isNpc: false, userId: { $exists: true, $ne: null } }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findDirectory(worldId: string): Promise<CharacterDirectoryEntry[]> {
    const docs = await this.model
      .find({ worldId }, { _id: 1, slug: 1, name: 1, imageUrl: 1, isNpc: 1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      id: String((doc as unknown as Record<string, unknown>)._id),
      slug: (doc as unknown as Record<string, unknown>).slug as string,
      name: (doc as unknown as Record<string, unknown>).name as string,
      imageUrl: (doc as unknown as Record<string, unknown>).imageUrl as string | undefined,
      isNpc: ((doc as unknown as Record<string, unknown>).isNpc as boolean) ?? false,
    }));
  }

  async existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean> {
    const count = await this.model.countDocuments({ slug: slug.toLowerCase(), worldId }).exec();
    return count > 0;
  }

  protected toEntity(doc: Record<string, unknown>): Character {
    return {
      id: String(doc._id),
      slug: doc.slug as string,
      name: (doc.name as string) ?? '',
      worldId: doc.worldId as string,
      userId: doc.userId as string | undefined,
      isNpc: (doc.isNpc as boolean) ?? false,
      imageUrl: doc.imageUrl as string | undefined,
      publicBio: (doc.publicBio as string) ?? '',
      publicInfoBlocks: ((doc.publicInfoBlocks as Record<string, unknown>[]) ?? []).map((b) => ({
        label: b.label as string,
        value: b.value as string,
      } as InfoBlock)),
      privateBio: (doc.privateBio as string) ?? '',
      privateInfoBlocks: ((doc.privateInfoBlocks as Record<string, unknown>[]) ?? []).map((b) => ({
        label: b.label as string,
        value: b.value as string,
      } as InfoBlock)),
      diaryData: (doc.diaryData as Record<string, unknown>) ?? {},
      extraBlocks: (doc.extraBlocks as SchemaBlock[]) ?? [],
      campaignSubjectId: doc.campaignSubjectId as string | undefined,
      accessRequirements: ((doc.accessRequirements as Record<string, unknown>[]) ?? []).map((r) => ({
        type: r.type as 'UserId' | 'AKJ' | 'Role' | 'AKJType',
        value: r.value as string,
      } as AccessRequirement)),
      customData: (doc.customData as Record<string, unknown>) ?? {},
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 4: Ověř kompilaci**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/characters/schemas/character.schema.ts \
        backend/src/modules/characters/interfaces/characters-repository.interface.ts \
        backend/src/modules/characters/repositories/characters.repository.ts
git commit -m "feat(characters): rozšířit schema + repository o diaryData, extraBlocks, findPlayerCharacters, findDirectory"
```

---

## Task 4: UpdateCharacterDto rozšíření

**Files:**
- Modify: `backend/src/modules/characters/dto/update-character.dto.ts`

- [ ] **Step 1: Přidat diaryData + extraBlocks do DTO**

Nahraď `backend/src/modules/characters/dto/update-character.dto.ts`:

```typescript
import { IsString, IsOptional, IsBoolean, IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccessRequirementDto } from '../../pages/dto/create-page.dto';
import { InfoBlockDto } from './create-character.dto';

export class UpdateCharacterDto {
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsBoolean() isNpc?: boolean;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() publicBio?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InfoBlockDto) publicInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsString() privateBio?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InfoBlockDto) privateInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsObject() diaryData?: Record<string, unknown>;
  @IsOptional() @IsArray() extraBlocks?: Record<string, unknown>[];
  @IsOptional() @IsString() campaignSubjectId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccessRequirementDto) accessRequirements?: AccessRequirementDto[];
}
```

- [ ] **Step 2: Ověř kompilaci**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/characters/dto/update-character.dto.ts
git commit -m "feat(characters): přidat diaryData + extraBlocks do UpdateCharacterDto"
```

---

## Task 5: CharactersService — nové metody + diaryData merge

**Files:**
- Modify: `backend/src/modules/characters/characters.service.ts`

- [ ] **Step 1: Napsat failing testy**

Na konec `describe` bloku v `backend/src/modules/characters/characters.service.spec.ts` přidej:

```typescript
describe('getPlayerCharacters', () => {
  it('vrátí pouze CP s userId (isNpc=false)', async () => {
    const cp = { ...mockCharacter, slug: 'aragorn', name: 'Aragorn' };
    mockCharRepo.findPlayerCharacters = jest.fn().mockResolvedValue([cp]);
    const result = await service.getPlayerCharacters('world1');
    expect(result).toEqual([{ name: 'Aragorn', slug: 'aragorn' }]);
    expect(mockCharRepo.findPlayerCharacters).toHaveBeenCalledWith('world1');
  });
});

describe('getDirectory', () => {
  it('vrátí directory entries pro svět', async () => {
    const entry = { id: 'c1', slug: 'frodo', name: 'Frodo', isNpc: false };
    mockCharRepo.findDirectory = jest.fn().mockResolvedValue([entry]);
    const result = await service.getDirectory('world1');
    expect(result).toEqual([entry]);
  });
});

describe('update diaryData merge', () => {
  it('merguje diaryData — zachová existující klíče, přidá nové', async () => {
    const existingChar = { ...mockCharacter, diaryData: { hp: 10, mana: 5 }, extraBlocks: [] };
    mockCharRepo.findBySlugAndWorld.mockResolvedValue(existingChar);
    mockCharRepo.update.mockResolvedValue({ ...existingChar, diaryData: { hp: 20, mana: 5 } });
    await service.update('medak', 'world1', { diaryData: { hp: 20 } });
    expect(mockCharRepo.update).toHaveBeenCalledWith(
      'char1',
      expect.objectContaining({ diaryData: { hp: 20, mana: 5 } }),
    );
  });

  it('extraBlocks se přepíše celé', async () => {
    const block = { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 1 };
    const existingChar = { ...mockCharacter, diaryData: {}, extraBlocks: [] };
    mockCharRepo.findBySlugAndWorld.mockResolvedValue(existingChar);
    mockCharRepo.update.mockResolvedValue({ ...existingChar, extraBlocks: [block] });
    await service.update('medak', 'world1', { extraBlocks: [block] });
    expect(mockCharRepo.update).toHaveBeenCalledWith(
      'char1',
      expect.objectContaining({ extraBlocks: [block] }),
    );
  });
});
```

- [ ] **Step 2: Spusť testy — ověř že failují**

```bash
cd backend && npx jest characters.service.spec.ts --no-coverage
```

Očekávaný výstup: FAIL — `service.getPlayerCharacters is not a function`, `service.getDirectory is not a function`, `diaryData` se nepřebírá.

- [ ] **Step 3: Implementovat nové metody v service**

Nahraď `backend/src/modules/characters/characters.service.ts`:

```typescript
import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ICharactersRepository } from './interfaces/characters-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Character, CharacterDirectoryEntry, CharacterPublicView, PlayerCharacter } from './interfaces/character.interface';
import type { CreateCharacterDto } from './dto/create-character.dto';
import type { UpdateCharacterDto } from './dto/update-character.dto';
import type { ConvertCharacterDto } from './dto/convert-character.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class CharactersService {
  constructor(
    @Inject('ICharactersRepository') private readonly charRepo: ICharactersRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findByWorld(worldId: string): Promise<CharacterPublicView[]> {
    const characters = await this.charRepo.findByWorld(worldId);
    return characters.map((c) => this.toPublicView(c));
  }

  async findBySlug(slug: string, worldId: string, requesterId: string): Promise<Character | CharacterPublicView> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');

    const membership = await this.membershipRepo.findByUserAndWorld(requesterId, worldId);
    const isPj = membership && membership.role >= WorldRole.PJ;
    const isOwner = !character.isNpc && character.userId === requesterId;

    if (isPj || isOwner) return character;
    return this.toPublicView(character);
  }

  async findBySlugRaw(slug: string, worldId: string): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    return character;
  }

  async assertSubdocAccess(slug: string, worldId: string, requesterId: string): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    const membership = await this.membershipRepo.findByUserAndWorld(requesterId, worldId);
    const isPj = membership && membership.role >= WorldRole.PJ;
    const isOwner = !character.isNpc && character.userId === requesterId;
    if (!isPj && !isOwner) throw new ForbiddenException('Přístup odepřen');
    return character;
  }

  async findByUser(userId: string, worldId: string): Promise<Character | null> {
    return this.charRepo.findByUserAndWorld(userId, worldId);
  }

  async getPlayerCharacters(worldId: string): Promise<PlayerCharacter[]> {
    const characters = await this.charRepo.findPlayerCharacters(worldId);
    return characters.map((c) => ({ name: c.name, slug: c.slug }));
  }

  async getDirectory(worldId: string): Promise<CharacterDirectoryEntry[]> {
    return this.charRepo.findDirectory(worldId);
  }

  async create(dto: CreateCharacterDto, worldId: string): Promise<Character> {
    const slug = dto.slug.toLowerCase();
    const exists = await this.charRepo.existsBySlugAndWorld(slug, worldId);
    if (exists) throw new ConflictException('Slug již existuje v tomto světě');

    const character = await this.charRepo.save({
      ...(dto as unknown as Partial<Character>),
      slug,
      worldId,
      publicBio: dto.publicBio ?? '',
      publicInfoBlocks: (dto.publicInfoBlocks as unknown as Character['publicInfoBlocks']) ?? [],
      privateBio: dto.privateBio ?? '',
      privateInfoBlocks: (dto.privateInfoBlocks as unknown as Character['privateInfoBlocks']) ?? [],
      diaryData: {},
      extraBlocks: [],
      accessRequirements: (dto.accessRequirements as unknown as Character['accessRequirements']) ?? [],
    });

    this.eventEmitter.emit('character.created', {
      characterId: character.id,
      worldId: character.worldId,
      userId: character.userId,
      isNpc: character.isNpc,
      name: character.name,
      imageUrl: character.imageUrl,
    });

    return character;
  }

  async update(slug: string, worldId: string, dto: UpdateCharacterDto, requester?: { id: string; role: UserRole }): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    if (requester && requester.role > UserRole.Admin) {
      const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
      const isPj = membership && membership.role >= WorldRole.PJ;
      const isOwner = !character.isNpc && character.userId === requester.id;
      if (!isPj && !isOwner) throw new ForbiddenException('Nedostatečná oprávnění');
    }

    const updateData: Partial<Character> = dto as unknown as Partial<Character>;
    if (dto.diaryData !== undefined) {
      updateData.diaryData = { ...(character.diaryData ?? {}), ...dto.diaryData };
    }

    const result = (await this.charRepo.update(character.id, updateData))!;
    this.eventEmitter.emit('character.updated', {
      characterId: result.id,
      worldId,
      userId: result.userId,
      isNpc: result.isNpc,
      name: result.name,
      imageUrl: result.imageUrl,
    });
    return result;
  }

  async convert(slug: string, worldId: string, dto: ConvertCharacterDto): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');

    const toNpc = !dto.userId;
    const updated = await this.charRepo.update(character.id, {
      userId: toNpc ? undefined : dto.userId,
      isNpc: toNpc,
    });

    this.eventEmitter.emit('character.converted', {
      characterId: character.id,
      worldId,
      toNpc,
      userId: toNpc ? character.userId : dto.userId,
      name: character.name,
      imageUrl: character.imageUrl,
    });

    return updated!;
  }

  async delete(slug: string, worldId: string): Promise<void> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    await this.charRepo.delete(character.id);
  }

  private toPublicView(c: Character): CharacterPublicView {
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      worldId: c.worldId,
      isNpc: c.isNpc,
      imageUrl: c.imageUrl,
      publicBio: c.publicBio,
      publicInfoBlocks: c.publicInfoBlocks,
    };
  }
}
```

- [ ] **Step 4: Spusť testy — ověř že prochází**

```bash
cd backend && npx jest characters.service.spec.ts --no-coverage
```

Očekávaný výstup: PASS — všechny testy zelené.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/characters/characters.service.ts \
        backend/src/modules/characters/characters.service.spec.ts
git commit -m "feat(characters): getPlayerCharacters, getDirectory, diaryData merge v update"
```

---

## Task 6: CharactersController — /players + /directory

**Files:**
- Modify: `backend/src/modules/characters/characters.controller.ts`

- [ ] **Step 1: Přidat nové endpointy do controlleru**

Nahraď `backend/src/modules/characters/characters.controller.ts`:

```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { CharactersService } from './characters.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { ConvertCharacterDto } from './dto/convert-character.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('worlds/:worldId/characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Param('worldId') worldId: string) {
    return this.charactersService.findByWorld(worldId);
  }

  @Get('players')
  @UseGuards(JwtAuthGuard)
  getPlayerCharacters(@Param('worldId') worldId: string) {
    return this.charactersService.getPlayerCharacters(worldId);
  }

  @Get('directory')
  getDirectory(@Param('worldId') worldId: string) {
    return this.charactersService.getDirectory(worldId);
  }

  @Get('by-user/:userId')
  @UseGuards(JwtAuthGuard)
  findByUser(
    @Param('worldId') worldId: string,
    @Param('userId') userId: string,
  ) {
    return this.charactersService.findByUser(userId, worldId);
  }

  @Get(':slug')
  @UseGuards(JwtAuthGuard)
  findOne(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.charactersService.findBySlug(slug, worldId, user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user.id, user.role, worldId);
    return this.charactersService.create(dto, worldId);
  }

  @Patch(':slug')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.charactersService.update(slug, worldId, dto, user);
  }

  @Patch(':slug/convert')
  @UseGuards(JwtAuthGuard)
  async convert(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: ConvertCharacterDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user.id, user.role, worldId);
    return this.charactersService.convert(slug, worldId, dto);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.charactersService.assertCanManage(user.id, user.role, worldId);
    return this.charactersService.delete(slug, worldId);
  }
}
```

> **Poznámka k routám:** `/players` a `/directory` jsou definovány PŘED `/:slug`, aby NestJS je nezachytil jako slug parametr.

- [ ] **Step 2: Ověř kompilaci**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: PASS — žádné regrese.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/characters/characters.controller.ts
git commit -m "feat(characters): přidat GET /players + GET /directory endpointy"
```

---

## Task 7: Finální ověření

- [ ] **Step 1: Spusť build**

```bash
cd backend && npm run build
```

Očekávaný výstup: Build succeeded bez chyb.

- [ ] **Step 2: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: PASS — všechny testy zelené.

- [ ] **Step 3: Finální commit**

```bash
git add -A
git commit -m "feat: Krok 7a — Characters RPG rozšíření (diarySchema, diaryData, /players, /directory)"
```
