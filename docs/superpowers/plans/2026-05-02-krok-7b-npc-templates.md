# Krok 7b — NPC Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat NPC Templates modul — per-world šablony s fixními combat stats + volným diarySchema, přístupné přes `/api/worlds/:worldId/npc-templates`.

**Architecture:** Repository pattern identický s Characters modulem. `BaseMongoRepository` poskytuje `findById/save/update/delete`; repository přidává `findByWorld`, `updateByIdAndWorld` a `deleteByIdAndWorld` pro world-scoped bezpečnost. Service deleguje na repository, controller volá service.

**Tech Stack:** NestJS, Mongoose, class-validator, Jest (unit testy, mocked repository)

---

## Mapování souborů

| Akce | Soubor |
|------|--------|
| Modify | `backend/src/modules/characters/interfaces/character.interface.ts` |
| Create | `backend/src/modules/npc-templates/schemas/npc-template.schema.ts` |
| Create | `backend/src/modules/npc-templates/interfaces/npc-template.interface.ts` |
| Create | `backend/src/modules/npc-templates/interfaces/npc-templates-repository.interface.ts` |
| Create | `backend/src/modules/npc-templates/npc-templates.service.spec.ts` |
| Create | `backend/src/modules/npc-templates/repositories/npc-templates.repository.ts` |
| Create | `backend/src/modules/npc-templates/npc-templates.service.ts` |
| Create | `backend/src/modules/npc-templates/dto/create-npc-template.dto.ts` |
| Create | `backend/src/modules/npc-templates/dto/update-npc-template.dto.ts` |
| Create | `backend/src/modules/npc-templates/npc-templates.controller.ts` |
| Create | `backend/src/modules/npc-templates/npc-templates.module.ts` |
| Modify | `backend/src/app.module.ts` |

---

## Task 1: TagValue alias + schema + interfaces

**Files:**
- Modify: `backend/src/modules/characters/interfaces/character.interface.ts`
- Create: `backend/src/modules/npc-templates/schemas/npc-template.schema.ts`
- Create: `backend/src/modules/npc-templates/interfaces/npc-template.interface.ts`
- Create: `backend/src/modules/npc-templates/interfaces/npc-templates-repository.interface.ts`

- [ ] **Step 1: Přidej TagValue alias do character.interface.ts**

Otevři `backend/src/modules/characters/interfaces/character.interface.ts` a hned za `InfoBlock` přidej:

```typescript
export type TagValue = InfoBlock; // { label: string; value: string }
```

Celý blok za importem bude vypadat takto (přidáváme jen řádek za `InfoBlock`):

```typescript
export interface InfoBlock {
  label: string;
  value: string;
}

export type TagValue = InfoBlock; // { label: string; value: string }
```

- [ ] **Step 2: Vytvoř schema soubor**

Vytvoř `backend/src/modules/npc-templates/schemas/npc-template.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NpcTemplateDocument = HydratedDocument<NpcTemplateSchemaClass>;

@Schema({ timestamps: true, collection: 'npcTemplates' })
export class NpcTemplateSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop() imageUrl?: string;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: 5 }) maxHp: number;
  @Prop({ default: 0 }) armor: number;
  @Prop({ default: 0 }) injury: number;
  @Prop({ type: [Object], default: [] }) abilities: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) diarySchema: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) diaryData: Record<string, unknown>;
}

export const NpcTemplateSchema = SchemaFactory.createForClass(NpcTemplateSchemaClass);
NpcTemplateSchema.index({ worldId: 1 });
```

- [ ] **Step 3: Vytvoř NpcTemplate interface**

Vytvoř `backend/src/modules/npc-templates/interfaces/npc-template.interface.ts`:

```typescript
import type { TagValue, SchemaBlock } from '../../characters/interfaces/character.interface';

export interface NpcTemplate {
  id: string;
  worldId: string;
  name: string;
  imageUrl?: string;
  notes: string;
  maxHp: number;
  armor: number;
  injury: number;
  abilities: TagValue[];
  diarySchema: SchemaBlock[];
  diaryData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 4: Vytvoř repository interface**

Vytvoř `backend/src/modules/npc-templates/interfaces/npc-templates-repository.interface.ts`:

```typescript
import type { NpcTemplate } from './npc-template.interface';

export interface INpcTemplatesRepository {
  findByWorld(worldId: string): Promise<NpcTemplate[]>;
  findById(id: string): Promise<NpcTemplate | null>;
  create(data: Partial<NpcTemplate>): Promise<NpcTemplate>;
  updateByIdAndWorld(id: string, worldId: string, data: Partial<NpcTemplate>): Promise<NpcTemplate | null>;
  deleteByIdAndWorld(id: string, worldId: string): Promise<boolean>;
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/characters/interfaces/character.interface.ts \
        backend/src/modules/npc-templates/schemas/npc-template.schema.ts \
        backend/src/modules/npc-templates/interfaces/npc-template.interface.ts \
        backend/src/modules/npc-templates/interfaces/npc-templates-repository.interface.ts
git commit -m "feat(npc-templates): přidat TagValue alias, schema a interfaces"
```

---

## Task 2: Unit testy (failing)

**Files:**
- Create: `backend/src/modules/npc-templates/npc-templates.service.spec.ts`

- [ ] **Step 1: Vytvoř testovací soubor**

Vytvoř `backend/src/modules/npc-templates/npc-templates.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NpcTemplatesService } from './npc-templates.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockTemplate = {
  id: 'tpl1',
  worldId: 'world1',
  name: 'Goblin',
  imageUrl: undefined,
  notes: '',
  maxHp: 5,
  armor: 0,
  injury: 0,
  abilities: [],
  diarySchema: [],
  diaryData: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('NpcTemplatesService', () => {
  let service: NpcTemplatesService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateByIdAndWorld: jest.fn(),
    deleteByIdAndWorld: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NpcTemplatesService,
        { provide: 'INpcTemplatesRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(NpcTemplatesService);
  });

  describe('findAll', () => {
    it('vrátí šablony daného světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockTemplate]);
      const result = await service.findAll('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('vrátí prázdné pole pokud svět nemá šablony', async () => {
      mockRepo.findByWorld.mockResolvedValue([]);
      const result = await service.findAll('world2');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('vrátí šablonu pokud patří světu', async () => {
      mockRepo.findById.mockResolvedValue(mockTemplate);
      const result = await service.findOne('tpl1', 'world1');
      expect(result.name).toBe('Goblin');
    });

    it('vyhodí NotFoundException pokud šablona neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findOne('tpl1', 'world1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí NotFoundException pokud šablona patří jinému světu', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockTemplate, worldId: 'world2' });
      await expect(service.findOne('tpl1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('předá worldId z parametru — ne z dto', async () => {
      mockRepo.create.mockResolvedValue(mockTemplate);
      await service.create({ name: 'Goblin' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', name: 'Goblin' }),
      );
    });

    it('nastaví defaultní maxHp=5, armor=0, injury=0 pokud chybí v dto', async () => {
      mockRepo.create.mockResolvedValue(mockTemplate);
      await service.create({ name: 'Goblin' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ maxHp: 5, armor: 0, injury: 0 }),
      );
    });
  });

  describe('update', () => {
    it('vrátí aktualizovanou šablonu', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue({ ...mockTemplate, name: 'Super Goblin' });
      const result = await service.update('tpl1', 'world1', { name: 'Super Goblin' });
      expect(result.name).toBe('Super Goblin');
      expect(mockRepo.updateByIdAndWorld).toHaveBeenCalledWith('tpl1', 'world1', expect.objectContaining({ name: 'Super Goblin' }));
    });

    it('vyhodí NotFoundException pokud repo vrátí null (šablona neexistuje nebo jiný world)', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue(null);
      await expect(service.update('tpl1', 'world1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('úspěšně smaže šablonu', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(true);
      await expect(service.remove('tpl1', 'world1')).resolves.toBeUndefined();
      expect(mockRepo.deleteByIdAndWorld).toHaveBeenCalledWith('tpl1', 'world1');
    });

    it('vyhodí NotFoundException pokud repo vrátí false', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(false);
      await expect(service.remove('tpl1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertCanManage('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanManage('pj1', UserRole.User, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertCanManage('user1', UserRole.User, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertCanManage('user1', UserRole.User, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spusť testy — ověř že selhávají (NpcTemplatesService neexistuje)**

```bash
cd backend && npx jest npc-templates.service.spec --no-coverage 2>&1 | tail -5
```

Očekáváno: `Cannot find module './npc-templates.service'` nebo `FAIL`

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/npc-templates/npc-templates.service.spec.ts
git commit -m "test(npc-templates): přidat failing unit testy pro NpcTemplatesService"
```

---

## Task 3: Repository implementace

**Files:**
- Create: `backend/src/modules/npc-templates/repositories/npc-templates.repository.ts`

- [ ] **Step 1: Vytvoř repository**

Vytvoř `backend/src/modules/npc-templates/repositories/npc-templates.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { NpcTemplateSchemaClass } from '../schemas/npc-template.schema';
import type { NpcTemplate } from '../interfaces/npc-template.interface';
import type { INpcTemplatesRepository } from '../interfaces/npc-templates-repository.interface';
import type { TagValue, SchemaBlock } from '../../characters/interfaces/character.interface';

@Injectable()
export class MongoNpcTemplatesRepository
  extends BaseMongoRepository<NpcTemplate>
  implements INpcTemplatesRepository
{
  constructor(@InjectModel(NpcTemplateSchemaClass.name) model: Model<NpcTemplateSchemaClass>) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<NpcTemplate[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async updateByIdAndWorld(id: string, worldId: string, data: Partial<NpcTemplate>): Promise<NpcTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOneAndUpdate({ _id: id, worldId }, { $set: data as Record<string, unknown> }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async deleteByIdAndWorld(id: string, worldId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findOneAndDelete({ _id: id, worldId }).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): NpcTemplate {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: (doc.name as string) ?? '',
      imageUrl: doc.imageUrl as string | undefined,
      notes: (doc.notes as string) ?? '',
      maxHp: (doc.maxHp as number) ?? 5,
      armor: (doc.armor as number) ?? 0,
      injury: (doc.injury as number) ?? 0,
      abilities: ((doc.abilities as Record<string, unknown>[]) ?? []).map((a) => ({
        label: a.label as string,
        value: a.value as string,
      } as TagValue)),
      diarySchema: (doc.diarySchema as SchemaBlock[]) ?? [],
      diaryData: (doc.diaryData as Record<string, unknown>) ?? {},
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/npc-templates/repositories/npc-templates.repository.ts
git commit -m "feat(npc-templates): implementovat MongoNpcTemplatesRepository"
```

---

## Task 4: Service implementace (zprovoznění testů)

**Files:**
- Create: `backend/src/modules/npc-templates/npc-templates.service.ts`

- [ ] **Step 1: Vytvoř service**

Vytvoř `backend/src/modules/npc-templates/npc-templates.service.ts`:

```typescript
import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { INpcTemplatesRepository } from './interfaces/npc-templates-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { NpcTemplate } from './interfaces/npc-template.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

export interface CreateNpcTemplateInput {
  name: string;
  imageUrl?: string;
  notes?: string;
  maxHp?: number;
  armor?: number;
  injury?: number;
  abilities?: { label: string; value: string }[];
  diarySchema?: Record<string, unknown>[];
  diaryData?: Record<string, unknown>;
}

@Injectable()
export class NpcTemplatesService {
  constructor(
    @Inject('INpcTemplatesRepository') private readonly repo: INpcTemplatesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async assertCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findAll(worldId: string): Promise<NpcTemplate[]> {
    return this.repo.findByWorld(worldId);
  }

  async findOne(id: string, worldId: string): Promise<NpcTemplate> {
    const template = await this.repo.findById(id);
    if (!template || template.worldId !== worldId) throw new NotFoundException('NPC šablona nenalezena');
    return template;
  }

  async create(dto: CreateNpcTemplateInput, worldId: string): Promise<NpcTemplate> {
    return this.repo.create({
      worldId,
      name: dto.name,
      imageUrl: dto.imageUrl,
      notes: dto.notes ?? '',
      maxHp: dto.maxHp ?? 5,
      armor: dto.armor ?? 0,
      injury: dto.injury ?? 0,
      abilities: dto.abilities ?? [],
      diarySchema: (dto.diarySchema as NpcTemplate['diarySchema']) ?? [],
      diaryData: dto.diaryData ?? {},
    });
  }

  async update(id: string, worldId: string, dto: CreateNpcTemplateInput): Promise<NpcTemplate> {
    const result = await this.repo.updateByIdAndWorld(id, worldId, dto as Partial<NpcTemplate>);
    if (!result) throw new NotFoundException('NPC šablona nenalezena');
    return result;
  }

  async remove(id: string, worldId: string): Promise<void> {
    const deleted = await this.repo.deleteByIdAndWorld(id, worldId);
    if (!deleted) throw new NotFoundException('NPC šablona nenalezena');
  }
}
```

- [ ] **Step 2: Spusť testy — ověř že procházejí**

```bash
cd backend && npx jest npc-templates.service.spec --no-coverage 2>&1 | tail -10
```

Očekáváno: `Tests: 10 passed, 10 total` (nebo podobný počet), `PASS`

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/npc-templates/npc-templates.service.ts
git commit -m "feat(npc-templates): implementovat NpcTemplatesService, všechny testy prochází"
```

---

## Task 5: DTOs

**Files:**
- Create: `backend/src/modules/npc-templates/dto/create-npc-template.dto.ts`
- Create: `backend/src/modules/npc-templates/dto/update-npc-template.dto.ts`

- [ ] **Step 1: Vytvoř CreateNpcTemplateDto**

Vytvoř `backend/src/modules/npc-templates/dto/create-npc-template.dto.ts`:

```typescript
import { IsString, IsOptional, IsNumber, IsArray, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TagValueDto {
  @IsString() label: string;
  @IsString() value: string;
}

export class CreateNpcTemplateDto {
  @IsString() name: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Min(0) maxHp?: number;
  @IsOptional() @IsNumber() @Min(0) armor?: number;
  @IsOptional() @IsNumber() @Min(0) injury?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TagValueDto) abilities?: TagValueDto[];
  @IsOptional() @IsArray() diarySchema?: Record<string, unknown>[];
  @IsOptional() @IsObject() diaryData?: Record<string, unknown>;
}
```

- [ ] **Step 2: Vytvoř UpdateNpcTemplateDto**

Vytvoř `backend/src/modules/npc-templates/dto/update-npc-template.dto.ts`:

```typescript
import { IsString, IsOptional, IsNumber, IsArray, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TagValueDto } from './create-npc-template.dto';

export class UpdateNpcTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Min(0) maxHp?: number;
  @IsOptional() @IsNumber() @Min(0) armor?: number;
  @IsOptional() @IsNumber() @Min(0) injury?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TagValueDto) abilities?: TagValueDto[];
  @IsOptional() @IsArray() diarySchema?: Record<string, unknown>[];
  @IsOptional() @IsObject() diaryData?: Record<string, unknown>;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/npc-templates/dto/
git commit -m "feat(npc-templates): přidat DTOs"
```

---

## Task 6: Controller + Module + registrace

**Files:**
- Create: `backend/src/modules/npc-templates/npc-templates.controller.ts`
- Create: `backend/src/modules/npc-templates/npc-templates.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř controller**

Vytvoř `backend/src/modules/npc-templates/npc-templates.controller.ts`:

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { NpcTemplatesService } from './npc-templates.service';
import { CreateNpcTemplateDto } from './dto/create-npc-template.dto';
import { UpdateNpcTemplateDto } from './dto/update-npc-template.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole }

@Controller('worlds/:worldId/npc-templates')
export class NpcTemplatesController {
  constructor(private readonly service: NpcTemplatesService) {}

  @Get()
  findAll(@Param('worldId') worldId: string) {
    return this.service.findAll(worldId);
  }

  @Get(':id')
  findOne(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.findOne(id, worldId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateNpcTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.create(dto, worldId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateNpcTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.update(id, worldId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.remove(id, worldId);
  }
}
```

- [ ] **Step 2: Vytvoř module**

Vytvoř `backend/src/modules/npc-templates/npc-templates.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NpcTemplateSchemaClass, NpcTemplateSchema } from './schemas/npc-template.schema';
import { MongoNpcTemplatesRepository } from './repositories/npc-templates.repository';
import { NpcTemplatesService } from './npc-templates.service';
import { NpcTemplatesController } from './npc-templates.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: NpcTemplateSchemaClass.name, schema: NpcTemplateSchema }]),
    WorldsModule,
  ],
  controllers: [NpcTemplatesController],
  providers: [
    NpcTemplatesService,
    { provide: 'INpcTemplatesRepository', useClass: MongoNpcTemplatesRepository },
  ],
  exports: [NpcTemplatesService, 'INpcTemplatesRepository'],
})
export class NpcTemplatesModule {}
```

- [ ] **Step 3: Registruj modul v app.module.ts**

V `backend/src/app.module.ts` přidej import:

```typescript
import { NpcTemplatesModule } from './modules/npc-templates/npc-templates.module';
```

A do pole `imports` přidej `NpcTemplatesModule` (za `CharacterSubdocsModule`):

```typescript
imports: [
  // ... stávající moduly ...
  CharactersModule,
  CharacterSubdocsModule,
  NpcTemplatesModule,   // ← přidat
  GatewaysModule,
],
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/npc-templates/npc-templates.controller.ts \
        backend/src/modules/npc-templates/npc-templates.module.ts \
        backend/src/app.module.ts
git commit -m "feat(npc-templates): přidat controller, module, registrovat v AppModule"
```

---

## Task 7: Ověření

- [ ] **Step 1: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -15
```

Očekáváno: všechny testy prochází, žádné regrese.

- [ ] **Step 2: Build ověření**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Očekáváno: žádné TypeScript chyby.

- [ ] **Step 3: Aktualizuj roadmap**

V `docs/roadmap.md` najdi sekci `## Krok 7b — NPC Templates ⬜` a odškrtni checkboxy:

```markdown
## Krok 7b — NPC Templates ✅

> Znovupoužitelné šablony NPC pro PJ — stats, schopnosti, poznámky.

- [x] **NpcTemplate schema**: name, imageUrl, abilities (TagValue), maxHp, armor, injury, notes, diarySchema, diaryData
- [x] GET /api/worlds/:worldId/npc-templates, GET /:id, POST, PUT /:id, DELETE (PJ/Admin+ pro mutace)
```

Také aktualizuj tabulku stavu dole: `| 7b | NPC Templates | ✅ |`

- [ ] **Step 4: Final commit**

```bash
git add docs/roadmap.md
git commit -m "docs: označit Krok 7b jako hotový"
```
