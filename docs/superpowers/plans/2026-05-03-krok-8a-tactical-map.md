# Krok 8a — Taktická mapa: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat taktický hex mapový systém — MapScene, MapTemplate, real-time MapGateway a rozšíření globálního bestiáře NpcTemplates.

**Architecture:** Nový modul `maps` s vlastní service/repository vrstvou. Tokeny obsahují `characterSlug` — GET /maps/:id obohacuje tokeny o `characterData` z Characters modulu. NpcTemplates modul dostane nullable `worldId` pro globální bestiář a endpoint pro import šablony do světa.

**Tech Stack:** NestJS, Mongoose, Socket.io (sdílený server s ChatGateway), Jest

---

## Přehled souborů

**Nové soubory:**
```
backend/src/modules/maps/
  schemas/map-scene.schema.ts
  schemas/map-template.schema.ts
  interfaces/map-scene.interface.ts
  interfaces/map-template.interface.ts
  interfaces/maps-repository.interface.ts
  interfaces/map-templates-repository.interface.ts
  repositories/maps.repository.ts
  repositories/map-templates.repository.ts
  dto/create-map.dto.ts
  dto/move-token.dto.ts
  dto/remove-token.dto.ts
  maps.service.ts
  maps.service.spec.ts
  maps.controller.ts
  map-templates.controller.ts
  maps.gateway.ts
  maps.module.ts
```

**Modifikované soubory:**
```
backend/src/app.module.ts                                         — přidat MapsModule
backend/src/modules/npc-templates/schemas/npc-template.schema.ts — worldId optional + movement + initiativeBase
backend/src/modules/npc-templates/interfaces/npc-template.interface.ts — worldId optional
backend/src/modules/npc-templates/interfaces/npc-templates-repository.interface.ts — přidat findGlobal, create s nullable worldId
backend/src/modules/npc-templates/repositories/npc-templates.repository.ts — přidat findGlobal
backend/src/modules/npc-templates/npc-templates.service.ts       — přidat findGlobal, importToWorld
backend/src/modules/npc-templates/npc-templates.service.spec.ts  — testy pro nové metody
backend/src/modules/npc-templates/npc-templates.controller.ts    — přidat /global a /:id/import
```

---

## Task 1: Interfaces & Schemas

**Files:**
- Create: `backend/src/modules/maps/interfaces/map-scene.interface.ts`
- Create: `backend/src/modules/maps/interfaces/map-template.interface.ts`
- Create: `backend/src/modules/maps/schemas/map-scene.schema.ts`
- Create: `backend/src/modules/maps/schemas/map-template.schema.ts`

- [ ] **Step 1: Vytvoř interfaces**

`backend/src/modules/maps/interfaces/map-scene.interface.ts`:
```typescript
export interface HexConfig {
  size: number;
  originX: number;
  originY: number;
  showGrid: boolean;
}

export interface HexCoord {
  q: number;
  r: number;
}

export interface ExplosionRing {
  radius: number;
  damage: number;
}

export interface MapEffect {
  id: string;
  type: string;
  hexes: HexCoord[];
  color?: string;
  rings?: ExplosionRing[];
  variant?: string;
  excludedHexes?: HexCoord[];
  barrierDC?: number;
}

export interface MapTokenAbility {
  name: string;
  description: string;
}

export interface MapToken {
  id: string;
  characterId: string;
  characterSlug: string;
  q: number;
  r: number;
  isNpc: boolean;
  templateId?: string;
  instanceName?: string;
  currentHp: number;
  maxHp: number;
  baseHp: number;
  armor: number;
  baseArmor: number;
  injury: number;
  initiative: number;
  initiativeBase: number;
  inCombat: boolean;
  movement: number;
  abilities: MapTokenAbility[];
  personalDiarySchema?: Record<string, unknown>[];
  customData: Record<string, unknown>;
  // Doplněno při GET — nikdy se neukládá do DB
  characterData?: {
    name: string;
    imageUrl?: string;
    diaryData: Record<string, unknown>;
  };
}

export interface MapSceneNpc {
  id: string;
  originTemplateId?: string;
  name: string;
  imageUrl?: string;
  notes: string;
  maxHp: number;
  armor: number;
  injury: number;
  movement: number;
  initiativeBase: number;
  abilities: { label: string; value: string }[];
  personalDiarySchema?: Record<string, unknown>[];
  customData: Record<string, unknown>;
}

export interface MapScene {
  id: string;
  worldId: string;
  name: string;
  imageUrl: string;
  folder?: string;
  config: HexConfig;
  tokens: MapToken[];
  npcTemplates: MapSceneNpc[];
  effects: MapEffect[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  templateId?: string;
  isActive: boolean;
  isHidden: boolean;
  isLocked: boolean;
  activeSoundIds: string[];
  lastModified?: Date;
}
```

`backend/src/modules/maps/interfaces/map-template.interface.ts`:
```typescript
import type { HexConfig, MapToken, MapSceneNpc, MapEffect, HexCoord } from './map-scene.interface';

export interface MapTemplate {
  id: string;
  name: string;
  imageUrl: string;
  config: HexConfig;
  npcTemplates: MapSceneNpc[];
  tokens: MapToken[];
  effects: MapEffect[];
  fogEnabled: boolean;
  revealedHexes: HexCoord[];
  activeSoundIds: string[];
  lastModified?: Date;
}
```

- [ ] **Step 2: Vytvoř MapScene schema**

`backend/src/modules/maps/schemas/map-scene.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MapSceneDocument = HydratedDocument<MapSceneSchemaClass>;

@Schema({ timestamps: false, collection: 'mapScenes' })
export class MapSceneSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) imageUrl: string;
  @Prop() folder?: string;
  @Prop({ type: Object, default: { size: 40, originX: 0, originY: 0, showGrid: true } }) config: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) tokens: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) npcTemplates: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) effects: Record<string, unknown>[];
  @Prop({ default: false }) fogEnabled: boolean;
  @Prop({ type: [Object], default: [] }) revealedHexes: Record<string, unknown>[];
  @Prop() templateId?: string;
  @Prop({ default: false }) isActive: boolean;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ default: false }) isLocked: boolean;
  @Prop({ type: [String], default: [] }) activeSoundIds: string[];
  @Prop() lastModified?: Date;
}

export const MapSceneSchema = SchemaFactory.createForClass(MapSceneSchemaClass);
MapSceneSchema.index({ worldId: 1 });
MapSceneSchema.index({ worldId: 1, isActive: 1 });
```

- [ ] **Step 3: Vytvoř MapTemplate schema**

`backend/src/modules/maps/schemas/map-template.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MapTemplateDocument = HydratedDocument<MapTemplateSchemaClass>;

@Schema({ timestamps: false, collection: 'mapTemplates' })
export class MapTemplateSchemaClass {
  @Prop({ default: '' }) name: string;
  @Prop({ default: '' }) imageUrl: string;
  @Prop({ type: Object, default: { size: 40, originX: 0, originY: 0, showGrid: true } }) config: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) npcTemplates: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) tokens: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) effects: Record<string, unknown>[];
  @Prop({ default: false }) fogEnabled: boolean;
  @Prop({ type: [Object], default: [] }) revealedHexes: Record<string, unknown>[];
  @Prop({ type: [String], default: [] }) activeSoundIds: string[];
  @Prop() lastModified?: Date;
}

export const MapTemplateSchema = SchemaFactory.createForClass(MapTemplateSchemaClass);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/maps/
git commit -m "feat(maps): přidat interfaces a schemas pro MapScene a MapTemplate"
```

---

## Task 2: Repository interfaces + implementace

**Files:**
- Create: `backend/src/modules/maps/interfaces/maps-repository.interface.ts`
- Create: `backend/src/modules/maps/interfaces/map-templates-repository.interface.ts`
- Create: `backend/src/modules/maps/repositories/maps.repository.ts`
- Create: `backend/src/modules/maps/repositories/map-templates.repository.ts`

- [ ] **Step 1: Vytvoř repository interfaces**

`backend/src/modules/maps/interfaces/maps-repository.interface.ts`:
```typescript
import type { MapScene } from './map-scene.interface';

export interface IMapsRepository {
  findByWorld(worldId: string): Promise<MapScene[]>;
  findActiveByWorld(worldId: string): Promise<MapScene | null>;
  findById(id: string): Promise<MapScene | null>;
  create(data: Partial<MapScene>): Promise<MapScene>;
  setActive(id: string, worldId: string): Promise<void>;
  replace(id: string, data: Partial<MapScene>): Promise<MapScene | null>;
  delete(id: string): Promise<boolean>;
}
```

`backend/src/modules/maps/interfaces/map-templates-repository.interface.ts`:
```typescript
import type { MapTemplate } from './map-template.interface';

export interface IMapTemplatesRepository {
  findAll(): Promise<MapTemplate[]>;
  findById(id: string): Promise<MapTemplate | null>;
  create(data: Partial<MapTemplate>): Promise<MapTemplate>;
  replace(id: string, data: Partial<MapTemplate>): Promise<MapTemplate | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 2: Implementuj MapsRepository**

`backend/src/modules/maps/repositories/maps.repository.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { MapSceneSchemaClass } from '../schemas/map-scene.schema';
import type { MapScene, HexConfig, MapToken, MapSceneNpc, MapEffect, HexCoord } from '../interfaces/map-scene.interface';
import type { IMapsRepository } from '../interfaces/maps-repository.interface';

@Injectable()
export class MongoMapsRepository
  extends BaseMongoRepository<MapScene>
  implements IMapsRepository
{
  constructor(@InjectModel(MapSceneSchemaClass.name) model: Model<MapSceneSchemaClass>) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<MapScene[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findActiveByWorld(worldId: string): Promise<MapScene | null> {
    const doc = await this.model.findOne({ worldId, isActive: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findById(id: string): Promise<MapScene | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(data: Partial<MapScene>): Promise<MapScene> {
    const doc = await this.model.create({ ...data, lastModified: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async setActive(id: string, worldId: string): Promise<void> {
    await this.model.updateMany({ worldId, isActive: true }, { $set: { isActive: false } }).exec();
    await this.model.findByIdAndUpdate(id, { $set: { isActive: true } }).exec();
  }

  async replace(id: string, data: Partial<MapScene>): Promise<MapScene | null> {
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

  protected toEntity(doc: Record<string, unknown>): MapScene {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: (doc.name as string) ?? '',
      imageUrl: (doc.imageUrl as string) ?? '',
      folder: doc.folder as string | undefined,
      config: (doc.config as HexConfig) ?? { size: 40, originX: 0, originY: 0, showGrid: true },
      tokens: ((doc.tokens as Record<string, unknown>[]) ?? []).map((t) => this.toToken(t)),
      npcTemplates: ((doc.npcTemplates as Record<string, unknown>[]) ?? []).map((n) => this.toSceneNpc(n)),
      effects: (doc.effects as MapEffect[]) ?? [],
      fogEnabled: (doc.fogEnabled as boolean) ?? false,
      revealedHexes: (doc.revealedHexes as HexCoord[]) ?? [],
      templateId: doc.templateId as string | undefined,
      isActive: (doc.isActive as boolean) ?? false,
      isHidden: (doc.isHidden as boolean) ?? false,
      isLocked: (doc.isLocked as boolean) ?? false,
      activeSoundIds: (doc.activeSoundIds as string[]) ?? [],
      lastModified: doc.lastModified as Date | undefined,
    };
  }

  private toToken(t: Record<string, unknown>): MapToken {
    return {
      id: (t.id as string) ?? '',
      characterId: (t.characterId as string) ?? '',
      characterSlug: (t.characterSlug as string) ?? '',
      q: (t.q as number) ?? 0,
      r: (t.r as number) ?? 0,
      isNpc: (t.isNpc as boolean) ?? false,
      templateId: t.templateId as string | undefined,
      instanceName: t.instanceName as string | undefined,
      currentHp: (t.currentHp as number) ?? 0,
      maxHp: (t.maxHp as number) ?? 0,
      baseHp: (t.baseHp as number) ?? 0,
      armor: (t.armor as number) ?? 0,
      baseArmor: (t.baseArmor as number) ?? 0,
      injury: (t.injury as number) ?? 0,
      initiative: (t.initiative as number) ?? 0,
      initiativeBase: (t.initiativeBase as number) ?? 0,
      inCombat: (t.inCombat as boolean) ?? false,
      movement: (t.movement as number) ?? 5,
      abilities: (t.abilities as { name: string; description: string }[]) ?? [],
      personalDiarySchema: t.personalDiarySchema as Record<string, unknown>[] | undefined,
      customData: (t.customData as Record<string, unknown>) ?? {},
    };
  }

  private toSceneNpc(n: Record<string, unknown>): MapSceneNpc {
    return {
      id: (n.id as string) ?? '',
      originTemplateId: n.originTemplateId as string | undefined,
      name: (n.name as string) ?? '',
      imageUrl: n.imageUrl as string | undefined,
      notes: (n.notes as string) ?? '',
      maxHp: (n.maxHp as number) ?? 5,
      armor: (n.armor as number) ?? 0,
      injury: (n.injury as number) ?? 0,
      movement: (n.movement as number) ?? 5,
      initiativeBase: (n.initiativeBase as number) ?? 0,
      abilities: (n.abilities as { label: string; value: string }[]) ?? [],
      personalDiarySchema: n.personalDiarySchema as Record<string, unknown>[] | undefined,
      customData: (n.customData as Record<string, unknown>) ?? {},
    };
  }
}
```

- [ ] **Step 3: Implementuj MapTemplatesRepository**

`backend/src/modules/maps/repositories/map-templates.repository.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { MapTemplateSchemaClass } from '../schemas/map-template.schema';
import type { MapTemplate } from '../interfaces/map-template.interface';
import type { IMapTemplatesRepository } from '../interfaces/map-templates-repository.interface';
import type { HexConfig, MapToken, MapSceneNpc, MapEffect, HexCoord } from '../interfaces/map-scene.interface';

@Injectable()
export class MongoMapTemplatesRepository
  extends BaseMongoRepository<MapTemplate>
  implements IMapTemplatesRepository
{
  constructor(@InjectModel(MapTemplateSchemaClass.name) model: Model<MapTemplateSchemaClass>) {
    super(model as never);
  }

  async findAll(): Promise<MapTemplate[]> {
    const docs = await this.model.find().lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findById(id: string): Promise<MapTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(data: Partial<MapTemplate>): Promise<MapTemplate> {
    const doc = await this.model.create({ ...data, lastModified: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async replace(id: string, data: Partial<MapTemplate>): Promise<MapTemplate | null> {
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

  protected toEntity(doc: Record<string, unknown>): MapTemplate {
    return {
      id: String(doc._id),
      name: (doc.name as string) ?? '',
      imageUrl: (doc.imageUrl as string) ?? '',
      config: (doc.config as HexConfig) ?? { size: 40, originX: 0, originY: 0, showGrid: true },
      npcTemplates: (doc.npcTemplates as MapSceneNpc[]) ?? [],
      tokens: (doc.tokens as MapToken[]) ?? [],
      effects: (doc.effects as MapEffect[]) ?? [],
      fogEnabled: (doc.fogEnabled as boolean) ?? false,
      revealedHexes: (doc.revealedHexes as HexCoord[]) ?? [],
      activeSoundIds: (doc.activeSoundIds as string[]) ?? [],
      lastModified: doc.lastModified as Date | undefined,
    };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/maps/
git commit -m "feat(maps): přidat repository interfaces a implementace"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/maps/dto/create-map.dto.ts`
- Create: `backend/src/modules/maps/dto/move-token.dto.ts`
- Create: `backend/src/modules/maps/dto/remove-token.dto.ts`

- [ ] **Step 1: Vytvoř DTOs**

`backend/src/modules/maps/dto/create-map.dto.ts`:
```typescript
export class CreateMapDto {
  name?: string;
  imageUrl?: string;
  worldId?: string;
  folder?: string;
  templateId?: string;
  config?: {
    size?: number;
    originX?: number;
    originY?: number;
    showGrid?: boolean;
  };
  tokens?: Record<string, unknown>[];
  npcTemplates?: Record<string, unknown>[];
  effects?: Record<string, unknown>[];
  fogEnabled?: boolean;
  revealedHexes?: { q: number; r: number }[];
  isActive?: boolean;
  isHidden?: boolean;
  isLocked?: boolean;
  activeSoundIds?: string[];
}
```

`backend/src/modules/maps/dto/move-token.dto.ts`:
```typescript
export class MoveTokenDto {
  id: string;
  q: number;
  r: number;
}
```

`backend/src/modules/maps/dto/remove-token.dto.ts`:
```typescript
export class RemoveTokenDto {
  tokenId: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/maps/dto/
git commit -m "feat(maps): přidat DTOs"
```

---

## Task 4: MapsService

**Files:**
- Create: `backend/src/modules/maps/maps.service.ts`
- Create: `backend/src/modules/maps/maps.service.spec.ts`

- [ ] **Step 1: Napiš failing testy**

`backend/src/modules/maps/maps.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MapsService } from './maps.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockScene = {
  id: 'scene1',
  worldId: 'world1',
  name: 'Kobka',
  imageUrl: '',
  folder: undefined,
  config: { size: 40, originX: 0, originY: 0, showGrid: true },
  tokens: [],
  npcTemplates: [],
  effects: [],
  fogEnabled: false,
  revealedHexes: [],
  templateId: undefined,
  isActive: false,
  isHidden: false,
  isLocked: false,
  activeSoundIds: [],
  lastModified: new Date(),
};

const mockToken = {
  id: 'tok1',
  characterId: 'user1',
  characterSlug: 'abi',
  q: 0, r: 0, isNpc: false,
  currentHp: 10, maxHp: 10, baseHp: 10,
  armor: 2, baseArmor: 2, injury: 0,
  initiative: 0, initiativeBase: 0,
  inCombat: false, movement: 5,
  abilities: [], customData: {},
};

describe('MapsService', () => {
  let service: MapsService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findActiveByWorld: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    setActive: jest.fn(),
    replace: jest.fn(),
    delete: jest.fn(),
  };
  const mockTemplateRepo = { findById: jest.fn() };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
  const mockCharacterRepo = { findBySlugAndWorld: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MapsService,
        { provide: 'IMapsRepository', useValue: mockRepo },
        { provide: 'IMapTemplatesRepository', useValue: mockTemplateRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'ICharactersRepository', useValue: mockCharacterRepo },
      ],
    }).compile();
    service = module.get(MapsService);
  });

  describe('findByWorld', () => {
    it('vrátí scény světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockScene]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });
  });

  describe('findActive', () => {
    it('vrátí aktivní scénu', async () => {
      mockRepo.findActiveByWorld.mockResolvedValue(mockScene);
      const result = await service.findActive('world1');
      expect(result.id).toBe('scene1');
    });

    it('vyhodí NotFoundException pokud žádná aktivní scéna neexistuje', async () => {
      mockRepo.findActiveByWorld.mockResolvedValue(null);
      await expect(service.findActive('world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('vrátí scénu bez enrichmentu pokud tokeny nemají slug', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      const result = await service.findById('scene1');
      expect(result.id).toBe('scene1');
      expect(mockCharacterRepo.findBySlugAndWorld).not.toHaveBeenCalled();
    });

    it('obohacuje token s characterData pokud existuje postava', async () => {
      const sceneWithToken = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(sceneWithToken);
      mockCharacterRepo.findBySlugAndWorld.mockResolvedValue({
        name: 'Abi', imageUrl: 'img.png', diaryData: { hp: 10 },
      });
      const result = await service.findById('scene1');
      expect(result.tokens[0].characterData).toEqual({
        name: 'Abi', imageUrl: 'img.png', diaryData: { hp: 10 },
      });
    });

    it('characterData je undefined pokud postava neexistuje', async () => {
      const sceneWithToken = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(sceneWithToken);
      mockCharacterRepo.findBySlugAndWorld.mockResolvedValue(null);
      const result = await service.findById('scene1');
      expect(result.tokens[0].characterData).toBeUndefined();
    });

    it('vyhodí NotFoundException pokud scéna neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('vytvoří scénu s worldId z parametru', async () => {
      mockRepo.create.mockResolvedValue(mockScene);
      await service.create({ name: 'Kobka' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', name: 'Kobka' }),
      );
    });

    it('inicializuje z šablony pokud templateId je předáno', async () => {
      const tpl = {
        id: 'tpl1', name: 'Šablona', imageUrl: '', config: { size: 40, originX: 0, originY: 0, showGrid: true },
        npcTemplates: [], tokens: [], effects: [], fogEnabled: false,
        revealedHexes: [], activeSoundIds: [],
      };
      mockTemplateRepo.findById.mockResolvedValue(tpl);
      mockRepo.create.mockResolvedValue(mockScene);
      await service.create({ templateId: 'tpl1' }, 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          templateId: 'tpl1',
          isActive: false,
          isHidden: false,
          isLocked: false,
        }),
      );
    });
  });

  describe('setActive', () => {
    it('volá repo.setActive a vrátí scénu', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      mockRepo.setActive.mockResolvedValue(undefined);
      await service.setActive('scene1', 'world1');
      expect(mockRepo.setActive).toHaveBeenCalledWith('scene1', 'world1');
    });

    it('vyhodí NotFoundException pokud scéna neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.setActive('bad', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('moveToken', () => {
    it('PJ může pohybovat libovolným tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      const result = await service.moveToken('scene1', { id: 'tok1', q: 2, r: 3 }, 'pj1', UserRole.PJ);
      expect(result.q).toBe(2);
      expect(result.r).toBe(3);
    });

    it('hráč může pohybovat jen svým tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue(scene);
      const result = await service.moveToken('scene1', { id: 'tok1', q: 1, r: 1 }, 'user1', UserRole.Hrac);
      expect(result.q).toBe(1);
    });

    it('vyhodí ForbiddenException pokud hráč zkouší pohybovat cizím tokenem', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      await expect(
        service.moveToken('scene1', { id: 'tok1', q: 1, r: 1 }, 'otherUser', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí NotFoundException pokud token neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(mockScene);
      await expect(
        service.moveToken('scene1', { id: 'bad', q: 0, r: 0 }, 'user1', UserRole.Hrac),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeToken', () => {
    it('PJ může odstranit libovolný token', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      mockRepo.replace.mockResolvedValue({ ...scene, tokens: [] });
      await expect(service.removeToken('scene1', 'tok1', 'pj1', UserRole.PJ)).resolves.toBeUndefined();
    });

    it('vyhodí ForbiddenException pokud hráč zkouší odstranit cizí token', async () => {
      const scene = { ...mockScene, tokens: [mockToken] };
      mockRepo.findById.mockResolvedValue(scene);
      await expect(
        service.removeToken('scene1', 'tok1', 'otherUser', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertCanManage('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Step 2: Spusť testy — ověř že failují**

```bash
cd backend && npx jest maps.service.spec.ts --no-coverage
```

Očekávaný výstup: `Cannot find module './maps.service'`

- [ ] **Step 3: Implementuj MapsService**

`backend/src/modules/maps/maps.service.ts`:
```typescript
import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { IMapsRepository } from './interfaces/maps-repository.interface';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { ICharactersRepository } from '../characters/interfaces/characters-repository.interface';
import type { MapScene, MapToken } from './interfaces/map-scene.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

export interface MoveTokenInput { id: string; q: number; r: number }

@Injectable()
export class MapsService {
  constructor(
    @Inject('IMapsRepository') private readonly repo: IMapsRepository,
    @Inject('IMapTemplatesRepository') private readonly templateRepo: IMapTemplatesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('ICharactersRepository') private readonly characterRepo: ICharactersRepository,
  ) {}

  async assertCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async findByWorld(worldId: string): Promise<MapScene[]> {
    return this.repo.findByWorld(worldId);
  }

  async findActive(worldId: string): Promise<MapScene> {
    const scene = await this.repo.findActiveByWorld(worldId);
    if (!scene) throw new NotFoundException('Žádná aktivní scéna');
    return scene;
  }

  async findById(id: string): Promise<MapScene> {
    const scene = await this.repo.findById(id);
    if (!scene) throw new NotFoundException('Scéna nenalezena');
    return this.enrichTokens(scene);
  }

  async create(dto: Partial<MapScene>, worldId: string): Promise<MapScene> {
    let data: Partial<MapScene> = { ...dto, worldId, isActive: false, isHidden: false, isLocked: false };

    if (dto.templateId) {
      const tpl = await this.templateRepo.findById(dto.templateId);
      if (tpl) {
        data = {
          ...data,
          config: tpl.config,
          npcTemplates: tpl.npcTemplates,
          tokens: tpl.tokens,
          effects: tpl.effects,
          fogEnabled: tpl.fogEnabled,
          revealedHexes: tpl.revealedHexes,
          activeSoundIds: tpl.activeSoundIds,
        };
      }
    }

    return this.repo.create(data);
  }

  async setActive(id: string, worldId: string): Promise<void> {
    const scene = await this.repo.findById(id);
    if (!scene) throw new NotFoundException('Scéna nenalezena');
    await this.repo.setActive(id, worldId);
  }

  async replace(id: string, dto: Partial<MapScene>): Promise<MapScene> {
    const scene = await this.repo.findById(id);
    if (!scene) throw new NotFoundException('Scéna nenalezena');
    const updated = await this.repo.replace(id, { ...dto, worldId: scene.worldId });
    return this.enrichTokens(updated!);
  }

  async moveToken(sceneId: string, dto: MoveTokenInput, userId: string, userRole: UserRole): Promise<MapToken> {
    const scene = await this.repo.findById(sceneId);
    if (!scene) throw new NotFoundException('Scéna nenalezena');

    const token = scene.tokens.find((t) => t.id === dto.id);
    if (!token) throw new NotFoundException('Token nenalezen');

    const isPj = userRole <= UserRole.PJ;
    if (!isPj && token.characterId !== userId) throw new ForbiddenException('Nelze pohybovat cizím tokenem');

    token.q = dto.q;
    token.r = dto.r;
    await this.repo.replace(sceneId, scene);
    return token;
  }

  async removeToken(sceneId: string, tokenId: string, userId: string, userRole: UserRole): Promise<void> {
    const scene = await this.repo.findById(sceneId);
    if (!scene) throw new NotFoundException('Scéna nenalezena');

    const token = scene.tokens.find((t) => t.id === tokenId);
    if (!token) throw new NotFoundException('Token nenalezen');

    const isPj = userRole <= UserRole.PJ;
    if (!isPj && token.characterId !== userId) throw new ForbiddenException('Nelze odstranit cizí token');

    scene.tokens = scene.tokens.filter((t) => t.id !== tokenId);
    await this.repo.replace(sceneId, scene);
  }

  async deleteScene(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Scéna nenalezena');
  }

  private async enrichTokens(scene: MapScene): Promise<MapScene> {
    const slugs = [...new Set(scene.tokens.filter((t) => t.characterSlug).map((t) => t.characterSlug))];
    if (slugs.length === 0) return scene;

    const characters = await Promise.all(
      slugs.map((slug) => this.characterRepo.findBySlugAndWorld(slug, scene.worldId)),
    );
    const charMap = new Map(
      characters
        .filter(Boolean)
        .map((c) => [c!.slug, { name: c!.name, imageUrl: c!.imageUrl, diaryData: c!.diaryData }]),
    );

    return {
      ...scene,
      tokens: scene.tokens.map((t) => ({
        ...t,
        characterData: charMap.get(t.characterSlug),
      })),
    };
  }
}
```

- [ ] **Step 4: Spusť testy — ověř že procházejí**

```bash
cd backend && npx jest maps.service.spec.ts --no-coverage
```

Očekávaný výstup: `Tests: X passed`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/maps/maps.service.ts backend/src/modules/maps/maps.service.spec.ts
git commit -m "feat(maps): přidat MapsService s enrichmentem postav"
```

---

## Task 5: Controllers

**Files:**
- Create: `backend/src/modules/maps/maps.controller.ts`
- Create: `backend/src/modules/maps/map-templates.controller.ts`

- [ ] **Step 1: Implementuj MapsController**

`backend/src/modules/maps/maps.controller.ts`:
```typescript
import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Query, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { MapsService } from './maps.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateMapDto } from './dto/create-map.dto';
import { MoveTokenDto } from './dto/move-token.dto';
import { RemoveTokenDto } from './dto/remove-token.dto';

interface RequestUser { id: string; role: UserRole }

@Controller('maps')
export class MapsController {
  constructor(private readonly service: MapsService) {}

  @Get()
  findByWorld(@Query('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @Get('active')
  findActive(@Query('worldId') worldId: string) {
    return this.service.findActive(worldId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateMapDto, @CurrentUser() user: RequestUser) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.create(dto, worldId);
  }

  @Post(':id/active')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async setActive(
    @Param('id') id: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    await this.service.setActive(id, worldId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async replace(
    @Param('id') id: string,
    @Body() dto: CreateMapDto,
    @CurrentUser() user: RequestUser,
  ) {
    const worldId = dto.worldId ?? '';
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.replace(id, dto);
  }

  @Patch(':id/move-token')
  @UseGuards(JwtAuthGuard)
  moveToken(
    @Param('id') sceneId: string,
    @Body() dto: MoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.moveToken(sceneId, dto, user.id, user.role);
  }

  @Patch(':id/remove-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async removeToken(
    @Param('id') sceneId: string,
    @Body() dto: RemoveTokenDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.removeToken(sceneId, dto.tokenId, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(@Param('id') id: string, @Query('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    await this.service.deleteScene(id);
  }
}
```

- [ ] **Step 2: Implementuj MapTemplatesController**

`backend/src/modules/maps/map-templates.controller.ts`:
```typescript
import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode, NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { MapTemplateSchemaClass } from './schemas/map-template.schema';
import { MapsService } from './maps.service';
import type { IMapTemplatesRepository } from './interfaces/map-templates-repository.interface';
import { Inject } from '@nestjs/common';

interface RequestUser { id: string; role: UserRole }

@Controller('map-templates')
export class MapTemplatesController {
  constructor(
    @Inject('IMapTemplatesRepository') private readonly repo: IMapTemplatesRepository,
    private readonly mapsService: MapsService,
  ) {}

  @Get()
  findAll() {
    return this.repo.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const tpl = await this.repo.findById(id);
    if (!tpl) throw new NotFoundException('Šablona nenalezena');
    return tpl;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: Record<string, unknown>, @CurrentUser() user: RequestUser) {
    if (user.role > UserRole.PJ) throw new NotFoundException('Nedostatečná oprávnění');
    return this.repo.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async replace(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role > UserRole.PJ) throw new NotFoundException('Nedostatečná oprávnění');
    await this.repo.replace(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    if (user.role > UserRole.PJ) throw new NotFoundException('Nedostatečná oprávnění');
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundException('Šablona nenalezena');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/maps/maps.controller.ts backend/src/modules/maps/map-templates.controller.ts
git commit -m "feat(maps): přidat MapsController a MapTemplatesController"
```

---

## Task 6: MapsGateway

**Files:**
- Create: `backend/src/modules/maps/maps.gateway.ts`

- [ ] **Step 1: Implementuj MapsGateway**

`backend/src/modules/maps/maps.gateway.ts`:
```typescript
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class MapsGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('map:join')
  handleJoin(@MessageBody() sceneId: string, @ConnectedSocket() client: Socket): void {
    client.join(sceneId);
  }

  @SubscribeMessage('map:leave')
  handleLeave(@MessageBody() sceneId: string, @ConnectedSocket() client: Socket): void {
    client.leave(sceneId);
  }

  @SubscribeMessage('map:token-moved')
  handleTokenMoved(@MessageBody() payload: { sceneId: string; token: unknown }, @ConnectedSocket() client: Socket): void {
    client.to(payload.sceneId).emit('map:token-moved', payload.token);
  }

  @SubscribeMessage('map:config-updated')
  handleConfigUpdated(@MessageBody() payload: { sceneId: string; config: unknown }, @ConnectedSocket() client: Socket): void {
    client.to(payload.sceneId).emit('map:config-updated', payload.config);
  }

  @SubscribeMessage('map:token-removed')
  handleTokenRemoved(@MessageBody() payload: { sceneId: string; tokenId: string }, @ConnectedSocket() client: Socket): void {
    client.to(payload.sceneId).emit('map:token-removed', payload.tokenId);
  }

  @SubscribeMessage('map:reload-scene')
  handleReloadScene(@MessageBody() payload: { sceneId: string; scene: unknown }, @ConnectedSocket() client: Socket): void {
    client.to(payload.sceneId).emit('map:scene-reloaded', payload.scene);
  }

  @SubscribeMessage('map:scene-cleared')
  handleSceneCleared(@MessageBody() sceneId: string, @ConnectedSocket() client: Socket): void {
    client.to(sceneId).emit('map:scene-cleared');
  }

  @SubscribeMessage('map:ping')
  handlePing(
    @MessageBody() payload: { sceneId: string; x: number; y: number; userName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:pinged', payload.x, payload.y, payload.userName);
  }

  @SubscribeMessage('map:effect-added')
  handleEffectAdded(@MessageBody() payload: { sceneId: string; effect: unknown }, @ConnectedSocket() client: Socket): void {
    client.to(payload.sceneId).emit('map:effect-added', payload.effect);
  }

  @SubscribeMessage('map:effect-removed')
  handleEffectRemoved(@MessageBody() payload: { sceneId: string; effectId: string }, @ConnectedSocket() client: Socket): void {
    client.to(payload.sceneId).emit('map:effect-removed', payload.effectId);
  }

  @SubscribeMessage('map:fog-updated')
  handleFogUpdated(
    @MessageBody() payload: { sceneId: string; fogEnabled: boolean; revealedHexes: unknown[] },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:fog-updated', payload.fogEnabled, payload.revealedHexes);
  }

  @SubscribeMessage('map:dice-rolled')
  handleDiceRolled(@MessageBody() payload: { sceneId: string; [key: string]: unknown }): void {
    // Broadcast všem včetně odesílatele
    const { sceneId, ...rest } = payload;
    this.server.to(sceneId).emit('map:dice-rolled', rest);
  }

  @SubscribeMessage('map:scene-state-changed')
  handleSceneStateChanged(
    @MessageBody() payload: { sceneId: string; isHidden: boolean; isLocked: boolean },
    @ConnectedSocket() client: Socket,
  ): void {
    client.to(payload.sceneId).emit('map:scene-state-changed', payload.isHidden, payload.isLocked);
  }

  @SubscribeMessage('map:sound-changed')
  handleSoundChanged(@MessageBody() payload: { sceneId: string; soundIds: string[] }, @ConnectedSocket() client: Socket): void {
    client.to(payload.sceneId).emit('map:sound-changed', payload.soundIds);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/maps/maps.gateway.ts
git commit -m "feat(maps): přidat MapsGateway (Socket.io relay)"
```

---

## Task 7: MapsModule + AppModule

**Files:**
- Create: `backend/src/modules/maps/maps.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř MapsModule**

`backend/src/modules/maps/maps.module.ts`:
```typescript
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
})
export class MapsModule {}
```

- [ ] **Step 2: Zaregistruj MapsModule v AppModule**

V `backend/src/app.module.ts` přidej import:
```typescript
import { MapsModule } from './modules/maps/maps.module';
```

A do `imports` pole přidej `MapsModule`:
```typescript
imports: [
  // ... existující moduly ...
  UniverseModule,
  MapsModule,   // ← přidat
  GatewaysModule,
],
```

- [ ] **Step 3: Spusť build — ověř že kompiluje**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby

- [ ] **Step 4: Spusť testy**

```bash
cd backend && npx jest maps --no-coverage
```

Očekávaný výstup: všechny testy prochází

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/maps/maps.module.ts backend/src/app.module.ts
git commit -m "feat(maps): registrovat MapsModule v AppModule"
```

---

## Task 8: NpcTemplates — globální bestiář

Rozšíříme existující NpcTemplates modul: nullable `worldId`, pole `movement` + `initiativeBase`, endpoint `/global` a `/import`.

**Files:**
- Modify: `backend/src/modules/npc-templates/schemas/npc-template.schema.ts`
- Modify: `backend/src/modules/npc-templates/interfaces/npc-template.interface.ts`
- Modify: `backend/src/modules/npc-templates/interfaces/npc-templates-repository.interface.ts`
- Modify: `backend/src/modules/npc-templates/repositories/npc-templates.repository.ts`
- Modify: `backend/src/modules/npc-templates/npc-templates.service.ts`
- Modify: `backend/src/modules/npc-templates/npc-templates.service.spec.ts`
- Modify: `backend/src/modules/npc-templates/npc-templates.controller.ts`

- [ ] **Step 1: Napiš failing testy pro nové metody**

Do `backend/src/modules/npc-templates/npc-templates.service.spec.ts` přidej na konec (před poslední `}`):

```typescript
  describe('findGlobal', () => {
    it('vrátí globální šablony (worldId = null)', async () => {
      const globalTpl = { ...mockTemplate, worldId: null };
      mockRepo.findGlobal.mockResolvedValue([globalTpl]);
      const result = await service.findGlobal();
      expect(result).toHaveLength(1);
      expect(mockRepo.findGlobal).toHaveBeenCalled();
    });
  });

  describe('importToWorld', () => {
    it('zkopíruje globální šablonu do světa s originTemplateId', async () => {
      const globalTpl = { ...mockTemplate, id: 'global1', worldId: null };
      mockRepo.findById.mockResolvedValue(globalTpl);
      mockRepo.create.mockResolvedValue({ ...mockTemplate, id: 'new1', worldId: 'world1' });
      const result = await service.importToWorld('global1', 'world1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          originTemplateId: 'global1',
          name: 'Goblin',
        }),
      );
      expect(result.worldId).toBe('world1');
    });

    it('vyhodí NotFoundException pokud globální šablona neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.importToWorld('bad', 'world1')).rejects.toThrow(NotFoundException);
    });
  });
```

Uprav také `mockRepo` v `beforeEach` bloku — přidej `findGlobal`:
```typescript
  const mockRepo = {
    findByWorld: jest.fn(),
    findGlobal: jest.fn(),  // ← přidat
    findById: jest.fn(),
    create: jest.fn(),
    updateByIdAndWorld: jest.fn(),
    deleteByIdAndWorld: jest.fn(),
  };
```

- [ ] **Step 2: Spusť testy — ověř že failují**

```bash
cd backend && npx jest npc-templates.service.spec.ts --no-coverage
```

Očekávaný výstup: `service.findGlobal is not a function`

- [ ] **Step 3: Uprav NpcTemplate schema**

`backend/src/modules/npc-templates/schemas/npc-template.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NpcTemplateDocument = HydratedDocument<NpcTemplateSchemaClass>;

@Schema({ timestamps: true, collection: 'npcTemplates' })
export class NpcTemplateSchemaClass {
  @Prop({ required: false, default: null }) worldId: string | null;  // null = globální bestiář
  @Prop({ required: true }) name: string;
  @Prop() imageUrl?: string;
  @Prop({ default: '' }) notes: string;
  @Prop({ default: 5 }) maxHp: number;
  @Prop({ default: 0 }) armor: number;
  @Prop({ default: 0 }) injury: number;
  @Prop({ default: 5 }) movement: number;
  @Prop({ default: 0 }) initiativeBase: number;
  @Prop({ type: [Object], default: [] }) abilities: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) diarySchema: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) diaryData: Record<string, unknown>;
}

export const NpcTemplateSchema = SchemaFactory.createForClass(NpcTemplateSchemaClass);
NpcTemplateSchema.index({ worldId: 1 });
```

- [ ] **Step 4: Uprav NpcTemplate interface**

`backend/src/modules/npc-templates/interfaces/npc-template.interface.ts`:
```typescript
import type { TagValue, SchemaBlock } from '../../characters/interfaces/character.interface';

export interface NpcTemplate {
  id: string;
  worldId: string | null;   // null = globální bestiář
  name: string;
  imageUrl?: string;
  notes: string;
  maxHp: number;
  armor: number;
  injury: number;
  movement: number;
  initiativeBase: number;
  abilities: TagValue[];
  diarySchema: SchemaBlock[];
  diaryData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 5: Uprav repository interface**

`backend/src/modules/npc-templates/interfaces/npc-templates-repository.interface.ts`:
```typescript
import type { NpcTemplate } from './npc-template.interface';

export interface INpcTemplatesRepository {
  findByWorld(worldId: string): Promise<NpcTemplate[]>;
  findGlobal(): Promise<NpcTemplate[]>;
  findById(id: string): Promise<NpcTemplate | null>;
  create(data: Partial<NpcTemplate>): Promise<NpcTemplate>;
  updateByIdAndWorld(id: string, worldId: string, data: Partial<NpcTemplate>): Promise<NpcTemplate | null>;
  deleteByIdAndWorld(id: string, worldId: string): Promise<boolean>;
}
```

- [ ] **Step 6: Uprav repository implementaci**

V `backend/src/modules/npc-templates/repositories/npc-templates.repository.ts`:

Přidej `findGlobal` metodu po `findByWorld`:
```typescript
  async findGlobal(): Promise<NpcTemplate[]> {
    const docs = await this.model.find({ worldId: null }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }
```

Uprav `toEntity` — přidej `movement` a `initiativeBase`:
```typescript
  protected toEntity(doc: Record<string, unknown>): NpcTemplate {
    return {
      id: String(doc._id),
      worldId: (doc.worldId as string | null) ?? null,
      name: (doc.name as string) ?? '',
      imageUrl: doc.imageUrl as string | undefined,
      notes: (doc.notes as string) ?? '',
      maxHp: (doc.maxHp as number) ?? 5,
      armor: (doc.armor as number) ?? 0,
      injury: (doc.injury as number) ?? 0,
      movement: (doc.movement as number) ?? 5,
      initiativeBase: (doc.initiativeBase as number) ?? 0,
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
```

- [ ] **Step 7: Uprav NpcTemplatesService**

Na konci `backend/src/modules/npc-templates/npc-templates.service.ts` přidej:
```typescript
  async findGlobal(): Promise<NpcTemplate[]> {
    return this.repo.findGlobal();
  }

  async importToWorld(templateId: string, worldId: string): Promise<NpcTemplate> {
    const tpl = await this.repo.findById(templateId);
    if (!tpl) throw new NotFoundException('Globální šablona nenalezena');
    return this.repo.create({
      worldId,
      originTemplateId: templateId,
      name: tpl.name,
      imageUrl: tpl.imageUrl,
      notes: tpl.notes,
      maxHp: tpl.maxHp,
      armor: tpl.armor,
      injury: tpl.injury,
      movement: tpl.movement,
      initiativeBase: tpl.initiativeBase,
      abilities: tpl.abilities,
      diarySchema: tpl.diarySchema,
      diaryData: tpl.diaryData,
    } as Partial<NpcTemplate>);
  }
```

Přidej `originTemplateId?: string` do `CreateNpcTemplateInput` interface na začátku souboru:
```typescript
export interface CreateNpcTemplateInput {
  originTemplateId?: string;  // ← přidat
  name: string;
  // ... zbytek beze změny
}
```

- [ ] **Step 8: Spusť testy — ověř že procházejí**

```bash
cd backend && npx jest npc-templates.service.spec.ts --no-coverage
```

Očekávaný výstup: všechny testy prochází

- [ ] **Step 9: Uprav NpcTemplatesController — přidej /global a /:id/import**

Na konec `backend/src/modules/npc-templates/npc-templates.controller.ts` před uzavírací `}` přidej:
```typescript
  @Get('global')
  @UseGuards(JwtAuthGuard)
  findGlobal() {
    return this.service.findGlobal();
  }

  @Post(':id/import')
  @UseGuards(JwtAuthGuard)
  async importToWorld(
    @Param('worldId') worldId: string,
    @Param('id') templateId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManage(user.id, user.role, worldId);
    return this.service.importToWorld(templateId, worldId);
  }
```

> **Pozor:** route `/global` musí být v controlleru PŘED `/:id`, jinak NestJS interpretuje `global` jako `:id`. Přesuň `@Get('global')` před `@Get(':id')` pokud není.

- [ ] **Step 10: Spusť build**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/npc-templates/
git commit -m "feat(npc-templates): přidat globální bestiář, movement, initiativeBase a import endpoint"
```

---

## Task 9: Finální ověření

- [ ] **Step 1: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: všechny testy prochází, žádné nové failing testy

- [ ] **Step 2: Spusť TypeScript build**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(8a): taktická mapa — finální ověření a cleanup"
```

---

## Checklist pokrytí spec požadavků

| Požadavek ze spec | Task |
|-------------------|------|
| MapScene schema s folder, templateId | Task 1 |
| MapToken s q/r, characterData enrichment | Task 1, Task 4 |
| MapSceneNpc s originTemplateId | Task 1 |
| MapTemplate schema | Task 1 |
| IMapsRepository + implementace | Task 2 |
| SetActive deaktivuje ostatní scény | Task 2, Task 4 |
| IMapTemplatesRepository + implementace | Task 2 |
| DTOs | Task 3 |
| MapsService CRUD | Task 4 |
| Token enrichment z Characters | Task 4 |
| MoveToken autorizace (hráč jen svůj) | Task 4 |
| RemoveToken autorizace | Task 4 |
| Init scény z MapTemplate | Task 4 |
| GET /api/maps, /active, /:id | Task 5 |
| POST, PUT, DELETE /api/maps | Task 5 |
| PATCH move-token, remove-token | Task 5 |
| GET/POST/PUT/DELETE /api/map-templates | Task 5 |
| MapsGateway — všechny eventy | Task 6 |
| DiceRolled → broadcast včetně odesílatele | Task 6 |
| MapsModule + AppModule registrace | Task 7 |
| NpcTemplate worldId nullable | Task 8 |
| NpcTemplate movement + initiativeBase | Task 8 |
| GET /npc-templates/global | Task 8 |
| POST /npc-templates/:id/import | Task 8 |
