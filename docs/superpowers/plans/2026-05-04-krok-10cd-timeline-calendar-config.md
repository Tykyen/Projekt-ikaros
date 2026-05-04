# WorldCalendarConfig & TimelineEvent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat dva nové moduly — `WorldCalendarConfigModule` (konfigurace fantasy kalendáře světa s nebeými tělesy) a `TimelineModule` (historická časová osa světa s automatickým výpočtem stavů nebeských těles).

**Architecture:** `WorldCalendarConfigModule` je nezávislý — ukládá konfiguraci kalendáře a exportuje `WorldCalendarConfigService` s logikou výpočtu nebeských těles. `TimelineModule` závisí na `WorldCalendarConfigModule` — při každém GET obohacuje události o vypočtené `celestialStates`. Výpočetní logika žije v izolovaném `world-calendar-config.utils.ts` pro snadné testování.

**Tech Stack:** NestJS, Mongoose, TypeScript, Jest. Žádné nové npm závislosti — ID generuje `crypto.randomUUID()`.

---

## Struktura souborů

**Nové soubory:**
```
backend/src/modules/world-calendar-config/
├── dto/upsert-world-calendar-config.dto.ts
├── interfaces/world-calendar-config.interface.ts
├── interfaces/world-calendar-config-repository.interface.ts
├── repositories/world-calendar-config.repository.ts
├── schemas/world-calendar-config.schema.ts
├── world-calendar-config.controller.ts
├── world-calendar-config.module.ts
├── world-calendar-config.service.ts
├── world-calendar-config.service.spec.ts
├── world-calendar-config.utils.ts
└── world-calendar-config.utils.spec.ts

backend/src/modules/timeline/
├── dto/create-timeline-event.dto.ts
├── dto/update-timeline-event.dto.ts
├── interfaces/timeline-event.interface.ts
├── interfaces/timeline-repository.interface.ts
├── repositories/timeline.repository.ts
├── schemas/timeline-event.schema.ts
├── timeline.controller.ts
├── timeline.module.ts
├── timeline.service.ts
└── timeline.service.spec.ts
```

**Upravené soubory:**
- `backend/src/app.module.ts` — registrace obou modulů

---

## Task 1: WorldCalendarConfig — interfaces a schema

**Files:**
- Create: `backend/src/modules/world-calendar-config/interfaces/world-calendar-config.interface.ts`
- Create: `backend/src/modules/world-calendar-config/interfaces/world-calendar-config-repository.interface.ts`
- Create: `backend/src/modules/world-calendar-config/schemas/world-calendar-config.schema.ts`

- [ ] Vytvoř soubor s interfacy:

```typescript
// backend/src/modules/world-calendar-config/interfaces/world-calendar-config.interface.ts
export type CelestialBodyType = 'moon' | 'sun' | 'planet' | 'comet' | 'other';

export interface MoonConfig { cycleLength: number; phases: string[]; }
export interface SunConfig { riseHour: number[]; setHour: number[]; }
export interface PlanetConfig { orbitalPeriod: number; constellations: string[]; }
export interface CometConfig { periodYears: number; apparitionDurationYears: number; }
export interface OtherConfig { cycleLength: number; states: string[]; }

export interface CelestialBody {
  id: string;
  name: string;
  type: CelestialBodyType;
  config: MoonConfig | SunConfig | PlanetConfig | CometConfig | OtherConfig;
  referenceState: string;
}

export interface CalendarMonth { name: string; daysCount: number; }
export interface CalendarReferenceDate { year: number; month: number; day: number; hour: number; }

export interface CelestialState {
  bodyId: string;
  name: string;
  type: CelestialBodyType;
  state: string;
  isManualOverride: boolean;
}

export interface CelestialOverride { bodyId: string; value: string; }

export interface WorldCalendarConfig {
  id: string;
  worldId: string;
  hoursPerDay: number;
  daysOfWeek: string[];
  months: CalendarMonth[];
  celestialBodies: CelestialBody[];
  referenceDate: CalendarReferenceDate | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] Vytvoř repository interface:

```typescript
// backend/src/modules/world-calendar-config/interfaces/world-calendar-config-repository.interface.ts
import { WorldCalendarConfig } from './world-calendar-config.interface';

export interface IWorldCalendarConfigRepository {
  findByWorldId(worldId: string): Promise<WorldCalendarConfig | null>;
  upsert(
    worldId: string,
    data: Omit<WorldCalendarConfig, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorldCalendarConfig>;
}
```

- [ ] Vytvoř schema:

```typescript
// backend/src/modules/world-calendar-config/schemas/world-calendar-config.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorldCalendarConfigDocument = HydratedDocument<WorldCalendarConfigSchemaClass>;

@Schema({ timestamps: true, collection: 'world_calendar_configs' })
export class WorldCalendarConfigSchemaClass {
  @Prop({ required: true, unique: true }) worldId: string;
  @Prop({ default: 24 }) hoursPerDay: number;
  @Prop({ type: [String], default: [] }) daysOfWeek: string[];
  @Prop({ type: [Object], default: [] }) months: Record<string, unknown>[];
  @Prop({ type: [Object], default: [] }) celestialBodies: Record<string, unknown>[];
  @Prop({ type: Object, default: null }) referenceDate: Record<string, unknown> | null;
}

export const WorldCalendarConfigSchema = SchemaFactory.createForClass(WorldCalendarConfigSchemaClass);
WorldCalendarConfigSchema.index({ worldId: 1 }, { unique: true });
```

- [ ] Commit:

```bash
git add backend/src/modules/world-calendar-config/
git commit -m "feat(world-calendar-config): interfaces and schema"
```

---

## Task 2: WorldCalendarConfig — repository

**Files:**
- Create: `backend/src/modules/world-calendar-config/repositories/world-calendar-config.repository.ts`

- [ ] Vytvoř repository:

```typescript
// backend/src/modules/world-calendar-config/repositories/world-calendar-config.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldCalendarConfigSchemaClass } from '../schemas/world-calendar-config.schema';
import { IWorldCalendarConfigRepository } from '../interfaces/world-calendar-config-repository.interface';
import {
  WorldCalendarConfig, CelestialBody, CalendarMonth, CalendarReferenceDate,
} from '../interfaces/world-calendar-config.interface';

@Injectable()
export class MongoWorldCalendarConfigRepository implements IWorldCalendarConfigRepository {
  constructor(
    @InjectModel(WorldCalendarConfigSchemaClass.name)
    private readonly model: Model<WorldCalendarConfigSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<WorldCalendarConfig | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async upsert(
    worldId: string,
    data: Omit<WorldCalendarConfig, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorldCalendarConfig> {
    const doc = await this.model
      .findOneAndUpdate({ worldId }, { $set: { worldId, ...data } }, { upsert: true, new: true })
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): WorldCalendarConfig {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      hoursPerDay: (doc.hoursPerDay as number) ?? 24,
      daysOfWeek: (doc.daysOfWeek as string[]) ?? [],
      months: (doc.months as CalendarMonth[]) ?? [],
      celestialBodies: (doc.celestialBodies as CelestialBody[]) ?? [],
      referenceDate: (doc.referenceDate as CalendarReferenceDate | null) ?? null,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] Commit:

```bash
git add backend/src/modules/world-calendar-config/repositories/
git commit -m "feat(world-calendar-config): repository"
```

---

## Task 3: Výpočetní utils (TDD)

**Files:**
- Create: `backend/src/modules/world-calendar-config/world-calendar-config.utils.ts`
- Create: `backend/src/modules/world-calendar-config/world-calendar-config.utils.spec.ts`

- [ ] Napiš spec PŘED implementací:

```typescript
// backend/src/modules/world-calendar-config/world-calendar-config.utils.spec.ts
import { absoluteDay, calculateCelestialStates, totalDaysPerYear } from './world-calendar-config.utils';
import { WorldCalendarConfig } from './interfaces/world-calendar-config.interface';

const base: WorldCalendarConfig = {
  id: '1', worldId: 'w1', hoursPerDay: 24, daysOfWeek: [],
  months: [
    { name: 'Leden', daysCount: 30 },
    { name: 'Únor', daysCount: 30 },
    { name: 'Březen', daysCount: 30 },
  ],
  celestialBodies: [],
  referenceDate: { year: 0, month: 1, day: 1, hour: 0 },
  createdAt: new Date(), updatedAt: new Date(),
};

describe('totalDaysPerYear', () => {
  it('vrátí součet dní všech měsíců', () => {
    expect(totalDaysPerYear(base)).toBe(90);
  });
});

describe('absoluteDay', () => {
  it('rok 0, měsíc 1, den 1 = 1', () => {
    expect(absoluteDay(0, 1, 1, base)).toBe(1);
  });
  it('rok 0, měsíc 2, den 1 = 31', () => {
    expect(absoluteDay(0, 2, 1, base)).toBe(31);
  });
  it('rok 1, měsíc 1, den 1 = 91', () => {
    expect(absoluteDay(1, 1, 1, base)).toBe(91);
  });
});

describe('calculateCelestialStates', () => {
  it('vrátí [] když chybí referenceDate', () => {
    const cfg = { ...base, referenceDate: null };
    expect(calculateCelestialStates(1, 1, 1, cfg, [])).toEqual([]);
  });

  it('vrátí [] když nejsou žádná tělesa', () => {
    expect(calculateCelestialStates(1, 1, 1, base, [])).toEqual([]);
  });

  it('moon: stejné datum jako reference vrátí referenceState fázi', () => {
    const cfg = {
      ...base,
      celestialBodies: [{
        id: 'm1', name: 'Měsíc', type: 'moon' as const,
        config: { cycleLength: 28, phases: ['nový', 'dorůstající', 'úplněk', 'couvající'] },
        referenceState: 'nový',
      }],
    };
    const result = calculateCelestialStates(0, 1, 1, cfg, []);
    expect(result[0].state).toBe('nový');
    expect(result[0].isManualOverride).toBe(false);
  });

  it('moon: 7 dní po novém = dorůstající (¼ cyklu 28 dní)', () => {
    const cfg = {
      ...base,
      celestialBodies: [{
        id: 'm1', name: 'Měsíc', type: 'moon' as const,
        config: { cycleLength: 28, phases: ['nový', 'dorůstající', 'úplněk', 'couvající'] },
        referenceState: 'nový',
      }],
    };
    // den 8 = delta 7
    const result = calculateCelestialStates(0, 1, 8, cfg, []);
    expect(result[0].state).toBe('dorůstající');
  });

  it('záporné delta: 14 dní PŘED referencí s nový → úplněk', () => {
    const cfg = {
      ...base,
      referenceDate: { year: 0, month: 1, day: 15, hour: 0 },
      celestialBodies: [{
        id: 'm1', name: 'Měsíc', type: 'moon' as const,
        config: { cycleLength: 28, phases: ['nový', 'dorůstající', 'úplněk', 'couvající'] },
        referenceState: 'nový',
      }],
    };
    // den 1 = delta -14 od reference (den 15)
    const result = calculateCelestialStates(0, 1, 1, cfg, []);
    expect(result[0].state).toBe('úplněk');
  });

  it('manuální override přebíjí výpočet', () => {
    const cfg = {
      ...base,
      celestialBodies: [{
        id: 'm1', name: 'Měsíc', type: 'moon' as const,
        config: { cycleLength: 28, phases: ['nový', 'dorůstající', 'úplněk', 'couvající'] },
        referenceState: 'nový',
      }],
    };
    const result = calculateCelestialStates(0, 1, 1, cfg, [{ bodyId: 'm1', value: 'úplněk' }]);
    expect(result[0].state).toBe('úplněk');
    expect(result[0].isManualOverride).toBe(true);
  });

  it('sun: vrátí hodiny východu/západu pro daný měsíc', () => {
    const cfg = {
      ...base,
      celestialBodies: [{
        id: 's1', name: 'Slunce', type: 'sun' as const,
        config: { riseHour: [6, 5, 6], setHour: [18, 19, 18] },
        referenceState: '',
      }],
    };
    const result = calculateCelestialStates(0, 2, 1, cfg, []);
    expect(result[0].state).toBe('vychod: 5:00, zapad: 19:00');
  });

  it('comet: viditelná v průletovém okně', () => {
    const cfg = {
      ...base,
      celestialBodies: [{
        id: 'c1', name: 'Kometa', type: 'comet' as const,
        config: { periodYears: 10, apparitionDurationYears: 1 },
        referenceState: 'viditelná',
      }],
    };
    // 45 dní po referenci (apparition = 1 rok = 90 dní)
    const result = calculateCelestialStates(0, 1, 46, cfg, []);
    expect(result[0].state).toBe('viditelná');
  });

  it('comet: neviditelná po skončení průletu', () => {
    const cfg = {
      ...base,
      celestialBodies: [{
        id: 'c1', name: 'Kometa', type: 'comet' as const,
        config: { periodYears: 10, apparitionDurationYears: 1 },
        referenceState: 'viditelná',
      }],
    };
    // 95 dní po referenci (apparition = 90 dní)
    const result = calculateCelestialStates(0, 2, 6, cfg, []);
    expect(result[0].state).toBe('neviditelná');
  });
});
```

- [ ] Spusť spec — ověř, že SELHÁVÁ:

```bash
cd backend && npx jest --testPathPattern="world-calendar-config.utils" --no-coverage
```

Očekáváno: FAIL — `Cannot find module`

- [ ] Vytvoř utils implementaci:

```typescript
// backend/src/modules/world-calendar-config/world-calendar-config.utils.ts
import {
  WorldCalendarConfig, CelestialBody, CelestialState, CelestialOverride,
  MoonConfig, SunConfig, PlanetConfig, CometConfig, OtherConfig,
} from './interfaces/world-calendar-config.interface';

export function totalDaysPerYear(config: Pick<WorldCalendarConfig, 'months'>): number {
  return config.months.reduce((sum, m) => sum + m.daysCount, 0);
}

export function absoluteDay(
  year: number,
  month: number,
  day: number,
  config: Pick<WorldCalendarConfig, 'months'>,
): number {
  const yearDays = totalDaysPerYear(config);
  const daysBeforeMonth = config.months.slice(0, month - 1).reduce((sum, m) => sum + m.daysCount, 0);
  return year * yearDays + daysBeforeMonth + day;
}

function getReferenceOffset(body: CelestialBody, yearDays: number): number {
  const { type, config: cfg, referenceState } = body;
  if (type === 'moon') {
    const c = cfg as MoonConfig;
    const idx = Math.max(0, c.phases.indexOf(referenceState));
    return idx * (c.cycleLength / c.phases.length);
  }
  if (type === 'other') {
    const c = cfg as OtherConfig;
    const idx = Math.max(0, c.states.indexOf(referenceState));
    return idx * (c.cycleLength / c.states.length);
  }
  if (type === 'planet') {
    const c = cfg as PlanetConfig;
    const idx = Math.max(0, c.constellations.indexOf(referenceState));
    return idx * (c.orbitalPeriod / c.constellations.length);
  }
  if (type === 'comet') {
    const c = cfg as CometConfig;
    const apparitionDays = c.apparitionDurationYears * yearDays;
    return referenceState === 'viditelná' ? 0 : apparitionDays;
  }
  return 0; // sun
}

function calculateBodyState(
  body: CelestialBody,
  delta: number,
  yearDays: number,
  month: number,
): string {
  const refOffset = getReferenceOffset(body, yearDays);
  const { type, config: cfg } = body;

  if (type === 'moon') {
    const c = cfg as MoonConfig;
    const pos = ((delta + refOffset) % c.cycleLength + c.cycleLength) % c.cycleLength;
    const idx = Math.floor(pos / (c.cycleLength / c.phases.length));
    return c.phases[Math.min(idx, c.phases.length - 1)];
  }
  if (type === 'other') {
    const c = cfg as OtherConfig;
    const pos = ((delta + refOffset) % c.cycleLength + c.cycleLength) % c.cycleLength;
    const idx = Math.floor(pos / (c.cycleLength / c.states.length));
    return c.states[Math.min(idx, c.states.length - 1)];
  }
  if (type === 'planet') {
    const c = cfg as PlanetConfig;
    const deg = (((delta + refOffset) % c.orbitalPeriod) / c.orbitalPeriod * 360 + 360) % 360;
    const idx = Math.floor(deg / (360 / c.constellations.length));
    return c.constellations[Math.min(idx, c.constellations.length - 1)];
  }
  if (type === 'comet') {
    const c = cfg as CometConfig;
    const totalPeriodDays = c.periodYears * yearDays;
    const apparitionDays = c.apparitionDurationYears * yearDays;
    const pos = ((delta + refOffset) % totalPeriodDays + totalPeriodDays) % totalPeriodDays;
    return pos < apparitionDays ? 'viditelná' : 'neviditelná';
  }
  if (type === 'sun') {
    const c = cfg as SunConfig;
    const rise = c.riseHour[month - 1] ?? c.riseHour[0];
    const set = c.setHour[month - 1] ?? c.setHour[0];
    return `vychod: ${rise}:00, zapad: ${set}:00`;
  }
  return '';
}

export function calculateCelestialStates(
  year: number,
  month: number,
  day: number,
  config: WorldCalendarConfig,
  overrides: CelestialOverride[],
): CelestialState[] {
  if (!config.referenceDate || config.celestialBodies.length === 0) return [];

  const yearDays = totalDaysPerYear(config);
  const refDay = absoluteDay(
    config.referenceDate.year,
    config.referenceDate.month,
    config.referenceDate.day,
    config,
  );
  const targetDay = absoluteDay(year, month, day, config);
  const delta = targetDay - refDay;

  return config.celestialBodies.map((body) => {
    const override = overrides.find((o) => o.bodyId === body.id);
    if (override) {
      return { bodyId: body.id, name: body.name, type: body.type, state: override.value, isManualOverride: true };
    }
    const state = calculateBodyState(body, delta, yearDays, month);
    return { bodyId: body.id, name: body.name, type: body.type, state, isManualOverride: false };
  });
}
```

- [ ] Spusť spec — ověř, že PROCHÁZÍ:

```bash
cd backend && npx jest --testPathPattern="world-calendar-config.utils" --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] Commit:

```bash
git add backend/src/modules/world-calendar-config/world-calendar-config.utils.ts
git add backend/src/modules/world-calendar-config/world-calendar-config.utils.spec.ts
git commit -m "feat(world-calendar-config): celestial calculation utils with tests"
```

---

## Task 4: WorldCalendarConfigService (TDD)

**Files:**
- Create: `backend/src/modules/world-calendar-config/dto/upsert-world-calendar-config.dto.ts`
- Create: `backend/src/modules/world-calendar-config/world-calendar-config.service.spec.ts`
- Create: `backend/src/modules/world-calendar-config/world-calendar-config.service.ts`

- [ ] Vytvoř DTO:

```typescript
// backend/src/modules/world-calendar-config/dto/upsert-world-calendar-config.dto.ts
export class UpsertWorldCalendarConfigDto {
  hoursPerDay?: number;
  daysOfWeek?: string[];
  months?: { name: string; daysCount: number }[];
  celestialBodies?: {
    id?: string;
    name: string;
    type: 'moon' | 'sun' | 'planet' | 'comet' | 'other';
    config: Record<string, unknown>;
    referenceState: string;
  }[];
  referenceDate?: { year: number; month: number; day: number; hour: number } | null;
}
```

- [ ] Napiš spec PŘED implementací:

```typescript
// backend/src/modules/world-calendar-config/world-calendar-config.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { WorldCalendarConfigService } from './world-calendar-config.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockRepo = { findByWorldId: jest.fn(), upsert: jest.fn() };
const mockMembershipRepo = { findByUserAndWorld: jest.fn() };

describe('WorldCalendarConfigService', () => {
  let service: WorldCalendarConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldCalendarConfigService,
        { provide: 'IWorldCalendarConfigRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(WorldCalendarConfigService);
  });

  describe('getConfig', () => {
    it('vrátí config pokud existuje', async () => {
      const cfg = { id: '1', worldId: 'w1' };
      mockRepo.findByWorldId.mockResolvedValue(cfg);
      expect(await service.getConfig('w1')).toBe(cfg);
    });

    it('vrátí null když config neexistuje', async () => {
      mockRepo.findByWorldId.mockResolvedValue(null);
      expect(await service.getConfig('w1')).toBeNull();
    });
  });

  describe('upsertConfig', () => {
    const dto = { months: [{ name: 'Leden', daysCount: 30 }], celestialBodies: [] };

    it('vyhodí ForbiddenException pro Hráče', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.upsertConfig('w1', dto, 'u1', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });

    it('povolí Adminovi bez kontroly členství', async () => {
      mockRepo.upsert.mockResolvedValue({ id: '1' });
      await service.upsertConfig('w1', dto, 'admin1', UserRole.Admin);
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('povolí PJ s platným členstvím', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockRepo.upsert.mockResolvedValue({ id: '1' });
      await service.upsertConfig('w1', dto, 'pj1', UserRole.Hrac);
      expect(mockRepo.upsert).toHaveBeenCalled();
    });

    it('vyhodí BadRequestException když riseHour délka neodpovídá počtu měsíců', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      const badDto = {
        months: [{ name: 'Leden', daysCount: 30 }],
        celestialBodies: [{
          name: 'Slunce', type: 'sun' as const,
          config: { riseHour: [6, 7], setHour: [18] },
          referenceState: '',
        }],
      };
      await expect(service.upsertConfig('w1', badDto, 'pj1', UserRole.Hrac)).rejects.toThrow(BadRequestException);
    });

    it('přiřadí UUID nebeským tělesům bez id', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockRepo.upsert.mockImplementation((_, data) => Promise.resolve({ id: '1', ...data }));
      const dtoWithBody = {
        months: [{ name: 'Leden', daysCount: 30 }],
        celestialBodies: [{
          name: 'Měsíc', type: 'moon' as const,
          config: { cycleLength: 28, phases: ['nový'] },
          referenceState: 'nový',
        }],
      };
      await service.upsertConfig('w1', dtoWithBody, 'pj1', UserRole.Hrac);
      const saved = mockRepo.upsert.mock.calls[0][1];
      expect(typeof saved.celestialBodies[0].id).toBe('string');
      expect(saved.celestialBodies[0].id.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] Spusť spec — ověř, že SELHÁVÁ:

```bash
cd backend && npx jest --testPathPattern="world-calendar-config.service.spec" --no-coverage
```

Očekáváno: FAIL — `Cannot find module`

- [ ] Vytvoř service implementaci:

```typescript
// backend/src/modules/world-calendar-config/world-calendar-config.service.ts
import { Injectable, Inject, ForbiddenException, BadRequestException } from '@nestjs/common';
import { IWorldCalendarConfigRepository } from './interfaces/world-calendar-config-repository.interface';
import { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import {
  WorldCalendarConfig, CelestialState, CelestialOverride, SunConfig,
} from './interfaces/world-calendar-config.interface';
import { UpsertWorldCalendarConfigDto } from './dto/upsert-world-calendar-config.dto';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { calculateCelestialStates } from './world-calendar-config.utils';

@Injectable()
export class WorldCalendarConfigService {
  constructor(
    @Inject('IWorldCalendarConfigRepository')
    private readonly repo: IWorldCalendarConfigRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async getConfig(worldId: string): Promise<WorldCalendarConfig | null> {
    return this.repo.findByWorldId(worldId);
  }

  async upsertConfig(
    worldId: string,
    dto: UpsertWorldCalendarConfigDto,
    userId: string,
    userRole: UserRole,
  ): Promise<WorldCalendarConfig> {
    await this.assertPjOnly(userId, userRole, worldId);

    const monthCount = dto.months?.length ?? 0;
    for (const body of dto.celestialBodies ?? []) {
      if (body.type === 'sun') {
        const sun = body.config as unknown as SunConfig;
        if ((sun.riseHour?.length ?? 0) !== monthCount || (sun.setHour?.length ?? 0) !== monthCount) {
          throw new BadRequestException('SunConfig riseHour a setHour musí odpovídat počtu měsíců');
        }
      }
    }

    const bodies = (dto.celestialBodies ?? []).map((b) => ({
      ...b,
      id: b.id ?? crypto.randomUUID(),
    }));

    return this.repo.upsert(worldId, {
      hoursPerDay: dto.hoursPerDay ?? 24,
      daysOfWeek: dto.daysOfWeek ?? [],
      months: dto.months ?? [],
      celestialBodies: bodies as WorldCalendarConfig['celestialBodies'],
      referenceDate: dto.referenceDate ?? null,
    });
  }

  calculateCelestialStates(
    year: number,
    month: number,
    day: number,
    config: WorldCalendarConfig,
    overrides: CelestialOverride[],
  ): CelestialState[] {
    return calculateCelestialStates(year, month, day, config, overrides);
  }

  private async assertPjOnly(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) {
      throw new ForbiddenException('Vyžaduje roli PJ nebo Admin');
    }
  }
}
```

- [ ] Spusť spec — ověř, že PROCHÁZÍ:

```bash
cd backend && npx jest --testPathPattern="world-calendar-config.service.spec" --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] Commit:

```bash
git add backend/src/modules/world-calendar-config/dto/
git add backend/src/modules/world-calendar-config/world-calendar-config.service.ts
git add backend/src/modules/world-calendar-config/world-calendar-config.service.spec.ts
git commit -m "feat(world-calendar-config): service with TDD"
```

---

## Task 5: WorldCalendarConfigController + Module + registrace

**Files:**
- Create: `backend/src/modules/world-calendar-config/world-calendar-config.controller.ts`
- Create: `backend/src/modules/world-calendar-config/world-calendar-config.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] Vytvoř controller:

```typescript
// backend/src/modules/world-calendar-config/world-calendar-config.controller.ts
import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldCalendarConfigService } from './world-calendar-config.service';
import { UpsertWorldCalendarConfigDto } from './dto/upsert-world-calendar-config.dto';

interface RequestUser { id: string; role: UserRole }

@UseGuards(JwtAuthGuard)
@Controller('worlds/:worldId/calendar-config')
export class WorldCalendarConfigController {
  constructor(private readonly service: WorldCalendarConfigService) {}

  @Get()
  getConfig(@Param('worldId') worldId: string) {
    return this.service.getConfig(worldId);
  }

  @Put()
  upsertConfig(
    @Param('worldId') worldId: string,
    @Body() dto: UpsertWorldCalendarConfigDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.upsertConfig(worldId, dto, user.id, user.role);
  }
}
```

- [ ] Vytvoř modul:

```typescript
// backend/src/modules/world-calendar-config/world-calendar-config.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldCalendarConfigSchemaClass, WorldCalendarConfigSchema } from './schemas/world-calendar-config.schema';
import { WorldCalendarConfigController } from './world-calendar-config.controller';
import { WorldCalendarConfigService } from './world-calendar-config.service';
import { MongoWorldCalendarConfigRepository } from './repositories/world-calendar-config.repository';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldCalendarConfigSchemaClass.name, schema: WorldCalendarConfigSchema },
    ]),
    WorldsModule,
  ],
  controllers: [WorldCalendarConfigController],
  providers: [
    WorldCalendarConfigService,
    { provide: 'IWorldCalendarConfigRepository', useClass: MongoWorldCalendarConfigRepository },
  ],
  exports: [WorldCalendarConfigService],
})
export class WorldCalendarConfigModule {}
```

- [ ] Přidej do `backend/src/app.module.ts`:

Import na začátek souboru:
```typescript
import { WorldCalendarConfigModule } from './modules/world-calendar-config/world-calendar-config.module';
```

Do pole `imports` (za `DungeonMapsModule`):
```typescript
WorldCalendarConfigModule,
```

- [ ] Commit:

```bash
git add backend/src/modules/world-calendar-config/
git add backend/src/app.module.ts
git commit -m "feat(world-calendar-config): controller, module, app registration"
```

---

## Task 6: TimelineEvent — interfaces a schema

**Files:**
- Create: `backend/src/modules/timeline/interfaces/timeline-event.interface.ts`
- Create: `backend/src/modules/timeline/interfaces/timeline-repository.interface.ts`
- Create: `backend/src/modules/timeline/schemas/timeline-event.schema.ts`

- [ ] Vytvoř interfacy:

```typescript
// backend/src/modules/timeline/interfaces/timeline-event.interface.ts
import { CelestialState, CelestialOverride } from '../../world-calendar-config/interfaces/world-calendar-config.interface';

export { CelestialOverride };

export interface TimelineEvent {
  id: string;
  worldId: string;
  year: number;
  month: number;
  day: number;
  hour?: number;
  title: string;
  text: string;
  imageUrl?: string | null;
  link?: string | null;
  celestialOverrides: CelestialOverride[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TimelineEventWithStates extends TimelineEvent {
  celestialStates: CelestialState[];
}
```

- [ ] Vytvoř repository interface:

```typescript
// backend/src/modules/timeline/interfaces/timeline-repository.interface.ts
import { TimelineEvent } from './timeline-event.interface';

export interface TimelineListFilters {
  limit?: number;
  fromYear?: number;
  toYear?: number;
}

export interface ITimelineRepository {
  findByWorld(worldId: string, filters: TimelineListFilters): Promise<TimelineEvent[]>;
  findById(id: string): Promise<TimelineEvent | null>;
  create(data: Omit<TimelineEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<TimelineEvent>;
  update(
    id: string,
    data: Partial<Omit<TimelineEvent, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<TimelineEvent | null>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] Vytvoř schema:

```typescript
// backend/src/modules/timeline/schemas/timeline-event.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TimelineEventDocument = HydratedDocument<TimelineEventSchemaClass>;

@Schema({ timestamps: true, collection: 'timeline_events' })
export class TimelineEventSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) year: number;
  @Prop({ required: true }) month: number;
  @Prop({ required: true }) day: number;
  @Prop({ default: null }) hour: number | null;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) text: string;
  @Prop({ default: null }) imageUrl: string | null;
  @Prop({ default: null }) link: string | null;
  @Prop({ type: [Object], default: [] }) celestialOverrides: Record<string, unknown>[];
}

export const TimelineEventSchema = SchemaFactory.createForClass(TimelineEventSchemaClass);
TimelineEventSchema.index({ worldId: 1, year: 1, month: 1, day: 1 });
```

- [ ] Commit:

```bash
git add backend/src/modules/timeline/
git commit -m "feat(timeline): interfaces and schema"
```

---

## Task 7: TimelineRepository

**Files:**
- Create: `backend/src/modules/timeline/repositories/timeline.repository.ts`

- [ ] Vytvoř repository:

```typescript
// backend/src/modules/timeline/repositories/timeline.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimelineEventSchemaClass } from '../schemas/timeline-event.schema';
import { ITimelineRepository, TimelineListFilters } from '../interfaces/timeline-repository.interface';
import { TimelineEvent, CelestialOverride } from '../interfaces/timeline-event.interface';

@Injectable()
export class MongoTimelineRepository implements ITimelineRepository {
  constructor(
    @InjectModel(TimelineEventSchemaClass.name)
    private readonly model: Model<TimelineEventSchemaClass>,
  ) {}

  async findByWorld(worldId: string, filters: TimelineListFilters): Promise<TimelineEvent[]> {
    const query: Record<string, unknown> = { worldId };
    if (filters.fromYear !== undefined) query.year = { ...((query.year as object) ?? {}), $gte: filters.fromYear };
    if (filters.toYear !== undefined) query.year = { ...((query.year as object) ?? {}), $lte: filters.toYear };
    let q = this.model.find(query).sort({ year: 1, month: 1, day: 1 });
    if (filters.limit) q = q.limit(filters.limit);
    const docs = await q.lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async findById(id: string): Promise<TimelineEvent | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(data: Omit<TimelineEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<TimelineEvent> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<Omit<TimelineEvent, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<TimelineEvent | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findByIdAndUpdate(id, { $set: data }, { new: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).lean().exec();
    return !!result;
  }

  private toEntity(doc: Record<string, unknown>): TimelineEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      year: doc.year as number,
      month: doc.month as number,
      day: doc.day as number,
      hour: (doc.hour as number | null) ?? undefined,
      title: doc.title as string,
      text: doc.text as string,
      imageUrl: (doc.imageUrl as string | null) ?? null,
      link: (doc.link as string | null) ?? null,
      celestialOverrides: (doc.celestialOverrides as CelestialOverride[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] Commit:

```bash
git add backend/src/modules/timeline/repositories/
git commit -m "feat(timeline): repository"
```

---

## Task 8: TimelineService (TDD)

**Files:**
- Create: `backend/src/modules/timeline/dto/create-timeline-event.dto.ts`
- Create: `backend/src/modules/timeline/dto/update-timeline-event.dto.ts`
- Create: `backend/src/modules/timeline/timeline.service.spec.ts`
- Create: `backend/src/modules/timeline/timeline.service.ts`

- [ ] Vytvoř DTOs:

```typescript
// backend/src/modules/timeline/dto/create-timeline-event.dto.ts
export class CreateTimelineEventDto {
  worldId: string;
  year: number;
  month: number;
  day: number;
  hour?: number;
  title: string;
  text: string;
  imageUrl?: string | null;
  link?: string | null;
  celestialOverrides?: { bodyId: string; value: string }[];
}
```

```typescript
// backend/src/modules/timeline/dto/update-timeline-event.dto.ts
export class UpdateTimelineEventDto {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  title?: string;
  text?: string;
  imageUrl?: string | null;
  link?: string | null;
  celestialOverrides?: { bodyId: string; value: string }[];
}
```

- [ ] Napiš spec PŘED implementací:

```typescript
// backend/src/modules/timeline/timeline.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { WorldCalendarConfigService } from '../world-calendar-config/world-calendar-config.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockRepo = {
  findByWorld: jest.fn(), findById: jest.fn(),
  create: jest.fn(), update: jest.fn(), delete: jest.fn(),
};
const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
const mockCalendarService = { getConfig: jest.fn(), calculateCelestialStates: jest.fn() };

const mockEvent = {
  id: 'ev1', worldId: 'w1', year: 100, month: 1, day: 5,
  title: 'Bitva', text: 'Popis', imageUrl: null, link: null,
  celestialOverrides: [], createdAt: new Date(), updatedAt: new Date(),
};

describe('TimelineService', () => {
  let service: TimelineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCalendarService.getConfig.mockResolvedValue(null);
    mockCalendarService.calculateCelestialStates.mockReturnValue([]);
    const module = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: 'ITimelineRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: WorldCalendarConfigService, useValue: mockCalendarService },
      ],
    }).compile();
    service = module.get(TimelineService);
  });

  describe('findAll', () => {
    it('vrátí události s prázdnými celestialStates když config neexistuje', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockEvent]);
      const result = await service.findAll('w1', {});
      expect(result[0].celestialStates).toEqual([]);
    });

    it('stripuje base64 imageUrl v listu', async () => {
      mockRepo.findByWorld.mockResolvedValue([{ ...mockEvent, imageUrl: 'data:image/png;base64,abc' }]);
      const result = await service.findAll('w1', {});
      expect(result[0].imageUrl).toBeNull();
    });

    it('zachová normální URL v listu', async () => {
      mockRepo.findByWorld.mockResolvedValue([{ ...mockEvent, imageUrl: 'https://cdn.example.com/img.png' }]);
      const result = await service.findAll('w1', {});
      expect(result[0].imageUrl).toBe('https://cdn.example.com/img.png');
    });
  });

  describe('findOne', () => {
    it('zachová base64 imageUrl v detailu', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEvent, imageUrl: 'data:image/png;base64,abc' });
      const result = await service.findOne('ev1');
      expect(result.imageUrl).toBe('data:image/png;base64,abc');
    });

    it('vyhodí NotFoundException pro neexistující událost', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('vyhodí ForbiddenException pro Hráče', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(
        service.create({ worldId: 'w1', year: 1, month: 1, day: 1, title: 'T', text: 'T' }, 'u1', UserRole.Hrac),
      ).rejects.toThrow(ForbiddenException);
    });

    it('vytvoří událost pro PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockRepo.create.mockResolvedValue(mockEvent);
      const result = await service.create(
        { worldId: 'w1', year: 1, month: 1, day: 1, title: 'T', text: 'T' }, 'pj1', UserRole.Hrac,
      );
      expect(result).toBe(mockEvent);
    });

    it('Admin vytvoří bez kontroly členství', async () => {
      mockRepo.create.mockResolvedValue(mockEvent);
      await service.create(
        { worldId: 'w1', year: 1, month: 1, day: 1, title: 'T', text: 'T' }, 'admin1', UserRole.Admin,
      );
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('zachová imageUrl při přijetí null v dto', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEvent, imageUrl: 'https://cdn.example.com/img.png' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockRepo.update.mockResolvedValue({ ...mockEvent, imageUrl: 'https://cdn.example.com/img.png' });
      await service.update('ev1', { imageUrl: null }, 'pj1', UserRole.Hrac);
      expect(mockRepo.update.mock.calls[0][1].imageUrl).toBe('https://cdn.example.com/img.png');
    });

    it('vyhodí NotFoundException pro neexistující událost', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.update('missing', {}, 'pj1', UserRole.Admin)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('vyhodí ForbiddenException pro Hráče', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.delete('ev1', 'u1', UserRole.Hrac)).rejects.toThrow(ForbiddenException);
    });

    it('Admin smaže bez kontroly členství', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent);
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('ev1', 'admin1', UserRole.Admin);
      expect(mockRepo.delete).toHaveBeenCalledWith('ev1');
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] Spusť spec — ověř, že SELHÁVÁ:

```bash
cd backend && npx jest --testPathPattern="timeline.service.spec" --no-coverage
```

Očekáváno: FAIL — `Cannot find module`

- [ ] Vytvoř service implementaci:

```typescript
// backend/src/modules/timeline/timeline.service.ts
import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ITimelineRepository, TimelineListFilters } from './interfaces/timeline-repository.interface';
import { TimelineEvent, TimelineEventWithStates } from './interfaces/timeline-event.interface';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldCalendarConfigService } from '../world-calendar-config/world-calendar-config.service';
import { WorldCalendarConfig } from '../world-calendar-config/interfaces/world-calendar-config.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

@Injectable()
export class TimelineService {
  constructor(
    @Inject('ITimelineRepository') private readonly repo: ITimelineRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly calendarConfigService: WorldCalendarConfigService,
  ) {}

  async findAll(worldId: string, filters: TimelineListFilters): Promise<TimelineEventWithStates[]> {
    const events = await this.repo.findByWorld(worldId, filters);
    const config = await this.calendarConfigService.getConfig(worldId);
    return events.map((event) => this.enrich(event, config, false));
  }

  async findOne(id: string): Promise<TimelineEventWithStates> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException('Timeline event not found');
    const config = await this.calendarConfigService.getConfig(event.worldId);
    return this.enrich(event, config, true);
  }

  async create(dto: CreateTimelineEventDto, userId: string, userRole: UserRole): Promise<TimelineEvent> {
    await this.assertPjOnly(userId, userRole, dto.worldId);
    return this.repo.create({
      worldId: dto.worldId,
      year: dto.year,
      month: dto.month,
      day: dto.day,
      hour: dto.hour,
      title: dto.title,
      text: dto.text,
      imageUrl: dto.imageUrl ?? null,
      link: dto.link ?? null,
      celestialOverrides: dto.celestialOverrides ?? [],
    });
  }

  async update(
    id: string,
    dto: UpdateTimelineEventDto,
    userId: string,
    userRole: UserRole,
  ): Promise<TimelineEventWithStates> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException('Timeline event not found');
    await this.assertPjOnly(userId, userRole, event.worldId);
    const imageUrl = dto.imageUrl === null ? event.imageUrl : dto.imageUrl;
    const updated = await this.repo.update(id, { ...dto, imageUrl });
    const config = await this.calendarConfigService.getConfig(event.worldId);
    return this.enrich(updated!, config, true);
  }

  async delete(id: string, userId: string, userRole: UserRole): Promise<void> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException('Timeline event not found');
    await this.assertPjOnly(userId, userRole, event.worldId);
    await this.repo.delete(id);
  }

  private enrich(
    event: TimelineEvent,
    config: WorldCalendarConfig | null,
    preserveImageUrl: boolean,
  ): TimelineEventWithStates {
    const celestialStates = config
      ? this.calendarConfigService.calculateCelestialStates(
          event.year, event.month, event.day, config, event.celestialOverrides,
        )
      : [];
    const imageUrl = preserveImageUrl ? event.imageUrl : stripBase64(event.imageUrl);
    return { ...event, imageUrl, celestialStates };
  }

  private async assertPjOnly(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PJ) {
      throw new ForbiddenException('Vyžaduje roli PJ nebo Admin');
    }
  }
}

function stripBase64(imageUrl: string | null | undefined): string | null {
  if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) return null;
  return imageUrl ?? null;
}
```

- [ ] Spusť spec — ověř, že PROCHÁZÍ:

```bash
cd backend && npx jest --testPathPattern="timeline.service.spec" --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] Commit:

```bash
git add backend/src/modules/timeline/
git commit -m "feat(timeline): service with TDD"
```

---

## Task 9: TimelineController + Module + registrace

**Files:**
- Create: `backend/src/modules/timeline/timeline.controller.ts`
- Create: `backend/src/modules/timeline/timeline.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] Vytvoř controller:

```typescript
// backend/src/modules/timeline/timeline.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { TimelineService } from './timeline.service';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';

interface RequestUser { id: string; role: UserRole }

@UseGuards(JwtAuthGuard)
@Controller('timeline')
export class TimelineController {
  constructor(private readonly service: TimelineService) {}

  @Get()
  findAll(
    @Query('worldId') worldId: string,
    @Query('limit') limit?: string,
    @Query('fromYear') fromYear?: string,
    @Query('toYear') toYear?: string,
  ) {
    return this.service.findAll(worldId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      fromYear: fromYear ? parseInt(fromYear, 10) : undefined,
      toYear: toYear ? parseInt(toYear, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTimelineEventDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.role);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimelineEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.delete(id, user.id, user.role);
  }
}
```

- [ ] Vytvoř modul:

```typescript
// backend/src/modules/timeline/timeline.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimelineEventSchemaClass, TimelineEventSchema } from './schemas/timeline-event.schema';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';
import { MongoTimelineRepository } from './repositories/timeline.repository';
import { WorldsModule } from '../worlds/worlds.module';
import { WorldCalendarConfigModule } from '../world-calendar-config/world-calendar-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TimelineEventSchemaClass.name, schema: TimelineEventSchema },
    ]),
    WorldsModule,
    WorldCalendarConfigModule,
  ],
  controllers: [TimelineController],
  providers: [
    TimelineService,
    { provide: 'ITimelineRepository', useClass: MongoTimelineRepository },
  ],
})
export class TimelineModule {}
```

- [ ] Přidej do `backend/src/app.module.ts`:

Import na začátek souboru:
```typescript
import { TimelineModule } from './modules/timeline/timeline.module';
```

Do pole `imports` (za `WorldCalendarConfigModule`):
```typescript
TimelineModule,
```

- [ ] Spusť všechny nové testy najednou — ověř, že vše PROCHÁZÍ:

```bash
cd backend && npx jest --testPathPattern="world-calendar-config|timeline" --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] Commit:

```bash
git add backend/src/modules/timeline/
git add backend/src/app.module.ts
git commit -m "feat(timeline): controller, module, app registration"
```
