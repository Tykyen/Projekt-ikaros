# Krok 12b — Sound Database — Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit `SoundsModule` s per-world a globální databází zvuků, schvalovacím workflow pro nominace a integrací s taktickou mapou.

**Architecture:** Jedna kolekce `sounds` s nullable `worldId` (null = globální pool). Vzor identický s `NpcTemplatesModule` — sdílený repozitář, dva controllery (globální + world-scoped). Globální zvuky mají `status` field (active/pending/rejected) pro schvalovací workflow.

**Tech Stack:** NestJS, Mongoose, class-validator, Jest

---

## Přehled souborů

**Vytvořit:**
- `backend/src/modules/sounds/schemas/sound.schema.ts`
- `backend/src/modules/sounds/interfaces/sound.interface.ts`
- `backend/src/modules/sounds/interfaces/sounds-repository.interface.ts`
- `backend/src/modules/sounds/repositories/sounds.repository.ts`
- `backend/src/modules/sounds/dto/create-sound.dto.ts`
- `backend/src/modules/sounds/dto/update-sound.dto.ts`
- `backend/src/modules/sounds/dto/reject-sound.dto.ts`
- `backend/src/modules/sounds/sounds.service.ts`
- `backend/src/modules/sounds/sounds.service.spec.ts`
- `backend/src/modules/sounds/sounds.controller.ts`
- `backend/src/modules/sounds/world-sounds.controller.ts`
- `backend/src/modules/sounds/sounds.module.ts`

**Upravit:**
- `backend/src/app.module.ts` — registrace SoundsModule

---

## Task 1: Schema, Interface, Repository Interface

**Files:**
- Create: `backend/src/modules/sounds/schemas/sound.schema.ts`
- Create: `backend/src/modules/sounds/interfaces/sound.interface.ts`
- Create: `backend/src/modules/sounds/interfaces/sounds-repository.interface.ts`

- [ ] **Krok 1: Vytvoř `sound.schema.ts`**

```typescript
// backend/src/modules/sounds/schemas/sound.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SoundDocument = HydratedDocument<SoundSchemaClass>;

export enum SoundMediaType { music = 'music', ambient = 'ambient', sfx = 'sfx', signal = 'signal', voice = 'voice' }
export enum SoundPrimaryFunction { safe = 'safe', social = 'social', exploration = 'exploration', tension = 'tension', threat = 'threat', combat = 'combat', ritual = 'ritual', horror = 'horror', revelation = 'revelation', aftermath = 'aftermath', transition = 'transition', system = 'system' }
export enum SoundEnvironment { neutral = 'neutral', nature = 'nature', urban = 'urban', interior = 'interior', industrial = 'industrial', military = 'military', sacral = 'sacral', arcane = 'arcane', digital = 'digital', alien = 'alien', ruin = 'ruin', void = 'void' }
export enum SoundEmotionalTone { calm = 'calm', wonder = 'wonder', melancholy = 'melancholy', mystery = 'mystery', dread = 'dread', fear = 'fear', urgency = 'urgency', aggression = 'aggression', grief = 'grief', awe = 'awe', faith = 'faith', corruption = 'corruption' }
export enum SoundOnsetProfile { instant = 'instant', fast = 'fast', soft = 'soft', slow = 'slow' }
export enum SoundOutroProfile { hard = 'hard', soft = 'soft', fade = 'fade', seamless = 'seamless' }
export enum SoundFactionStyle { civilian = 'civilian', noble = 'noble', religious = 'religious', military = 'military', corporate = 'corporate', criminal = 'criminal', tribal = 'tribal', arcane = 'arcane', alien = 'alien' }
export enum SoundTechLevel { preindustrial = 'preindustrial', industrial = 'industrial', modern = 'modern', advanced = 'advanced', posthuman = 'posthuman' }
export enum SoundMagicLevel { none = 'none', low = 'low', medium = 'medium', high = 'high', extreme = 'extreme' }
export enum SoundCombatEnergy { none = 'none', low = 'low', medium = 'medium', high = 'high' }
export type SoundStatus = 'active' | 'pending' | 'rejected';

@Schema({ timestamps: true, collection: 'sounds' })
export class SoundSchemaClass {
  @Prop({ required: false, default: null }) worldId: string | null;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) youtubeUrl: string;
  @Prop({ enum: SoundMediaType, default: SoundMediaType.music }) mediaType: SoundMediaType;
  @Prop({ enum: SoundPrimaryFunction, default: SoundPrimaryFunction.safe }) primaryFunction: SoundPrimaryFunction;
  @Prop({ enum: SoundEnvironment, default: SoundEnvironment.neutral }) environment: SoundEnvironment;
  @Prop({ enum: SoundEmotionalTone, default: SoundEmotionalTone.calm }) emotionalTone: SoundEmotionalTone;
  @Prop({ default: 1, min: 1, max: 5 }) intensity: number;
  @Prop({ default: 0 }) duration: number;
  @Prop({ default: true }) loop: boolean;
  @Prop({ enum: SoundOnsetProfile, default: SoundOnsetProfile.soft }) onsetProfile: SoundOnsetProfile;
  @Prop({ enum: SoundOutroProfile, default: SoundOutroProfile.fade }) outroProfile: SoundOutroProfile;
  @Prop({ enum: SoundFactionStyle, default: SoundFactionStyle.civilian }) factionStyle: SoundFactionStyle;
  @Prop({ enum: SoundTechLevel, default: SoundTechLevel.modern }) techLevel: SoundTechLevel;
  @Prop({ enum: SoundMagicLevel, default: SoundMagicLevel.none }) magicLevel: SoundMagicLevel;
  @Prop({ enum: SoundCombatEnergy, default: SoundCombatEnergy.none }) combatEnergy: SoundCombatEnergy;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: '' }) notes: string;
  @Prop({ default: 'active' }) status: SoundStatus;
  @Prop({ required: false, default: null }) proposedBy: string | null;
  @Prop({ required: false, default: null }) proposedByWorldId: string | null;
  @Prop({ required: false, default: null }) rejectReason: string | null;
  @Prop({ required: true }) createdBy: string;
}

export const SoundSchema = SchemaFactory.createForClass(SoundSchemaClass);
SoundSchema.index({ worldId: 1, name: 1 });
SoundSchema.index({ worldId: 1, mediaType: 1 });
SoundSchema.index({ status: 1 });
```

- [ ] **Krok 2: Vytvoř `sound.interface.ts`**

```typescript
// backend/src/modules/sounds/interfaces/sound.interface.ts
import type {
  SoundMediaType, SoundPrimaryFunction, SoundEnvironment, SoundEmotionalTone,
  SoundOnsetProfile, SoundOutroProfile, SoundFactionStyle, SoundTechLevel,
  SoundMagicLevel, SoundCombatEnergy, SoundStatus,
} from '../schemas/sound.schema';

export type { SoundMediaType, SoundPrimaryFunction, SoundEnvironment, SoundEmotionalTone, SoundOnsetProfile, SoundOutroProfile, SoundFactionStyle, SoundTechLevel, SoundMagicLevel, SoundCombatEnergy, SoundStatus };

export interface Sound {
  id: string;
  worldId: string | null;
  name: string;
  youtubeUrl: string;
  mediaType: SoundMediaType;
  primaryFunction: SoundPrimaryFunction;
  environment: SoundEnvironment;
  emotionalTone: SoundEmotionalTone;
  intensity: number;
  duration: number;
  loop: boolean;
  onsetProfile: SoundOnsetProfile;
  outroProfile: SoundOutroProfile;
  factionStyle: SoundFactionStyle;
  techLevel: SoundTechLevel;
  magicLevel: SoundMagicLevel;
  combatEnergy: SoundCombatEnergy;
  tags: string[];
  notes: string;
  status: SoundStatus;
  proposedBy: string | null;
  proposedByWorldId: string | null;
  rejectReason: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 3: Vytvoř `sounds-repository.interface.ts`**

```typescript
// backend/src/modules/sounds/interfaces/sounds-repository.interface.ts
import type { Sound } from './sound.interface';

export interface ISoundsRepository {
  findByWorld(worldId: string): Promise<Sound[]>;
  findGlobal(): Promise<Sound[]>;
  findGlobalPending(): Promise<Sound[]>;
  findById(id: string): Promise<Sound | null>;
  findGlobalByUrlOrName(url: string, name: string): Promise<Sound | null>;
  create(data: Partial<Sound>): Promise<Sound>;
  updateById(id: string, data: Partial<Sound>): Promise<Sound | null>;
  updateByIdAndWorld(id: string, worldId: string, data: Partial<Sound>): Promise<Sound | null>;
  deleteById(id: string): Promise<boolean>;
  deleteByIdAndWorld(id: string, worldId: string): Promise<boolean>;
}
```

- [ ] **Krok 4: Commit**

```bash
git add backend/src/modules/sounds/schemas/sound.schema.ts backend/src/modules/sounds/interfaces/sound.interface.ts backend/src/modules/sounds/interfaces/sounds-repository.interface.ts
git commit -m "feat(sounds): schema, interface, repository interface"
```

---

## Task 2: Repository implementace

**Files:**
- Create: `backend/src/modules/sounds/repositories/sounds.repository.ts`

- [ ] **Krok 1: Vytvoř `sounds.repository.ts`**

```typescript
// backend/src/modules/sounds/repositories/sounds.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { SoundSchemaClass } from '../schemas/sound.schema';
import type { Sound, SoundMediaType, SoundPrimaryFunction, SoundEnvironment, SoundEmotionalTone, SoundOnsetProfile, SoundOutroProfile, SoundFactionStyle, SoundTechLevel, SoundMagicLevel, SoundCombatEnergy, SoundStatus } from '../interfaces/sound.interface';
import type { ISoundsRepository } from '../interfaces/sounds-repository.interface';

@Injectable()
export class MongoSoundsRepository
  extends BaseMongoRepository<Sound>
  implements ISoundsRepository
{
  constructor(@InjectModel(SoundSchemaClass.name) model: Model<SoundSchemaClass>) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<Sound[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findGlobal(): Promise<Sound[]> {
    const docs = await this.model.find({ worldId: null, status: 'active' }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findGlobalPending(): Promise<Sound[]> {
    const docs = await this.model.find({ worldId: null, status: 'pending' }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findGlobalByUrlOrName(url: string, name: string): Promise<Sound | null> {
    const doc = await this.model
      .findOne({
        worldId: null,
        $or: [
          { youtubeUrl: url },
          { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        ],
      })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(data: Partial<Sound>): Promise<Sound> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async updateById(id: string, data: Partial<Sound>): Promise<Sound | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async updateByIdAndWorld(id: string, worldId: string, data: Partial<Sound>): Promise<Sound | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOneAndUpdate({ _id: id, worldId }, { $set: data as Record<string, unknown> }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async deleteByIdAndWorld(id: string, worldId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findOneAndDelete({ _id: id, worldId }).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): Sound {
    return {
      id: String(doc._id),
      worldId: (doc.worldId as string | null) ?? null,
      name: (doc.name as string) ?? '',
      youtubeUrl: (doc.youtubeUrl as string) ?? '',
      mediaType: (doc.mediaType as SoundMediaType) ?? 'music',
      primaryFunction: (doc.primaryFunction as SoundPrimaryFunction) ?? 'safe',
      environment: (doc.environment as SoundEnvironment) ?? 'neutral',
      emotionalTone: (doc.emotionalTone as SoundEmotionalTone) ?? 'calm',
      intensity: (doc.intensity as number) ?? 1,
      duration: (doc.duration as number) ?? 0,
      loop: (doc.loop as boolean) ?? true,
      onsetProfile: (doc.onsetProfile as SoundOnsetProfile) ?? 'soft',
      outroProfile: (doc.outroProfile as SoundOutroProfile) ?? 'fade',
      factionStyle: (doc.factionStyle as SoundFactionStyle) ?? 'civilian',
      techLevel: (doc.techLevel as SoundTechLevel) ?? 'modern',
      magicLevel: (doc.magicLevel as SoundMagicLevel) ?? 'none',
      combatEnergy: (doc.combatEnergy as SoundCombatEnergy) ?? 'none',
      tags: (doc.tags as string[]) ?? [],
      notes: (doc.notes as string) ?? '',
      status: (doc.status as SoundStatus) ?? 'active',
      proposedBy: (doc.proposedBy as string | null) ?? null,
      proposedByWorldId: (doc.proposedByWorldId as string | null) ?? null,
      rejectReason: (doc.rejectReason as string | null) ?? null,
      createdBy: (doc.createdBy as string) ?? '',
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Krok 2: Commit**

```bash
git add backend/src/modules/sounds/repositories/sounds.repository.ts
git commit -m "feat(sounds): MongoDB repository implementace"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/sounds/dto/create-sound.dto.ts`
- Create: `backend/src/modules/sounds/dto/update-sound.dto.ts`
- Create: `backend/src/modules/sounds/dto/reject-sound.dto.ts`

- [ ] **Krok 1: Vytvoř `create-sound.dto.ts`**

```typescript
// backend/src/modules/sounds/dto/create-sound.dto.ts
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { SoundMediaType, SoundPrimaryFunction, SoundEnvironment, SoundEmotionalTone, SoundOnsetProfile, SoundOutroProfile, SoundFactionStyle, SoundTechLevel, SoundMagicLevel, SoundCombatEnergy } from '../schemas/sound.schema';

export class CreateSoundDto {
  @IsString() name: string;
  @IsString() youtubeUrl: string;
  @IsOptional() @IsEnum(SoundMediaType) mediaType?: SoundMediaType;
  @IsOptional() @IsEnum(SoundPrimaryFunction) primaryFunction?: SoundPrimaryFunction;
  @IsOptional() @IsEnum(SoundEnvironment) environment?: SoundEnvironment;
  @IsOptional() @IsEnum(SoundEmotionalTone) emotionalTone?: SoundEmotionalTone;
  @IsOptional() @IsNumber() @Min(1) @Max(5) intensity?: number;
  @IsOptional() @IsNumber() @Min(0) duration?: number;
  @IsOptional() @IsBoolean() loop?: boolean;
  @IsOptional() @IsEnum(SoundOnsetProfile) onsetProfile?: SoundOnsetProfile;
  @IsOptional() @IsEnum(SoundOutroProfile) outroProfile?: SoundOutroProfile;
  @IsOptional() @IsEnum(SoundFactionStyle) factionStyle?: SoundFactionStyle;
  @IsOptional() @IsEnum(SoundTechLevel) techLevel?: SoundTechLevel;
  @IsOptional() @IsEnum(SoundMagicLevel) magicLevel?: SoundMagicLevel;
  @IsOptional() @IsEnum(SoundCombatEnergy) combatEnergy?: SoundCombatEnergy;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}
```

- [ ] **Krok 2: Vytvoř `update-sound.dto.ts`**

```typescript
// backend/src/modules/sounds/dto/update-sound.dto.ts
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { SoundMediaType, SoundPrimaryFunction, SoundEnvironment, SoundEmotionalTone, SoundOnsetProfile, SoundOutroProfile, SoundFactionStyle, SoundTechLevel, SoundMagicLevel, SoundCombatEnergy } from '../schemas/sound.schema';

export class UpdateSoundDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() youtubeUrl?: string;
  @IsOptional() @IsEnum(SoundMediaType) mediaType?: SoundMediaType;
  @IsOptional() @IsEnum(SoundPrimaryFunction) primaryFunction?: SoundPrimaryFunction;
  @IsOptional() @IsEnum(SoundEnvironment) environment?: SoundEnvironment;
  @IsOptional() @IsEnum(SoundEmotionalTone) emotionalTone?: SoundEmotionalTone;
  @IsOptional() @IsNumber() @Min(1) @Max(5) intensity?: number;
  @IsOptional() @IsNumber() @Min(0) duration?: number;
  @IsOptional() @IsBoolean() loop?: boolean;
  @IsOptional() @IsEnum(SoundOnsetProfile) onsetProfile?: SoundOnsetProfile;
  @IsOptional() @IsEnum(SoundOutroProfile) outroProfile?: SoundOutroProfile;
  @IsOptional() @IsEnum(SoundFactionStyle) factionStyle?: SoundFactionStyle;
  @IsOptional() @IsEnum(SoundTechLevel) techLevel?: SoundTechLevel;
  @IsOptional() @IsEnum(SoundMagicLevel) magicLevel?: SoundMagicLevel;
  @IsOptional() @IsEnum(SoundCombatEnergy) combatEnergy?: SoundCombatEnergy;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}
```

- [ ] **Krok 3: Vytvoř `reject-sound.dto.ts`**

```typescript
// backend/src/modules/sounds/dto/reject-sound.dto.ts
import { IsString } from 'class-validator';

export class RejectSoundDto {
  @IsString() reason: string;
}
```

- [ ] **Krok 4: Commit**

```bash
git add backend/src/modules/sounds/dto/
git commit -m "feat(sounds): DTOs (create, update, reject)"
```

---

## Task 4: Service — testy (TDD)

**Files:**
- Create: `backend/src/modules/sounds/sounds.service.spec.ts`

- [ ] **Krok 1: Napiš failing testy pro `SoundsService`**

```typescript
// backend/src/modules/sounds/sounds.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { SoundsService } from './sounds.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { SoundMediaType, SoundPrimaryFunction, SoundEnvironment, SoundEmotionalTone, SoundOnsetProfile, SoundOutroProfile, SoundFactionStyle, SoundTechLevel, SoundMagicLevel, SoundCombatEnergy } from './schemas/sound.schema';

const makeSound = (overrides = {}) => ({
  id: 'sound1',
  worldId: 'world1',
  name: 'Dark Ambient',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  mediaType: SoundMediaType.ambient,
  primaryFunction: SoundPrimaryFunction.tension,
  environment: SoundEnvironment.interior,
  emotionalTone: SoundEmotionalTone.dread,
  intensity: 3,
  duration: 180,
  loop: true,
  onsetProfile: SoundOnsetProfile.soft,
  outroProfile: SoundOutroProfile.fade,
  factionStyle: SoundFactionStyle.civilian,
  techLevel: SoundTechLevel.modern,
  magicLevel: SoundMagicLevel.none,
  combatEnergy: SoundCombatEnergy.none,
  tags: ['dark', 'ambient'],
  notes: '',
  status: 'active' as const,
  proposedBy: null,
  proposedByWorldId: null,
  rejectReason: null,
  createdBy: 'user1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('SoundsService', () => {
  let service: SoundsService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findGlobal: jest.fn(),
    findGlobalPending: jest.fn(),
    findById: jest.fn(),
    findGlobalByUrlOrName: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    updateByIdAndWorld: jest.fn(),
    deleteById: jest.fn(),
    deleteByIdAndWorld: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SoundsService,
        { provide: 'ISoundsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(SoundsService);
  });

  describe('findByWorld', () => {
    it('vrátí zvuky daného světa', async () => {
      mockRepo.findByWorld.mockResolvedValue([makeSound()]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });
  });

  describe('findGlobal', () => {
    it('vrátí approved globální zvuky', async () => {
      const global = makeSound({ worldId: null });
      mockRepo.findGlobal.mockResolvedValue([global]);
      const result = await service.findGlobal();
      expect(result).toHaveLength(1);
    });
  });

  describe('findGlobalPending', () => {
    it('vrátí pending nominations', async () => {
      const pending = makeSound({ worldId: null, status: 'pending' });
      mockRepo.findGlobalPending.mockResolvedValue([pending]);
      const result = await service.findGlobalPending();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('vrátí zvuk pokud patří světu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound());
      const result = await service.findOne('sound1', 'world1');
      expect(result.name).toBe('Dark Ambient');
    });

    it('vyhodí NotFoundException pokud zvuk neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findOne('sound1', 'world1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí NotFoundException pokud zvuk patří jinému světu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world2' }));
      await expect(service.findOne('sound1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findGlobalById', () => {
    it('vrátí globální zvuk dle id', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null }));
      const result = await service.findGlobalById('sound1');
      expect(result.worldId).toBeNull();
    });

    it('vyhodí NotFoundException pokud zvuk není globální', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world1' }));
      await expect(service.findGlobalById('sound1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createWorldSound', () => {
    it('přidá zvuk do světa se správným worldId a createdBy', async () => {
      mockRepo.create.mockResolvedValue(makeSound());
      await service.createWorldSound({ name: 'Dark Ambient', youtubeUrl: 'https://youtube.com/watch?v=abc' }, 'world1', 'user1');
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ worldId: 'world1', createdBy: 'user1', status: 'active' }));
    });
  });

  describe('createGlobalSound', () => {
    it('přidá zvuk přímo do globálního poolu jako active', async () => {
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeSound({ worldId: null, status: 'active' }));
      await service.createGlobalSound({ name: 'Dark Ambient', youtubeUrl: 'https://youtube.com/watch?v=abc' }, 'admin1');
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ worldId: null, status: 'active' }));
    });

    it('vyhodí ConflictException pokud duplicitní URL nebo název', async () => {
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(makeSound({ worldId: null }));
      await expect(
        service.createGlobalSound({ name: 'Dark Ambient', youtubeUrl: 'https://youtube.com/watch?v=abc' }, 'admin1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('nominateToGlobal', () => {
    it('vytvoří pending nomination z world zvuku', async () => {
      mockRepo.findById.mockResolvedValue(makeSound());
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeSound({ worldId: null, status: 'pending' }));
      await service.nominateToGlobal('sound1', 'world1', 'pj1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: null, status: 'pending', proposedBy: 'pj1', proposedByWorldId: 'world1' }),
      );
    });

    it('vyhodí NotFoundException pokud zvuk nepatří světu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world2' }));
      await expect(service.nominateToGlobal('sound1', 'world1', 'pj1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ConflictException při duplicitní URL v globálním poolu', async () => {
      mockRepo.findById.mockResolvedValue(makeSound());
      mockRepo.findGlobalByUrlOrName.mockResolvedValue(makeSound({ worldId: null }));
      await expect(service.nominateToGlobal('sound1', 'world1', 'pj1')).rejects.toThrow(ConflictException);
    });
  });

  describe('approveNomination', () => {
    it('nastaví status=active', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null, status: 'pending' }));
      mockRepo.updateById.mockResolvedValue(makeSound({ worldId: null, status: 'active' }));
      const result = await service.approveNomination('sound1');
      expect(mockRepo.updateById).toHaveBeenCalledWith('sound1', { status: 'active', rejectReason: null });
      expect(result.status).toBe('active');
    });

    it('vyhodí NotFoundException pokud zvuk není pending globální', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null, status: 'active' }));
      await expect(service.approveNomination('sound1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectNomination', () => {
    it('nastaví status=rejected s důvodem', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null, status: 'pending' }));
      mockRepo.updateById.mockResolvedValue(makeSound({ worldId: null, status: 'rejected', rejectReason: 'Duplicita' }));
      await service.rejectNomination('sound1', 'Duplicita');
      expect(mockRepo.updateById).toHaveBeenCalledWith('sound1', { status: 'rejected', rejectReason: 'Duplicita' });
    });

    it('vyhodí NotFoundException pokud zvuk není pending', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null, status: 'active' }));
      await expect(service.rejectNomination('sound1', 'důvod')).rejects.toThrow(NotFoundException);
    });
  });

  describe('importToWorld', () => {
    it('zkopíruje globální zvuk do světa s novým worldId', async () => {
      const globalSound = makeSound({ worldId: null, status: 'active' });
      mockRepo.findById.mockResolvedValue(globalSound);
      mockRepo.create.mockResolvedValue(makeSound({ id: 'new1', worldId: 'world1' }));
      const result = await service.importToWorld('sound1', 'world1', 'pj1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', name: 'Dark Ambient', status: 'active', createdBy: 'pj1' }),
      );
      expect(result.worldId).toBe('world1');
    });

    it('vyhodí NotFoundException pokud globální zvuk neexistuje nebo není active', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null, status: 'pending' }));
      await expect(service.importToWorld('sound1', 'world1', 'pj1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateWorldSound', () => {
    it('aktualizuje zvuk světa', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue(makeSound({ name: 'Updated' }));
      const result = await service.updateWorldSound('sound1', 'world1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('vyhodí NotFoundException pokud vrátí null', async () => {
      mockRepo.updateByIdAndWorld.mockResolvedValue(null);
      await expect(service.updateWorldSound('sound1', 'world1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateGlobalSound', () => {
    it('aktualizuje globální zvuk dle id', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null }));
      mockRepo.updateById.mockResolvedValue(makeSound({ worldId: null, name: 'Updated' }));
      const result = await service.updateGlobalSound('sound1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('vyhodí NotFoundException pokud zvuk není globální', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world1' }));
      await expect(service.updateGlobalSound('sound1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeWorldSound', () => {
    it('smaže world zvuk', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(true);
      await expect(service.removeWorldSound('sound1', 'world1')).resolves.toBeUndefined();
    });

    it('vyhodí NotFoundException pokud zvuk neexistuje', async () => {
      mockRepo.deleteByIdAndWorld.mockResolvedValue(false);
      await expect(service.removeWorldSound('sound1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeGlobalSound', () => {
    it('smaže globální zvuk', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: null }));
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(service.removeGlobalSound('sound1')).resolves.toBeUndefined();
    });

    it('vyhodí NotFoundException pokud zvuk není globální', async () => {
      mockRepo.findById.mockResolvedValue(makeSound({ worldId: 'world1' }));
      await expect(service.removeGlobalSound('sound1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanManageWorld', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertCanManageWorld('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PJ daného světa', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertCanManageWorld('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('propustí PomocnýPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PomocnyPJ });
      await expect(service.assertCanManageWorld('ppj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne hráče s ForbiddenException', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertCanManageWorld('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertIsAdmin', () => {
    it('propustí Admina', async () => {
      await expect(service.assertIsAdmin(UserRole.Admin)).resolves.toBeUndefined();
    });

    it('propustí Superadmina', async () => {
      await expect(service.assertIsAdmin(UserRole.Superadmin)).resolves.toBeUndefined();
    });

    it('odmítne PJ s ForbiddenException', async () => {
      await expect(service.assertIsAdmin(UserRole.PJ)).rejects.toThrow(ForbiddenException);
    });
  });
});
```

- [ ] **Krok 2: Spusť testy — musí selhat (service neexistuje)**

```bash
cd backend && npx jest sounds.service.spec.ts --no-coverage 2>&1 | tail -5
```

Očekávej: `Cannot find module './sounds.service'`

- [ ] **Krok 3: Commit testů**

```bash
git add backend/src/modules/sounds/sounds.service.spec.ts
git commit -m "test(sounds): failing testy pro SoundsService (TDD)"
```

---

## Task 5: Service — implementace

**Files:**
- Create: `backend/src/modules/sounds/sounds.service.ts`

- [ ] **Krok 1: Vytvoř `sounds.service.ts`**

```typescript
// backend/src/modules/sounds/sounds.service.ts
import { Injectable, Inject, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import type { ISoundsRepository } from './interfaces/sounds-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { Sound } from './interfaces/sound.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateSoundDto } from './dto/create-sound.dto';
import type { UpdateSoundDto } from './dto/update-sound.dto';

@Injectable()
export class SoundsService {
  constructor(
    @Inject('ISoundsRepository') private readonly repo: ISoundsRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async assertCanManageWorld(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PomocnyPJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }

  async assertIsAdmin(userRole: UserRole): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    throw new ForbiddenException('Pouze Admin nebo Superadmin');
  }

  async findByWorld(worldId: string): Promise<Sound[]> {
    return this.repo.findByWorld(worldId);
  }

  async findGlobal(): Promise<Sound[]> {
    return this.repo.findGlobal();
  }

  async findGlobalPending(): Promise<Sound[]> {
    return this.repo.findGlobalPending();
  }

  async findOne(id: string, worldId: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== worldId) throw new NotFoundException('Zvuk nenalezen');
    return sound;
  }

  async findGlobalById(id: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null) throw new NotFoundException('Globální zvuk nenalezen');
    return sound;
  }

  async createWorldSound(dto: CreateSoundDto, worldId: string, userId: string): Promise<Sound> {
    return this.repo.create({
      ...dto,
      worldId,
      status: 'active',
      createdBy: userId,
      proposedBy: null,
      proposedByWorldId: null,
      rejectReason: null,
    });
  }

  async createGlobalSound(dto: CreateSoundDto, userId: string): Promise<Sound> {
    const duplicate = await this.repo.findGlobalByUrlOrName(dto.youtubeUrl, dto.name);
    if (duplicate) throw new ConflictException(`Duplicitní zvuk: ${duplicate.name} (${duplicate.id})`);
    return this.repo.create({
      ...dto,
      worldId: null,
      status: 'active',
      createdBy: userId,
      proposedBy: null,
      proposedByWorldId: null,
      rejectReason: null,
    });
  }

  async nominateToGlobal(soundId: string, worldId: string, userId: string): Promise<Sound> {
    const sound = await this.repo.findById(soundId);
    if (!sound || sound.worldId !== worldId) throw new NotFoundException('Zvuk nenalezen');
    const duplicate = await this.repo.findGlobalByUrlOrName(sound.youtubeUrl, sound.name);
    if (duplicate) throw new ConflictException(`Duplicitní zvuk v globální DB: ${duplicate.name} (${duplicate.id})`);
    return this.repo.create({
      worldId: null,
      name: sound.name,
      youtubeUrl: sound.youtubeUrl,
      mediaType: sound.mediaType,
      primaryFunction: sound.primaryFunction,
      environment: sound.environment,
      emotionalTone: sound.emotionalTone,
      intensity: sound.intensity,
      duration: sound.duration,
      loop: sound.loop,
      onsetProfile: sound.onsetProfile,
      outroProfile: sound.outroProfile,
      factionStyle: sound.factionStyle,
      techLevel: sound.techLevel,
      magicLevel: sound.magicLevel,
      combatEnergy: sound.combatEnergy,
      tags: sound.tags,
      notes: sound.notes,
      status: 'pending',
      proposedBy: userId,
      proposedByWorldId: worldId,
      createdBy: userId,
      rejectReason: null,
    });
  }

  async approveNomination(id: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null || sound.status !== 'pending') throw new NotFoundException('Pending nomination nenalezena');
    const updated = await this.repo.updateById(id, { status: 'active', rejectReason: null });
    return updated!;
  }

  async rejectNomination(id: string, reason: string): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null || sound.status !== 'pending') throw new NotFoundException('Pending nomination nenalezena');
    const updated = await this.repo.updateById(id, { status: 'rejected', rejectReason: reason });
    return updated!;
  }

  async importToWorld(globalSoundId: string, worldId: string, userId: string): Promise<Sound> {
    const sound = await this.repo.findById(globalSoundId);
    if (!sound || sound.worldId !== null || sound.status !== 'active') throw new NotFoundException('Globální zvuk nenalezen nebo není schválen');
    return this.repo.create({
      worldId,
      name: sound.name,
      youtubeUrl: sound.youtubeUrl,
      mediaType: sound.mediaType,
      primaryFunction: sound.primaryFunction,
      environment: sound.environment,
      emotionalTone: sound.emotionalTone,
      intensity: sound.intensity,
      duration: sound.duration,
      loop: sound.loop,
      onsetProfile: sound.onsetProfile,
      outroProfile: sound.outroProfile,
      factionStyle: sound.factionStyle,
      techLevel: sound.techLevel,
      magicLevel: sound.magicLevel,
      combatEnergy: sound.combatEnergy,
      tags: sound.tags,
      notes: sound.notes,
      status: 'active',
      proposedBy: null,
      proposedByWorldId: null,
      rejectReason: null,
      createdBy: userId,
    });
  }

  async updateWorldSound(id: string, worldId: string, dto: UpdateSoundDto): Promise<Sound> {
    const updated = await this.repo.updateByIdAndWorld(id, worldId, dto as Partial<Sound>);
    if (!updated) throw new NotFoundException('Zvuk nenalezen');
    return updated;
  }

  async updateGlobalSound(id: string, dto: UpdateSoundDto): Promise<Sound> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null) throw new NotFoundException('Globální zvuk nenalezen');
    const updated = await this.repo.updateById(id, dto as Partial<Sound>);
    return updated!;
  }

  async removeWorldSound(id: string, worldId: string): Promise<void> {
    const deleted = await this.repo.deleteByIdAndWorld(id, worldId);
    if (!deleted) throw new NotFoundException('Zvuk nenalezen');
  }

  async removeGlobalSound(id: string): Promise<void> {
    const sound = await this.repo.findById(id);
    if (!sound || sound.worldId !== null) throw new NotFoundException('Globální zvuk nenalezen');
    await this.repo.deleteById(id);
  }
}
```

- [ ] **Krok 2: Spusť testy — musí projít**

```bash
cd backend && npx jest sounds.service.spec.ts --no-coverage 2>&1 | tail -10
```

Očekávej: `Tests: XX passed`

- [ ] **Krok 3: Commit**

```bash
git add backend/src/modules/sounds/sounds.service.ts
git commit -m "feat(sounds): SoundsService implementace"
```

---

## Task 6: Controllery

**Files:**
- Create: `backend/src/modules/sounds/sounds.controller.ts`
- Create: `backend/src/modules/sounds/world-sounds.controller.ts`

- [ ] **Krok 1: Vytvoř `sounds.controller.ts` (globální pool)**

```typescript
// backend/src/modules/sounds/sounds.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { SoundsService } from './sounds.service';
import { CreateSoundDto } from './dto/create-sound.dto';
import { UpdateSoundDto } from './dto/update-sound.dto';
import { RejectSoundDto } from './dto/reject-sound.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole; username: string }

@Controller('sounds')
@UseGuards(JwtAuthGuard)
export class SoundsController {
  constructor(private readonly service: SoundsService) {}

  @Get()
  findAll() {
    return this.service.findGlobal();
  }

  @Get('pending')
  async getPending(@CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.findGlobalPending();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findGlobalById(id);
  }

  @Post()
  async create(@Body() dto: CreateSoundDto, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.createGlobalSound(dto, user.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSoundDto, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.updateGlobalSound(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.removeGlobalSound(id);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.approveNomination(id);
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectSoundDto, @CurrentUser() user: RequestUser) {
    await this.service.assertIsAdmin(user.role);
    return this.service.rejectNomination(id, dto.reason);
  }
}
```

- [ ] **Krok 2: Vytvoř `world-sounds.controller.ts`**

```typescript
// backend/src/modules/sounds/world-sounds.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { SoundsService } from './sounds.service';
import { CreateSoundDto } from './dto/create-sound.dto';
import { UpdateSoundDto } from './dto/update-sound.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; role: UserRole; username: string }

@Controller('worlds/:worldId/sounds')
@UseGuards(JwtAuthGuard)
export class WorldSoundsController {
  constructor(private readonly service: SoundsService) {}

  @Get()
  findAll(@Param('worldId') worldId: string) {
    return this.service.findByWorld(worldId);
  }

  @Post()
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateSoundDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.createWorldSound(dto, worldId, user.id);
  }

  @Put(':id')
  async update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSoundDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.updateWorldSound(id, worldId, dto);
  }

  @Delete(':id')
  async remove(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.removeWorldSound(id, worldId);
  }

  @Post(':id/nominate')
  async nominate(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.nominateToGlobal(id, worldId, user.id);
  }

  @Post('import/:globalId')
  async importGlobal(
    @Param('worldId') worldId: string,
    @Param('globalId') globalId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertCanManageWorld(user.id, user.role, worldId);
    return this.service.importToWorld(globalId, worldId, user.id);
  }
}
```

- [ ] **Krok 3: Commit**

```bash
git add backend/src/modules/sounds/sounds.controller.ts backend/src/modules/sounds/world-sounds.controller.ts
git commit -m "feat(sounds): SoundsController a WorldSoundsController"
```

---

## Task 7: Module + registrace v AppModule

**Files:**
- Create: `backend/src/modules/sounds/sounds.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Krok 1: Vytvoř `sounds.module.ts`**

```typescript
// backend/src/modules/sounds/sounds.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SoundSchemaClass, SoundSchema } from './schemas/sound.schema';
import { MongoSoundsRepository } from './repositories/sounds.repository';
import { SoundsService } from './sounds.service';
import { SoundsController } from './sounds.controller';
import { WorldSoundsController } from './world-sounds.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SoundSchemaClass.name, schema: SoundSchema }]),
    WorldsModule,
  ],
  controllers: [SoundsController, WorldSoundsController],
  providers: [
    SoundsService,
    { provide: 'ISoundsRepository', useClass: MongoSoundsRepository },
  ],
  exports: [SoundsService],
})
export class SoundsModule {}
```

- [ ] **Krok 2: Zaregistruj `SoundsModule` v `app.module.ts`**

Do `backend/src/app.module.ts` přidej:

```typescript
// přidej import na začátek
import { SoundsModule } from './modules/sounds/sounds.module';

// přidej do imports[] pole (za ImagesModule):
SoundsModule,
```

- [ ] **Krok 3: Spusť build — musí projít bez chyb**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Očekávej: žádný výstup (0 chyb)

- [ ] **Krok 4: Spusť všechny testy — nesmí nic rozbít**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -15
```

Očekávej: všechny testy `passed`

- [ ] **Krok 5: Commit**

```bash
git add backend/src/modules/sounds/sounds.module.ts backend/src/app.module.ts
git commit -m "feat(sounds): SoundsModule registrace, krok 12b kompletní"
```

---

## Self-review

**Spec coverage:**
- ✅ Schema s všemi enumy — Task 1
- ✅ ISoundsRepository s findGlobalByUrlOrName — Task 1
- ✅ MongoDB repository — Task 2
- ✅ Deduplicita (URL + name case-insensitive) — Task 2, Task 5
- ✅ Globální CRUD + approve/reject — Task 5, Task 6
- ✅ Per-world CRUD + nominate + import — Task 5, Task 6
- ✅ assertCanManageWorld (PJ/PomocnýPJ) — Task 5
- ✅ assertIsAdmin (Admin/Superadmin) — Task 5
- ✅ MapHub — `map:sound-changed` event již existuje v MapsGateway, activeSoundIds na MapScene schema — žádná změna potřeba
- ✅ Module + AppModule registrace — Task 7

**Placeholder scan:** Žádné TBD ani TODO.

**Type consistency:** `CreateSoundDto`, `UpdateSoundDto`, `Sound` interface, `ISoundsRepository` — konzistentní napříč tasky.
