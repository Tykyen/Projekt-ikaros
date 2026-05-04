# Krok 8b — Dungeon Builder: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat backend modul `dungeon-maps` — CRUD pro ukládání rozpracovaných dungeonů a export do MapTemplate / MapScene.

**Architecture:** Nový NestJS modul `DungeonMapsModule` s vlastní MongoDB kolekcí `dungeonMaps`. Service závisí na `IMapTemplatesRepository` a `IMapsRepository` z `MapsModule` (přidáme exports). Autorizace přes `IWorldMembershipRepository` z `WorldsModule` — stejný vzor jako `MapsService`.

**Tech Stack:** NestJS, Mongoose, Jest (unit testy service), TypeScript

---

## Přehled souborů

| Soubor | Akce |
|--------|------|
| `backend/src/modules/dungeon-maps/interfaces/dungeon-map.interface.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/interfaces/dungeon-maps-repository.interface.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/schemas/dungeon-map.schema.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/repositories/dungeon-maps.repository.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dto/create-dungeon-map.dto.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dto/update-dungeon-map.dto.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dto/export-template.dto.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dto/export-scene.dto.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dungeon-maps.service.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dungeon-maps.service.spec.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dungeon-maps.controller.ts` | Vytvoř |
| `backend/src/modules/dungeon-maps/dungeon-maps.module.ts` | Vytvoř |
| `backend/src/modules/maps/maps.module.ts` | Uprav — přidej exports |
| `backend/src/app.module.ts` | Uprav — registruj DungeonMapsModule |

---

## Task 1: Interface + Schema

**Files:**
- Create: `backend/src/modules/dungeon-maps/interfaces/dungeon-map.interface.ts`
- Create: `backend/src/modules/dungeon-maps/schemas/dungeon-map.schema.ts`

- [ ] **Krok 1: Vytvoř interface**

```typescript
// backend/src/modules/dungeon-maps/interfaces/dungeon-map.interface.ts

export interface DungeonWallEdges {
  // square grid
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
  // hex grid (volitelné)
  nw?: boolean;
  n?: boolean;
  ne?: boolean;
  se?: boolean;
  s?: boolean;
  sw?: boolean;
}

export interface DungeonCell {
  type: 'empty' | 'floor' | 'wall' | 'door' | 'door-locked'
      | 'stairs-up' | 'stairs-down' | 'water' | 'lava' | 'pit';
  wallEdges: DungeonWallEdges;
  floorVariant?: string;
}

export interface DungeonDecoration {
  id: string;
  type: string;
  cellX: number;
  cellY: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface DungeonMap {
  id: string;
  worldId: string;
  name: string;
  gridType: 'square' | 'hex';
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  theme: 'dyson' | 'modern';
  cells: DungeonCell[][];
  decorations: DungeonDecoration[];
  lastModified?: Date;
}
```

- [ ] **Krok 2: Vytvoř Mongoose schema**

```typescript
// backend/src/modules/dungeon-maps/schemas/dungeon-map.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DungeonMapDocument = HydratedDocument<DungeonMapSchemaClass>;

@Schema({ timestamps: false, collection: 'dungeonMaps' })
export class DungeonMapSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ default: '' }) name: string;
  @Prop({ default: 'square' }) gridType: string;
  @Prop({ default: 20 }) gridWidth: number;
  @Prop({ default: 20 }) gridHeight: number;
  @Prop({ default: 40 }) cellSize: number;
  @Prop({ default: 'dyson' }) theme: string;
  @Prop({ type: [[Object]], default: [] }) cells: Record<string, unknown>[][];
  @Prop({ type: [Object], default: [] }) decorations: Record<string, unknown>[];
  @Prop() lastModified?: Date;
}

export const DungeonMapSchema = SchemaFactory.createForClass(DungeonMapSchemaClass);
DungeonMapSchema.index({ worldId: 1 });
```

- [ ] **Krok 3: Commit**

```bash
git add backend/src/modules/dungeon-maps/interfaces/dungeon-map.interface.ts backend/src/modules/dungeon-maps/schemas/dungeon-map.schema.ts
git commit -m "feat(dungeon-maps): přidat interface a schema"
```

---

## Task 2: Repository interface + implementace

**Files:**
- Create: `backend/src/modules/dungeon-maps/interfaces/dungeon-maps-repository.interface.ts`
- Create: `backend/src/modules/dungeon-maps/repositories/dungeon-maps.repository.ts`

- [ ] **Krok 1: Vytvoř repository interface**

```typescript
// backend/src/modules/dungeon-maps/interfaces/dungeon-maps-repository.interface.ts
import type { DungeonMap } from './dungeon-map.interface';

export interface IDungeonMapsRepository {
  findByWorld(worldId: string): Promise<DungeonMap[]>;
  findById(id: string): Promise<DungeonMap | null>;
  create(data: Partial<DungeonMap>): Promise<DungeonMap>;
  replace(id: string, data: Partial<DungeonMap>): Promise<DungeonMap | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Krok 2: Vytvoř MongoDB implementaci**

```typescript
// backend/src/modules/dungeon-maps/repositories/dungeon-maps.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { DungeonMapSchemaClass } from '../schemas/dungeon-map.schema';
import type { DungeonMap, DungeonCell, DungeonDecoration } from '../interfaces/dungeon-map.interface';
import type { IDungeonMapsRepository } from '../interfaces/dungeon-maps-repository.interface';

@Injectable()
export class MongoDungeonMapsRepository
  extends BaseMongoRepository<DungeonMap>
  implements IDungeonMapsRepository
{
  constructor(@InjectModel(DungeonMapSchemaClass.name) model: Model<DungeonMapSchemaClass>) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<DungeonMap[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findById(id: string): Promise<DungeonMap | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(data: Partial<DungeonMap>): Promise<DungeonMap> {
    const doc = await this.model.create({ ...data, lastModified: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async replace(id: string, data: Partial<DungeonMap>): Promise<DungeonMap | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { ...data, lastModified: new Date() }, { new: true, overwrite: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): DungeonMap {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: (doc.name as string) ?? '',
      gridType: ((doc.gridType as string) === 'hex' ? 'hex' : 'square'),
      gridWidth: (doc.gridWidth as number) ?? 20,
      gridHeight: (doc.gridHeight as number) ?? 20,
      cellSize: (doc.cellSize as number) ?? 40,
      theme: ((doc.theme as string) === 'modern' ? 'modern' : 'dyson'),
      cells: (doc.cells as DungeonCell[][]) ?? [],
      decorations: (doc.decorations as DungeonDecoration[]) ?? [],
      lastModified: doc.lastModified as Date | undefined,
    };
  }
}
```

- [ ] **Krok 3: Commit**

```bash
git add backend/src/modules/dungeon-maps/interfaces/dungeon-maps-repository.interface.ts backend/src/modules/dungeon-maps/repositories/dungeon-maps.repository.ts
git commit -m "feat(dungeon-maps): přidat repository interface a implementaci"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/dungeon-maps/dto/create-dungeon-map.dto.ts`
- Create: `backend/src/modules/dungeon-maps/dto/update-dungeon-map.dto.ts`
- Create: `backend/src/modules/dungeon-maps/dto/export-template.dto.ts`
- Create: `backend/src/modules/dungeon-maps/dto/export-scene.dto.ts`

- [ ] **Krok 1: Vytvoř DTOs**

```typescript
// backend/src/modules/dungeon-maps/dto/create-dungeon-map.dto.ts
export class CreateDungeonMapDto {
  worldId?: string;
  name?: string;
  gridType?: 'square' | 'hex';
  gridWidth?: number;
  gridHeight?: number;
  cellSize?: number;
  theme?: 'dyson' | 'modern';
  cells?: Record<string, unknown>[][];
  decorations?: Record<string, unknown>[];
}
```

```typescript
// backend/src/modules/dungeon-maps/dto/update-dungeon-map.dto.ts
export class UpdateDungeonMapDto {
  name?: string;
  gridType?: 'square' | 'hex';
  gridWidth?: number;
  gridHeight?: number;
  cellSize?: number;
  theme?: 'dyson' | 'modern';
  cells?: Record<string, unknown>[][];
  decorations?: Record<string, unknown>[];
}
```

```typescript
// backend/src/modules/dungeon-maps/dto/export-template.dto.ts
export class ExportTemplateDto {
  imageUrl!: string;
}
```

```typescript
// backend/src/modules/dungeon-maps/dto/export-scene.dto.ts
export class ExportSceneDto {
  imageUrl!: string;
  worldId!: string;
}
```

- [ ] **Krok 2: Commit**

```bash
git add backend/src/modules/dungeon-maps/dto/
git commit -m "feat(dungeon-maps): přidat DTOs"
```

---

## Task 4: Service + testy (TDD)

**Files:**
- Create: `backend/src/modules/dungeon-maps/dungeon-maps.service.spec.ts`
- Create: `backend/src/modules/dungeon-maps/dungeon-maps.service.ts`

- [ ] **Krok 1: Napiš failing testy**

```typescript
// backend/src/modules/dungeon-maps/dungeon-maps.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DungeonMapsService } from './dungeon-maps.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockDungeon = {
  id: 'dun1',
  worldId: 'world1',
  name: 'Kobka',
  gridType: 'square' as const,
  gridWidth: 20,
  gridHeight: 20,
  cellSize: 40,
  theme: 'dyson' as const,
  cells: [],
  decorations: [],
  lastModified: new Date(),
};

describe('DungeonMapsService', () => {
  let service: DungeonMapsService;

  const mockRepo = {
    findByWorld: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    replace: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
  const mockTemplateRepo = { create: jest.fn() };
  const mockMapsRepo = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DungeonMapsService,
        { provide: 'IDungeonMapsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IMapTemplatesRepository', useValue: mockTemplateRepo },
        { provide: 'IMapsRepository', useValue: mockMapsRepo },
      ],
    }).compile();
    service = module.get(DungeonMapsService);
  });

  describe('findByWorld', () => {
    it('vrátí seznam dungeonů světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockDungeon]);
      const result = await service.findByWorld('world1');
      expect(result).toEqual([mockDungeon]);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });
  });

  describe('findById', () => {
    it('vrátí dungeon pokud existuje', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      const result = await service.findById('dun1');
      expect(result).toEqual(mockDungeon);
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('neexistuje')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanManage', () => {
    it('projde pro Admin bez kontroly členství', async () => {
      await expect(service.assertCanManage('u1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('projde pro PJ světa', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanManage('pj1', UserRole.Player, 'world1')).resolves.toBeUndefined();
    });

    it('hodí ForbiddenException pro hráče bez PJ role', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Player });
      await expect(service.assertCanManage('u1', UserRole.Player, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('hodí ForbiddenException pokud nemá členství', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertCanManage('u1', UserRole.Player, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('vytvoří dungeon s worldId z DTO', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockRepo.create.mockResolvedValue(mockDungeon);
      const result = await service.create({ worldId: 'world1', name: 'Kobka' }, 'pj1', UserRole.Player);
      expect(result).toEqual(mockDungeon);
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ worldId: 'world1', name: 'Kobka' }));
    });
  });

  describe('replace', () => {
    it('nahradí dungeon', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      const updated = { ...mockDungeon, name: 'Nové jméno' };
      mockRepo.replace.mockResolvedValue(updated);
      const result = await service.replace('dun1', { name: 'Nové jméno' }, 'pj1', UserRole.Player);
      expect(result).toEqual(updated);
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.replace('x', {}, 'pj1', UserRole.Player)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('smaže dungeon', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockRepo.delete.mockResolvedValue(true);
      await expect(service.delete('dun1', 'pj1', UserRole.Player)).resolves.toBeUndefined();
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('x', 'pj1', UserRole.Player)).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportTemplate', () => {
    it('vytvoří MapTemplate z dungeonu a vrátí templateId', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockTemplateRepo.create.mockResolvedValue({ id: 'tpl1', name: 'Kobka' });
      const result = await service.exportTemplate('dun1', 'https://example.com/img.png', 'pj1', UserRole.Player);
      expect(result).toEqual({ templateId: 'tpl1' });
      expect(mockTemplateRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Kobka',
        imageUrl: 'https://example.com/img.png',
        config: expect.objectContaining({ size: 40 }),
      }));
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.exportTemplate('x', 'https://img.png', 'pj1', UserRole.Player)).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportScene', () => {
    it('vytvoří MapScene z dungeonu a vrátí sceneId', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockMapsRepo.create.mockResolvedValue({ id: 'scene1', worldId: 'world1' });
      const result = await service.exportScene('dun1', 'https://example.com/img.png', 'world1', 'pj1', UserRole.Player);
      expect(result).toEqual({ sceneId: 'scene1' });
      expect(mockMapsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Kobka',
        imageUrl: 'https://example.com/img.png',
        worldId: 'world1',
        isActive: false,
      }));
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.exportScene('x', 'https://img.png', 'world1', 'pj1', UserRole.Player)).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Krok 2: Spusť testy — ověř že PADAJÍ**

```bash
cd backend && npx jest dungeon-maps.service.spec.ts --no-coverage
```

Očekávaný výstup: `Cannot find module './dungeon-maps.service'`

- [ ] **Krok 3: Implementuj service**

```typescript
// backend/src/modules/dungeon-maps/dungeon-maps.service.ts
import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { IDungeonMapsRepository } from './interfaces/dungeon-maps-repository.interface';
import type { DungeonMap } from './interfaces/dungeon-map.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IMapTemplatesRepository } from '../maps/interfaces/map-templates-repository.interface';
import type { IMapsRepository } from '../maps/interfaces/maps-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class DungeonMapsService {
  constructor(
    @Inject('IDungeonMapsRepository') private readonly repo: IDungeonMapsRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IMapTemplatesRepository') private readonly templateRepo: IMapTemplatesRepository,
    @Inject('IMapsRepository') private readonly mapsRepo: IMapsRepository,
  ) {}

  async assertCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findByWorld(worldId: string): Promise<DungeonMap[]> {
    return this.repo.findByWorld(worldId);
  }

  async findById(id: string): Promise<DungeonMap> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    return dungeon;
  }

  async create(dto: Partial<DungeonMap>, userId: string, userRole: UserRole): Promise<DungeonMap> {
    await this.assertCanManage(userId, userRole, dto.worldId ?? '');
    return this.repo.create(dto);
  }

  async replace(id: string, dto: Partial<DungeonMap>, userId: string, userRole: UserRole): Promise<DungeonMap> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    const updated = await this.repo.replace(id, { ...dto, worldId: dungeon.worldId });
    return updated!;
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    await this.repo.delete(id);
  }

  async exportTemplate(
    id: string,
    imageUrl: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ templateId: string }> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    const template = await this.templateRepo.create({
      name: dungeon.name,
      imageUrl,
      config: { size: dungeon.cellSize, originX: 0, originY: 0, showGrid: true },
      npcTemplates: [],
      tokens: [],
      effects: [],
      fogEnabled: false,
      revealedHexes: [],
      activeSoundIds: [],
    });
    return { templateId: template.id };
  }

  async exportScene(
    id: string,
    imageUrl: string,
    worldId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<{ sceneId: string }> {
    const dungeon = await this.repo.findById(id);
    if (!dungeon) throw new NotFoundException('Dungeon nenalezen');
    await this.assertCanManage(userId, userRole, dungeon.worldId);
    const scene = await this.mapsRepo.create({
      name: dungeon.name,
      imageUrl,
      worldId,
      config: { size: dungeon.cellSize, originX: 0, originY: 0, showGrid: true },
      tokens: [],
      npcTemplates: [],
      effects: [],
      fogEnabled: false,
      revealedHexes: [],
      isActive: false,
      isHidden: false,
      isLocked: false,
      activeSoundIds: [],
    });
    return { sceneId: scene.id };
  }
}
```

- [ ] **Krok 4: Spusť testy — ověř že PROCHÁZÍ**

```bash
cd backend && npx jest dungeon-maps.service.spec.ts --no-coverage
```

Očekávaný výstup: `Tests: 16 passed`

- [ ] **Krok 5: Commit**

```bash
git add backend/src/modules/dungeon-maps/dungeon-maps.service.ts backend/src/modules/dungeon-maps/dungeon-maps.service.spec.ts
git commit -m "feat(dungeon-maps): přidat service s testy"
```

---

## Task 5: Controller

**Files:**
- Create: `backend/src/modules/dungeon-maps/dungeon-maps.controller.ts`

- [ ] **Krok 1: Vytvoř controller**

```typescript
// backend/src/modules/dungeon-maps/dungeon-maps.controller.ts
import {
  Controller, Get, Post, Put, Delete,
  Param, Query, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { DungeonMapsService } from './dungeon-maps.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateDungeonMapDto } from './dto/create-dungeon-map.dto';
import { UpdateDungeonMapDto } from './dto/update-dungeon-map.dto';
import { ExportTemplateDto } from './dto/export-template.dto';
import { ExportSceneDto } from './dto/export-scene.dto';

interface RequestUser { id: string; role: UserRole }

@Controller('dungeon-maps')
@UseGuards(JwtAuthGuard)
export class DungeonMapsController {
  constructor(private readonly service: DungeonMapsService) {}

  @Get()
  findByWorld(@Query('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(@Body() dto: CreateDungeonMapDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto as never, user.id, user.role);
  }

  @Put(':id')
  replace(
    @Param('id') id: string,
    @Body() dto: UpdateDungeonMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.replace(id, dto as never, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.delete(id, user.id, user.role);
  }

  @Post(':id/export-template')
  exportTemplate(
    @Param('id') id: string,
    @Body() dto: ExportTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.exportTemplate(id, dto.imageUrl, user.id, user.role);
  }

  @Post(':id/export-scene')
  exportScene(
    @Param('id') id: string,
    @Body() dto: ExportSceneDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.exportScene(id, dto.imageUrl, dto.worldId, user.id, user.role);
  }
}
```

- [ ] **Krok 2: Commit**

```bash
git add backend/src/modules/dungeon-maps/dungeon-maps.controller.ts
git commit -m "feat(dungeon-maps): přidat controller"
```

---

## Task 6: Module + registrace v aplikaci

**Files:**
- Create: `backend/src/modules/dungeon-maps/dungeon-maps.module.ts`
- Modify: `backend/src/modules/maps/maps.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Krok 1: Uprav MapsModule — přidej exports**

V souboru `backend/src/modules/maps/maps.module.ts` přidej `exports` pole:

```typescript
// Celý soubor po změně:
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MapSceneSchemaClass, MapSceneSchema } from './schemas/map-scene.schema';
import { MapTemplateSchemaClass, MapTemplateSchema } from './schemas/map-template.schema';
import { MongoMapsRepository } from './repositories/maps.repository';
import { MongoMapTemplatesRepository } from './repositories/map-templates.repository';
import { MapsService } from './maps.service';
import { MapsController } from './maps.controller';
import { MapTemplatesController } from './map-templates.controller';
import { MapsGateway } from './maps.gateway';
import { WorldsModule } from '../worlds/worlds.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MapSceneSchemaClass.name, schema: MapSceneSchema },
      { name: MapTemplateSchemaClass.name, schema: MapTemplateSchema },
    ]),
    WorldsModule,
    CharactersModule,
  ],
  controllers: [MapsController, MapTemplatesController],
  providers: [
    MapsService,
    MapsGateway,
    { provide: 'IMapsRepository', useClass: MongoMapsRepository },
    { provide: 'IMapTemplatesRepository', useClass: MongoMapTemplatesRepository },
  ],
  exports: ['IMapsRepository', 'IMapTemplatesRepository'],
})
export class MapsModule {}
```

- [ ] **Krok 2: Vytvoř DungeonMapsModule**

```typescript
// backend/src/modules/dungeon-maps/dungeon-maps.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DungeonMapSchemaClass, DungeonMapSchema } from './schemas/dungeon-map.schema';
import { MongoDungeonMapsRepository } from './repositories/dungeon-maps.repository';
import { DungeonMapsService } from './dungeon-maps.service';
import { DungeonMapsController } from './dungeon-maps.controller';
import { WorldsModule } from '../worlds/worlds.module';
import { MapsModule } from '../maps/maps.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DungeonMapSchemaClass.name, schema: DungeonMapSchema },
    ]),
    WorldsModule,
    MapsModule,
  ],
  controllers: [DungeonMapsController],
  providers: [
    DungeonMapsService,
    { provide: 'IDungeonMapsRepository', useClass: MongoDungeonMapsRepository },
  ],
})
export class DungeonMapsModule {}
```

- [ ] **Krok 3: Zaregistruj v AppModule**

V souboru `backend/src/app.module.ts` přidej import:

```typescript
import { DungeonMapsModule } from './modules/dungeon-maps/dungeon-maps.module';
```

A do `imports` pole přidej `DungeonMapsModule` (za `MapsModule`):

```typescript
MapsModule,
DungeonMapsModule,
```

- [ ] **Krok 4: Ověř kompilaci**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby.

- [ ] **Krok 5: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: všechny testy prochází.

- [ ] **Krok 6: Commit**

```bash
git add backend/src/modules/dungeon-maps/dungeon-maps.module.ts backend/src/modules/maps/maps.module.ts backend/src/app.module.ts
git commit -m "feat(dungeon-maps): registrovat modul v aplikaci"
```
