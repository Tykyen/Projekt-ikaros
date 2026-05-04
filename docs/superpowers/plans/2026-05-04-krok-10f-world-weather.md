# WorldWeather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat modul `WeatherGenerators` — PJ může vytvořit více generátorů počasí per world (per planeta/sféra), generovat nebo ručně nastavit `currentWeather` a broadcastovat ho do chat kanálu nebo taktické mapy.

**Architecture:** Samostatný modul `weather-generators` s vlastní kolekcí `world_weather_generators`. Service obsahuje generovací algoritmus (vážená náhoda z config parametrů). Broadcast do chatu jde přes novou metodu `ChatService.createSystemMessage()`. Broadcast do mapy jde přes EventEmitter → MapsGateway `@OnEvent`.

**Tech Stack:** NestJS, Mongoose, Jest, EventEmitter2, Socket.io

---

## Mapa souborů

**Nové soubory:**
- `backend/src/modules/weather-generators/interfaces/weather-generator.interface.ts` — entity typy
- `backend/src/modules/weather-generators/interfaces/weather-generator-repository.interface.ts` — repository kontrakt
- `backend/src/modules/weather-generators/schemas/weather-generator.schema.ts` — Mongoose schema
- `backend/src/modules/weather-generators/repositories/weather-generator.repository.ts` — MongoDB implementace
- `backend/src/modules/weather-generators/repositories/weather-generator.repository.spec.ts` — testy repository
- `backend/src/modules/weather-generators/dto/create-weather-generator.dto.ts`
- `backend/src/modules/weather-generators/dto/update-weather-generator.dto.ts`
- `backend/src/modules/weather-generators/dto/set-current-weather.dto.ts`
- `backend/src/modules/weather-generators/dto/broadcast-weather.dto.ts`
- `backend/src/modules/weather-generators/weather-generators.service.ts`
- `backend/src/modules/weather-generators/weather-generators.service.spec.ts`
- `backend/src/modules/weather-generators/weather-generators.controller.ts`
- `backend/src/modules/weather-generators/weather-generators.module.ts`

**Modifikované soubory:**
- `backend/src/modules/chat/chat.service.ts` — přidána metoda `createSystemMessage()`
- `backend/src/modules/chat/chat.module.ts` — export `ChatService`
- `backend/src/modules/maps/maps.gateway.ts` — `@OnEvent('weather.updated')` handler
- `backend/src/modules/worlds/worlds.service.ts` — seed defaultního generátoru při vytvoření světa
- `backend/src/app.module.ts` — registrace `WeatherGeneratorsModule`

---

## Task 1: Interfaces & Schema

**Files:**
- Create: `backend/src/modules/weather-generators/interfaces/weather-generator.interface.ts`
- Create: `backend/src/modules/weather-generators/interfaces/weather-generator-repository.interface.ts`
- Create: `backend/src/modules/weather-generators/schemas/weather-generator.schema.ts`

- [ ] **Step 1: Vytvoř entity interfaces**

```typescript
// backend/src/modules/weather-generators/interfaces/weather-generator.interface.ts

export interface WeatherTypeEntry {
  type: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'custom';
  label: string;
  icon: string;
  probability: number;
  cloudRange: [number, number];
  precipRange: [number, number];
}

export interface CustomFieldConfig {
  label: string;
  possibleValues: string[];
  probability: number;
}

export interface WeatherGeneratorConfig {
  tempMin: number;
  tempMax: number;
  tempUnit: 'C' | 'F';
  weatherTypes: WeatherTypeEntry[];
  windMin: number;
  windMax: number;
  windGustMultiplier: number;
  pressureMin: number;
  pressureMax: number;
  humidityMin: number;
  humidityMax: number;
  customFields: CustomFieldConfig[];
}

export interface WeatherExtra {
  label: string;
  value: string;
  description?: string;
}

export interface WeatherResult {
  generatedAt: Date;
  isManual: boolean;
  temperature: number;
  tempUnit: string;
  weatherType: string;
  weatherIcon: string;
  cloudiness: { value: string; description: string };
  precipitation: { value: string; description: string };
  wind: { speed: number; gusts: number; unit: 'kmh' };
  pressure: { value: number; trend: string };
  humidity: number;
  extras: WeatherExtra[];
  narrativeText?: string;
}

export interface WeatherGenerator {
  id: string;
  worldId: string;
  name: string;
  description?: string;
  config: WeatherGeneratorConfig;
  currentWeather?: WeatherResult;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Vytvoř repository interface**

```typescript
// backend/src/modules/weather-generators/interfaces/weather-generator-repository.interface.ts

import { WeatherGenerator, WeatherResult } from './weather-generator.interface';

export interface IWeatherGeneratorRepository {
  findById(id: string): Promise<WeatherGenerator | null>;
  findByWorldId(worldId: string): Promise<WeatherGenerator[]>;
  save(data: Partial<WeatherGenerator>): Promise<WeatherGenerator>;
  update(id: string, data: Partial<WeatherGenerator>): Promise<WeatherGenerator | null>;
  setCurrentWeather(id: string, weather: WeatherResult): Promise<WeatherGenerator | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Vytvoř Mongoose schema**

```typescript
// backend/src/modules/weather-generators/schemas/weather-generator.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
class WeatherTypeEntrySchema {
  @Prop({ required: true }) type: string;
  @Prop({ required: true }) label: string;
  @Prop({ required: true }) icon: string;
  @Prop({ required: true }) probability: number;
  @Prop({ type: [Number], required: true }) cloudRange: number[];
  @Prop({ type: [Number], required: true }) precipRange: number[];
}

@Schema({ _id: false })
class CustomFieldConfigSchema {
  @Prop({ required: true }) label: string;
  @Prop({ type: [String], required: true }) possibleValues: string[];
  @Prop({ required: true }) probability: number;
}

@Schema({ _id: false })
class WeatherGeneratorConfigSchema {
  @Prop({ required: true }) tempMin: number;
  @Prop({ required: true }) tempMax: number;
  @Prop({ default: 'C' }) tempUnit: string;
  @Prop({ type: [Object], default: [] }) weatherTypes: WeatherTypeEntrySchema[];
  @Prop({ default: 0 }) windMin: number;
  @Prop({ default: 100 }) windMax: number;
  @Prop({ default: 2.0 }) windGustMultiplier: number;
  @Prop({ default: 960 }) pressureMin: number;
  @Prop({ default: 1040 }) pressureMax: number;
  @Prop({ default: 0 }) humidityMin: number;
  @Prop({ default: 100 }) humidityMax: number;
  @Prop({ type: [Object], default: [] }) customFields: CustomFieldConfigSchema[];
}

@Schema({ timestamps: true, collection: 'world_weather_generators' })
export class WeatherGeneratorSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  @Prop({ type: Object, required: true }) config: WeatherGeneratorConfigSchema;
  @Prop({ type: Object }) currentWeather?: Record<string, unknown>;
}

export const WeatherGeneratorSchema = SchemaFactory.createForClass(WeatherGeneratorSchemaClass);
WeatherGeneratorSchema.index({ worldId: 1 });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/weather-generators/interfaces/ backend/src/modules/weather-generators/schemas/
git commit -m "feat(weather): interfaces and schema"
```

---

## Task 2: Repository

**Files:**
- Create: `backend/src/modules/weather-generators/repositories/weather-generator.repository.ts`
- Create: `backend/src/modules/weather-generators/repositories/weather-generator.repository.spec.ts`

- [ ] **Step 1: Napiš failing test**

```typescript
// backend/src/modules/weather-generators/repositories/weather-generator.repository.spec.ts

import { MongoWeatherGeneratorRepository } from './weather-generator.repository';
import { WeatherGenerator } from '../interfaces/weather-generator.interface';

const mockModel = {
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn(),
};

function makeModel(mock: Record<string, jest.Mock>) {
  const inst = function (data: unknown) {
    return { ...data, save: jest.fn().mockResolvedValue({ _id: 'id1', ...data }) };
  };
  Object.assign(inst, mock);
  return inst;
}

describe('MongoWeatherGeneratorRepository', () => {
  let repo: MongoWeatherGeneratorRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new MongoWeatherGeneratorRepository(makeModel(mockModel) as never);
  });

  it('findByWorldId returns mapped generators', async () => {
    mockModel.find.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve([{ _id: 'id1', worldId: 'w1', name: 'Test', config: {}, createdAt: new Date(), updatedAt: new Date() }]) }),
    });
    const result = await repo.findByWorldId('w1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id1');
    expect(result[0].worldId).toBe('w1');
  });

  it('delete returns true when found', async () => {
    mockModel.findByIdAndDelete.mockReturnValue({ exec: () => Promise.resolve({ _id: 'id1' }) });
    const result = await repo.delete('id1');
    expect(result).toBe(true);
  });

  it('delete returns false when not found', async () => {
    mockModel.findByIdAndDelete.mockReturnValue({ exec: () => Promise.resolve(null) });
    const result = await repo.delete('nonexistent');
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Spusť test — ověř že failuje**

```bash
cd backend && npx jest weather-generator.repository.spec.ts --no-coverage
```

Očekáváno: FAIL — `MongoWeatherGeneratorRepository` neexistuje.

- [ ] **Step 3: Implementuj repository**

```typescript
// backend/src/modules/weather-generators/repositories/weather-generator.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WeatherGeneratorSchemaClass } from '../schemas/weather-generator.schema';
import { IWeatherGeneratorRepository } from '../interfaces/weather-generator-repository.interface';
import { WeatherGenerator, WeatherResult } from '../interfaces/weather-generator.interface';

@Injectable()
export class MongoWeatherGeneratorRepository implements IWeatherGeneratorRepository {
  constructor(
    @InjectModel(WeatherGeneratorSchemaClass.name)
    private readonly model: Model<WeatherGeneratorSchemaClass>,
  ) {}

  async findById(id: string): Promise<WeatherGenerator | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByWorldId(worldId: string): Promise<WeatherGenerator[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async save(data: Partial<WeatherGenerator>): Promise<WeatherGenerator> {
    const instance = new this.model(data);
    const saved = await instance.save();
    return this.toEntity(saved.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<WeatherGenerator>): Promise<WeatherGenerator | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async setCurrentWeather(id: string, weather: WeatherResult): Promise<WeatherGenerator | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: { currentWeather: weather } }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  private toEntity(doc: Record<string, unknown>): WeatherGenerator {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: doc.name as string,
      description: doc.description as string | undefined,
      config: doc.config as WeatherGenerator['config'],
      currentWeather: doc.currentWeather as WeatherResult | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 4: Spusť test — ověř PASS**

```bash
cd backend && npx jest weather-generator.repository.spec.ts --no-coverage
```

Očekáváno: PASS (3 testy)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/weather-generators/repositories/
git commit -m "feat(weather): repository implementation"
```

---

## Task 3: DTOs

**Files:**
- Create: `backend/src/modules/weather-generators/dto/create-weather-generator.dto.ts`
- Create: `backend/src/modules/weather-generators/dto/update-weather-generator.dto.ts`
- Create: `backend/src/modules/weather-generators/dto/set-current-weather.dto.ts`
- Create: `backend/src/modules/weather-generators/dto/broadcast-weather.dto.ts`

- [ ] **Step 1: Vytvoř create DTO**

```typescript
// backend/src/modules/weather-generators/dto/create-weather-generator.dto.ts

import { Type } from 'class-transformer';
import {
  IsString, IsNumber, IsArray, IsOptional, IsIn,
  Min, Max, ValidateNested, ArrayMinSize, IsNotEmpty,
} from 'class-validator';

export class WeatherTypeEntryDto {
  @IsIn(['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'custom'])
  type: string;

  @IsString() @IsNotEmpty() label: string;
  @IsString() @IsNotEmpty() icon: string;

  @IsNumber() @Min(0) @Max(100)
  probability: number;

  @IsArray() @ArrayMinSize(2)
  cloudRange: [number, number];

  @IsArray() @ArrayMinSize(2)
  precipRange: [number, number];
}

export class CustomFieldConfigDto {
  @IsString() @IsNotEmpty() label: string;
  @IsArray() @ArrayMinSize(1) possibleValues: string[];
  @IsNumber() @Min(0) @Max(100) probability: number;
}

export class WeatherGeneratorConfigDto {
  @IsNumber() tempMin: number;
  @IsNumber() tempMax: number;
  @IsIn(['C', 'F']) @IsOptional() tempUnit?: 'C' | 'F';

  @IsArray() @ValidateNested({ each: true }) @Type(() => WeatherTypeEntryDto)
  weatherTypes: WeatherTypeEntryDto[];

  @IsNumber() @Min(0) windMin: number;
  @IsNumber() @Min(0) windMax: number;
  @IsNumber() @Min(1) windGustMultiplier: number;

  @IsNumber() pressureMin: number;
  @IsNumber() pressureMax: number;
  @IsNumber() @Min(0) @Max(100) humidityMin: number;
  @IsNumber() @Min(0) @Max(100) humidityMax: number;

  @IsArray() @ValidateNested({ each: true }) @Type(() => CustomFieldConfigDto) @IsOptional()
  customFields?: CustomFieldConfigDto[];
}

export class CreateWeatherGeneratorDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  @ValidateNested() @Type(() => WeatherGeneratorConfigDto) config: WeatherGeneratorConfigDto;
}
```

- [ ] **Step 2: Vytvoř update DTO**

```typescript
// backend/src/modules/weather-generators/dto/update-weather-generator.dto.ts

import { Type } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty, ValidateNested } from 'class-validator';
import { WeatherGeneratorConfigDto } from './create-weather-generator.dto';

export class UpdateWeatherGeneratorDto {
  @IsString() @IsNotEmpty() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @ValidateNested() @Type(() => WeatherGeneratorConfigDto) @IsOptional() config?: WeatherGeneratorConfigDto;
}
```

- [ ] **Step 3: Vytvoř set-current-weather DTO**

```typescript
// backend/src/modules/weather-generators/dto/set-current-weather.dto.ts

import { Type } from 'class-transformer';
import {
  IsBoolean, IsNumber, IsString, IsArray, IsOptional,
  ValidateNested, IsNotEmpty,
} from 'class-validator';

class CloudinessDto {
  @IsString() value: string;
  @IsString() description: string;
}

class PrecipitationDto {
  @IsString() value: string;
  @IsString() description: string;
}

class WindDto {
  @IsNumber() speed: number;
  @IsNumber() gusts: number;
  @IsString() unit: string;
}

class PressureDto {
  @IsNumber() value: number;
  @IsString() trend: string;
}

class WeatherExtraDto {
  @IsString() label: string;
  @IsString() value: string;
  @IsString() @IsOptional() description?: string;
}

export class SetCurrentWeatherDto {
  @IsNumber() temperature: number;
  @IsString() @IsNotEmpty() tempUnit: string;
  @IsString() @IsNotEmpty() weatherType: string;
  @IsString() @IsNotEmpty() weatherIcon: string;
  @ValidateNested() @Type(() => CloudinessDto) cloudiness: CloudinessDto;
  @ValidateNested() @Type(() => PrecipitationDto) precipitation: PrecipitationDto;
  @ValidateNested() @Type(() => WindDto) wind: WindDto;
  @ValidateNested() @Type(() => PressureDto) pressure: PressureDto;
  @IsNumber() humidity: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WeatherExtraDto) extras: WeatherExtraDto[];
  @IsString() @IsOptional() narrativeText?: string;
}
```

- [ ] **Step 4: Vytvoř broadcast DTO**

```typescript
// backend/src/modules/weather-generators/dto/broadcast-weather.dto.ts

import { IsIn, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class BroadcastWeatherDto {
  @IsIn(['chat', 'map']) target: 'chat' | 'map';
  @IsString() @IsNotEmpty() @IsOptional() channelId?: string;
  @IsString() @IsOptional() mapId?: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/weather-generators/dto/
git commit -m "feat(weather): DTOs"
```

---

## Task 4: Service CRUD

**Files:**
- Create: `backend/src/modules/weather-generators/weather-generators.service.ts`
- Create: `backend/src/modules/weather-generators/weather-generators.service.spec.ts`

- [ ] **Step 1: Napiš failing testy pro CRUD**

```typescript
// backend/src/modules/weather-generators/weather-generators.service.spec.ts

import { WeatherGeneratorsService } from './weather-generators.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const mockRepo = {
  findById: jest.fn(),
  findByWorldId: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  setCurrentWeather: jest.fn(),
  delete: jest.fn(),
};

const mockChatService = { createSystemMessage: jest.fn() };
const mockEventEmitter = { emit: jest.fn() };

const MOCK_GENERATOR = {
  id: 'gen1',
  worldId: 'world1',
  name: 'Albánie',
  config: {
    tempMin: 5, tempMax: 30, tempUnit: 'C',
    weatherTypes: [{ type: 'clear', label: 'Jasno', icon: 'clear', probability: 100, cloudRange: [0, 1], precipRange: [0, 0] }],
    windMin: 0, windMax: 20, windGustMultiplier: 2.0,
    pressureMin: 990, pressureMax: 1030, humidityMin: 20, humidityMax: 80,
    customFields: [],
  },
  currentWeather: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('WeatherGeneratorsService - CRUD', () => {
  let service: WeatherGeneratorsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WeatherGeneratorsService(
      mockRepo as any,
      mockChatService as any,
      mockEventEmitter as any,
    );
  });

  it('getAll returns generators for world', async () => {
    mockRepo.findByWorldId.mockResolvedValue([MOCK_GENERATOR]);
    const result = await service.getAll('world1');
    expect(result).toHaveLength(1);
    expect(mockRepo.findByWorldId).toHaveBeenCalledWith('world1');
  });

  it('getOne throws NotFoundException for unknown id', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.getOne('world1', 'bad')).rejects.toThrow(NotFoundException);
  });

  it('getOne throws NotFoundException when worldId mismatch', async () => {
    mockRepo.findById.mockResolvedValue({ ...MOCK_GENERATOR, worldId: 'other' });
    await expect(service.getOne('world1', 'gen1')).rejects.toThrow(NotFoundException);
  });

  it('create saves and returns generator', async () => {
    mockRepo.save.mockResolvedValue(MOCK_GENERATOR);
    const dto = { name: 'Albánie', config: MOCK_GENERATOR.config };
    const result = await service.create('world1', dto as any);
    expect(result.name).toBe('Albánie');
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ worldId: 'world1', name: 'Albánie' }));
  });

  it('remove throws NotFoundException for unknown generator', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.remove('world1', 'gen1')).rejects.toThrow(NotFoundException);
  });

  it('remove deletes and returns true', async () => {
    mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
    mockRepo.delete.mockResolvedValue(true);
    const result = await service.remove('world1', 'gen1');
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend && npx jest weather-generators.service.spec.ts --no-coverage
```

Očekáváno: FAIL — service neexistuje.

- [ ] **Step 3: Implementuj service CRUD**

```typescript
// backend/src/modules/weather-generators/weather-generators.service.ts

import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IWeatherGeneratorRepository } from './interfaces/weather-generator-repository.interface';
import { WeatherGenerator, WeatherGeneratorConfig, WeatherResult } from './interfaces/weather-generator.interface';
import { CreateWeatherGeneratorDto } from './dto/create-weather-generator.dto';
import { UpdateWeatherGeneratorDto } from './dto/update-weather-generator.dto';
import { SetCurrentWeatherDto } from './dto/set-current-weather.dto';
import { BroadcastWeatherDto } from './dto/broadcast-weather.dto';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class WeatherGeneratorsService {
  constructor(
    @Inject('IWeatherGeneratorRepository')
    private readonly repo: IWeatherGeneratorRepository,
    private readonly chatService: ChatService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getAll(worldId: string): Promise<WeatherGenerator[]> {
    return this.repo.findByWorldId(worldId);
  }

  async getOne(worldId: string, id: string): Promise<WeatherGenerator> {
    const gen = await this.repo.findById(id);
    if (!gen || gen.worldId !== worldId) throw new NotFoundException('Generátor nenalezen');
    return gen;
  }

  async create(worldId: string, dto: CreateWeatherGeneratorDto): Promise<WeatherGenerator> {
    this.validateConfig(dto.config as WeatherGeneratorConfig);
    return this.repo.save({
      worldId,
      name: dto.name,
      description: dto.description,
      config: dto.config as WeatherGeneratorConfig,
    });
  }

  async update(worldId: string, id: string, dto: UpdateWeatherGeneratorDto): Promise<WeatherGenerator> {
    const gen = await this.getOne(worldId, id);
    if (dto.config) this.validateConfig(dto.config as WeatherGeneratorConfig);
    const updated = await this.repo.update(gen.id, {
      name: dto.name ?? gen.name,
      description: dto.description ?? gen.description,
      config: dto.config ? (dto.config as WeatherGeneratorConfig) : gen.config,
    });
    return updated!;
  }

  async remove(worldId: string, id: string): Promise<boolean> {
    await this.getOne(worldId, id);
    return this.repo.delete(id);
  }

  private validateConfig(config: WeatherGeneratorConfig): void {
    if (config.tempMin > config.tempMax) throw new Error('tempMin musí být ≤ tempMax');
    if (config.windMin > config.windMax) throw new Error('windMin musí být ≤ windMax');
    if (config.pressureMin > config.pressureMax) throw new Error('pressureMin musí být ≤ pressureMax');
    if (config.humidityMin > config.humidityMax) throw new Error('humidityMin musí být ≤ humidityMax');
    if (config.windGustMultiplier < 1) throw new Error('windGustMultiplier musí být ≥ 1');
    if (config.weatherTypes && config.weatherTypes.length > 0) {
      const total = config.weatherTypes.reduce((s, t) => s + t.probability, 0);
      if (Math.round(total) !== 100) throw new Error(`Součet probability weatherTypes musí být 100, je ${total}`);
    }
  }

  // Metody generate, setCurrentWeather a broadcast jsou v Task 5 a 6
  async generate(worldId: string, id: string): Promise<WeatherGenerator> {
    throw new Error('Not implemented yet');
  }

  async setCurrentWeather(worldId: string, id: string, dto: SetCurrentWeatherDto): Promise<WeatherGenerator> {
    throw new Error('Not implemented yet');
  }

  async broadcast(worldId: string, id: string, dto: BroadcastWeatherDto): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async seedDefaultForWorld(worldId: string, genre: string): Promise<void> {
    const config = this.defaultConfigForGenre(genre);
    await this.repo.save({ worldId, name: 'Výchozí prostředí', config });
  }

  private defaultConfigForGenre(genre: string): WeatherGeneratorConfig {
    const base: WeatherGeneratorConfig = {
      tempUnit: 'C',
      windMin: 0, windMax: 50, windGustMultiplier: 2.0,
      pressureMin: 980, pressureMax: 1030,
      humidityMin: 20, humidityMax: 90,
      customFields: [],
      weatherTypes: [
        { type: 'clear', label: 'Jasno', icon: 'clear', probability: 30, cloudRange: [0, 1], precipRange: [0, 0] },
        { type: 'cloudy', label: 'Zataženo', icon: 'cloudy', probability: 40, cloudRange: [5, 8], precipRange: [0, 0] },
        { type: 'rain', label: 'Déšť', icon: 'rain', probability: 20, cloudRange: [6, 8], precipRange: [1, 8] },
        { type: 'storm', label: 'Bouřka', icon: 'storm', probability: 10, cloudRange: [7, 8], precipRange: [8, 20] },
      ],
      tempMin: 0,
      tempMax: 25,
    };
    if (genre === 'fantasy') {
      base.tempMin = -5;
      base.tempMax = 30;
    } else if (genre === 'sci-fi') {
      base.tempMin = -60;
      base.tempMax = 60;
      base.humidityMin = 0;
      base.humidityMax = 30;
    }
    return base;
  }
}
```

- [ ] **Step 4: Spusť test — ověř PASS**

```bash
cd backend && npx jest weather-generators.service.spec.ts --no-coverage
```

Očekáváno: PASS (6 testů CRUD)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/weather-generators/weather-generators.service.ts backend/src/modules/weather-generators/weather-generators.service.spec.ts
git commit -m "feat(weather): service CRUD"
```

---

## Task 5: Generation Algorithm

**Files:**
- Modify: `backend/src/modules/weather-generators/weather-generators.service.ts`
- Modify: `backend/src/modules/weather-generators/weather-generators.service.spec.ts`

- [ ] **Step 1: Přidej testy pro generate()**

Přidej do `weather-generators.service.spec.ts` nový `describe` blok:

```typescript
describe('WeatherGeneratorsService - generate()', () => {
  let service: WeatherGeneratorsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WeatherGeneratorsService(
      mockRepo as any,
      mockChatService as any,
      mockEventEmitter as any,
    );
  });

  it('generate() sets currentWeather with correct temperature range', async () => {
    mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
    mockRepo.setCurrentWeather.mockImplementation(async (id, weather) => ({
      ...MOCK_GENERATOR,
      currentWeather: weather,
    }));

    const result = await service.generate('world1', 'gen1');
    const w = result.currentWeather!;

    expect(w.temperature).toBeGreaterThanOrEqual(MOCK_GENERATOR.config.tempMin);
    expect(w.temperature).toBeLessThanOrEqual(MOCK_GENERATOR.config.tempMax);
    expect(w.tempUnit).toBe('C');
    expect(w.isManual).toBe(false);
    expect(w.weatherType).toBe('Jasno');
    expect(w.weatherIcon).toBe('clear');
  });

  it('generate() picks weatherType by weighted probability', async () => {
    const genWith50_50 = {
      ...MOCK_GENERATOR,
      config: {
        ...MOCK_GENERATOR.config,
        weatherTypes: [
          { type: 'clear', label: 'Jasno', icon: 'clear', probability: 50, cloudRange: [0, 1], precipRange: [0, 0] },
          { type: 'rain', label: 'Déšť', icon: 'rain', probability: 50, cloudRange: [6, 8], precipRange: [2, 5] },
        ],
      },
    };
    mockRepo.findById.mockResolvedValue(genWith50_50);
    mockRepo.setCurrentWeather.mockImplementation(async (_id, weather) => ({
      ...genWith50_50, currentWeather: weather,
    }));

    // Mock Math.random to return 0.3 → should pick first (0–0.5)
    jest.spyOn(Math, 'random').mockReturnValue(0.3);
    const r1 = await service.generate('world1', 'gen1');
    expect(r1.currentWeather!.weatherIcon).toBe('clear');

    // Mock Math.random to return 0.7 → should pick second (0.5–1.0)
    jest.spyOn(Math, 'random').mockReturnValue(0.7);
    const r2 = await service.generate('world1', 'gen1');
    expect(r2.currentWeather!.weatherIcon).toBe('rain');

    jest.spyOn(Math, 'random').mockRestore();
  });

  it('generate() applies customFields when probability hits', async () => {
    const genWithCustom = {
      ...MOCK_GENERATOR,
      config: {
        ...MOCK_GENERATOR.config,
        customFields: [{ label: 'Magická anomálie', possibleValues: ['Přítomna', 'Silná'], probability: 100 }],
      },
    };
    mockRepo.findById.mockResolvedValue(genWithCustom);
    mockRepo.setCurrentWeather.mockImplementation(async (_id, weather) => ({ ...genWithCustom, currentWeather: weather }));

    const result = await service.generate('world1', 'gen1');
    expect(result.currentWeather!.extras).toHaveLength(1);
    expect(result.currentWeather!.extras[0].label).toBe('Magická anomálie');
    expect(['Přítomna', 'Silná']).toContain(result.currentWeather!.extras[0].value);
  });
});
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend && npx jest weather-generators.service.spec.ts --no-coverage
```

Očekáváno: FAIL — `generate()` hází `Error: Not implemented yet`.

- [ ] **Step 3: Implementuj generate() metodu**

Nahraď placeholder `generate()` v `weather-generators.service.ts`:

```typescript
async generate(worldId: string, id: string): Promise<WeatherGenerator> {
  const gen = await this.getOne(worldId, id);
  const config = gen.config;

  const selectedType = this.weightedPick(config.weatherTypes);
  const temperature = this.randomBetween(config.tempMin, config.tempMax, 1);
  const cloudValue = Math.round(this.randomBetween(selectedType.cloudRange[0], selectedType.cloudRange[1], 0));
  const precipValue = this.randomBetween(selectedType.precipRange[0], selectedType.precipRange[1], 1);
  const windSpeed = Math.round(this.randomBetween(config.windMin, config.windMax, 0));
  const windGusts = Math.round(windSpeed * config.windGustMultiplier);
  const pressureValue = Math.round(this.randomBetween(config.pressureMin, config.pressureMax, 0));
  const humidity = Math.round(this.randomBetween(config.humidityMin, config.humidityMax, 0));

  const extras = config.customFields
    .filter((cf) => Math.random() * 100 < cf.probability)
    .map((cf) => ({
      label: cf.label,
      value: cf.possibleValues[Math.floor(Math.random() * cf.possibleValues.length)],
    }));

  const weather: WeatherResult = {
    generatedAt: new Date(),
    isManual: false,
    temperature,
    tempUnit: config.tempUnit ?? 'C',
    weatherType: selectedType.label,
    weatherIcon: selectedType.type,
    cloudiness: this.cloudinessText(cloudValue),
    precipitation: this.precipitationText(precipValue),
    wind: { speed: windSpeed, gusts: windGusts, unit: 'kmh' },
    pressure: { value: pressureValue, trend: this.pressureTrend(pressureValue) },
    humidity,
    extras,
  };

  const updated = await this.repo.setCurrentWeather(gen.id, weather);
  return updated!;
}

async setCurrentWeather(worldId: string, id: string, dto: SetCurrentWeatherDto): Promise<WeatherGenerator> {
  const gen = await this.getOne(worldId, id);
  const weather: WeatherResult = {
    generatedAt: new Date(),
    isManual: true,
    temperature: dto.temperature,
    tempUnit: dto.tempUnit,
    weatherType: dto.weatherType,
    weatherIcon: dto.weatherIcon,
    cloudiness: dto.cloudiness,
    precipitation: dto.precipitation,
    wind: dto.wind,
    pressure: dto.pressure,
    humidity: dto.humidity,
    extras: dto.extras ?? [],
    narrativeText: dto.narrativeText,
  };
  const updated = await this.repo.setCurrentWeather(gen.id, weather);
  return updated!;
}

private weightedPick<T extends { probability: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.probability, 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.probability;
    if (rand <= 0) return item;
  }
  return items[items.length - 1];
}

private randomBetween(min: number, max: number, decimals: number): number {
  const val = min + Math.random() * (max - min);
  return parseFloat(val.toFixed(decimals));
}

private cloudinessText(value: number): { value: string; description: string } {
  if (value === 0) return { value: '0/8 Jasno', description: 'Obloha bez mraků' };
  if (value <= 2) return { value: `${value}/8 Skoro jasno`, description: 'Ojedinělá oblačnost' };
  if (value <= 4) return { value: `${value}/8 Polojasno`, description: 'Proměnlivá oblačnost' };
  if (value <= 6) return { value: `${value}/8 Oblačno`, description: 'Převážně oblačno' };
  if (value === 7) return { value: '7/8 Převážně zataženo', description: 'Obloha z větší části zakrytá' };
  return { value: '8/8 Zataženo', description: 'Obloha úplně zakrytá' };
}

private precipitationText(mmPerHour: number): { value: string; description: string } {
  if (mmPerHour === 0) return { value: 'Beze srážek', description: '' };
  if (mmPerHour <= 2) return { value: 'Slabé srážky', description: 'Mírný déšť nebo mrholení' };
  if (mmPerHour <= 10) return { value: 'Střední srážky', description: 'Pravidelný déšť' };
  return { value: 'Silné srážky', description: 'Intenzivní srážky nebo bouřka' };
}

private pressureTrend(hpa: number): string {
  if (hpa > 1020) return 'Stabilní';
  if (hpa > 1010) return 'Mírný pokles';
  if (hpa > 1000) return 'Silný pokles';
  return 'Výrazný pokles';
}
```

- [ ] **Step 4: Spusť test — ověř PASS**

```bash
cd backend && npx jest weather-generators.service.spec.ts --no-coverage
```

Očekáváno: PASS (všechny testy včetně generate)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/weather-generators/weather-generators.service.ts backend/src/modules/weather-generators/weather-generators.service.spec.ts
git commit -m "feat(weather): generation algorithm"
```

---

## Task 6: Broadcast Logic + MapsGateway

**Files:**
- Modify: `backend/src/modules/weather-generators/weather-generators.service.ts`
- Modify: `backend/src/modules/weather-generators/weather-generators.service.spec.ts`
- Modify: `backend/src/modules/chat/chat.service.ts`
- Modify: `backend/src/modules/chat/chat.module.ts`
- Modify: `backend/src/modules/maps/maps.gateway.ts`

- [ ] **Step 1: Přidej `createSystemMessage` do ChatService**

Otevři `backend/src/modules/chat/chat.service.ts` a přidej metodu na konec třídy:

```typescript
async createSystemMessage(
  channelId: string,
  worldId: string,
  content: string,
  senderName: string,
): Promise<void> {
  const channel = await this.channelRepo.findById(channelId);
  if (!channel || channel.worldId !== worldId) return;

  const message = await this.messageRepo.save({
    channelId,
    worldId,
    senderId: 'system',
    senderName: 'Systém',
    overrideName: senderName,
    content,
    isEdited: false,
    isDeleted: false,
    visibleTo: [],
    reactions: {},
    attachments: [],
  });
  this.eventEmitter.emit('chat.message.created', { channelId, worldId, message });
}
```

- [ ] **Step 2: Ověř export ChatService z ChatModule**

Otevři `backend/src/modules/chat/chat.module.ts`. Zkontroluj, že `exports` array obsahuje `ChatService`. Pokud ne, přidej ho:

```typescript
// přidej ChatService do exports pokud chybí:
exports: [ChatService, /* ... stávající exports ... */],
```

- [ ] **Step 3: Přidej `@OnEvent` handler do MapsGateway**

Otevři `backend/src/modules/maps/maps.gateway.ts` a přidej import a handler:

```typescript
// přidej import na začátek souboru:
import { OnEvent } from '@nestjs/event-emitter';
import { WeatherResult } from '../weather-generators/interfaces/weather-generator.interface';

// přidej metodu do třídy MapsGateway:
@OnEvent('weather.updated')
handleWeatherUpdated(payload: { worldId: string; generatorId: string; generatorName: string; weather: WeatherResult }): void {
  this.server.to(`world:${payload.worldId}`).emit('weather:updated', payload);
}
```

- [ ] **Step 4: Napiš testy pro broadcast()**

Přidej do `weather-generators.service.spec.ts`:

```typescript
describe('WeatherGeneratorsService - broadcast()', () => {
  let service: WeatherGeneratorsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WeatherGeneratorsService(
      mockRepo as any,
      mockChatService as any,
      mockEventEmitter as any,
    );
  });

  const GEN_WITH_WEATHER = {
    ...MOCK_GENERATOR,
    currentWeather: {
      generatedAt: new Date(),
      isManual: false,
      temperature: 21,
      tempUnit: 'C',
      weatherType: 'Jasno',
      weatherIcon: 'clear',
      cloudiness: { value: '0/8 Jasno', description: 'Obloha bez mraků' },
      precipitation: { value: 'Beze srážek', description: '' },
      wind: { speed: 5, gusts: 10, unit: 'kmh' },
      pressure: { value: 1015, trend: 'Stabilní' },
      humidity: 45,
      extras: [],
    },
  };

  it('broadcast to chat calls createSystemMessage', async () => {
    mockRepo.findById.mockResolvedValue(GEN_WITH_WEATHER);
    mockChatService.createSystemMessage.mockResolvedValue(undefined);
    await service.broadcast('world1', 'gen1', { target: 'chat', channelId: 'ch1' });
    expect(mockChatService.createSystemMessage).toHaveBeenCalledWith(
      'ch1',
      'world1',
      expect.stringContaining('Jasno'),
      expect.stringContaining('Albánie'),
    );
  });

  it('broadcast to map emits weather.updated event', async () => {
    mockRepo.findById.mockResolvedValue(GEN_WITH_WEATHER);
    await service.broadcast('world1', 'gen1', { target: 'map' });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('weather.updated', expect.objectContaining({
      worldId: 'world1',
      generatorId: 'gen1',
      generatorName: 'Albánie',
    }));
  });

  it('broadcast throws ConflictException when currentWeather missing', async () => {
    mockRepo.findById.mockResolvedValue({ ...MOCK_GENERATOR, currentWeather: undefined });
    await expect(service.broadcast('world1', 'gen1', { target: 'chat', channelId: 'ch1' }))
      .rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 5: Spusť test — ověř FAIL**

```bash
cd backend && npx jest weather-generators.service.spec.ts --no-coverage
```

Očekáváno: FAIL — `broadcast()` hází `Error: Not implemented yet`.

- [ ] **Step 6: Implementuj broadcast()**

Nahraď placeholder `broadcast()` v `weather-generators.service.ts`:

```typescript
async broadcast(worldId: string, id: string, dto: BroadcastWeatherDto): Promise<void> {
  const gen = await this.getOne(worldId, id);
  if (!gen.currentWeather) {
    throw new ConflictException('Generátor nemá aktuální počasí. Nejdříve zavolejte /generate nebo /current.');
  }

  const w = gen.currentWeather;
  if (dto.target === 'chat') {
    if (!dto.channelId) throw new Error('channelId je povinný pro broadcast do chatu');
    const content = this.formatWeatherForChat(gen.name, w);
    await this.chatService.createSystemMessage(dto.channelId, worldId, content, `Počasí — ${gen.name}`);
  } else {
    this.eventEmitter.emit('weather.updated', {
      worldId,
      generatorId: gen.id,
      generatorName: gen.name,
      weather: w,
    });
  }
}

private formatWeatherForChat(generatorName: string, w: WeatherResult): string {
  const lines = [
    `**${generatorName}** — ${w.weatherType}`,
    `Teplota: ${w.temperature > 0 ? '+' : ''}${w.temperature}°${w.tempUnit}`,
    `Oblačnost: ${w.cloudiness.value}`,
    `Srážky: ${w.precipitation.value}`,
    `Vítr: ${w.wind.speed} km/h (nárazy ${w.wind.gusts} km/h)`,
    `Tlak: ${w.pressure.value} hPa — ${w.pressure.trend} | Vlhkost: ${w.humidity}%`,
  ];
  if (w.extras.length > 0) {
    lines.push('');
    for (const extra of w.extras) {
      lines.push(`${extra.label}: ${extra.value}${extra.description ? ` — ${extra.description}` : ''}`);
    }
  }
  if (w.narrativeText) {
    lines.push('');
    lines.push(w.narrativeText);
  }
  return lines.join('\n');
}
```

Přidej také import `ConflictException` do importů NestJS na začátku souboru:

```typescript
import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
```

- [ ] **Step 7: Spusť test — ověř PASS**

```bash
cd backend && npx jest weather-generators.service.spec.ts --no-coverage
```

Očekáváno: PASS (všechny testy)

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/weather-generators/weather-generators.service.ts backend/src/modules/weather-generators/weather-generators.service.spec.ts backend/src/modules/chat/chat.service.ts backend/src/modules/chat/chat.module.ts backend/src/modules/maps/maps.gateway.ts
git commit -m "feat(weather): broadcast to chat and map"
```

---

## Task 7: Controller

**Files:**
- Create: `backend/src/modules/weather-generators/weather-generators.controller.ts`

- [ ] **Step 1: Implementuj controller**

```typescript
// backend/src/modules/weather-generators/weather-generators.controller.ts

import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/request-user.interface';
import { WeatherGeneratorsService } from './weather-generators.service';
import { CreateWeatherGeneratorDto } from './dto/create-weather-generator.dto';
import { UpdateWeatherGeneratorDto } from './dto/update-weather-generator.dto';
import { SetCurrentWeatherDto } from './dto/set-current-weather.dto';
import { BroadcastWeatherDto } from './dto/broadcast-weather.dto';
import { WorldMemberGuard } from '../worlds/guards/world-member.guard';
import { WorldRoleGuard } from '../worlds/guards/world-role.guard';
import { RequireWorldRole } from '../worlds/decorators/require-world-role.decorator';

@Controller('worlds/:worldId/weather-generators')
@UseGuards(JwtAuthGuard, WorldMemberGuard)
export class WeatherGeneratorsController {
  constructor(private readonly service: WeatherGeneratorsService) {}

  @Get()
  getAll(@Param('worldId') worldId: string) {
    return this.service.getAll(worldId);
  }

  @Get(':id')
  getOne(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.getOne(worldId, id);
  }

  @Post()
  @UseGuards(WorldRoleGuard)
  @RequireWorldRole('PJ', 'Admin')
  create(@Param('worldId') worldId: string, @Body() dto: CreateWeatherGeneratorDto) {
    return this.service.create(worldId, dto);
  }

  @Put(':id')
  @UseGuards(WorldRoleGuard)
  @RequireWorldRole('PJ', 'Admin')
  update(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWeatherGeneratorDto,
  ) {
    return this.service.update(worldId, id, dto);
  }

  @Delete(':id')
  @UseGuards(WorldRoleGuard)
  @RequireWorldRole('PJ', 'Admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.remove(worldId, id);
  }

  @Post(':id/generate')
  @UseGuards(WorldRoleGuard)
  @RequireWorldRole('PJ', 'Admin')
  generate(@Param('worldId') worldId: string, @Param('id') id: string) {
    return this.service.generate(worldId, id);
  }

  @Put(':id/current')
  @UseGuards(WorldRoleGuard)
  @RequireWorldRole('PJ', 'Admin')
  setCurrentWeather(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: SetCurrentWeatherDto,
  ) {
    return this.service.setCurrentWeather(worldId, id, dto);
  }

  @Post(':id/broadcast')
  @UseGuards(WorldRoleGuard)
  @RequireWorldRole('PJ', 'Admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  broadcast(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: BroadcastWeatherDto,
  ) {
    return this.service.broadcast(worldId, id, dto);
  }
}
```

> **Poznámka:** Zkontroluj existující Guards a Decorators v projektu. Pokud `WorldMemberGuard`, `WorldRoleGuard` nebo `RequireWorldRole` neexistují pod těmito cestami, najdi správné cesty pomocí `grep -r "WorldMemberGuard" backend/src --include="*.ts" -l` a uprav importy.

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/weather-generators/weather-generators.controller.ts
git commit -m "feat(weather): controller"
```

---

## Task 8: Module Registration

**Files:**
- Create: `backend/src/modules/weather-generators/weather-generators.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř modul**

```typescript
// backend/src/modules/weather-generators/weather-generators.module.ts

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WeatherGeneratorSchemaClass, WeatherGeneratorSchema } from './schemas/weather-generator.schema';
import { MongoWeatherGeneratorRepository } from './repositories/weather-generator.repository';
import { WeatherGeneratorsService } from './weather-generators.service';
import { WeatherGeneratorsController } from './weather-generators.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WeatherGeneratorSchemaClass.name, schema: WeatherGeneratorSchema },
    ]),
    ChatModule,
  ],
  controllers: [WeatherGeneratorsController],
  providers: [
    WeatherGeneratorsService,
    { provide: 'IWeatherGeneratorRepository', useClass: MongoWeatherGeneratorRepository },
  ],
  exports: [WeatherGeneratorsService],
})
export class WeatherGeneratorsModule {}
```

- [ ] **Step 2: Registruj modul v app.module.ts**

Otevři `backend/src/app.module.ts`. Přidej `WeatherGeneratorsModule` do `imports` array:

```typescript
import { WeatherGeneratorsModule } from './modules/weather-generators/weather-generators.module';

// do imports[]:
WeatherGeneratorsModule,
```

- [ ] **Step 3: Zkus build**

```bash
cd backend && npx tsc --noEmit
```

Očekáváno: Žádné chyby. Pokud jsou chyby importů (Guards, Decorators), oprav cesty podle výstupu.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/weather-generators/weather-generators.module.ts backend/src/app.module.ts
git commit -m "feat(weather): module registration"
```

---

## Task 9: World Seed

**Files:**
- Modify: `backend/src/modules/worlds/worlds.service.ts`

- [ ] **Step 1: Přidej seed volání při vytvoření světa**

Otevři `backend/src/modules/worlds/worlds.service.ts`. Najdi metodu `create()` (nebo `createWorld()`). Po uložení nového světa přidej volání seedu:

```typescript
// importy na začátek souboru (pokud chybí):
import { WeatherGeneratorsService } from '../weather-generators/weather-generators.service';

// do konstruktoru přidej:
private readonly weatherGeneratorsService: WeatherGeneratorsService,

// v metodě create(), po uložení světa (kde je `const world = await this.worldsRepo.save(...)`):
await this.weatherGeneratorsService.seedDefaultForWorld(world.id, world.genre ?? 'other');
```

> **Poznámka:** Pokud vznikne circular dependency (WorldsModule ↔ WeatherGeneratorsModule), použij `forwardRef`:
> ```typescript
> // weather-generators.module.ts
> import { forwardRef } from '@nestjs/common';
> imports: [forwardRef(() => WorldsModule), ...]
> 
> // worlds.module.ts  
> imports: [forwardRef(() => WeatherGeneratorsModule), ...]
> ```

- [ ] **Step 2: Ověř build**

```bash
cd backend && npx tsc --noEmit
```

Očekáváno: Žádné chyby.

- [ ] **Step 3: Spusť všechny weather testy**

```bash
cd backend && npx jest weather --no-coverage
```

Očekáváno: PASS (všechny testy modulu)

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/worlds/worlds.service.ts
git commit -m "feat(weather): seed default generator on world creation"
```

---

## Task 10: Full test run

- [ ] **Step 1: Spusť celou test suite**

```bash
cd backend && npx jest --no-coverage
```

Očekáváno: Všechny testy PASS. Pokud jsou failures nesouvisející s tímto modulem, zaznamenej je ale neřeš (jsou pre-existující).

- [ ] **Step 2: Ověř TypeScript build**

```bash
cd backend && npx tsc --noEmit
```

Očekáváno: Žádné chyby.

- [ ] **Step 3: Aktualizuj roadmap**

Otevři `docs/roadmap.md`. Najdi sekci `## Krok 10f — WorldWeather ⬜` a aktualizuj:

```markdown
## Krok 10f — WorldWeather ✅

> Generátor počasí per world s konfigurovatelnou logikou.

- [x] WeatherGenerator schema: worldId, name, description, config, currentWeather
- [x] WeatherGeneratorConfig: tempMin/Max, tempUnit, weatherTypes (vážená náhoda), windMin/Max/GustMultiplier, pressureMin/Max, humidityMin/Max, customFields
- [x] WeatherResult: temperature, weatherType, weatherIcon, cloudiness, precipitation, wind, pressure, humidity, extras, narrativeText
- [x] GET /api/worlds/:id/weather-generators, GET /:genId, POST, PUT, DELETE
- [x] POST /:genId/generate — vygeneruj počasí z config, ulož do currentWeather
- [x] PUT /:genId/current — ručně nastav currentWeather
- [x] POST /:genId/broadcast — odešli do chat kanálu nebo taktické mapy
- [x] ChatService.createSystemMessage() pro systémové zprávy
- [x] MapsGateway @OnEvent('weather.updated') → weather:updated socket event
- [x] Seed defaultního generátoru dle genre při POST /api/worlds

**Spec:** docs/superpowers/specs/2026-05-04-krok-10f-world-weather-design.md  
**Plán:** docs/superpowers/plans/2026-05-04-krok-10f-world-weather.md
```

- [ ] **Step 4: Final commit**

```bash
git add docs/roadmap.md
git commit -m "docs: mark Krok 10f WorldWeather as complete"
```
