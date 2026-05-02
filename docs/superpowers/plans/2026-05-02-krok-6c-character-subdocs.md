# Krok 6c — Character Sub-dokumenty: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat CharacterSubdocs modul — auto-vytvoření Deníku, Kalendáře, Financí, Výbavy a Poznámek při vzniku postavy; CRUD endpointy; Finance addMonthly/undo; isHidden flag na Finance+Výbava při CP↔NPC konverzi.

**Architecture:** `CharacterSubdocsModule` poslouchá EventEmitter2 eventy `character.created` a `character.converted`. Každý sub-doc má vlastní schema + repository. Jeden CharacterSubdocsService řeší vše. Routes jsou vnořené pod `/api/worlds/:worldId/characters/:slug/`.

**Tech Stack:** NestJS 11, TypeScript 5, Mongoose 9, EventEmitter2, class-validator, Jest

---

## Přehled souborů

**Vytvořit:**
- `backend/src/modules/character-subdocs/interfaces/character-diary.interface.ts`
- `backend/src/modules/character-subdocs/interfaces/character-calendar.interface.ts`
- `backend/src/modules/character-subdocs/interfaces/character-finance.interface.ts`
- `backend/src/modules/character-subdocs/interfaces/character-inventory.interface.ts`
- `backend/src/modules/character-subdocs/interfaces/character-notes.interface.ts`
- `backend/src/modules/character-subdocs/schemas/character-diary.schema.ts`
- `backend/src/modules/character-subdocs/schemas/character-calendar.schema.ts`
- `backend/src/modules/character-subdocs/schemas/character-finance.schema.ts`
- `backend/src/modules/character-subdocs/schemas/character-inventory.schema.ts`
- `backend/src/modules/character-subdocs/schemas/character-notes.schema.ts`
- `backend/src/modules/character-subdocs/repositories/character-diary.repository.ts`
- `backend/src/modules/character-subdocs/repositories/character-calendar.repository.ts`
- `backend/src/modules/character-subdocs/repositories/character-finance.repository.ts`
- `backend/src/modules/character-subdocs/repositories/character-inventory.repository.ts`
- `backend/src/modules/character-subdocs/repositories/character-notes.repository.ts`
- `backend/src/modules/character-subdocs/character-subdocs.service.ts`
- `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts`
- `backend/src/modules/character-subdocs/character-subdocs.controller.ts`
- `backend/src/modules/character-subdocs/character-subdocs.module.ts`

**Upravit:**
- `backend/src/app.module.ts` — registrace CharacterSubdocsModule

---

## Kontext projektu

- `CharactersService` emituje `character.created` s payloadem `{ characterId, worldId, userId, isNpc }` a `character.converted` s `{ characterId, worldId, toNpc, userId }`.
- `ICharactersRepository` je exportován z `CharactersModule`.
- Vzorový event listener: `backend/src/modules/ikaros-messages/ikaros-messages.service.ts` — používá `@OnEvent('world.join.requested')`.
- `PageSection` a `PageSectionItem` jsou definovány v `backend/src/modules/pages/interfaces/page.interface.ts`.

---

## Task 1: Interfaces

**Files:**
- Create: všech 5 interface souborů

- [ ] **Step 1: Vytvořit character-diary.interface.ts**

```typescript
// backend/src/modules/character-subdocs/interfaces/character-diary.interface.ts
import type { PageSection } from '../../pages/interfaces/page.interface';

export interface CustomDiaryBlock {
  id: string;
  type: string;       // 'bar' | 'stat' | 'list' | 'text'
  label: string;
  description?: string;
  maxValue?: number;
  minValue?: number;
  color?: string;
  options?: string[];
  order: number;
  layoutArea?: string;
}

export interface CharacterDiary {
  id: string;
  characterId: string;
  worldId: string;
  sections: PageSection[];
  personalDiarySchema?: CustomDiaryBlock[];
  customData: Record<string, unknown>;
}
```

- [ ] **Step 2: Vytvořit character-calendar.interface.ts**

```typescript
// backend/src/modules/character-subdocs/interfaces/character-calendar.interface.ts
export interface CalendarEvent {
  id: string;
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  hourStart?: string;
  hourEnd?: string;
  description?: string;
}

export interface CharacterCalendar {
  id: string;
  characterId: string;
  worldId: string;
  events: CalendarEvent[];
}
```

- [ ] **Step 3: Vytvořit character-finance.interface.ts**

```typescript
// backend/src/modules/character-subdocs/interfaces/character-finance.interface.ts
export interface FinanceEntry {
  id: string;
  label: string;
  amount: number;       // kladné = příjem, záporné = výdaj
}

export interface FinanceTransaction {
  id: string;
  date: Date;
  delta: number;        // o kolik se změnil balance
  description: string;
}

export interface CharacterFinance {
  id: string;
  characterId: string;
  isHidden: boolean;
  accountType: string;
  accessLocation: string;
  currency: string;
  lastSyncDate?: Date;
  balance: number;
  entries: FinanceEntry[];
  transactions: FinanceTransaction[];
}
```

- [ ] **Step 4: Vytvořit character-inventory.interface.ts**

```typescript
// backend/src/modules/character-subdocs/interfaces/character-inventory.interface.ts
import type { PageSection } from '../../pages/interfaces/page.interface';

export interface CharacterInventory {
  id: string;
  characterId: string;
  isHidden: boolean;
  sections: PageSection[];
}
```

- [ ] **Step 5: Vytvořit character-notes.interface.ts**

```typescript
// backend/src/modules/character-subdocs/interfaces/character-notes.interface.ts
export interface CharacterNotes {
  id: string;
  characterId: string;
  content: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/character-subdocs/interfaces/
git commit -m "feat(character-subdocs): přidat interfaces pro sub-dokumenty"
```

---

## Task 2: Schemas

**Files:**
- Create: všech 5 schema souborů

- [ ] **Step 1: Vytvořit schemas**

```typescript
// backend/src/modules/character-subdocs/schemas/character-diary.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterDiaryDocument = HydratedDocument<CharacterDiarySchemaClass>;

@Schema({ collection: 'character_diaries' })
export class CharacterDiarySchemaClass {
  @Prop({ required: true, unique: true, index: true }) characterId: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ type: [Object], default: [] }) sections: Record<string, unknown>[];
  @Prop({ type: [Object] }) personalDiarySchema?: Record<string, unknown>[];
  @Prop({ type: Object, default: {} }) customData: Record<string, unknown>;
}

export const CharacterDiarySchema = SchemaFactory.createForClass(CharacterDiarySchemaClass);
```

```typescript
// backend/src/modules/character-subdocs/schemas/character-calendar.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterCalendarDocument = HydratedDocument<CharacterCalendarSchemaClass>;

@Schema({ collection: 'character_calendars' })
export class CharacterCalendarSchemaClass {
  @Prop({ required: true, unique: true, index: true }) characterId: string;
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ type: [Object], default: [] }) events: Record<string, unknown>[];
}

export const CharacterCalendarSchema = SchemaFactory.createForClass(CharacterCalendarSchemaClass);
```

```typescript
// backend/src/modules/character-subdocs/schemas/character-finance.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterFinanceDocument = HydratedDocument<CharacterFinanceSchemaClass>;

@Schema({ collection: 'character_finances' })
export class CharacterFinanceSchemaClass {
  @Prop({ required: true, unique: true, index: true }) characterId: string;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ default: 'Osobní' }) accountType: string;
  @Prop({ default: '' }) accessLocation: string;
  @Prop({ default: '' }) currency: string;
  @Prop() lastSyncDate?: Date;
  @Prop({ default: 0 }) balance: number;
  @Prop({ type: [Object], default: [] }) entries: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) transactions: Record<string, unknown>[];
}

export const CharacterFinanceSchema = SchemaFactory.createForClass(CharacterFinanceSchemaClass);
```

```typescript
// backend/src/modules/character-subdocs/schemas/character-inventory.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterInventoryDocument = HydratedDocument<CharacterInventorySchemaClass>;

@Schema({ collection: 'character_inventories' })
export class CharacterInventorySchemaClass {
  @Prop({ required: true, unique: true, index: true }) characterId: string;
  @Prop({ default: false }) isHidden: boolean;
  @Prop({ type: [Object], default: [] }) sections: Record<string, unknown>[];
}

export const CharacterInventorySchema = SchemaFactory.createForClass(CharacterInventorySchemaClass);
```

```typescript
// backend/src/modules/character-subdocs/schemas/character-notes.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterNotesDocument = HydratedDocument<CharacterNotesSchemaClass>;

@Schema({ collection: 'character_notes' })
export class CharacterNotesSchemaClass {
  @Prop({ required: true, unique: true, index: true }) characterId: string;
  @Prop({ default: '' }) content: string;
}

export const CharacterNotesSchema = SchemaFactory.createForClass(CharacterNotesSchemaClass);
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/character-subdocs/schemas/
git commit -m "feat(character-subdocs): přidat Mongoose schemas pro sub-dokumenty"
```

---

## Task 3: Repositories

**Files:**
- Create: všech 5 repository souborů

- [ ] **Step 1: Vytvořit character-diary.repository.ts**

```typescript
// backend/src/modules/character-subdocs/repositories/character-diary.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterDiarySchemaClass } from '../schemas/character-diary.schema';
import { CharacterDiary, CustomDiaryBlock } from '../interfaces/character-diary.interface';
import { PageSection, PageSectionItem } from '../../pages/interfaces/page.interface';

@Injectable()
export class CharacterDiaryRepository {
  constructor(@InjectModel(CharacterDiarySchemaClass.name) private readonly model: Model<CharacterDiarySchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterDiary | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(characterId: string, worldId: string): Promise<CharacterDiary> {
    const created = new this.model({ characterId, worldId, sections: [], customData: {} });
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(characterId: string, data: Partial<CharacterDiary>): Promise<CharacterDiary | null> {
    const doc = await this.model.findOneAndUpdate({ characterId }, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterDiary {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      worldId: doc.worldId as string,
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
      personalDiarySchema: (doc.personalDiarySchema as CustomDiaryBlock[]) ?? undefined,
      customData: (doc.customData as Record<string, unknown>) ?? {},
    };
  }
}
```

- [ ] **Step 2: Vytvořit character-calendar.repository.ts**

```typescript
// backend/src/modules/character-subdocs/repositories/character-calendar.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterCalendarSchemaClass } from '../schemas/character-calendar.schema';
import { CharacterCalendar, CalendarEvent } from '../interfaces/character-calendar.interface';

@Injectable()
export class CharacterCalendarRepository {
  constructor(@InjectModel(CharacterCalendarSchemaClass.name) private readonly model: Model<CharacterCalendarSchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterCalendar | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(characterId: string, worldId: string): Promise<CharacterCalendar> {
    const created = new this.model({ characterId, worldId, events: [] });
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(characterId: string, data: Partial<CharacterCalendar>): Promise<CharacterCalendar | null> {
    const doc = await this.model.findOneAndUpdate({ characterId }, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterCalendar {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      worldId: doc.worldId as string,
      events: ((doc.events as Record<string, unknown>[]) ?? []).map((e) => ({
        id: e.id as string,
        title: (e.title as string) ?? '',
        start: e.start as string | undefined,
        end: e.end as string | undefined,
        allDay: e.allDay as boolean | undefined,
        hourStart: e.hourStart as string | undefined,
        hourEnd: e.hourEnd as string | undefined,
        description: e.description as string | undefined,
      } as CalendarEvent)),
    };
  }
}
```

- [ ] **Step 3: Vytvořit character-finance.repository.ts**

```typescript
// backend/src/modules/character-subdocs/repositories/character-finance.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterFinanceSchemaClass } from '../schemas/character-finance.schema';
import { CharacterFinance, FinanceEntry, FinanceTransaction } from '../interfaces/character-finance.interface';

@Injectable()
export class CharacterFinanceRepository {
  constructor(@InjectModel(CharacterFinanceSchemaClass.name) private readonly model: Model<CharacterFinanceSchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterFinance | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(characterId: string): Promise<CharacterFinance> {
    const created = new this.model({ characterId, isHidden: false, balance: 0, entries: [], transactions: [] });
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(characterId: string, data: Partial<CharacterFinance>): Promise<CharacterFinance | null> {
    const doc = await this.model.findOneAndUpdate({ characterId }, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterFinance {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      isHidden: (doc.isHidden as boolean) ?? false,
      accountType: (doc.accountType as string) ?? 'Osobní',
      accessLocation: (doc.accessLocation as string) ?? '',
      currency: (doc.currency as string) ?? '',
      lastSyncDate: doc.lastSyncDate as Date | undefined,
      balance: (doc.balance as number) ?? 0,
      entries: ((doc.entries as Record<string, unknown>[]) ?? []).map((e) => ({
        id: e.id as string,
        label: (e.label as string) ?? '',
        amount: (e.amount as number) ?? 0,
      } as FinanceEntry)),
      transactions: ((doc.transactions as Record<string, unknown>[]) ?? []).map((t) => ({
        id: t.id as string,
        date: t.date as Date,
        delta: (t.delta as number) ?? 0,
        description: (t.description as string) ?? '',
      } as FinanceTransaction)),
    };
  }
}
```

- [ ] **Step 4: Vytvořit character-inventory.repository.ts**

```typescript
// backend/src/modules/character-subdocs/repositories/character-inventory.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterInventorySchemaClass } from '../schemas/character-inventory.schema';
import { CharacterInventory } from '../interfaces/character-inventory.interface';
import { PageSection, PageSectionItem } from '../../pages/interfaces/page.interface';

@Injectable()
export class CharacterInventoryRepository {
  constructor(@InjectModel(CharacterInventorySchemaClass.name) private readonly model: Model<CharacterInventorySchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterInventory | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(characterId: string): Promise<CharacterInventory> {
    const created = new this.model({ characterId, isHidden: false, sections: [] });
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(characterId: string, data: Partial<CharacterInventory>): Promise<CharacterInventory | null> {
    const doc = await this.model.findOneAndUpdate({ characterId }, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterInventory {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      isHidden: (doc.isHidden as boolean) ?? false,
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
    };
  }
}
```

- [ ] **Step 5: Vytvořit character-notes.repository.ts**

```typescript
// backend/src/modules/character-subdocs/repositories/character-notes.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterNotesSchemaClass } from '../schemas/character-notes.schema';
import { CharacterNotes } from '../interfaces/character-notes.interface';

@Injectable()
export class CharacterNotesRepository {
  constructor(@InjectModel(CharacterNotesSchemaClass.name) private readonly model: Model<CharacterNotesSchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterNotes | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(characterId: string): Promise<CharacterNotes> {
    const created = new this.model({ characterId, content: '' });
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(characterId: string, data: Partial<CharacterNotes>): Promise<CharacterNotes | null> {
    const doc = await this.model.findOneAndUpdate({ characterId }, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): CharacterNotes {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      content: (doc.content as string) ?? '',
    };
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/character-subdocs/repositories/
git commit -m "feat(character-subdocs): přidat repositories pro sub-dokumenty"
```

---

## Task 4: Service + testy (auto-create + convert events)

**Files:**
- Create: `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts`
- Create: `backend/src/modules/character-subdocs/character-subdocs.service.ts`

- [ ] **Step 1: Napsat failing testy**

```typescript
// backend/src/modules/character-subdocs/character-subdocs.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CharacterSubdocsService } from './character-subdocs.service';

const mockDiary = { id: 'd1', characterId: 'char1', worldId: 'w1', sections: [], customData: {} };
const mockCalendar = { id: 'cal1', characterId: 'char1', worldId: 'w1', events: [] };
const mockFinance = { id: 'f1', characterId: 'char1', isHidden: false, accountType: 'Osobní', accessLocation: '', currency: 'Libra', balance: 100, entries: [{ id: 'e1', label: 'Plat', amount: 50 }], transactions: [] };
const mockInventory = { id: 'inv1', characterId: 'char1', isHidden: false, sections: [] };
const mockNotes = { id: 'n1', characterId: 'char1', content: '' };

describe('CharacterSubdocsService', () => {
  let service: CharacterSubdocsService;
  const mockDiaryRepo = { findByCharacterId: jest.fn(), create: jest.fn(), update: jest.fn() };
  const mockCalendarRepo = { findByCharacterId: jest.fn(), create: jest.fn(), update: jest.fn() };
  const mockFinanceRepo = { findByCharacterId: jest.fn(), create: jest.fn(), update: jest.fn() };
  const mockInventoryRepo = { findByCharacterId: jest.fn(), create: jest.fn(), update: jest.fn() };
  const mockNotesRepo = { findByCharacterId: jest.fn(), create: jest.fn(), update: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CharacterSubdocsService,
        { provide: 'ICharacterDiaryRepository', useValue: mockDiaryRepo },
        { provide: 'ICharacterCalendarRepository', useValue: mockCalendarRepo },
        { provide: 'ICharacterFinanceRepository', useValue: mockFinanceRepo },
        { provide: 'ICharacterInventoryRepository', useValue: mockInventoryRepo },
        { provide: 'ICharacterNotesRepository', useValue: mockNotesRepo },
      ],
    }).compile();
    service = module.get(CharacterSubdocsService);
  });

  describe('onCharacterCreated — CP', () => {
    it('vytvoří diary, calendar, finance, inventory, notes pro CP', async () => {
      mockDiaryRepo.create.mockResolvedValue(mockDiary);
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);
      mockFinanceRepo.create.mockResolvedValue(mockFinance);
      mockInventoryRepo.create.mockResolvedValue(mockInventory);
      mockNotesRepo.create.mockResolvedValue(mockNotes);

      await service.onCharacterCreated({ characterId: 'char1', worldId: 'w1', userId: 'user1', isNpc: false });

      expect(mockDiaryRepo.create).toHaveBeenCalledWith('char1', 'w1');
      expect(mockCalendarRepo.create).toHaveBeenCalledWith('char1', 'w1');
      expect(mockFinanceRepo.create).toHaveBeenCalledWith('char1');
      expect(mockInventoryRepo.create).toHaveBeenCalledWith('char1');
      expect(mockNotesRepo.create).toHaveBeenCalledWith('char1');
    });
  });

  describe('onCharacterCreated — NPC', () => {
    it('vytvoří diary, calendar, notes pro NPC — bez finance a inventory', async () => {
      mockDiaryRepo.create.mockResolvedValue(mockDiary);
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);
      mockNotesRepo.create.mockResolvedValue(mockNotes);

      await service.onCharacterCreated({ characterId: 'char1', worldId: 'w1', userId: undefined, isNpc: true });

      expect(mockDiaryRepo.create).toHaveBeenCalled();
      expect(mockCalendarRepo.create).toHaveBeenCalled();
      expect(mockNotesRepo.create).toHaveBeenCalled();
      expect(mockFinanceRepo.create).not.toHaveBeenCalled();
      expect(mockInventoryRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('onCharacterConverted — CP → NPC', () => {
    it('skryje finance a inventory při konverzi na NPC', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(mockFinance);
      mockInventoryRepo.findByCharacterId.mockResolvedValue(mockInventory);

      await service.onCharacterConverted({ characterId: 'char1', worldId: 'w1', toNpc: true, userId: undefined });

      expect(mockFinanceRepo.update).toHaveBeenCalledWith('char1', { isHidden: true });
      expect(mockInventoryRepo.update).toHaveBeenCalledWith('char1', { isHidden: true });
    });
  });

  describe('onCharacterConverted — NPC → CP', () => {
    it('odkryje finance pokud existují', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(mockFinance);
      mockInventoryRepo.findByCharacterId.mockResolvedValue(mockInventory);

      await service.onCharacterConverted({ characterId: 'char1', worldId: 'w1', toNpc: false, userId: 'user1' });

      expect(mockFinanceRepo.update).toHaveBeenCalledWith('char1', { isHidden: false });
      expect(mockInventoryRepo.update).toHaveBeenCalledWith('char1', { isHidden: false });
    });

    it('vytvoří finance pokud neexistují při NPC → CP konverzi', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      mockInventoryRepo.findByCharacterId.mockResolvedValue(null);
      mockFinanceRepo.create.mockResolvedValue(mockFinance);
      mockInventoryRepo.create.mockResolvedValue(mockInventory);

      await service.onCharacterConverted({ characterId: 'char1', worldId: 'w1', toNpc: false, userId: 'user1' });

      expect(mockFinanceRepo.create).toHaveBeenCalledWith('char1');
      expect(mockInventoryRepo.create).toHaveBeenCalledWith('char1');
    });
  });

  describe('addMonthly', () => {
    it('přičte součet entries k balance a zapíše transakci', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(mockFinance);
      mockFinanceRepo.update.mockResolvedValue({ ...mockFinance, balance: 150 });

      const result = await service.addMonthly('char1');

      expect(mockFinanceRepo.update).toHaveBeenCalledWith('char1', expect.objectContaining({
        balance: 150,
        lastSyncDate: expect.any(Date),
        transactions: expect.arrayContaining([expect.objectContaining({ delta: 50 })]),
      }));
      expect(result.balance).toBe(150);
    });

    it('vyhodí NotFoundException pokud finance neexistují', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      await expect(service.addMonthly('char1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('undoLastTransaction', () => {
    it('odebere poslední transakci a odečte delta od balance', async () => {
      const financeWithTx = {
        ...mockFinance,
        balance: 150,
        transactions: [
          { id: 'tx1', date: new Date(), delta: 50, description: 'měsíční zúčtování' },
        ],
      };
      mockFinanceRepo.findByCharacterId.mockResolvedValue(financeWithTx);
      mockFinanceRepo.update.mockResolvedValue({ ...financeWithTx, balance: 100, transactions: [] });

      const result = await service.undoLastTransaction('char1');

      expect(mockFinanceRepo.update).toHaveBeenCalledWith('char1', expect.objectContaining({
        balance: 100,
        transactions: [],
      }));
      expect(result.balance).toBe(100);
    });

    it('vyhodí NotFoundException pokud finance neexistují', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      await expect(service.undoLastTransaction('char1')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Spustit testy — ověřit že failují**

```bash
cd backend && npx jest character-subdocs.service.spec --no-coverage
```
Očekáváno: FAIL — `Cannot find module './character-subdocs.service'`

- [ ] **Step 3: Implementovat character-subdocs.service.ts**

```typescript
// backend/src/modules/character-subdocs/character-subdocs.service.ts
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import type { CharacterDiaryRepository } from './repositories/character-diary.repository';
import type { CharacterCalendarRepository } from './repositories/character-calendar.repository';
import type { CharacterFinanceRepository } from './repositories/character-finance.repository';
import type { CharacterInventoryRepository } from './repositories/character-inventory.repository';
import type { CharacterNotesRepository } from './repositories/character-notes.repository';
import type { CharacterDiary } from './interfaces/character-diary.interface';
import type { CharacterCalendar } from './interfaces/character-calendar.interface';
import type { CharacterFinance } from './interfaces/character-finance.interface';
import type { CharacterInventory } from './interfaces/character-inventory.interface';
import type { CharacterNotes } from './interfaces/character-notes.interface';

interface CharacterCreatedPayload {
  characterId: string;
  worldId: string;
  userId?: string;
  isNpc: boolean;
}

interface CharacterConvertedPayload {
  characterId: string;
  worldId: string;
  toNpc: boolean;
  userId?: string;
}

@Injectable()
export class CharacterSubdocsService {
  constructor(
    @Inject('ICharacterDiaryRepository') private readonly diaryRepo: CharacterDiaryRepository,
    @Inject('ICharacterCalendarRepository') private readonly calendarRepo: CharacterCalendarRepository,
    @Inject('ICharacterFinanceRepository') private readonly financeRepo: CharacterFinanceRepository,
    @Inject('ICharacterInventoryRepository') private readonly inventoryRepo: CharacterInventoryRepository,
    @Inject('ICharacterNotesRepository') private readonly notesRepo: CharacterNotesRepository,
  ) {}

  @OnEvent('character.created')
  async onCharacterCreated(payload: CharacterCreatedPayload): Promise<void> {
    const { characterId, worldId, isNpc } = payload;
    await Promise.all([
      this.diaryRepo.create(characterId, worldId),
      this.calendarRepo.create(characterId, worldId),
      this.notesRepo.create(characterId),
      ...(!isNpc ? [
        this.financeRepo.create(characterId),
        this.inventoryRepo.create(characterId),
      ] : []),
    ]);
  }

  @OnEvent('character.converted')
  async onCharacterConverted(payload: CharacterConvertedPayload): Promise<void> {
    const { characterId, toNpc } = payload;
    if (toNpc) {
      await Promise.all([
        this.financeRepo.update(characterId, { isHidden: true }),
        this.inventoryRepo.update(characterId, { isHidden: true }),
      ]);
    } else {
      const [finance, inventory] = await Promise.all([
        this.financeRepo.findByCharacterId(characterId),
        this.inventoryRepo.findByCharacterId(characterId),
      ]);
      await Promise.all([
        finance
          ? this.financeRepo.update(characterId, { isHidden: false })
          : this.financeRepo.create(characterId),
        inventory
          ? this.inventoryRepo.update(characterId, { isHidden: false })
          : this.inventoryRepo.create(characterId),
      ]);
    }
  }

  async getDiary(characterId: string): Promise<CharacterDiary> {
    const diary = await this.diaryRepo.findByCharacterId(characterId);
    if (!diary) throw new NotFoundException('Deník nenalezen');
    return diary;
  }

  async updateDiary(characterId: string, data: Partial<CharacterDiary>): Promise<CharacterDiary> {
    const updated = await this.diaryRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Deník nenalezen');
    return updated;
  }

  async getCalendar(characterId: string): Promise<CharacterCalendar> {
    const calendar = await this.calendarRepo.findByCharacterId(characterId);
    if (!calendar) throw new NotFoundException('Kalendář nenalezen');
    return calendar;
  }

  async updateCalendar(characterId: string, data: Partial<CharacterCalendar>): Promise<CharacterCalendar> {
    const updated = await this.calendarRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Kalendář nenalezen');
    return updated;
  }

  async getFinance(characterId: string): Promise<CharacterFinance> {
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (!finance) throw new NotFoundException('Finance nenalezeny');
    return finance;
  }

  async updateFinance(characterId: string, data: Partial<CharacterFinance>): Promise<CharacterFinance> {
    const updated = await this.financeRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Finance nenalezeny');
    return updated;
  }

  async addMonthly(characterId: string): Promise<CharacterFinance> {
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (!finance) throw new NotFoundException('Finance nenalezeny');

    const delta = finance.entries.reduce((sum, e) => sum + e.amount, 0);
    const transaction = { id: randomUUID(), date: new Date(), delta, description: 'měsíční zúčtování' };

    const updated = await this.financeRepo.update(characterId, {
      balance: finance.balance + delta,
      lastSyncDate: new Date(),
      transactions: [...finance.transactions, transaction],
    });
    return updated!;
  }

  async undoLastTransaction(characterId: string): Promise<CharacterFinance> {
    const finance = await this.financeRepo.findByCharacterId(characterId);
    if (!finance) throw new NotFoundException('Finance nenalezeny');
    if (finance.transactions.length === 0) return finance;

    const last = finance.transactions[finance.transactions.length - 1];
    const updated = await this.financeRepo.update(characterId, {
      balance: finance.balance - last.delta,
      transactions: finance.transactions.slice(0, -1),
    });
    return updated!;
  }

  async getInventory(characterId: string): Promise<CharacterInventory> {
    const inventory = await this.inventoryRepo.findByCharacterId(characterId);
    if (!inventory) throw new NotFoundException('Výbava nenalezena');
    return inventory;
  }

  async updateInventory(characterId: string, data: Partial<CharacterInventory>): Promise<CharacterInventory> {
    const updated = await this.inventoryRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Výbava nenalezena');
    return updated;
  }

  async getNotes(characterId: string): Promise<CharacterNotes> {
    const notes = await this.notesRepo.findByCharacterId(characterId);
    if (!notes) throw new NotFoundException('Poznámky nenalezeny');
    return notes;
  }

  async updateNotes(characterId: string, data: Partial<CharacterNotes>): Promise<CharacterNotes> {
    const updated = await this.notesRepo.update(characterId, data);
    if (!updated) throw new NotFoundException('Poznámky nenalezeny');
    return updated;
  }
}
```

- [ ] **Step 4: Spustit testy — ověřit že prochází**

```bash
cd backend && npx jest character-subdocs.service.spec --no-coverage
```
Očekáváno: PASS — všechny testy zelené

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/character-subdocs/character-subdocs.service.ts backend/src/modules/character-subdocs/character-subdocs.service.spec.ts
git commit -m "feat(character-subdocs): přidat CharacterSubdocsService + testy"
```

---

## Task 5: Controller + Module + registrace

**Files:**
- Create: `backend/src/modules/character-subdocs/character-subdocs.controller.ts`
- Create: `backend/src/modules/character-subdocs/character-subdocs.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvořit character-subdocs.controller.ts**

```typescript
// backend/src/modules/character-subdocs/character-subdocs.controller.ts
import { Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { CharacterSubdocsService } from './character-subdocs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CharactersService } from '../characters/characters.service';

@Controller('worlds/:worldId/characters/:slug')
@UseGuards(JwtAuthGuard)
export class CharacterSubdocsController {
  constructor(
    private readonly subdocsService: CharacterSubdocsService,
    private readonly charactersService: CharactersService,
  ) {}

  // ── Deník ──
  @Get('diary')
  async getDiary(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.getDiary(character.id);
  }

  @Patch('diary')
  async updateDiary(@Param('worldId') worldId: string, @Param('slug') slug: string, @Body() body: Record<string, unknown>) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.updateDiary(character.id, body);
  }

  // ── Kalendář ──
  @Get('calendar')
  async getCalendar(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.getCalendar(character.id);
  }

  @Patch('calendar')
  async updateCalendar(@Param('worldId') worldId: string, @Param('slug') slug: string, @Body() body: Record<string, unknown>) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.updateCalendar(character.id, body);
  }

  // ── Finance ──
  @Get('finance')
  async getFinance(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.getFinance(character.id);
  }

  @Patch('finance')
  async updateFinance(@Param('worldId') worldId: string, @Param('slug') slug: string, @Body() body: Record<string, unknown>) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.updateFinance(character.id, body);
  }

  @Post('finance/add-monthly')
  async addMonthly(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.addMonthly(character.id);
  }

  @Post('finance/undo')
  async undoLastTransaction(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.undoLastTransaction(character.id);
  }

  // ── Výbava ──
  @Get('inventory')
  async getInventory(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.getInventory(character.id);
  }

  @Patch('inventory')
  async updateInventory(@Param('worldId') worldId: string, @Param('slug') slug: string, @Body() body: Record<string, unknown>) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.updateInventory(character.id, body);
  }

  // ── Poznámky ──
  @Get('notes')
  async getNotes(@Param('worldId') worldId: string, @Param('slug') slug: string) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.getNotes(character.id);
  }

  @Patch('notes')
  async updateNotes(@Param('worldId') worldId: string, @Param('slug') slug: string, @Body() body: Record<string, unknown>) {
    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    return this.subdocsService.updateNotes(character.id, body);
  }
}
```

> **Poznámka:** Controller volá `charactersService.findBySlugRaw()` — přidej tuto metodu do CharactersService v `backend/src/modules/characters/characters.service.ts`:
>
> ```typescript
> async findBySlugRaw(slug: string, worldId: string): Promise<Character> {
>   const character = await this.charRepo.findBySlugAndWorld(slug, worldId);
>   if (!character) throw new NotFoundException('Postava nenalezena');
>   return character;
> }
> ```

- [ ] **Step 2: Přidat findBySlugRaw do CharactersService**

Otevři `backend/src/modules/characters/characters.service.ts` a přidej metodu `findBySlugRaw` dle Poznámky výše za metodou `findByUser`.

- [ ] **Step 3: Vytvořit character-subdocs.module.ts**

```typescript
// backend/src/modules/character-subdocs/character-subdocs.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterDiarySchemaClass, CharacterDiarySchema } from './schemas/character-diary.schema';
import { CharacterCalendarSchemaClass, CharacterCalendarSchema } from './schemas/character-calendar.schema';
import { CharacterFinanceSchemaClass, CharacterFinanceSchema } from './schemas/character-finance.schema';
import { CharacterInventorySchemaClass, CharacterInventorySchema } from './schemas/character-inventory.schema';
import { CharacterNotesSchemaClass, CharacterNotesSchema } from './schemas/character-notes.schema';
import { CharacterDiaryRepository } from './repositories/character-diary.repository';
import { CharacterCalendarRepository } from './repositories/character-calendar.repository';
import { CharacterFinanceRepository } from './repositories/character-finance.repository';
import { CharacterInventoryRepository } from './repositories/character-inventory.repository';
import { CharacterNotesRepository } from './repositories/character-notes.repository';
import { CharacterSubdocsService } from './character-subdocs.service';
import { CharacterSubdocsController } from './character-subdocs.controller';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CharacterDiarySchemaClass.name, schema: CharacterDiarySchema },
      { name: CharacterCalendarSchemaClass.name, schema: CharacterCalendarSchema },
      { name: CharacterFinanceSchemaClass.name, schema: CharacterFinanceSchema },
      { name: CharacterInventorySchemaClass.name, schema: CharacterInventorySchema },
      { name: CharacterNotesSchemaClass.name, schema: CharacterNotesSchema },
    ]),
    CharactersModule,
  ],
  controllers: [CharacterSubdocsController],
  providers: [
    CharacterSubdocsService,
    { provide: 'ICharacterDiaryRepository', useClass: CharacterDiaryRepository },
    { provide: 'ICharacterCalendarRepository', useClass: CharacterCalendarRepository },
    { provide: 'ICharacterFinanceRepository', useClass: CharacterFinanceRepository },
    { provide: 'ICharacterInventoryRepository', useClass: CharacterInventoryRepository },
    { provide: 'ICharacterNotesRepository', useClass: CharacterNotesRepository },
  ],
})
export class CharacterSubdocsModule {}
```

- [ ] **Step 4: Přidat CharacterSubdocsModule do app.module.ts**

```typescript
// backend/src/app.module.ts
// Přidat import:
import { CharacterSubdocsModule } from './modules/character-subdocs/character-subdocs.module';

// Přidat do imports[] pole (za CharactersModule):
CharacterSubdocsModule,
```

- [ ] **Step 5: Spustit build + všechny testy**

```bash
cd backend && npx tsc --noEmit && npx jest --no-coverage
```
Očekáváno: build bez chyb, všechny testy zelené

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/character-subdocs/ backend/src/modules/characters/characters.service.ts backend/src/app.module.ts
git commit -m "feat(character-subdocs): přidat controller, module a registraci v AppModule"
```
