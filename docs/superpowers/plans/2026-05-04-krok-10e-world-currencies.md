# WorldCurrencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit samostatný `WorldCurrenciesModule` s vlastní MongoDB kolekcí, CRUD endpointy pro správu měn per-world a konverzním endpointem pro přepočet mezi měnami.

**Architecture:** Nový modul `world-currencies` sleduje vzor ostatních modulů v projektu — schema, interface, repository (token injection), service, controller. Data jsou v kolekci `world_currencies` (1:1 per world). Seed logika pro měny dle žánru se přesune z `WorldsService` do `WorldCurrenciesService`. `WorldsModule` importuje `WorldCurrenciesModule` pro seed při vytvoření světa.

**Tech Stack:** NestJS, Mongoose, class-validator, class-transformer, Jest

---

## Přehled souborů

**Nové soubory:**
- `backend/src/modules/world-currencies/interfaces/world-currencies.interface.ts`
- `backend/src/modules/world-currencies/interfaces/world-currencies-repository.interface.ts`
- `backend/src/modules/world-currencies/schemas/world-currencies.schema.ts`
- `backend/src/modules/world-currencies/repositories/world-currencies.repository.ts`
- `backend/src/modules/world-currencies/dto/update-world-currencies.dto.ts`
- `backend/src/modules/world-currencies/dto/convert-currency.dto.ts`
- `backend/src/modules/world-currencies/world-currencies.service.ts`
- `backend/src/modules/world-currencies/world-currencies.service.spec.ts`
- `backend/src/modules/world-currencies/world-currencies.controller.ts`
- `backend/src/modules/world-currencies/world-currencies.module.ts`

**Modifikované soubory:**
- `backend/src/modules/worlds/worlds.service.ts` — odstranit `getCurrenciesForGenre()`, inject `WorldCurrenciesService`, volat seed
- `backend/src/modules/worlds/worlds.module.ts` — importovat `WorldCurrenciesModule`
- `backend/src/app.module.ts` — přidat `WorldCurrenciesModule`
- `backend/src/modules/worlds/worlds.service.spec.ts` — přidat mock pro `WorldCurrenciesService`

---

## Task 1: Interface a schema

**Files:**
- Create: `backend/src/modules/world-currencies/interfaces/world-currencies.interface.ts`
- Create: `backend/src/modules/world-currencies/interfaces/world-currencies-repository.interface.ts`
- Create: `backend/src/modules/world-currencies/schemas/world-currencies.schema.ts`

- [ ] **Step 1: Vytvoř interfaces**

`backend/src/modules/world-currencies/interfaces/world-currencies.interface.ts`:
```typescript
export interface WorldCurrencyItem {
  id: string;
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

export interface WorldCurrencies {
  id: string;
  worldId: string;
  items: WorldCurrencyItem[];
  updatedAt: Date;
}
```

`backend/src/modules/world-currencies/interfaces/world-currencies-repository.interface.ts`:
```typescript
import { WorldCurrencies, WorldCurrencyItem } from './world-currencies.interface';

export interface IWorldCurrenciesRepository {
  findByWorldId(worldId: string): Promise<WorldCurrencies | null>;
  upsert(worldId: string, items: WorldCurrencyItem[]): Promise<WorldCurrencies>;
}
```

- [ ] **Step 2: Vytvoř schema**

`backend/src/modules/world-currencies/schemas/world-currencies.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldCurrenciesDocument = HydratedDocument<WorldCurrenciesSchemaClass>;

@Schema({ collection: 'world_currencies' })
export class WorldCurrenciesSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ type: [Object], default: [] }) items: Record<string, unknown>[];
  @Prop({ default: Date.now }) updatedAt: Date;
}

export const WorldCurrenciesSchema = SchemaFactory.createForClass(WorldCurrenciesSchemaClass);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/world-currencies/interfaces/ backend/src/modules/world-currencies/schemas/
git commit -m "feat(world-currencies): interfaces a schema"
```

---

## Task 2: Repository

**Files:**
- Create: `backend/src/modules/world-currencies/repositories/world-currencies.repository.ts`

- [ ] **Step 1: Vytvoř repository**

`backend/src/modules/world-currencies/repositories/world-currencies.repository.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldCurrenciesSchemaClass } from '../schemas/world-currencies.schema';
import { WorldCurrencies, WorldCurrencyItem } from '../interfaces/world-currencies.interface';
import type { IWorldCurrenciesRepository } from '../interfaces/world-currencies-repository.interface';

@Injectable()
export class MongoWorldCurrenciesRepository implements IWorldCurrenciesRepository {
  constructor(
    @InjectModel(WorldCurrenciesSchemaClass.name)
    private readonly model: Model<WorldCurrenciesSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<WorldCurrencies | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async upsert(worldId: string, items: WorldCurrencyItem[]): Promise<WorldCurrencies> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId },
        { $set: { items, worldId, updatedAt: new Date() } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): WorldCurrencies {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      items: (doc.items as WorldCurrencyItem[]) ?? [],
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/world-currencies/repositories/
git commit -m "feat(world-currencies): repository"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/world-currencies/dto/update-world-currencies.dto.ts`
- Create: `backend/src/modules/world-currencies/dto/convert-currency.dto.ts`

- [ ] **Step 1: Vytvoř DTOs**

`backend/src/modules/world-currencies/dto/update-world-currencies.dto.ts`:
```typescript
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorldCurrencyItemDto {
  @IsOptional() @IsString() id?: string;
  @IsString() code: string;
  @IsString() name: string;
  @IsString() symbol: string;
  @IsNumber() @Min(0.0001) rate: number;
}

export class UpdateWorldCurrenciesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorldCurrencyItemDto)
  items: WorldCurrencyItemDto[];
}
```

`backend/src/modules/world-currencies/dto/convert-currency.dto.ts`:
```typescript
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class ConvertCurrencyDto {
  @IsNumber() @Min(0) amount: number;
  @IsString() @MinLength(1) from: string;
  @IsString() @MinLength(1) to: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/world-currencies/dto/
git commit -m "feat(world-currencies): DTOs"
```

---

## Task 4: Service — testy

**Files:**
- Create: `backend/src/modules/world-currencies/world-currencies.service.spec.ts`

- [ ] **Step 1: Napiš failing testy**

`backend/src/modules/world-currencies/world-currencies.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorldCurrenciesService } from './world-currencies.service';

const mockRepo = {
  findByWorldId: jest.fn(),
  upsert: jest.fn(),
};

const mockMembershipRepo = {
  findByUserAndWorld: jest.fn(),
};

const mockWorldsRepo = {
  findById: jest.fn(),
};

const mockWorld = {
  id: 'world1',
  name: 'Matrix',
  slug: 'matrix',
  ownerId: 'owner1',
  genre: 'fantasy',
  isActive: true,
  accessMode: 'private',
  playerCount: 0,
  system: 'matrix',
  tones: [],
  dice: [],
  offeredCharacters: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockItems = [
  { id: 'id1', code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
  { id: 'id2', code: 'ST', name: 'Stříbrňák', symbol: 'St', rate: 0.1 },
  { id: 'id3', code: 'MD', name: 'Měďák', symbol: 'Md', rate: 0.01 },
];

describe('WorldCurrenciesService', () => {
  let service: WorldCurrenciesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorldCurrenciesService,
        { provide: 'IWorldCurrenciesRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
      ],
    }).compile();
    service = module.get(WorldCurrenciesService);
    jest.clearAllMocks();
  });

  describe('getCurrencies', () => {
    it('should return currencies for world member', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockRepo.findByWorldId.mockResolvedValue({ id: 'c1', worldId: 'world1', items: mockItems, updatedAt: new Date() });

      const result = await service.getCurrencies('world1', 'user1');
      expect(result.items).toHaveLength(3);
      expect(result.worldId).toBe('world1');
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);

      await expect(service.getCurrencies('world1', 'user1')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty items when no document exists', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockRepo.findByWorldId.mockResolvedValue(null);

      const result = await service.getCurrencies('world1', 'user1');
      expect(result.items).toEqual([]);
    });
  });

  describe('updateCurrencies', () => {
    it('should update currencies for PJ', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 4 }); // PJ
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: mockItems, updatedAt: new Date() });

      const result = await service.updateCurrencies('world1', mockItems, { id: 'pj1', role: 3, username: 'pj' });
      expect(result.items).toHaveLength(3);
      expect(mockRepo.upsert).toHaveBeenCalledWith('world1', expect.arrayContaining([expect.objectContaining({ code: 'ZL' })]));
    });

    it('should throw ForbiddenException for Hrac', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 }); // Hrac

      await expect(
        service.updateCurrencies('world1', mockItems, { id: 'user1', role: 3, username: 'u' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should assign UUID to items without id', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 4 });
      mockRepo.upsert.mockImplementation((_wId, items) =>
        Promise.resolve({ id: 'c1', worldId: 'world1', items, updatedAt: new Date() }),
      );

      const itemsWithoutId = [{ code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 }];
      const result = await service.updateCurrencies('world1', itemsWithoutId as any, { id: 'pj1', role: 4, username: 'pj' });
      expect(result.items[0].id).toBeDefined();
      expect(result.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('convert', () => {
    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockRepo.findByWorldId.mockResolvedValue({ id: 'c1', worldId: 'world1', items: mockItems, updatedAt: new Date() });
    });

    it('should convert ZL to ST correctly', async () => {
      const result = await service.convert('world1', { amount: 5, from: 'ZL', to: 'ST' }, 'user1');
      expect(result.result).toBe(50);
    });

    it('should convert ST to MD correctly', async () => {
      const result = await service.convert('world1', { amount: 1, from: 'ST', to: 'MD' }, 'user1');
      expect(result.result).toBe(10);
    });

    it('should throw BadRequestException when from code not found', async () => {
      await expect(service.convert('world1', { amount: 1, from: 'UNKNOWN', to: 'ST' }, 'user1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when from === to', async () => {
      await expect(service.convert('world1', { amount: 1, from: 'ZL', to: 'ZL' }, 'user1')).rejects.toThrow(BadRequestException);
    });

    it('should round result to 4 decimal places', async () => {
      const result = await service.convert('world1', { amount: 1, from: 'MD', to: 'ST' }, 'user1');
      expect(result.result).toBe(0.1);
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.convert('world1', { amount: 1, from: 'ZL', to: 'ST' }, 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('seedForWorld', () => {
    it('should seed fantasy currencies', async () => {
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: [], updatedAt: new Date() });
      await service.seedForWorld('world1', 'fantasy');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([
          expect.objectContaining({ code: 'ZL', rate: 1.0 }),
          expect.objectContaining({ code: 'ST', rate: 0.1 }),
          expect.objectContaining({ code: 'MD', rate: 0.01 }),
        ]),
      );
    });

    it('should seed cyberpunk currencies', async () => {
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: [], updatedAt: new Date() });
      await service.seedForWorld('world1', 'cyberpunk');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([expect.objectContaining({ code: 'CR' })]),
      );
    });

    it('should seed default currency for unknown genre', async () => {
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: [], updatedAt: new Date() });
      await service.seedForWorld('world1', undefined);
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([expect.objectContaining({ code: 'MNC' })]),
      );
    });
  });
});
```

- [ ] **Step 2: Spusť testy — ověř že padají**

```bash
cd backend && npx jest world-currencies.service.spec.ts --no-coverage
```

Očekávaný výstup: `Cannot find module './world-currencies.service'`

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/world-currencies/world-currencies.service.spec.ts
git commit -m "test(world-currencies): failing testy pro service"
```

---

## Task 5: Service — implementace

**Files:**
- Create: `backend/src/modules/world-currencies/world-currencies.service.ts`

- [ ] **Step 1: Implementuj service**

`backend/src/modules/world-currencies/world-currencies.service.ts`:
```typescript
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IWorldCurrenciesRepository } from './interfaces/world-currencies-repository.interface';
import type { WorldCurrencies, WorldCurrencyItem } from './interfaces/world-currencies.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IWorldsRepository } from '../worlds/interfaces/worlds-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { ConvertCurrencyDto } from './dto/convert-currency.dto';

export interface CurrencyRequester {
  id: string;
  role: UserRole;
  username: string;
}

@Injectable()
export class WorldCurrenciesService {
  constructor(
    @Inject('IWorldCurrenciesRepository') private readonly repo: IWorldCurrenciesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
  ) {}

  async getCurrencies(worldId: string, userId: string): Promise<WorldCurrencies> {
    await this.assertMember(worldId, userId);
    const doc = await this.repo.findByWorldId(worldId);
    if (!doc) return { id: '', worldId, items: [], updatedAt: new Date() };
    return doc;
  }

  async updateCurrencies(
    worldId: string,
    items: WorldCurrencyItem[],
    requester: CurrencyRequester,
  ): Promise<WorldCurrencies> {
    await this.assertCanAdmin(worldId, requester);
    const normalized = items.map((item) => ({
      ...item,
      id: item.id ?? crypto.randomUUID(),
    }));
    return this.repo.upsert(worldId, normalized);
  }

  async convert(
    worldId: string,
    dto: ConvertCurrencyDto,
    userId: string,
  ): Promise<{ from: string; to: string; amount: number; result: number }> {
    await this.assertMember(worldId, userId);
    const doc = await this.repo.findByWorldId(worldId);
    const items = doc?.items ?? [];

    if (dto.from === dto.to) throw new BadRequestException('from a to musí být různé');

    const fromCurrency = items.find((c) => c.code === dto.from);
    const toCurrency = items.find((c) => c.code === dto.to);

    if (!fromCurrency) throw new BadRequestException(`Měna '${dto.from}' neexistuje`);
    if (!toCurrency) throw new BadRequestException(`Měna '${dto.to}' neexistuje`);

    const raw = dto.amount * (fromCurrency.rate / toCurrency.rate);
    const result = Math.round(raw * 10000) / 10000;

    return { from: dto.from, to: dto.to, amount: dto.amount, result };
  }

  async seedForWorld(worldId: string, genre?: string): Promise<void> {
    const items = this.getItemsForGenre(genre);
    await this.repo.upsert(worldId, items);
  }

  private getItemsForGenre(genre?: string): WorldCurrencyItem[] {
    const id = () => crypto.randomUUID();
    const fantasy = ['fantasy', 'dark-fantasy', 'heroic-fantasy', 'sword-sorcery', 'grimdark', 'mytologicky'];
    const cyber = ['cyberpunk', 'sci-fi', 'hard-sci-fi', 'soft-sci-fi', 'biopunk'];
    const space = ['space-opera', 'military'];
    const postapo = ['postapo', 'post-postapo', 'dieselpunk'];

    if (genre && fantasy.includes(genre)) {
      return [
        { id: id(), code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
        { id: id(), code: 'ST', name: 'Stříbrňák', symbol: 'St', rate: 0.1 },
        { id: id(), code: 'MD', name: 'Měďák', symbol: 'Md', rate: 0.01 },
      ];
    }
    if (genre && cyber.includes(genre)) {
      return [
        { id: id(), code: 'CR', name: 'Kredit', symbol: 'Cr', rate: 1.0 },
        { id: id(), code: 'NUSD', name: 'NUSA Dolar', symbol: '$', rate: 2.5 },
      ];
    }
    if (genre && space.includes(genre)) {
      return [
        { id: id(), code: 'CR', name: 'Kredit', symbol: 'Cr', rate: 1.0 },
        { id: id(), code: 'KR', name: 'Krystal', symbol: 'Kr', rate: 100.0 },
      ];
    }
    if (genre && postapo.includes(genre)) {
      return [
        { id: id(), code: 'ZAT', name: 'Zátka', symbol: 'Zt', rate: 1.0 },
        { id: id(), code: 'PR', name: 'Příděl', symbol: 'Př', rate: 50.0 },
      ];
    }
    return [{ id: id(), code: 'MNC', name: 'Mince', symbol: 'Mn', rate: 1.0 }];
  }

  private async assertMember(worldId: string, userId: string): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership) throw new ForbiddenException('Nejsi členem tohoto světa');
  }

  private async assertCanAdmin(worldId: string, requester: CurrencyRequester): Promise<void> {
    const world = await this.worldsRepo.findById(worldId);
    if (!world) throw new NotFoundException('Svět nenalezen');
    if (requester.role <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
    if (!membership || membership.role < WorldRole.PJ) throw new ForbiddenException('Nedostatečná oprávnění');
  }
}
```

- [ ] **Step 2: Spusť testy — ověř že prochází**

```bash
cd backend && npx jest world-currencies.service.spec.ts --no-coverage
```

Očekávaný výstup: všechny testy `PASS`

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/world-currencies/world-currencies.service.ts
git commit -m "feat(world-currencies): service implementace"
```

---

## Task 6: Controller

**Files:**
- Create: `backend/src/modules/world-currencies/world-currencies.controller.ts`

- [ ] **Step 1: Implementuj controller**

`backend/src/modules/world-currencies/world-currencies.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { WorldCurrenciesService } from './world-currencies.service';
import { UpdateWorldCurrenciesDto } from './dto/update-world-currencies.dto';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrencyRequester } from './world-currencies.service';

@Controller('worlds')
export class WorldCurrenciesController {
  constructor(private readonly service: WorldCurrenciesService) {}

  @Get(':worldId/currencies')
  @UseGuards(JwtAuthGuard)
  getCurrencies(
    @Param('worldId') worldId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.getCurrencies(worldId, user.id);
  }

  @Put(':worldId/currencies')
  @UseGuards(JwtAuthGuard)
  updateCurrencies(
    @Param('worldId') worldId: string,
    @Body() dto: UpdateWorldCurrenciesDto,
    @CurrentUser() user: CurrencyRequester,
  ) {
    return this.service.updateCurrencies(worldId, dto.items as any, user);
  }

  @Post(':worldId/currencies/convert')
  @UseGuards(JwtAuthGuard)
  convert(
    @Param('worldId') worldId: string,
    @Body() dto: ConvertCurrencyDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.convert(worldId, dto, user.id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/world-currencies/world-currencies.controller.ts
git commit -m "feat(world-currencies): controller"
```

---

## Task 7: Module + registrace

**Files:**
- Create: `backend/src/modules/world-currencies/world-currencies.module.ts`
- Modify: `backend/src/modules/worlds/worlds.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř module**

`backend/src/modules/world-currencies/world-currencies.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldCurrenciesSchemaClass, WorldCurrenciesSchema } from './schemas/world-currencies.schema';
import { MongoWorldCurrenciesRepository } from './repositories/world-currencies.repository';
import { WorldCurrenciesService } from './world-currencies.service';
import { WorldCurrenciesController } from './world-currencies.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldCurrenciesSchemaClass.name, schema: WorldCurrenciesSchema },
    ]),
  ],
  controllers: [WorldCurrenciesController],
  providers: [
    WorldCurrenciesService,
    { provide: 'IWorldCurrenciesRepository', useClass: MongoWorldCurrenciesRepository },
  ],
  exports: [WorldCurrenciesService],
})
export class WorldCurrenciesModule {}
```

- [ ] **Step 2: Importuj WorldCurrenciesModule do WorldsModule**

Soubor `backend/src/modules/worlds/worlds.module.ts` — přidej import `WorldCurrenciesModule`. Pozor: `WorldCurrenciesModule` potřebuje `IWorldsRepository` a `IWorldMembershipRepository` které jsou v `WorldsModule` — použij `forwardRef` na obou stranách:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldSchemaClass, WorldSchema } from './schemas/world.schema';
import { WorldMembershipSchemaClass, WorldMembershipSchema } from './schemas/world-membership.schema';
import { WorldSettingsSchemaClass, WorldSettingsSchema } from './schemas/world-settings.schema';
import { MongoWorldsRepository } from './repositories/worlds.repository';
import { MongoWorldMembershipRepository } from './repositories/world-membership.repository';
import { MongoWorldSettingsRepository } from './repositories/world-settings.repository';
import { WorldsService } from './worlds.service';
import { WorldsController } from './worlds.controller';
import { WorldsGateway } from './worlds.gateway';
import { PagesModule } from '../pages/pages.module';
import { WorldCurrenciesModule } from '../world-currencies/world-currencies.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: WorldMembershipSchemaClass.name, schema: WorldMembershipSchema },
      { name: WorldSettingsSchemaClass.name, schema: WorldSettingsSchema },
    ]),
    forwardRef(() => PagesModule),
    forwardRef(() => WorldCurrenciesModule),
  ],
  controllers: [WorldsController],
  providers: [
    WorldsService,
    { provide: 'IWorldsRepository', useClass: MongoWorldsRepository },
    { provide: 'IWorldMembershipRepository', useClass: MongoWorldMembershipRepository },
    { provide: 'IWorldSettingsRepository', useClass: MongoWorldSettingsRepository },
    WorldsGateway,
  ],
  exports: [WorldsService, 'IWorldsRepository', 'IWorldMembershipRepository'],
})
export class WorldsModule {}
```

- [ ] **Step 3: Přidej WorldCurrenciesModule do AppModule**

V `backend/src/app.module.ts` přidej import `WorldCurrenciesModule` za `WorldsModule`:

```typescript
import { WorldCurrenciesModule } from './modules/world-currencies/world-currencies.module';
```

A do pole `imports`:
```typescript
WorldCurrenciesModule,
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/world-currencies/world-currencies.module.ts backend/src/modules/worlds/worlds.module.ts backend/src/app.module.ts
git commit -m "feat(world-currencies): modul registrace"
```

---

## Task 8: Migrace seed logiky z WorldsService

**Files:**
- Modify: `backend/src/modules/worlds/worlds.service.ts`
- Modify: `backend/src/modules/worlds/worlds.service.spec.ts`

- [ ] **Step 1: Uprav WorldsService — nahraď seed volání**

V `backend/src/modules/worlds/worlds.service.ts`:

1. Přidej import a inject `WorldCurrenciesService`:
```typescript
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
```

Do konstruktoru přidej:
```typescript
private readonly currenciesService: WorldCurrenciesService,
```

2. V metodě `create()` nahraď:
```typescript
// ODSTRAŇ tyto 2 řádky:
const currencies = this.getCurrenciesForGenre(dto.genre);
await this.settingsRepo.upsert(world.id, { currencies });

// NAHRAĎ za:
await this.currenciesService.seedForWorld(world.id, dto.genre);
```

3. Odstraň celou privátní metodu `getCurrenciesForGenre()` (řádky 295–328).

- [ ] **Step 2: Uprav test pro WorldsService**

V `backend/src/modules/worlds/worlds.service.spec.ts` přidej mock pro `WorldCurrenciesService` do `beforeEach`:

```typescript
const mockCurrenciesService = {
  seedForWorld: jest.fn(),
};
```

A do `providers`:
```typescript
{ provide: WorldCurrenciesService, useValue: mockCurrenciesService },
```

Přidej také import:
```typescript
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
```

- [ ] **Step 3: Spusť testy**

```bash
cd backend && npx jest worlds.service.spec.ts world-currencies.service.spec.ts --no-coverage
```

Očekávaný výstup: všechny testy `PASS`

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/worlds/worlds.service.ts backend/src/modules/worlds/worlds.service.spec.ts
git commit -m "feat(world-currencies): přesun seed logiky z WorldsService"
```

---

## Task 9: Smoke test — build

- [ ] **Step 1: Zkompiluj projekt**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby

- [ ] **Step 2: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: všechny testy `PASS`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(world-currencies): krok 10e hotov"
```
