# Krok 6b — Characters modul: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat Characters modul — CP/NPC entity s veřejnou a soukromou částí, world+user binding, CP↔NPC konverze a EventEmitter2 event po vytvoření pro Krok 6c.

**Architecture:** Repository pattern identický s worlds modulem. Character má `publicBio/publicInfoBlocks` (viditelné ostatním) a `privateBio/privateInfoBlocks` (jen hráč + PJ). API vrací různý objem dat dle role. EventEmitter2 emit `character.created` po `create()`.

**Tech Stack:** NestJS 11, TypeScript 5, Mongoose 9, class-validator, EventEmitter2, Jest

---

## Přehled souborů

**Vytvořit:**
- `backend/src/modules/characters/interfaces/character.interface.ts`
- `backend/src/modules/characters/interfaces/characters-repository.interface.ts`
- `backend/src/modules/characters/schemas/character.schema.ts`
- `backend/src/modules/characters/repositories/characters.repository.ts`
- `backend/src/modules/characters/dto/create-character.dto.ts`
- `backend/src/modules/characters/dto/update-character.dto.ts`
- `backend/src/modules/characters/dto/convert-character.dto.ts`
- `backend/src/modules/characters/characters.service.ts`
- `backend/src/modules/characters/characters.service.spec.ts`
- `backend/src/modules/characters/characters.controller.ts`
- `backend/src/modules/characters/characters.module.ts`

**Upravit:**
- `backend/src/app.module.ts` — registrace CharactersModule

---

## Kontext projektu

Vzorový modul: `backend/src/modules/worlds/`. WorldRole: Hrac=0, Korektor=1, PomocnyPJ=2, PJ=3.  
WorldMembership má `akj: number` a `role: WorldRole`. `IWorldMembershipRepository` exportuje WorldsModule.  
Access check pro sub-dokumenty: `membership.role >= WorldRole.PJ` = jen PJ.

---

## Task 1: Interface + Repository Interface

**Files:**
- Create: `backend/src/modules/characters/interfaces/character.interface.ts`
- Create: `backend/src/modules/characters/interfaces/characters-repository.interface.ts`

- [ ] **Step 1: Vytvořit character.interface.ts**

```typescript
// backend/src/modules/characters/interfaces/character.interface.ts
import type { AccessRequirement } from '../../pages/interfaces/page.interface';

export interface InfoBlock {
  label: string;
  value: string;
}

export interface Character {
  id: string;
  slug: string;
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

  // Společné
  campaignSubjectId?: string;
  accessRequirements: AccessRequirement[];
  customData?: Record<string, unknown>;
  createdAt: Date;
}

export interface CharacterPublicView {
  id: string;
  slug: string;
  worldId: string;
  isNpc: boolean;
  imageUrl?: string;
  publicBio: string;
  publicInfoBlocks: InfoBlock[];
}
```

- [ ] **Step 2: Vytvořit characters-repository.interface.ts**

```typescript
// backend/src/modules/characters/interfaces/characters-repository.interface.ts
import { Character } from './character.interface';

export interface ICharactersRepository {
  findById(id: string): Promise<Character | null>;
  findBySlugAndWorld(slug: string, worldId: string): Promise<Character | null>;
  findByWorld(worldId: string): Promise<Character[]>;
  findByUserAndWorld(userId: string, worldId: string): Promise<Character | null>;
  existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean>;
  save(character: Partial<Character>): Promise<Character>;
  update(id: string, data: Partial<Character>): Promise<Character | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/characters/interfaces/
git commit -m "feat(characters): přidat Character interface a ICharactersRepository"
```

---

## Task 2: Schema + Repository

**Files:**
- Create: `backend/src/modules/characters/schemas/character.schema.ts`
- Create: `backend/src/modules/characters/repositories/characters.repository.ts`

- [ ] **Step 1: Vytvořit character.schema.ts**

```typescript
// backend/src/modules/characters/schemas/character.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterDocument = HydratedDocument<CharacterSchemaClass>;

@Schema({ timestamps: true, collection: 'characters' })
export class CharacterSchemaClass {
  @Prop({ required: true, index: true }) slug: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ index: true }) userId?: string;
  @Prop({ default: false }) isNpc: boolean;
  @Prop() imageUrl?: string;
  @Prop({ default: '' }) publicBio: string;
  @Prop({ type: [Object], default: [] }) publicInfoBlocks: Record<string, unknown>[];
  @Prop({ default: '' }) privateBio: string;
  @Prop({ type: [Object], default: [] }) privateInfoBlocks: Record<string, unknown>[];
  @Prop() campaignSubjectId?: string;
  @Prop({ type: [Object], default: [] }) accessRequirements: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData?: Record<string, unknown>;
}

export const CharacterSchema = SchemaFactory.createForClass(CharacterSchemaClass);
CharacterSchema.index({ worldId: 1, slug: 1 }, { unique: true });
CharacterSchema.index({ worldId: 1, userId: 1 });
```

- [ ] **Step 2: Vytvořit characters.repository.ts**

```typescript
// backend/src/modules/characters/repositories/characters.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CharacterSchemaClass } from '../schemas/character.schema';
import { Character, InfoBlock } from '../interfaces/character.interface';
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

  async existsBySlugAndWorld(slug: string, worldId: string): Promise<boolean> {
    const count = await this.model.countDocuments({ slug: slug.toLowerCase(), worldId }).exec();
    return count > 0;
  }

  protected toEntity(doc: Record<string, unknown>): Character {
    return {
      id: String(doc._id),
      slug: doc.slug as string,
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
      campaignSubjectId: doc.campaignSubjectId as string | undefined,
      accessRequirements: ((doc.accessRequirements as Record<string, unknown>[]) ?? []).map((r) => ({
        type: r.type as 'UserId' | 'AKJ' | 'Role',
        value: r.value as string,
      } as AccessRequirement)),
      customData: (doc.customData as Record<string, unknown>) ?? {},
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/characters/schemas/ backend/src/modules/characters/repositories/
git commit -m "feat(characters): přidat CharacterSchema a MongoCharactersRepository"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/characters/dto/create-character.dto.ts`
- Create: `backend/src/modules/characters/dto/update-character.dto.ts`
- Create: `backend/src/modules/characters/dto/convert-character.dto.ts`

- [ ] **Step 1: Vytvořit create-character.dto.ts**

```typescript
// backend/src/modules/characters/dto/create-character.dto.ts
import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AccessRequirementDto } from '../../pages/dto/create-page.dto';

export class InfoBlockDto {
  @IsString() label: string;
  @IsString() value: string;
}

export class CreateCharacterDto {
  @IsString() slug: string;
  @IsOptional() @IsString() userId?: string;
  @IsBoolean() isNpc: boolean;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() publicBio?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InfoBlockDto) publicInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsString() privateBio?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InfoBlockDto) privateInfoBlocks?: InfoBlockDto[];
  @IsOptional() @IsString() campaignSubjectId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AccessRequirementDto) accessRequirements?: AccessRequirementDto[];
}
```

- [ ] **Step 2: Vytvořit update-character.dto.ts a convert-character.dto.ts**

```typescript
// backend/src/modules/characters/dto/update-character.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateCharacterDto } from './create-character.dto';
export class UpdateCharacterDto extends PartialType(CreateCharacterDto) {}
```

```typescript
// backend/src/modules/characters/dto/convert-character.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class ConvertCharacterDto {
  // Pro konverzi NPC → CP: vyplnit userId
  // Pro konverzi CP → NPC: nechat prázdné
  @IsOptional() @IsString() userId?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/characters/dto/
git commit -m "feat(characters): přidat DTOs pro Characters"
```

---

## Task 4: Service — CRUD + konverze + testy

**Files:**
- Create: `backend/src/modules/characters/characters.service.spec.ts`
- Create: `backend/src/modules/characters/characters.service.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/characters/characters.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharactersService } from './characters.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockCharacter = {
  id: 'char1', slug: 'medak', worldId: 'world1',
  userId: 'user1', isNpc: false,
  publicBio: '<p>veřejné</p>', publicInfoBlocks: [],
  privateBio: '<p>soukromé</p>', privateInfoBlocks: [],
  accessRequirements: [], createdAt: new Date(),
};

const mockNpc = { ...mockCharacter, id: 'char2', slug: 'agent-smith', userId: undefined, isNpc: true };

const mockMembership = { id: 'mem1', userId: 'user1', worldId: 'world1', role: WorldRole.Hrac, akj: 5, joinedAt: new Date() };
const mockPjMembership = { ...mockMembership, role: WorldRole.PJ };

describe('CharactersService', () => {
  let service: CharactersService;
  const mockCharRepo = {
    findById: jest.fn(),
    findBySlugAndWorld: jest.fn(),
    findByWorld: jest.fn(),
    findByUserAndWorld: jest.fn(),
    existsBySlugAndWorld: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CharactersService,
        { provide: 'ICharactersRepository', useValue: mockCharRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    service = module.get(CharactersService);
  });

  describe('findBySlug', () => {
    it('vrátí veřejnou část NPC pro běžného hráče', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      const result = await service.findBySlug('agent-smith', 'world1', 'user1');
      expect(result).toHaveProperty('publicBio');
      expect(result).not.toHaveProperty('privateBio');
    });

    it('vrátí plnou postavu PJ pro NPC', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPjMembership);
      const result = await service.findBySlug('agent-smith', 'world1', 'pj1');
      expect(result).toHaveProperty('privateBio');
    });

    it('vrátí plnou postavu přiřazenému hráči CP', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockMembership);
      const result = await service.findBySlug('medak', 'world1', 'user1');
      expect(result).toHaveProperty('privateBio');
    });

    it('vrátí jen veřejnou část CP pro cizího hráče', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockMembership, userId: 'jiny-user' });
      const result = await service.findBySlug('medak', 'world1', 'jiny-user');
      expect(result).toHaveProperty('publicBio');
      expect(result).not.toHaveProperty('privateBio');
    });

    it('vyhodí NotFoundException pokud postava neexistuje', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(null);
      await expect(service.findBySlug('neexistuje', 'world1', 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('vyhodí ConflictException pokud slug existuje', async () => {
      mockCharRepo.existsBySlugAndWorld.mockResolvedValue(true);
      await expect(service.create({ slug: 'medak', isNpc: false }, 'world1')).rejects.toThrow(ConflictException);
    });

    it('emituje character.created po vytvoření', async () => {
      mockCharRepo.existsBySlugAndWorld.mockResolvedValue(false);
      mockCharRepo.save.mockResolvedValue(mockCharacter);
      await service.create({ slug: 'medak', isNpc: false }, 'world1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('character.created', expect.objectContaining({ characterId: 'char1', isNpc: false }));
    });
  });

  describe('convert', () => {
    it('CP → NPC: smaže userId, nastaví isNpc=true', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockCharRepo.update.mockResolvedValue({ ...mockCharacter, userId: undefined, isNpc: true });
      const result = await service.convert('medak', 'world1', {});
      expect(mockCharRepo.update).toHaveBeenCalledWith('char1', expect.objectContaining({ userId: undefined, isNpc: true }));
    });

    it('NPC → CP: nastaví userId, nastaví isNpc=false', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockNpc);
      mockCharRepo.update.mockResolvedValue({ ...mockNpc, userId: 'user2', isNpc: false });
      await service.convert('agent-smith', 'world1', { userId: 'user2' });
      expect(mockCharRepo.update).toHaveBeenCalledWith('char2', expect.objectContaining({ userId: 'user2', isNpc: false }));
    });

    it('emituje character.converted', async () => {
      mockCharRepo.findBySlugAndWorld.mockResolvedValue(mockCharacter);
      mockCharRepo.update.mockResolvedValue({ ...mockCharacter, userId: undefined, isNpc: true });
      await service.convert('medak', 'world1', {});
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('character.converted', expect.objectContaining({ characterId: 'char1' }));
    });
  });

  describe('findByUser', () => {
    it('vrátí CP hráče ve světě', async () => {
      mockCharRepo.findByUserAndWorld.mockResolvedValue(mockCharacter);
      const result = await service.findByUser('user1', 'world1');
      expect(result?.slug).toBe('medak');
    });
  });
});
```

- [ ] **Step 2: Spustit testy — ověřit že failují**

```bash
cd backend && npx jest characters.service.spec --no-coverage
```
Očekáváno: FAIL — `Cannot find module './characters.service'`

- [ ] **Step 3: Implementovat characters.service.ts**

```typescript
// backend/src/modules/characters/characters.service.ts
import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ICharactersRepository } from './interfaces/characters-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Character, CharacterPublicView } from './interfaces/character.interface';
import type { CreateCharacterDto } from './dto/create-character.dto';
import type { UpdateCharacterDto } from './dto/update-character.dto';
import type { ConvertCharacterDto } from './dto/convert-character.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

@Injectable()
export class CharactersService {
  constructor(
    @Inject('ICharactersRepository') private readonly charRepo: ICharactersRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

  async findByUser(userId: string, worldId: string): Promise<Character | null> {
    return this.charRepo.findByUserAndWorld(userId, worldId);
  }

  async create(dto: CreateCharacterDto, worldId: string): Promise<Character> {
    const slug = dto.slug.toLowerCase();
    const exists = await this.charRepo.existsBySlugAndWorld(slug, worldId);
    if (exists) throw new ConflictException('Slug již existuje v tomto světě');

    const character = await this.charRepo.save({
      ...dto,
      slug,
      worldId,
      publicBio: dto.publicBio ?? '',
      publicInfoBlocks: dto.publicInfoBlocks ?? [],
      privateBio: dto.privateBio ?? '',
      privateInfoBlocks: dto.privateInfoBlocks ?? [],
      accessRequirements: dto.accessRequirements ?? [],
    });

    this.eventEmitter.emit('character.created', {
      characterId: character.id,
      worldId: character.worldId,
      userId: character.userId,
      isNpc: character.isNpc,
    });

    return character;
  }

  async update(slug: string, worldId: string, dto: UpdateCharacterDto): Promise<Character> {
    const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
    if (!character) throw new NotFoundException('Postava nenalezena');
    return (await this.charRepo.update(character.id, dto))!;
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
      userId: dto.userId,
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
      worldId: c.worldId,
      isNpc: c.isNpc,
      imageUrl: c.imageUrl,
      publicBio: c.publicBio,
      publicInfoBlocks: c.publicInfoBlocks,
    };
  }
}
```

- [ ] **Step 4: Spustit testy — ověřit že prochází**

```bash
cd backend && npx jest characters.service.spec --no-coverage
```
Očekáváno: PASS — všechny testy zelené

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/characters/characters.service.ts backend/src/modules/characters/characters.service.spec.ts
git commit -m "feat(characters): přidat CharactersService s CP/NPC logikou + testy"
```

---

## Task 5: Controller

**Files:**
- Create: `backend/src/modules/characters/characters.controller.ts`

- [ ] **Step 1: Vytvořit characters.controller.ts**

```typescript
// backend/src/modules/characters/characters.controller.ts
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
  create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateCharacterDto,
  ) {
    return this.charactersService.create(dto, worldId);
  }

  @Patch(':slug')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateCharacterDto,
  ) {
    return this.charactersService.update(slug, worldId, dto);
  }

  @Patch(':slug/convert')
  @UseGuards(JwtAuthGuard)
  convert(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: ConvertCharacterDto,
  ) {
    return this.charactersService.convert(slug, worldId, dto);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
  ) {
    return this.charactersService.delete(slug, worldId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/characters/characters.controller.ts
git commit -m "feat(characters): přidat CharactersController"
```

---

## Task 6: Module + registrace v AppModule

**Files:**
- Create: `backend/src/modules/characters/characters.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvořit characters.module.ts**

```typescript
// backend/src/modules/characters/characters.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterSchemaClass, CharacterSchema } from './schemas/character.schema';
import { MongoCharactersRepository } from './repositories/characters.repository';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CharacterSchemaClass.name, schema: CharacterSchema }]),
    WorldsModule,
  ],
  controllers: [CharactersController],
  providers: [
    CharactersService,
    { provide: 'ICharactersRepository', useClass: MongoCharactersRepository },
  ],
  exports: [CharactersService, 'ICharactersRepository'],
})
export class CharactersModule {}
```

- [ ] **Step 2: Přidat CharactersModule do app.module.ts**

```typescript
// backend/src/app.module.ts
// Přidat import:
import { CharactersModule } from './modules/characters/characters.module';

// Přidat do imports[] pole:
CharactersModule,
```

- [ ] **Step 3: Spustit build + testy**

```bash
cd backend && npx tsc --noEmit && npx jest --no-coverage
```
Očekáváno: build bez chyb, všechny testy zelené

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/characters/characters.module.ts backend/src/app.module.ts
git commit -m "feat(characters): registrovat CharactersModule v AppModule"
```
