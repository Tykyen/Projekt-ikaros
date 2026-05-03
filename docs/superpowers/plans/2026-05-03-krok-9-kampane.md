# Krok 9 — Kampaně: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat GM kampaňový modul — pavučina vztahů, příběhové linky, scénáře, poznámky, obchod + auditní changelog.

**Architecture:** Jeden NestJS modul `campaign` s 7 Mongoose kolekcemi, repository pattern (interface + Mongo implementace), jedna service, jeden controller. Přístup řeší `resolveScope` dle WorldRole. ChangeLog se zapisuje fire-and-forget po každé mutaci.

**Tech Stack:** NestJS, Mongoose, MongoDB compound indexes + TTL index, class-validator DTOs, JwtAuthGuard, @CurrentUser decorator.

---

## Soubory

**Vytvořit:**
```
backend/src/modules/campaign/
├── campaign.module.ts
├── campaign.controller.ts
├── campaign.service.ts
├── campaign.service.spec.ts
├── schemas/
│   ├── campaign-subject.schema.ts
│   ├── campaign-relationship.schema.ts
│   ├── campaign-storyline.schema.ts
│   ├── campaign-scenario.schema.ts
│   ├── campaign-quick-note.schema.ts
│   ├── campaign-shop-item.schema.ts
│   └── campaign-change-log.schema.ts
├── interfaces/
│   ├── campaign-subject.interface.ts
│   ├── campaign-relationship.interface.ts
│   ├── campaign-storyline.interface.ts
│   ├── campaign-scenario.interface.ts
│   ├── campaign-quick-note.interface.ts
│   ├── campaign-shop-item.interface.ts
│   ├── campaign-change-log.interface.ts
│   ├── campaign-subject-repository.interface.ts
│   ├── campaign-relationship-repository.interface.ts
│   ├── campaign-storyline-repository.interface.ts
│   ├── campaign-scenario-repository.interface.ts
│   ├── campaign-quick-note-repository.interface.ts
│   ├── campaign-shop-item-repository.interface.ts
│   └── campaign-change-log-repository.interface.ts
├── repositories/
│   ├── campaign-subject.repository.ts
│   ├── campaign-relationship.repository.ts
│   ├── campaign-storyline.repository.ts
│   ├── campaign-scenario.repository.ts
│   ├── campaign-quick-note.repository.ts
│   ├── campaign-shop-item.repository.ts
│   └── campaign-change-log.repository.ts
└── dto/
    ├── create-campaign-subject.dto.ts
    ├── create-campaign-relationship.dto.ts
    ├── create-campaign-storyline.dto.ts
    ├── create-campaign-scenario.dto.ts
    ├── create-campaign-quick-note.dto.ts
    └── create-campaign-shop-item.dto.ts
```

**Upravit:**
- `backend/src/app.module.ts` — přidat `CampaignModule`

---

## Task 1: Entity interfaces

**Files:**
- Create: `backend/src/modules/campaign/interfaces/campaign-subject.interface.ts`
- Create: `backend/src/modules/campaign/interfaces/campaign-relationship.interface.ts`
- Create: `backend/src/modules/campaign/interfaces/campaign-storyline.interface.ts`
- Create: `backend/src/modules/campaign/interfaces/campaign-scenario.interface.ts`
- Create: `backend/src/modules/campaign/interfaces/campaign-quick-note.interface.ts`
- Create: `backend/src/modules/campaign/interfaces/campaign-shop-item.interface.ts`
- Create: `backend/src/modules/campaign/interfaces/campaign-change-log.interface.ts`

- [ ] **Krok 1: Napsat campaign-subject.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-subject.interface.ts
export type CampaignSubjectType = 'PC' | 'NPC' | 'LOCATION' | 'ORG' | 'FACTION';
export type CampaignSubjectStatus = 'active' | 'archived';

export interface CampaignSubject {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  type: CampaignSubjectType;
  name: string;
  avatarUrl?: string;
  tags: string[];
  status: CampaignSubjectStatus;
  linkedPageSlug?: string;
  linkedCharacterSlug?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 2: Napsat campaign-relationship.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-relationship.interface.ts
export type CampaignRelationshipStatus = 'active' | 'dormant' | 'crisis' | 'closed';

export interface RelationshipShared {
  whatHappened?: string;
  behindTheScenes?: string;
}

export interface RelationshipSide {
  tone?: string;
  behavior?: string;
  gmIntent?: string;
  strength: number;
}

export interface CampaignRelationship {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  subjectAId: string;
  subjectBId: string;
  shared: RelationshipShared;
  sideA: RelationshipSide;
  sideB: RelationshipSide;
  status: CampaignRelationshipStatus;
  priority: number;
  storylineIds: string[];
  lastChangeNote?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 3: Napsat campaign-storyline.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-storyline.interface.ts
export type CampaignStorylineLevel = 'macro' | 'mid' | 'micro';
export type CampaignStorylineStatus = 'active' | 'dormant' | 'escalating' | 'climax' | 'closed';

export interface CampaignStoryline {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  level: CampaignStorylineLevel;
  title: string;
  status: CampaignStorylineStatus;
  phase?: string;
  summary?: string;
  whatHappened?: string;
  truth?: string;
  playersBelief?: string;
  gmIntent?: string;
  nextStep?: string;
  subjectIds: string[];
  relationshipIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 4: Napsat campaign-scenario.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-scenario.interface.ts
export interface CampaignScenario {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  title: string;
  contentData?: Record<string, unknown>;
  order: number;
  linkedPageSlug?: string;
  subjectIds: string[];
  storylineIds: string[];
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 5: Napsat campaign-quick-note.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-quick-note.interface.ts
export type CampaignQuickNoteStatus = 'open' | 'done';

export interface CampaignQuickNote {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  title: string;
  body?: string;
  status: CampaignQuickNoteStatus;
  pinned: boolean;
  subjectIds: string[];
  storylineIds: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 6: Napsat campaign-shop-item.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-shop-item.interface.ts
export interface CampaignShopItem {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  name: string;
  description?: string;
  group: string;
  subgroup?: string;
  price: number;
  currencyCode: string;
  linkedItemIds: string[];
  referenceLink?: string;
  isRecommended: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 7: Napsat campaign-change-log.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-change-log.interface.ts
export type CampaignEntityType = 'subject' | 'relationship' | 'storyline' | 'scenario' | 'quicknote' | 'shopitem';
export type CampaignChangeType = 'created' | 'updated' | 'deleted';

export interface CampaignChangeLog {
  id: string;
  worldId: string;
  ownerId: string;
  isShared: boolean;
  entityType: CampaignEntityType;
  entityId: string;
  entityName: string;
  changeType: CampaignChangeType;
  changedByUserId: string;
  changedByName: string;
  changedAt: Date;
}
```

- [ ] **Krok 8: Commit**

```bash
git add backend/src/modules/campaign/interfaces/
git commit -m "feat(campaign): přidat entity interfaces"
```

---

## Task 2: Repository interfaces

**Files:**
- Create: všechny `*-repository.interface.ts` v `interfaces/`

- [ ] **Krok 1: Napsat campaign-subject-repository.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-subject-repository.interface.ts
import type { CampaignSubject } from './campaign-subject.interface';

export interface ICampaignSubjectRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignSubject[]>;
  findById(id: string): Promise<CampaignSubject | null>;
  create(data: Partial<CampaignSubject>): Promise<CampaignSubject>;
  update(id: string, data: Partial<CampaignSubject>): Promise<CampaignSubject | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Krok 2: Napsat campaign-relationship-repository.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-relationship-repository.interface.ts
import type { CampaignRelationship } from './campaign-relationship.interface';

export interface ICampaignRelationshipRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignRelationship[]>;
  findById(id: string): Promise<CampaignRelationship | null>;
  create(data: Partial<CampaignRelationship>): Promise<CampaignRelationship>;
  update(id: string, data: Partial<CampaignRelationship>): Promise<CampaignRelationship | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Krok 3: Napsat campaign-storyline-repository.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-storyline-repository.interface.ts
import type { CampaignStoryline } from './campaign-storyline.interface';

export interface ICampaignStorylineRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignStoryline[]>;
  findById(id: string): Promise<CampaignStoryline | null>;
  create(data: Partial<CampaignStoryline>): Promise<CampaignStoryline>;
  update(id: string, data: Partial<CampaignStoryline>): Promise<CampaignStoryline | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Krok 4: Napsat campaign-scenario-repository.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-scenario-repository.interface.ts
import type { CampaignScenario } from './campaign-scenario.interface';

export interface ICampaignScenarioRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignScenario[]>;
  findById(id: string): Promise<CampaignScenario | null>;
  create(data: Partial<CampaignScenario>): Promise<CampaignScenario>;
  update(id: string, data: Partial<CampaignScenario>): Promise<CampaignScenario | null>;
  delete(id: string): Promise<boolean>;
  maxOrder(filter: Record<string, unknown>): Promise<number>;
}
```

- [ ] **Krok 5: Napsat campaign-quick-note-repository.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-quick-note-repository.interface.ts
import type { CampaignQuickNote } from './campaign-quick-note.interface';

export interface ICampaignQuickNoteRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignQuickNote[]>;
  findById(id: string): Promise<CampaignQuickNote | null>;
  create(data: Partial<CampaignQuickNote>): Promise<CampaignQuickNote>;
  update(id: string, data: Partial<CampaignQuickNote>): Promise<CampaignQuickNote | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Krok 6: Napsat campaign-shop-item-repository.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-shop-item-repository.interface.ts
import type { CampaignShopItem } from './campaign-shop-item.interface';

export interface ICampaignShopItemRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<CampaignShopItem[]>;
  findById(id: string): Promise<CampaignShopItem | null>;
  create(data: Partial<CampaignShopItem>): Promise<CampaignShopItem>;
  update(id: string, data: Partial<CampaignShopItem>): Promise<CampaignShopItem | null>;
  delete(id: string): Promise<boolean>;
  pullLinkedItem(worldId: string, deletedId: string): Promise<void>;
}
```

- [ ] **Krok 7: Napsat campaign-change-log-repository.interface.ts**

```typescript
// backend/src/modules/campaign/interfaces/campaign-change-log-repository.interface.ts
import type { CampaignChangeLog } from './campaign-change-log.interface';

export interface ICampaignChangeLogRepository {
  append(entry: Omit<CampaignChangeLog, 'id'>): Promise<void>;
  findMany(filter: Record<string, unknown>, limit: number): Promise<CampaignChangeLog[]>;
}
```

- [ ] **Krok 8: Commit**

```bash
git add backend/src/modules/campaign/interfaces/
git commit -m "feat(campaign): přidat repository interfaces"
```

---

## Task 3: Mongoose schemas

**Files:**
- Create: všechny soubory v `schemas/`

- [ ] **Krok 1: Napsat campaign-subject.schema.ts**

```typescript
// backend/src/modules/campaign/schemas/campaign-subject.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignSubjectDocument = HydratedDocument<CampaignSubjectSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignSubjects' })
export class CampaignSubjectSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ default: 'NPC' }) type: string;
  @Prop({ required: true }) name: string;
  @Prop() avatarUrl?: string;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: 'active' }) status: string;
  @Prop() linkedPageSlug?: string;
  @Prop() linkedCharacterSlug?: string;
  @Prop() notes?: string;
}

export const CampaignSubjectSchema = SchemaFactory.createForClass(CampaignSubjectSchemaClass);
CampaignSubjectSchema.index({ worldId: 1, ownerId: 1 });
CampaignSubjectSchema.index({ worldId: 1, isShared: 1 });
CampaignSubjectSchema.index({ worldId: 1, updatedAt: -1 });
```

- [ ] **Krok 2: Napsat campaign-relationship.schema.ts**

```typescript
// backend/src/modules/campaign/schemas/campaign-relationship.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignRelationshipDocument = HydratedDocument<CampaignRelationshipSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignRelationships' })
export class CampaignRelationshipSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) subjectAId: string;
  @Prop({ required: true }) subjectBId: string;
  @Prop({ type: Object, default: {} }) shared: Record<string, unknown>;
  @Prop({ type: Object, default: { strength: 5 } }) sideA: Record<string, unknown>;
  @Prop({ type: Object, default: { strength: 5 } }) sideB: Record<string, unknown>;
  @Prop({ default: 'active' }) status: string;
  @Prop({ default: 3 }) priority: number;
  @Prop({ type: [String], default: [] }) storylineIds: string[];
  @Prop() lastChangeNote?: string;
}

export const CampaignRelationshipSchema = SchemaFactory.createForClass(CampaignRelationshipSchemaClass);
CampaignRelationshipSchema.index({ worldId: 1, ownerId: 1 });
CampaignRelationshipSchema.index({ worldId: 1, isShared: 1 });
CampaignRelationshipSchema.index({ worldId: 1, updatedAt: -1 });
CampaignRelationshipSchema.index({ worldId: 1, subjectAId: 1 });
CampaignRelationshipSchema.index({ worldId: 1, subjectBId: 1 });
```

- [ ] **Krok 3: Napsat campaign-storyline.schema.ts**

```typescript
// backend/src/modules/campaign/schemas/campaign-storyline.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignStorylineDocument = HydratedDocument<CampaignStorylineSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignStorylines' })
export class CampaignStorylineSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ default: 'mid' }) level: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: 'active' }) status: string;
  @Prop() phase?: string;
  @Prop() summary?: string;
  @Prop() whatHappened?: string;
  @Prop() truth?: string;
  @Prop() playersBelief?: string;
  @Prop() gmIntent?: string;
  @Prop() nextStep?: string;
  @Prop({ type: [String], default: [] }) subjectIds: string[];
  @Prop({ type: [String], default: [] }) relationshipIds: string[];
}

export const CampaignStorylineSchema = SchemaFactory.createForClass(CampaignStorylineSchemaClass);
CampaignStorylineSchema.index({ worldId: 1, ownerId: 1 });
CampaignStorylineSchema.index({ worldId: 1, isShared: 1 });
CampaignStorylineSchema.index({ worldId: 1, status: 1 });
CampaignStorylineSchema.index({ worldId: 1, updatedAt: -1 });
```

- [ ] **Krok 4: Napsat campaign-scenario.schema.ts**

```typescript
// backend/src/modules/campaign/schemas/campaign-scenario.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignScenarioDocument = HydratedDocument<CampaignScenarioSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignScenarios' })
export class CampaignScenarioSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) title: string;
  @Prop({ type: Object }) contentData?: Record<string, unknown>;
  @Prop({ default: 0 }) order: number;
  @Prop() linkedPageSlug?: string;
  @Prop({ type: [String], default: [] }) subjectIds: string[];
  @Prop({ type: [String], default: [] }) storylineIds: string[];
  @Prop({ type: [String], default: [] }) images: string[];
}

export const CampaignScenarioSchema = SchemaFactory.createForClass(CampaignScenarioSchemaClass);
CampaignScenarioSchema.index({ worldId: 1, ownerId: 1 });
CampaignScenarioSchema.index({ worldId: 1, isShared: 1 });
CampaignScenarioSchema.index({ worldId: 1, order: 1 });
CampaignScenarioSchema.index({ worldId: 1, updatedAt: -1 });
```

- [ ] **Krok 5: Napsat campaign-quick-note.schema.ts**

```typescript
// backend/src/modules/campaign/schemas/campaign-quick-note.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignQuickNoteDocument = HydratedDocument<CampaignQuickNoteSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignQuickNotes' })
export class CampaignQuickNoteSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) title: string;
  @Prop() body?: string;
  @Prop({ default: 'open' }) status: string;
  @Prop({ default: false }) pinned: boolean;
  @Prop({ type: [String], default: [] }) subjectIds: string[];
  @Prop({ type: [String], default: [] }) storylineIds: string[];
}

export const CampaignQuickNoteSchema = SchemaFactory.createForClass(CampaignQuickNoteSchemaClass);
CampaignQuickNoteSchema.index({ worldId: 1, ownerId: 1 });
CampaignQuickNoteSchema.index({ worldId: 1, isShared: 1 });
CampaignQuickNoteSchema.index({ worldId: 1, pinned: 1 });
CampaignQuickNoteSchema.index({ worldId: 1, updatedAt: -1 });
```

- [ ] **Krok 6: Napsat campaign-shop-item.schema.ts**

```typescript
// backend/src/modules/campaign/schemas/campaign-shop-item.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignShopItemDocument = HydratedDocument<CampaignShopItemSchemaClass>;

@Schema({ timestamps: true, collection: 'campaignShopItems' })
export class CampaignShopItemSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  @Prop({ required: true }) group: string;
  @Prop() subgroup?: string;
  @Prop({ default: 0 }) price: number;
  @Prop({ default: '' }) currencyCode: string;
  @Prop({ type: [String], default: [] }) linkedItemIds: string[];
  @Prop() referenceLink?: string;
  @Prop({ default: false }) isRecommended: boolean;
}

export const CampaignShopItemSchema = SchemaFactory.createForClass(CampaignShopItemSchemaClass);
CampaignShopItemSchema.index({ worldId: 1, ownerId: 1 });
CampaignShopItemSchema.index({ worldId: 1, isShared: 1 });
CampaignShopItemSchema.index({ worldId: 1, group: 1 });
CampaignShopItemSchema.index({ worldId: 1, updatedAt: -1 });
```

- [ ] **Krok 7: Napsat campaign-change-log.schema.ts**

```typescript
// backend/src/modules/campaign/schemas/campaign-change-log.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignChangeLogDocument = HydratedDocument<CampaignChangeLogSchemaClass>;

@Schema({ collection: 'campaignChangeLogs' })
export class CampaignChangeLogSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) ownerId: string;
  @Prop({ default: false }) isShared: boolean;
  @Prop({ required: true }) entityType: string;
  @Prop({ required: true }) entityId: string;
  @Prop({ required: true }) entityName: string;
  @Prop({ required: true }) changeType: string;
  @Prop({ required: true }) changedByUserId: string;
  @Prop({ required: true }) changedByName: string;
  @Prop({ default: () => new Date() }) changedAt: Date;
}

export const CampaignChangeLogSchema = SchemaFactory.createForClass(CampaignChangeLogSchemaClass);
CampaignChangeLogSchema.index({ worldId: 1, changedAt: -1 });
CampaignChangeLogSchema.index({ worldId: 1, isShared: 1, changedAt: -1 });
CampaignChangeLogSchema.index({ changedAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 dní TTL
```

- [ ] **Krok 8: Commit**

```bash
git add backend/src/modules/campaign/schemas/
git commit -m "feat(campaign): přidat Mongoose schemas"
```

---

## Task 4: Repository implementace

**Files:**
- Create: všechny soubory v `repositories/`

Vzorový pattern (podle `MongoNpcTemplatesRepository`):
- Extend `BaseMongoRepository<T>`
- `@InjectModel(SchemaClass.name)` v konstruktoru
- `toEntity(doc)` mapuje `_id` → `id`

- [ ] **Krok 1: Napsat campaign-subject.repository.ts**

```typescript
// backend/src/modules/campaign/repositories/campaign-subject.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignSubjectSchemaClass } from '../schemas/campaign-subject.schema';
import type { CampaignSubject } from '../interfaces/campaign-subject.interface';
import type { ICampaignSubjectRepository } from '../interfaces/campaign-subject-repository.interface';

@Injectable()
export class MongoCampaignSubjectRepository
  extends BaseMongoRepository<CampaignSubject>
  implements ICampaignSubjectRepository
{
  constructor(@InjectModel(CampaignSubjectSchemaClass.name) model: Model<CampaignSubjectSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { updatedAt: -1 }): Promise<CampaignSubject[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignSubject>): Promise<CampaignSubject> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignSubject>): Promise<CampaignSubject | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): CampaignSubject {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      type: (doc.type as CampaignSubject['type']) ?? 'NPC',
      name: doc.name as string,
      avatarUrl: doc.avatarUrl as string | undefined,
      tags: (doc.tags as string[]) ?? [],
      status: (doc.status as CampaignSubject['status']) ?? 'active',
      linkedPageSlug: doc.linkedPageSlug as string | undefined,
      linkedCharacterSlug: doc.linkedCharacterSlug as string | undefined,
      notes: doc.notes as string | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Krok 2: Napsat campaign-relationship.repository.ts**

```typescript
// backend/src/modules/campaign/repositories/campaign-relationship.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignRelationshipSchemaClass } from '../schemas/campaign-relationship.schema';
import type { CampaignRelationship } from '../interfaces/campaign-relationship.interface';
import type { ICampaignRelationshipRepository } from '../interfaces/campaign-relationship-repository.interface';

@Injectable()
export class MongoCampaignRelationshipRepository
  extends BaseMongoRepository<CampaignRelationship>
  implements ICampaignRelationshipRepository
{
  constructor(@InjectModel(CampaignRelationshipSchemaClass.name) model: Model<CampaignRelationshipSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { updatedAt: -1 }): Promise<CampaignRelationship[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignRelationship>): Promise<CampaignRelationship> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignRelationship>): Promise<CampaignRelationship | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): CampaignRelationship {
    const shared = (doc.shared as Record<string, unknown>) ?? {};
    const sideA = (doc.sideA as Record<string, unknown>) ?? {};
    const sideB = (doc.sideB as Record<string, unknown>) ?? {};
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      subjectAId: doc.subjectAId as string,
      subjectBId: doc.subjectBId as string,
      shared: { whatHappened: shared.whatHappened as string | undefined, behindTheScenes: shared.behindTheScenes as string | undefined },
      sideA: { tone: sideA.tone as string | undefined, behavior: sideA.behavior as string | undefined, gmIntent: sideA.gmIntent as string | undefined, strength: (sideA.strength as number) ?? 5 },
      sideB: { tone: sideB.tone as string | undefined, behavior: sideB.behavior as string | undefined, gmIntent: sideB.gmIntent as string | undefined, strength: (sideB.strength as number) ?? 5 },
      status: (doc.status as CampaignRelationship['status']) ?? 'active',
      priority: (doc.priority as number) ?? 3,
      storylineIds: (doc.storylineIds as string[]) ?? [],
      lastChangeNote: doc.lastChangeNote as string | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Krok 3: Napsat campaign-storyline.repository.ts**

```typescript
// backend/src/modules/campaign/repositories/campaign-storyline.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignStorylineSchemaClass } from '../schemas/campaign-storyline.schema';
import type { CampaignStoryline } from '../interfaces/campaign-storyline.interface';
import type { ICampaignStorylineRepository } from '../interfaces/campaign-storyline-repository.interface';

@Injectable()
export class MongoCampaignStorylineRepository
  extends BaseMongoRepository<CampaignStoryline>
  implements ICampaignStorylineRepository
{
  constructor(@InjectModel(CampaignStorylineSchemaClass.name) model: Model<CampaignStorylineSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { updatedAt: -1 }): Promise<CampaignStoryline[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignStoryline>): Promise<CampaignStoryline> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignStoryline>): Promise<CampaignStoryline | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): CampaignStoryline {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      level: (doc.level as CampaignStoryline['level']) ?? 'mid',
      title: doc.title as string,
      status: (doc.status as CampaignStoryline['status']) ?? 'active',
      phase: doc.phase as string | undefined,
      summary: doc.summary as string | undefined,
      whatHappened: doc.whatHappened as string | undefined,
      truth: doc.truth as string | undefined,
      playersBelief: doc.playersBelief as string | undefined,
      gmIntent: doc.gmIntent as string | undefined,
      nextStep: doc.nextStep as string | undefined,
      subjectIds: (doc.subjectIds as string[]) ?? [],
      relationshipIds: (doc.relationshipIds as string[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Krok 4: Napsat campaign-scenario.repository.ts**

```typescript
// backend/src/modules/campaign/repositories/campaign-scenario.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignScenarioSchemaClass } from '../schemas/campaign-scenario.schema';
import type { CampaignScenario } from '../interfaces/campaign-scenario.interface';
import type { ICampaignScenarioRepository } from '../interfaces/campaign-scenario-repository.interface';

@Injectable()
export class MongoCampaignScenarioRepository
  extends BaseMongoRepository<CampaignScenario>
  implements ICampaignScenarioRepository
{
  constructor(@InjectModel(CampaignScenarioSchemaClass.name) model: Model<CampaignScenarioSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { order: 1 }): Promise<CampaignScenario[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async maxOrder(filter: Record<string, unknown>): Promise<number> {
    const doc = await this.model.findOne(filter).sort({ order: -1 }).select('order').lean().exec();
    return doc ? (doc.order as number) ?? 0 : 0;
  }

  async create(data: Partial<CampaignScenario>): Promise<CampaignScenario> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignScenario>): Promise<CampaignScenario | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): CampaignScenario {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      title: doc.title as string,
      contentData: doc.contentData as Record<string, unknown> | undefined,
      order: (doc.order as number) ?? 0,
      linkedPageSlug: doc.linkedPageSlug as string | undefined,
      subjectIds: (doc.subjectIds as string[]) ?? [],
      storylineIds: (doc.storylineIds as string[]) ?? [],
      images: (doc.images as string[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Krok 5: Napsat campaign-quick-note.repository.ts**

```typescript
// backend/src/modules/campaign/repositories/campaign-quick-note.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignQuickNoteSchemaClass } from '../schemas/campaign-quick-note.schema';
import type { CampaignQuickNote } from '../interfaces/campaign-quick-note.interface';
import type { ICampaignQuickNoteRepository } from '../interfaces/campaign-quick-note-repository.interface';

@Injectable()
export class MongoCampaignQuickNoteRepository
  extends BaseMongoRepository<CampaignQuickNote>
  implements ICampaignQuickNoteRepository
{
  constructor(@InjectModel(CampaignQuickNoteSchemaClass.name) model: Model<CampaignQuickNoteSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { pinned: -1, updatedAt: -1 }): Promise<CampaignQuickNote[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignQuickNote>): Promise<CampaignQuickNote> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignQuickNote>): Promise<CampaignQuickNote | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): CampaignQuickNote {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      title: doc.title as string,
      body: doc.body as string | undefined,
      status: (doc.status as CampaignQuickNote['status']) ?? 'open',
      pinned: (doc.pinned as boolean) ?? false,
      subjectIds: (doc.subjectIds as string[]) ?? [],
      storylineIds: (doc.storylineIds as string[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Krok 6: Napsat campaign-shop-item.repository.ts**

```typescript
// backend/src/modules/campaign/repositories/campaign-shop-item.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignShopItemSchemaClass } from '../schemas/campaign-shop-item.schema';
import type { CampaignShopItem } from '../interfaces/campaign-shop-item.interface';
import type { ICampaignShopItemRepository } from '../interfaces/campaign-shop-item-repository.interface';

@Injectable()
export class MongoCampaignShopItemRepository
  extends BaseMongoRepository<CampaignShopItem>
  implements ICampaignShopItemRepository
{
  constructor(@InjectModel(CampaignShopItemSchemaClass.name) model: Model<CampaignShopItemSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { group: 1, updatedAt: -1 }): Promise<CampaignShopItem[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignShopItem>): Promise<CampaignShopItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignShopItem>): Promise<CampaignShopItem | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async pullLinkedItem(worldId: string, deletedId: string): Promise<void> {
    await this.model.updateMany(
      { worldId, linkedItemIds: deletedId },
      { $pull: { linkedItemIds: deletedId } },
    ).exec();
  }

  protected toEntity(doc: Record<string, unknown>): CampaignShopItem {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      name: doc.name as string,
      description: doc.description as string | undefined,
      group: (doc.group as string) ?? '',
      subgroup: doc.subgroup as string | undefined,
      price: (doc.price as number) ?? 0,
      currencyCode: (doc.currencyCode as string) ?? '',
      linkedItemIds: (doc.linkedItemIds as string[]) ?? [],
      referenceLink: doc.referenceLink as string | undefined,
      isRecommended: (doc.isRecommended as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Krok 7: Napsat campaign-change-log.repository.ts**

```typescript
// backend/src/modules/campaign/repositories/campaign-change-log.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CampaignChangeLogSchemaClass } from '../schemas/campaign-change-log.schema';
import type { CampaignChangeLog } from '../interfaces/campaign-change-log.interface';
import type { ICampaignChangeLogRepository } from '../interfaces/campaign-change-log-repository.interface';

const MAX_LOGS_PER_WORLD = 200;

@Injectable()
export class MongoCampaignChangeLogRepository implements ICampaignChangeLogRepository {
  constructor(@InjectModel(CampaignChangeLogSchemaClass.name) model: Model<CampaignChangeLogSchemaClass>) {
    this.model = model;
  }

  private readonly model: Model<CampaignChangeLogSchemaClass>;

  async append(entry: Omit<CampaignChangeLog, 'id'>): Promise<void> {
    await this.model.create(entry);
    const count = await this.model.countDocuments({ worldId: entry.worldId }).exec();
    if (count > MAX_LOGS_PER_WORLD) {
      const excess = count - MAX_LOGS_PER_WORLD;
      const oldest = await this.model
        .find({ worldId: entry.worldId })
        .sort({ changedAt: 1 })
        .limit(excess)
        .select('_id')
        .lean()
        .exec();
      const ids = oldest.map((d) => d._id);
      await this.model.deleteMany({ _id: { $in: ids } }).exec();
    }
  }

  async findMany(filter: Record<string, unknown>, limit: number): Promise<CampaignChangeLog[]> {
    const docs = await this.model.find(filter).sort({ changedAt: -1 }).limit(limit).lean().exec();
    return docs.map((doc) => ({
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      entityType: doc.entityType as CampaignChangeLog['entityType'],
      entityId: doc.entityId as string,
      entityName: doc.entityName as string,
      changeType: doc.changeType as CampaignChangeLog['changeType'],
      changedByUserId: doc.changedByUserId as string,
      changedByName: doc.changedByName as string,
      changedAt: doc.changedAt as Date,
    }));
  }
}
```

- [ ] **Krok 8: Commit**

```bash
git add backend/src/modules/campaign/repositories/
git commit -m "feat(campaign): přidat repository implementace"
```

---

## Task 5: Campaign service

**Files:**
- Create: `backend/src/modules/campaign/campaign.service.ts`

- [ ] **Krok 1: Napsat failing test pro resolveScope**

```typescript
// backend/src/modules/campaign/campaign.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockSubject = {
  id: 'sub1', worldId: 'w1', ownerId: 'user1', isShared: false,
  type: 'NPC' as const, name: 'Goblin', tags: [], status: 'active' as const,
  createdAt: new Date(), updatedAt: new Date(),
};

const mockSubjectShared = { ...mockSubject, id: 'sub2', isShared: true, ownerId: 'pj1' };

describe('CampaignService', () => {
  let service: CampaignService;

  const mockSubjectRepo = { findMany: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const mockRelRepo = { findMany: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const mockStorylineRepo = { findMany: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const mockScenarioRepo = { findMany: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), maxOrder: jest.fn() };
  const mockNoteRepo = { findMany: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
  const mockShopRepo = { findMany: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), pullLinkedItem: jest.fn() };
  const mockLogRepo = { append: jest.fn(), findMany: jest.fn() };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: 'ICampaignSubjectRepository', useValue: mockSubjectRepo },
        { provide: 'ICampaignRelationshipRepository', useValue: mockRelRepo },
        { provide: 'ICampaignStorylineRepository', useValue: mockStorylineRepo },
        { provide: 'ICampaignScenarioRepository', useValue: mockScenarioRepo },
        { provide: 'ICampaignQuickNoteRepository', useValue: mockNoteRepo },
        { provide: 'ICampaignShopItemRepository', useValue: mockShopRepo },
        { provide: 'ICampaignChangeLogRepository', useValue: mockLogRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(CampaignService);
  });

  describe('getWorldRole', () => {
    it('vrátí PJ pro admina bez DB dotazu', async () => {
      const role = await service.getWorldRole('admin1', UserRole.Admin, 'w1');
      expect(role).toBe(WorldRole.PJ);
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('vrátí WorldRole z membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PomocnyPJ });
      const role = await service.getWorldRole('user1', UserRole.Hrac, 'w1');
      expect(role).toBe(WorldRole.PomocnyPJ);
    });

    it('vrátí Hrac pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const role = await service.getWorldRole('user1', UserRole.Hrac, 'w1');
      expect(role).toBe(WorldRole.Hrac);
    });
  });

  describe('resolveScope', () => {
    it('Hráč vidí jen vlastní data', () => {
      const filter = service.resolveScope('user1', WorldRole.Hrac, 'w1');
      expect(filter).toEqual({ worldId: 'w1', ownerId: 'user1' });
    });

    it('PomocnýPJ vidí vlastní + sdílená', () => {
      const filter = service.resolveScope('pj2', WorldRole.PomocnyPJ, 'w1');
      expect(filter).toEqual({ worldId: 'w1', $or: [{ ownerId: 'pj2' }, { isShared: true }] });
    });

    it('PJ vidí vše ve světě', () => {
      const filter = service.resolveScope('pj1', WorldRole.PJ, 'w1');
      expect(filter).toEqual({ worldId: 'w1' });
    });
  });

  describe('canModify', () => {
    it('vlastník může modifikovat', () => {
      expect(service.canModify(mockSubject, 'user1', WorldRole.Hrac)).toBe(true);
    });

    it('cizí hráč nemůže modifikovat', () => {
      expect(service.canModify(mockSubject, 'user2', WorldRole.Hrac)).toBe(false);
    });

    it('PomocnýPJ může modifikovat sdílenou entitu', () => {
      expect(service.canModify(mockSubjectShared, 'pj2', WorldRole.PomocnyPJ)).toBe(true);
    });

    it('PomocnýPJ nemůže modifikovat cizí nesd\'ílený subjekt', () => {
      expect(service.canModify(mockSubject, 'pj2', WorldRole.PomocnyPJ)).toBe(false);
    });

    it('PJ může modifikovat cokoliv', () => {
      expect(service.canModify(mockSubject, 'pj1', WorldRole.PJ)).toBe(true);
    });
  });

  describe('subjects', () => {
    it('findSubjects volá repo s resolveScope filtrem', async () => {
      mockSubjectRepo.findMany.mockResolvedValue([mockSubject]);
      const result = await service.findSubjects('user1', WorldRole.Hrac, 'w1', {});
      expect(mockSubjectRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'w1', ownerId: 'user1' }),
      );
      expect(result).toHaveLength(1);
    });

    it('createSubject zapíše changelog', async () => {
      mockSubjectRepo.create.mockResolvedValue(mockSubject);
      await service.createSubject('user1', 'UserName', WorldRole.Hrac, 'w1', false, { name: 'Goblin', type: 'NPC' });
      expect(mockLogRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'created', entityType: 'subject', entityName: 'Goblin' }),
      );
    });

    it('deleteSubject vyhodí ForbiddenException pro cizího vlastníka', async () => {
      mockSubjectRepo.findById.mockResolvedValue(mockSubject);
      await expect(service.deleteSubject('sub1', 'user2', WorldRole.Hrac, 'user2Name')).rejects.toThrow(ForbiddenException);
    });

    it('deleteSubject vyhodí NotFoundException pokud subjekt neexistuje', async () => {
      mockSubjectRepo.findById.mockResolvedValue(null);
      await expect(service.deleteSubject('sub1', 'user1', WorldRole.PJ, 'pjName')).rejects.toThrow(NotFoundException);
    });
  });

  describe('shopitems cascade delete', () => {
    it('deleteShopItem volá pullLinkedItem pro kaskádové mazání', async () => {
      const mockItem = { ...mockSubject, id: 'item1', worldId: 'w1', name: 'Meč', group: 'zbrane' };
      mockShopRepo.findById.mockResolvedValue(mockItem);
      mockShopRepo.delete.mockResolvedValue(true);
      mockShopRepo.pullLinkedItem.mockResolvedValue(undefined);
      await service.deleteShopItem('item1', 'user1', WorldRole.PJ, 'pjName');
      expect(mockShopRepo.pullLinkedItem).toHaveBeenCalledWith('w1', 'item1');
    });
  });

  describe('changelog', () => {
    it('PJ dostane všechny záznamy světa', async () => {
      mockLogRepo.findMany.mockResolvedValue([]);
      await service.getChangelog('w1', WorldRole.PJ, 50);
      expect(mockLogRepo.findMany).toHaveBeenCalledWith({ worldId: 'w1' }, 50);
    });

    it('PomocnýPJ dostane jen sdílené záznamy', async () => {
      mockLogRepo.findMany.mockResolvedValue([]);
      await service.getChangelog('w1', WorldRole.PomocnyPJ, 50);
      expect(mockLogRepo.findMany).toHaveBeenCalledWith({ worldId: 'w1', isShared: true }, 50);
    });
  });
});
```

- [ ] **Krok 2: Spustit test — ověřit že selže**

```bash
cd backend && npx jest campaign.service.spec.ts --no-coverage 2>&1 | tail -20
```

Očekáváno: `FAIL — Cannot find module './campaign.service'`

- [ ] **Krok 3: Napsat campaign.service.ts**

```typescript
// backend/src/modules/campaign/campaign.service.ts
import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { ICampaignSubjectRepository } from './interfaces/campaign-subject-repository.interface';
import type { ICampaignRelationshipRepository } from './interfaces/campaign-relationship-repository.interface';
import type { ICampaignStorylineRepository } from './interfaces/campaign-storyline-repository.interface';
import type { ICampaignScenarioRepository } from './interfaces/campaign-scenario-repository.interface';
import type { ICampaignQuickNoteRepository } from './interfaces/campaign-quick-note-repository.interface';
import type { ICampaignShopItemRepository } from './interfaces/campaign-shop-item-repository.interface';
import type { ICampaignChangeLogRepository } from './interfaces/campaign-change-log-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { CampaignSubject } from './interfaces/campaign-subject.interface';
import type { CampaignRelationship } from './interfaces/campaign-relationship.interface';
import type { CampaignStoryline } from './interfaces/campaign-storyline.interface';
import type { CampaignScenario } from './interfaces/campaign-scenario.interface';
import type { CampaignQuickNote } from './interfaces/campaign-quick-note.interface';
import type { CampaignShopItem } from './interfaces/campaign-shop-item.interface';
import type { CampaignEntityType, CampaignChangeType } from './interfaces/campaign-change-log.interface';

interface EntityBase { id: string; worldId: string; ownerId: string; isShared: boolean; }

@Injectable()
export class CampaignService {
  constructor(
    @Inject('ICampaignSubjectRepository') private readonly subjectRepo: ICampaignSubjectRepository,
    @Inject('ICampaignRelationshipRepository') private readonly relRepo: ICampaignRelationshipRepository,
    @Inject('ICampaignStorylineRepository') private readonly storylineRepo: ICampaignStorylineRepository,
    @Inject('ICampaignScenarioRepository') private readonly scenarioRepo: ICampaignScenarioRepository,
    @Inject('ICampaignQuickNoteRepository') private readonly noteRepo: ICampaignQuickNoteRepository,
    @Inject('ICampaignShopItemRepository') private readonly shopRepo: ICampaignShopItemRepository,
    @Inject('ICampaignChangeLogRepository') private readonly logRepo: ICampaignChangeLogRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  async getWorldRole(userId: string, userRole: UserRole, worldId: string): Promise<WorldRole> {
    if (userRole <= UserRole.Admin) return WorldRole.PJ;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    return membership?.role ?? WorldRole.Hrac;
  }

  resolveScope(userId: string, worldRole: WorldRole, worldId: string): Record<string, unknown> {
    if (worldRole >= WorldRole.PJ) return { worldId };
    if (worldRole === WorldRole.PomocnyPJ) return { worldId, $or: [{ ownerId: userId }, { isShared: true }] };
    return { worldId, ownerId: userId };
  }

  canModify(entity: EntityBase, userId: string, worldRole: WorldRole): boolean {
    if (worldRole >= WorldRole.PJ) return true;
    if (entity.isShared && worldRole >= WorldRole.PomocnyPJ) return true;
    return entity.ownerId === userId;
  }

  private logChange(
    entity: EntityBase,
    entityType: CampaignEntityType,
    entityName: string,
    changeType: CampaignChangeType,
    changedByUserId: string,
    changedByName: string,
  ): void {
    this.logRepo.append({
      worldId: entity.worldId,
      ownerId: entity.ownerId,
      isShared: entity.isShared,
      entityType,
      entityId: entity.id,
      entityName,
      changeType,
      changedByUserId,
      changedByName,
      changedAt: new Date(),
    }).catch(() => { /* fire-and-forget */ });
  }

  // ── Subjects ─────────────────────────────────────────────────────────────

  async findSubjects(
    userId: string, worldRole: WorldRole, worldId: string,
    filters: { type?: string; status?: string; q?: string },
  ): Promise<CampaignSubject[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.type) base['type'] = filters.type;
    if (filters.status) base['status'] = filters.status;
    if (filters.q) base['name'] = { $regex: filters.q, $options: 'i' };
    return this.subjectRepo.findMany(base);
  }

  async findSubjectById(id: string, userId: string, worldRole: WorldRole): Promise<CampaignSubject> {
    const entity = await this.subjectRepo.findById(id);
    if (!entity) throw new NotFoundException('Subjekt nenalezen');
    if (!this.canModify(entity, userId, worldRole)) throw new ForbiddenException();
    return entity;
  }

  async createSubject(
    userId: string, userName: string, worldRole: WorldRole, worldId: string, isShared: boolean,
    dto: { name: string; type?: CampaignSubject['type']; avatarUrl?: string; tags?: string[]; status?: CampaignSubject['status']; linkedPageSlug?: string; linkedCharacterSlug?: string; notes?: string },
  ): Promise<CampaignSubject> {
    const created = await this.subjectRepo.create({
      worldId, ownerId: userId, isShared,
      type: dto.type ?? 'NPC',
      name: dto.name,
      avatarUrl: dto.avatarUrl,
      tags: dto.tags ?? [],
      status: dto.status ?? 'active',
      linkedPageSlug: dto.linkedPageSlug,
      linkedCharacterSlug: dto.linkedCharacterSlug,
      notes: dto.notes,
    });
    this.logChange(created, 'subject', created.name, 'created', userId, userName);
    return created;
  }

  async updateSubject(
    id: string, userId: string, userName: string, worldRole: WorldRole,
    dto: Partial<Omit<CampaignSubject, 'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CampaignSubject> {
    const existing = await this.subjectRepo.findById(id);
    if (!existing) throw new NotFoundException('Subjekt nenalezen');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    const updated = await this.subjectRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Subjekt nenalezen');
    this.logChange(updated, 'subject', updated.name, 'updated', userId, userName);
    return updated;
  }

  async deleteSubject(id: string, userId: string, worldRole: WorldRole, userName: string): Promise<void> {
    const existing = await this.subjectRepo.findById(id);
    if (!existing) throw new NotFoundException('Subjekt nenalezen');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    await this.subjectRepo.delete(id);
    this.logChange(existing, 'subject', existing.name, 'deleted', userId, userName);
  }

  // ── Relationships ─────────────────────────────────────────────────────────

  async findRelationships(
    userId: string, worldRole: WorldRole, worldId: string,
    filters: { subjectId?: string; status?: string; storylineId?: string },
  ): Promise<CampaignRelationship[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.status) base['status'] = filters.status;
    if (filters.storylineId) base['storylineIds'] = filters.storylineId;
    if (filters.subjectId) {
      base['$or'] = [{ subjectAId: filters.subjectId }, { subjectBId: filters.subjectId }];
    }
    return this.relRepo.findMany(base);
  }

  async findRelationshipById(id: string, userId: string, worldRole: WorldRole): Promise<CampaignRelationship> {
    const entity = await this.relRepo.findById(id);
    if (!entity) throw new NotFoundException('Vztah nenalezen');
    if (!this.canModify(entity, userId, worldRole)) throw new ForbiddenException();
    return entity;
  }

  async createRelationship(
    userId: string, userName: string, worldRole: WorldRole, worldId: string, isShared: boolean,
    dto: { subjectAId: string; subjectBId: string; shared?: CampaignRelationship['shared']; sideA?: Partial<CampaignRelationship['sideA']>; sideB?: Partial<CampaignRelationship['sideB']>; status?: CampaignRelationship['status']; priority?: number; storylineIds?: string[]; lastChangeNote?: string },
  ): Promise<CampaignRelationship> {
    const created = await this.relRepo.create({
      worldId, ownerId: userId, isShared,
      subjectAId: dto.subjectAId,
      subjectBId: dto.subjectBId,
      shared: dto.shared ?? {},
      sideA: { strength: 5, ...dto.sideA },
      sideB: { strength: 5, ...dto.sideB },
      status: dto.status ?? 'active',
      priority: dto.priority ?? 3,
      storylineIds: dto.storylineIds ?? [],
      lastChangeNote: dto.lastChangeNote,
    });
    this.logChange(created, 'relationship', `${created.subjectAId}↔${created.subjectBId}`, 'created', userId, userName);
    return created;
  }

  async updateRelationship(
    id: string, userId: string, userName: string, worldRole: WorldRole,
    dto: Partial<Omit<CampaignRelationship, 'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CampaignRelationship> {
    const existing = await this.relRepo.findById(id);
    if (!existing) throw new NotFoundException('Vztah nenalezen');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    const updated = await this.relRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Vztah nenalezen');
    this.logChange(updated, 'relationship', `${updated.subjectAId}↔${updated.subjectBId}`, 'updated', userId, userName);
    return updated;
  }

  async deleteRelationship(id: string, userId: string, worldRole: WorldRole, userName: string): Promise<void> {
    const existing = await this.relRepo.findById(id);
    if (!existing) throw new NotFoundException('Vztah nenalezen');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    await this.relRepo.delete(id);
    this.logChange(existing, 'relationship', `${existing.subjectAId}↔${existing.subjectBId}`, 'deleted', userId, userName);
  }

  // ── Storylines ────────────────────────────────────────────────────────────

  async findStorylines(
    userId: string, worldRole: WorldRole, worldId: string,
    filters: { level?: string; status?: string; subjectId?: string },
  ): Promise<CampaignStoryline[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.level) base['level'] = filters.level;
    if (filters.status) base['status'] = filters.status;
    if (filters.subjectId) base['subjectIds'] = filters.subjectId;
    return this.storylineRepo.findMany(base);
  }

  async findStorylineById(id: string, userId: string, worldRole: WorldRole): Promise<CampaignStoryline> {
    const entity = await this.storylineRepo.findById(id);
    if (!entity) throw new NotFoundException('Storyline nenalezena');
    if (!this.canModify(entity, userId, worldRole)) throw new ForbiddenException();
    return entity;
  }

  async createStoryline(
    userId: string, userName: string, worldRole: WorldRole, worldId: string, isShared: boolean,
    dto: { title: string; level?: CampaignStoryline['level']; status?: CampaignStoryline['status']; phase?: string; summary?: string; whatHappened?: string; truth?: string; playersBelief?: string; gmIntent?: string; nextStep?: string; subjectIds?: string[]; relationshipIds?: string[] },
  ): Promise<CampaignStoryline> {
    const created = await this.storylineRepo.create({
      worldId, ownerId: userId, isShared,
      title: dto.title,
      level: dto.level ?? 'mid',
      status: dto.status ?? 'active',
      phase: dto.phase, summary: dto.summary, whatHappened: dto.whatHappened,
      truth: dto.truth, playersBelief: dto.playersBelief, gmIntent: dto.gmIntent, nextStep: dto.nextStep,
      subjectIds: dto.subjectIds ?? [],
      relationshipIds: dto.relationshipIds ?? [],
    });
    this.logChange(created, 'storyline', created.title, 'created', userId, userName);
    return created;
  }

  async updateStoryline(
    id: string, userId: string, userName: string, worldRole: WorldRole,
    dto: Partial<Omit<CampaignStoryline, 'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CampaignStoryline> {
    const existing = await this.storylineRepo.findById(id);
    if (!existing) throw new NotFoundException('Storyline nenalezena');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    const updated = await this.storylineRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Storyline nenalezena');
    this.logChange(updated, 'storyline', updated.title, 'updated', userId, userName);
    return updated;
  }

  async deleteStoryline(id: string, userId: string, worldRole: WorldRole, userName: string): Promise<void> {
    const existing = await this.storylineRepo.findById(id);
    if (!existing) throw new NotFoundException('Storyline nenalezena');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    await this.storylineRepo.delete(id);
    this.logChange(existing, 'storyline', existing.title, 'deleted', userId, userName);
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────

  async findScenarios(userId: string, worldRole: WorldRole, worldId: string): Promise<CampaignScenario[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    return this.scenarioRepo.findMany(base, { order: 1 });
  }

  async findScenarioById(id: string, userId: string, worldRole: WorldRole): Promise<CampaignScenario> {
    const entity = await this.scenarioRepo.findById(id);
    if (!entity) throw new NotFoundException('Scénář nenalezen');
    if (!this.canModify(entity, userId, worldRole)) throw new ForbiddenException();
    return entity;
  }

  async createScenario(
    userId: string, userName: string, worldRole: WorldRole, worldId: string, isShared: boolean,
    dto: { title: string; contentData?: Record<string, unknown>; linkedPageSlug?: string; subjectIds?: string[]; storylineIds?: string[]; images?: string[] },
  ): Promise<CampaignScenario> {
    const scopeFilter = { worldId, ownerId: userId, isShared };
    const maxOrder = await this.scenarioRepo.maxOrder(scopeFilter);
    const created = await this.scenarioRepo.create({
      worldId, ownerId: userId, isShared,
      title: dto.title,
      contentData: dto.contentData,
      order: maxOrder + 1,
      linkedPageSlug: dto.linkedPageSlug,
      subjectIds: dto.subjectIds ?? [],
      storylineIds: dto.storylineIds ?? [],
      images: dto.images ?? [],
    });
    this.logChange(created, 'scenario', created.title, 'created', userId, userName);
    return created;
  }

  async updateScenario(
    id: string, userId: string, userName: string, worldRole: WorldRole,
    dto: Partial<Omit<CampaignScenario, 'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CampaignScenario> {
    const existing = await this.scenarioRepo.findById(id);
    if (!existing) throw new NotFoundException('Scénář nenalezen');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    const updated = await this.scenarioRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Scénář nenalezen');
    this.logChange(updated, 'scenario', updated.title, 'updated', userId, userName);
    return updated;
  }

  async deleteScenario(id: string, userId: string, worldRole: WorldRole, userName: string): Promise<void> {
    const existing = await this.scenarioRepo.findById(id);
    if (!existing) throw new NotFoundException('Scénář nenalezen');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    await this.scenarioRepo.delete(id);
    this.logChange(existing, 'scenario', existing.title, 'deleted', userId, userName);
  }

  // ── QuickNotes ────────────────────────────────────────────────────────────

  async findQuickNotes(
    userId: string, worldRole: WorldRole, worldId: string,
    filters: { status?: string; pinned?: boolean },
  ): Promise<CampaignQuickNote[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.status) base['status'] = filters.status;
    if (filters.pinned !== undefined) base['pinned'] = filters.pinned;
    return this.noteRepo.findMany(base);
  }

  async findQuickNoteById(id: string, userId: string, worldRole: WorldRole): Promise<CampaignQuickNote> {
    const entity = await this.noteRepo.findById(id);
    if (!entity) throw new NotFoundException('Poznámka nenalezena');
    if (!this.canModify(entity, userId, worldRole)) throw new ForbiddenException();
    return entity;
  }

  async createQuickNote(
    userId: string, userName: string, worldRole: WorldRole, worldId: string, isShared: boolean,
    dto: { title: string; body?: string; status?: CampaignQuickNote['status']; pinned?: boolean; subjectIds?: string[]; storylineIds?: string[] },
  ): Promise<CampaignQuickNote> {
    const created = await this.noteRepo.create({
      worldId, ownerId: userId, isShared,
      title: dto.title, body: dto.body,
      status: dto.status ?? 'open',
      pinned: dto.pinned ?? false,
      subjectIds: dto.subjectIds ?? [],
      storylineIds: dto.storylineIds ?? [],
    });
    this.logChange(created, 'quicknote', created.title, 'created', userId, userName);
    return created;
  }

  async updateQuickNote(
    id: string, userId: string, userName: string, worldRole: WorldRole,
    dto: Partial<Omit<CampaignQuickNote, 'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CampaignQuickNote> {
    const existing = await this.noteRepo.findById(id);
    if (!existing) throw new NotFoundException('Poznámka nenalezena');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    const updated = await this.noteRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Poznámka nenalezena');
    this.logChange(updated, 'quicknote', updated.title, 'updated', userId, userName);
    return updated;
  }

  async deleteQuickNote(id: string, userId: string, worldRole: WorldRole, userName: string): Promise<void> {
    const existing = await this.noteRepo.findById(id);
    if (!existing) throw new NotFoundException('Poznámka nenalezena');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    await this.noteRepo.delete(id);
    this.logChange(existing, 'quicknote', existing.title, 'deleted', userId, userName);
  }

  // ── ShopItems ─────────────────────────────────────────────────────────────

  async findShopItems(
    userId: string, worldRole: WorldRole, worldId: string,
    filters: { group?: string },
  ): Promise<CampaignShopItem[]> {
    const base = this.resolveScope(userId, worldRole, worldId);
    if (filters.group) base['group'] = filters.group;
    return this.shopRepo.findMany(base);
  }

  async findShopItemById(id: string, userId: string, worldRole: WorldRole): Promise<CampaignShopItem> {
    const entity = await this.shopRepo.findById(id);
    if (!entity) throw new NotFoundException('Položka nenalezena');
    if (!this.canModify(entity, userId, worldRole)) throw new ForbiddenException();
    return entity;
  }

  async createShopItem(
    userId: string, userName: string, worldRole: WorldRole, worldId: string, isShared: boolean,
    dto: { name: string; description?: string; group: string; subgroup?: string; price?: number; currencyCode?: string; linkedItemIds?: string[]; referenceLink?: string; isRecommended?: boolean },
  ): Promise<CampaignShopItem> {
    const created = await this.shopRepo.create({
      worldId, ownerId: userId, isShared,
      name: dto.name, description: dto.description,
      group: dto.group, subgroup: dto.subgroup,
      price: dto.price ?? 0,
      currencyCode: dto.currencyCode ?? '',
      linkedItemIds: dto.linkedItemIds ?? [],
      referenceLink: dto.referenceLink,
      isRecommended: dto.isRecommended ?? false,
    });
    this.logChange(created, 'shopitem', created.name, 'created', userId, userName);
    return created;
  }

  async updateShopItem(
    id: string, userId: string, userName: string, worldRole: WorldRole,
    dto: Partial<Omit<CampaignShopItem, 'id' | 'worldId' | 'ownerId' | 'isShared' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CampaignShopItem> {
    const existing = await this.shopRepo.findById(id);
    if (!existing) throw new NotFoundException('Položka nenalezena');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    const updated = await this.shopRepo.update(id, dto);
    if (!updated) throw new NotFoundException('Položka nenalezena');
    this.logChange(updated, 'shopitem', updated.name, 'updated', userId, userName);
    return updated;
  }

  async deleteShopItem(id: string, userId: string, worldRole: WorldRole, userName: string): Promise<void> {
    const existing = await this.shopRepo.findById(id);
    if (!existing) throw new NotFoundException('Položka nenalezena');
    if (!this.canModify(existing, userId, worldRole)) throw new ForbiddenException();
    await this.shopRepo.delete(id);
    await this.shopRepo.pullLinkedItem(existing.worldId, id);
    this.logChange(existing, 'shopitem', existing.name, 'deleted', userId, userName);
  }

  // ── Players ───────────────────────────────────────────────────────────────

  async getPlayers(requestingUserId: string, worldId: string) {
    const memberships = await this.membershipRepo.findByWorldId(worldId);
    return memberships
      .filter((m) => m.role >= WorldRole.Hrac && m.userId !== requestingUserId)
      .map((m) => ({ userId: m.userId, characterPath: m.characterPath, role: m.role }));
  }

  // ── Changelog & Dashboard ─────────────────────────────────────────────────

  async getChangelog(worldId: string, worldRole: WorldRole, limit = 50) {
    const filter: Record<string, unknown> = { worldId };
    if (worldRole === WorldRole.PomocnyPJ) filter['isShared'] = true;
    return this.logRepo.findMany(filter, limit);
  }

  async getDashboard(userId: string, worldRole: WorldRole, worldId: string) {
    const scope = this.resolveScope(userId, worldRole, worldId);
    const [crisisRelationships, activeStorylines, pinnedNotes, recentChanges] = await Promise.all([
      this.relRepo.findMany({ ...scope, status: 'crisis' }),
      this.storylineRepo.findMany({ ...scope, status: 'active' }),
      this.noteRepo.findMany({ ...scope, pinned: true, status: 'open' }),
      this.getChangelog(worldId, worldRole, 20),
    ]);
    return {
      crisisRelationships: crisisRelationships.slice(0, 10),
      activeStorylines,
      pinnedNotes,
      recentChanges,
    };
  }
}
```

- [ ] **Krok 4: Spustit testy — ověřit že projdou**

```bash
cd backend && npx jest campaign.service.spec.ts --no-coverage 2>&1 | tail -20
```

Očekáváno: `PASS` — všechny testy zelené.

- [ ] **Krok 5: Commit**

```bash
git add backend/src/modules/campaign/campaign.service.ts backend/src/modules/campaign/campaign.service.spec.ts
git commit -m "feat(campaign): přidat CampaignService s testy"
```

---

## Task 6: DTOs

**Files:**
- Create: všechny soubory v `dto/`

- [ ] **Krok 1: Napsat create-campaign-subject.dto.ts**

```typescript
// backend/src/modules/campaign/dto/create-campaign-subject.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export class CreateCampaignSubjectDto {
  @IsString() name: string;
  @IsOptional() @IsIn(['PC', 'NPC', 'LOCATION', 'ORG', 'FACTION']) type?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
  @IsOptional() @IsString() linkedPageSlug?: string;
  @IsOptional() @IsString() linkedCharacterSlug?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
```

- [ ] **Krok 2: Napsat create-campaign-relationship.dto.ts**

```typescript
// backend/src/modules/campaign/dto/create-campaign-relationship.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean, IsNumber, IsIn, IsObject, Min, Max } from 'class-validator';

export class RelationshipSideDto {
  @IsOptional() @IsString() tone?: string;
  @IsOptional() @IsString() behavior?: string;
  @IsOptional() @IsString() gmIntent?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(10) strength?: number;
}

export class CreateCampaignRelationshipDto {
  @IsString() subjectAId: string;
  @IsString() subjectBId: string;
  @IsOptional() @IsObject() shared?: { whatHappened?: string; behindTheScenes?: string };
  @IsOptional() @IsObject() sideA?: RelationshipSideDto;
  @IsOptional() @IsObject() sideB?: RelationshipSideDto;
  @IsOptional() @IsIn(['active', 'dormant', 'crisis', 'closed']) status?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(5) priority?: number;
  @IsOptional() @IsArray() storylineIds?: string[];
  @IsOptional() @IsString() lastChangeNote?: string;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
```

- [ ] **Krok 3: Napsat create-campaign-storyline.dto.ts**

```typescript
// backend/src/modules/campaign/dto/create-campaign-storyline.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export class CreateCampaignStorylineDto {
  @IsString() title: string;
  @IsOptional() @IsIn(['macro', 'mid', 'micro']) level?: string;
  @IsOptional() @IsIn(['active', 'dormant', 'escalating', 'climax', 'closed']) status?: string;
  @IsOptional() @IsString() phase?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() whatHappened?: string;
  @IsOptional() @IsString() truth?: string;
  @IsOptional() @IsString() playersBelief?: string;
  @IsOptional() @IsString() gmIntent?: string;
  @IsOptional() @IsString() nextStep?: string;
  @IsOptional() @IsArray() subjectIds?: string[];
  @IsOptional() @IsArray() relationshipIds?: string[];
  @IsOptional() @IsBoolean() isShared?: boolean;
}
```

- [ ] **Krok 4: Napsat create-campaign-scenario.dto.ts**

```typescript
// backend/src/modules/campaign/dto/create-campaign-scenario.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean, IsObject } from 'class-validator';

export class CreateCampaignScenarioDto {
  @IsString() title: string;
  @IsOptional() @IsObject() contentData?: Record<string, unknown>;
  @IsOptional() @IsString() linkedPageSlug?: string;
  @IsOptional() @IsArray() subjectIds?: string[];
  @IsOptional() @IsArray() storylineIds?: string[];
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsBoolean() isShared?: boolean;
}
```

- [ ] **Krok 5: Napsat create-campaign-quick-note.dto.ts**

```typescript
// backend/src/modules/campaign/dto/create-campaign-quick-note.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export class CreateCampaignQuickNoteDto {
  @IsString() title: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsIn(['open', 'done']) status?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsArray() subjectIds?: string[];
  @IsOptional() @IsArray() storylineIds?: string[];
  @IsOptional() @IsBoolean() isShared?: boolean;
}
```

- [ ] **Krok 6: Napsat create-campaign-shop-item.dto.ts**

```typescript
// backend/src/modules/campaign/dto/create-campaign-shop-item.dto.ts
import { IsString, IsOptional, IsArray, IsBoolean, IsNumber, Min } from 'class-validator';

export class CreateCampaignShopItemDto {
  @IsString() name: string;
  @IsString() group: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() subgroup?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsArray() linkedItemIds?: string[];
  @IsOptional() @IsString() referenceLink?: string;
  @IsOptional() @IsBoolean() isRecommended?: boolean;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
```

- [ ] **Krok 7: Commit**

```bash
git add backend/src/modules/campaign/dto/
git commit -m "feat(campaign): přidat DTOs"
```

---

## Task 7: Controller

**Files:**
- Create: `backend/src/modules/campaign/campaign.controller.ts`

- [ ] **Krok 1: Napsat campaign.controller.ts**

```typescript
// backend/src/modules/campaign/campaign.controller.ts
import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
  ForbiddenException, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateCampaignSubjectDto } from './dto/create-campaign-subject.dto';
import { CreateCampaignRelationshipDto } from './dto/create-campaign-relationship.dto';
import { CreateCampaignStorylineDto } from './dto/create-campaign-storyline.dto';
import { CreateCampaignScenarioDto } from './dto/create-campaign-scenario.dto';
import { CreateCampaignQuickNoteDto } from './dto/create-campaign-quick-note.dto';
import { CreateCampaignShopItemDto } from './dto/create-campaign-shop-item.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

interface RequestUser { id: string; role: UserRole; username: string; }

@Controller('campaign')
@UseGuards(JwtAuthGuard)
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  private async role(user: RequestUser, worldId: string): Promise<WorldRole> {
    return this.service.getWorldRole(user.id, user.role, worldId);
  }

  // ── Players ───────────────────────────────────────────────────────────────

  @Get('players')
  async getPlayers(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
  ) {
    const worldRole = await this.role(user, worldId);
    if (worldRole < WorldRole.PJ) throw new ForbiddenException();
    return this.service.getPlayers(user.id, worldId);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  async getDashboard(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.getDashboard(user.id, worldRole, worldId);
  }

  // ── Changelog ─────────────────────────────────────────────────────────────

  @Get('changelog')
  async getChangelog(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const worldRole = await this.role(user, worldId);
    if (worldRole < WorldRole.PomocnyPJ) throw new ForbiddenException();
    return this.service.getChangelog(worldId, worldRole, limit);
  }

  // ── Subjects ──────────────────────────────────────────────────────────────

  @Get('subjects')
  async findSubjects(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findSubjects(user.id, worldRole, worldId, { type, status, q });
  }

  @Get('subjects/:id')
  async findSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findSubjectById(id, user.id, worldRole);
  }

  @Post('subjects')
  async createSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignSubjectDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createSubject(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('subjects/:id')
  async updateSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignSubjectDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateSubject(id, user.id, user.username, worldRole, dto);
  }

  @Delete('subjects/:id')
  async deleteSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteSubject(id, user.id, worldRole, user.username);
  }

  // ── Relationships ─────────────────────────────────────────────────────────

  @Get('relationships')
  async findRelationships(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('subjectId') subjectId?: string,
    @Query('status') status?: string,
    @Query('storylineId') storylineId?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findRelationships(user.id, worldRole, worldId, { subjectId, status, storylineId });
  }

  @Get('relationships/:id')
  async findRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findRelationshipById(id, user.id, worldRole);
  }

  @Post('relationships')
  async createRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignRelationshipDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createRelationship(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('relationships/:id')
  async updateRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignRelationshipDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateRelationship(id, user.id, user.username, worldRole, dto);
  }

  @Delete('relationships/:id')
  async deleteRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteRelationship(id, user.id, worldRole, user.username);
  }

  // ── Storylines ────────────────────────────────────────────────────────────

  @Get('storylines')
  async findStorylines(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('level') level?: string,
    @Query('status') status?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findStorylines(user.id, worldRole, worldId, { level, status, subjectId });
  }

  @Get('storylines/:id')
  async findStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findStorylineById(id, user.id, worldRole);
  }

  @Post('storylines')
  async createStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignStorylineDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createStoryline(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('storylines/:id')
  async updateStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignStorylineDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateStoryline(id, user.id, user.username, worldRole, dto);
  }

  @Delete('storylines/:id')
  async deleteStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteStoryline(id, user.id, worldRole, user.username);
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────

  @Get('scenarios')
  async findScenarios(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findScenarios(user.id, worldRole, worldId);
  }

  @Get('scenarios/:id')
  async findScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findScenarioById(id, user.id, worldRole);
  }

  @Post('scenarios')
  async createScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignScenarioDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createScenario(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('scenarios/:id')
  async updateScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignScenarioDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateScenario(id, user.id, user.username, worldRole, dto);
  }

  @Delete('scenarios/:id')
  async deleteScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteScenario(id, user.id, worldRole, user.username);
  }

  // ── QuickNotes ────────────────────────────────────────────────────────────

  @Get('quicknotes')
  async findQuickNotes(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('status') status?: string,
    @Query('pinned') pinned?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findQuickNotes(user.id, worldRole, worldId, {
      status,
      pinned: pinned !== undefined ? pinned === 'true' : undefined,
    });
  }

  @Get('quicknotes/:id')
  async findQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findQuickNoteById(id, user.id, worldRole);
  }

  @Post('quicknotes')
  async createQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignQuickNoteDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createQuickNote(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('quicknotes/:id')
  async updateQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignQuickNoteDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateQuickNote(id, user.id, user.username, worldRole, dto);
  }

  @Delete('quicknotes/:id')
  async deleteQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteQuickNote(id, user.id, worldRole, user.username);
  }

  // ── ShopItems ─────────────────────────────────────────────────────────────

  @Get('shopitems')
  async findShopItems(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('group') group?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findShopItems(user.id, worldRole, worldId, { group });
  }

  @Get('shopitems/:id')
  async findShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findShopItemById(id, user.id, worldRole);
  }

  @Post('shopitems')
  async createShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignShopItemDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createShopItem(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('shopitems/:id')
  async updateShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignShopItemDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateShopItem(id, user.id, user.username, worldRole, dto);
  }

  @Delete('shopitems/:id')
  async deleteShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteShopItem(id, user.id, worldRole, user.username);
  }
}
```

- [ ] **Krok 2: Commit**

```bash
git add backend/src/modules/campaign/campaign.controller.ts
git commit -m "feat(campaign): přidat CampaignController"
```

---

## Task 8: Module + registrace

**Files:**
- Create: `backend/src/modules/campaign/campaign.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Krok 1: Napsat campaign.module.ts**

```typescript
// backend/src/modules/campaign/campaign.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignSubjectSchemaClass, CampaignSubjectSchema } from './schemas/campaign-subject.schema';
import { CampaignRelationshipSchemaClass, CampaignRelationshipSchema } from './schemas/campaign-relationship.schema';
import { CampaignStorylineSchemaClass, CampaignStorylineSchema } from './schemas/campaign-storyline.schema';
import { CampaignScenarioSchemaClass, CampaignScenarioSchema } from './schemas/campaign-scenario.schema';
import { CampaignQuickNoteSchemaClass, CampaignQuickNoteSchema } from './schemas/campaign-quick-note.schema';
import { CampaignShopItemSchemaClass, CampaignShopItemSchema } from './schemas/campaign-shop-item.schema';
import { CampaignChangeLogSchemaClass, CampaignChangeLogSchema } from './schemas/campaign-change-log.schema';
import { MongoCampaignSubjectRepository } from './repositories/campaign-subject.repository';
import { MongoCampaignRelationshipRepository } from './repositories/campaign-relationship.repository';
import { MongoCampaignStorylineRepository } from './repositories/campaign-storyline.repository';
import { MongoCampaignScenarioRepository } from './repositories/campaign-scenario.repository';
import { MongoCampaignQuickNoteRepository } from './repositories/campaign-quick-note.repository';
import { MongoCampaignShopItemRepository } from './repositories/campaign-shop-item.repository';
import { MongoCampaignChangeLogRepository } from './repositories/campaign-change-log.repository';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CampaignSubjectSchemaClass.name, schema: CampaignSubjectSchema },
      { name: CampaignRelationshipSchemaClass.name, schema: CampaignRelationshipSchema },
      { name: CampaignStorylineSchemaClass.name, schema: CampaignStorylineSchema },
      { name: CampaignScenarioSchemaClass.name, schema: CampaignScenarioSchema },
      { name: CampaignQuickNoteSchemaClass.name, schema: CampaignQuickNoteSchema },
      { name: CampaignShopItemSchemaClass.name, schema: CampaignShopItemSchema },
      { name: CampaignChangeLogSchemaClass.name, schema: CampaignChangeLogSchema },
    ]),
    WorldsModule,
  ],
  controllers: [CampaignController],
  providers: [
    CampaignService,
    { provide: 'ICampaignSubjectRepository', useClass: MongoCampaignSubjectRepository },
    { provide: 'ICampaignRelationshipRepository', useClass: MongoCampaignRelationshipRepository },
    { provide: 'ICampaignStorylineRepository', useClass: MongoCampaignStorylineRepository },
    { provide: 'ICampaignScenarioRepository', useClass: MongoCampaignScenarioRepository },
    { provide: 'ICampaignQuickNoteRepository', useClass: MongoCampaignQuickNoteRepository },
    { provide: 'ICampaignShopItemRepository', useClass: MongoCampaignShopItemRepository },
    { provide: 'ICampaignChangeLogRepository', useClass: MongoCampaignChangeLogRepository },
  ],
})
export class CampaignModule {}
```

- [ ] **Krok 2: Přidat CampaignModule do app.module.ts**

V `backend/src/app.module.ts` přidat import:
```typescript
import { CampaignModule } from './modules/campaign/campaign.module';
```

A do pole `imports` přidat `CampaignModule` za `UniverseModule`:
```typescript
    UniverseModule,
    CampaignModule,   // ← přidat
    GatewaysModule,
```

- [ ] **Krok 3: Ověřit TypeScript build**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Očekáváno: žádné chyby. Pokud jsou — oprav je před commitem.

- [ ] **Krok 4: Spustit všechny testy**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -20
```

Očekáváno: `PASS` pro všechny existující testy + nový `campaign.service.spec.ts`.

- [ ] **Krok 5: Commit**

```bash
git add backend/src/modules/campaign/campaign.module.ts backend/src/app.module.ts
git commit -m "feat(campaign): registrovat CampaignModule v aplikaci"
```

---

## Task 9: Aktualizace roadmapy

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Krok 1: Označit Krok 9 jako hotový v roadmapě**

V `docs/roadmap.md` najdi `## Krok 9 — Kampaně ⬜` a změň na `## Krok 9 — Kampaně ✅`.

Odškrtni všechny checkboxy v sekci Krok 9 (změň `- [ ]` na `- [x]`).

Aktualizuj tabulku přehledu stavu: `| 9 | Kampaně | ⬜ |` → `| 9 | Kampaně | ✅ |`.

Přidej odkaz na plán:
```
**Plán:** [docs/superpowers/plans/2026-05-03-krok-9-kampane.md](superpowers/plans/2026-05-03-krok-9-kampane.md)
```

- [ ] **Krok 2: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs: označit Krok 9 jako hotový"
```
