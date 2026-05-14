# Krok 10b — Calendar: Implementační plán (Fáze 5.2)

> **Datum vzniku:** 2026-05-04
> **Aktualizováno:** 2026-05-06 (revize během brainstormingu Fáze 5.2 — auth pattern, DTO validace, anti-leak)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ⚠️ **DŮLEŽITÉ pro implementer subagenty:** Aktualizace 2026-05-06 přidává konzistenci s WorldNews/Timeline/Calendar/Weather patterny:
> - **Auth pro CalendarsModule** (aggregate, settings) — `assertCanModerate(worldId, requester)`: Admin/Superadmin shortcut **\|** `WorldRole >= PomocnyPJ`. Anti-leak: 403 pro write na neexistující svět, 404 pro read.
> - **DTO validace** přes class-validator (`@IsString`, `@IsHexColor`, `@IsIn`, `@IsBoolean`, atd.) — `whitelist: true` v ValidationPipe by jinak strippal pole.
> - **Service signatures**: všechny metody nového `CalendarsService` přijímají `requester: RequestUser` jako parametr; auth se řeší v service (NE v controller decorators).
> - **`assertSubdocAccess`** je existující helper v `character-subdocs` — použít pro legacy GET/PUT endpointy (vlastník nebo PJ/Admin).
> - **Pattern reference:** `backend/src/modules/timeline/timeline.service.ts` (assertMember/assertCanWrite), `world-currencies.service.ts` (assertCanAdmin přes worldsRepo+membershipRepo).

**Goal:** Rozšířit existující `character-subdocs` kalendář o nastavení vzhledu, agregovaný PJ pohled, legacy endpoint pro budoucí migraci dat a podporu lokací jako entit s kalendářem.

**Architecture:** Existující `CharacterCalendar` schema dostane `color` + `displaySettings`. `Character` schema dostane `isLocation` flag, který podmíní tvorbu subdokumentů. Nový `CalendarsModule` přidá tři endpointy: agregaci, nastavení (≥ PomocnyPJ) a legacy URL (assertSubdocAccess). `CharacterSubdocsModule` exportuje svůj service a controller změní `PATCH` → `PUT`.

**Tech Stack:** NestJS 11, Mongoose 9, class-validator, Jest, TypeScript strict.

**Závislosti:**
- `CharactersModule` — `ICharactersRepository` (slug → characterId, character info)
- `CharacterSubdocsModule` — `CharacterSubdocsService` (existing methods + nový `getCalendarsByWorldId`)
- `WorldsModule` — `IWorldMembershipRepository`, `IWorldsRepository` (auth)

**Spec:** [2026-05-04-krok-10b-calendar-design.md](../specs/2026-05-04-krok-10b-calendar-design.md)

---

## File Map

| Akce | Soubor |
|------|--------|
| Modify | `backend/src/modules/characters/interfaces/character.interface.ts` |
| Modify | `backend/src/modules/characters/schemas/character.schema.ts` |
| Modify | `backend/src/modules/characters/dto/create-character.dto.ts` |
| Modify | `backend/src/modules/characters/characters.service.ts` |
| Modify | `backend/src/modules/characters/characters.service.spec.ts` |
| Modify | `backend/src/modules/character-subdocs/character-subdocs.service.ts` |
| Modify | `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts` |
| Modify | `backend/src/modules/character-subdocs/interfaces/character-calendar.interface.ts` |
| Modify | `backend/src/modules/character-subdocs/schemas/character-calendar.schema.ts` |
| Modify | `backend/src/modules/character-subdocs/repositories/character-calendar.repository.ts` |
| Modify | `backend/src/modules/character-subdocs/character-subdocs.service.ts` |
| Modify | `backend/src/modules/character-subdocs/character-subdocs.module.ts` |
| Modify | `backend/src/modules/character-subdocs/character-subdocs.controller.ts` |
| Modify | `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts` |
| Create | `backend/src/modules/calendars/interfaces/calendars.interface.ts` |
| Create | `backend/src/modules/calendars/calendars.service.ts` |
| Create | `backend/src/modules/calendars/calendars.service.spec.ts` |
| Create | `backend/src/modules/calendars/calendars.controller.ts` |
| Create | `backend/src/modules/calendars/legacy-calenders.controller.ts` |
| Create | `backend/src/modules/calendars/calendars.module.ts` |
| Modify | `backend/src/app.module.ts` |

---

## Task 0: isLocation flag — Character schema, DTO, service, subdocs logika

**Files:**
- Modify: `backend/src/modules/characters/interfaces/character.interface.ts`
- Modify: `backend/src/modules/characters/schemas/character.schema.ts`
- Modify: `backend/src/modules/characters/dto/create-character.dto.ts`
- Modify: `backend/src/modules/characters/characters.service.ts`
- Test: `backend/src/modules/characters/characters.service.spec.ts`
- Modify: `backend/src/modules/character-subdocs/character-subdocs.service.ts`
- Test: `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts`

- [ ] **Step 1: Napiš failing test — subdocs přeskočí diary/notes pro lokaci**

V `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts` přidej tento blok za stávající `onCharacterCreated — NPC` describe:

```typescript
  describe('onCharacterCreated — lokace', () => {
    it('vytvoří jen calendar pro lokaci — bez diary, notes, finance, inventory', async () => {
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);

      await service.onCharacterCreated({ characterId: 'loc1', worldId: 'w1', userId: undefined, isNpc: true, isLocation: true });

      expect(mockCalendarRepo.create).toHaveBeenCalledWith('loc1', 'w1');
      expect(mockDiaryRepo.create).not.toHaveBeenCalled();
      expect(mockNotesRepo.create).not.toHaveBeenCalled();
      expect(mockFinanceRepo.create).not.toHaveBeenCalled();
      expect(mockInventoryRepo.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend && npx jest --testPathPattern=character-subdocs.service --no-coverage
```

Očekáváno: FAIL — test selže, protože `onCharacterCreated` ignoruje `isLocation` a volá i diary/notes

- [ ] **Step 3: Přidej `isLocation` do Character interface**

V `backend/src/modules/characters/interfaces/character.interface.ts` přidej pole `isLocation` za `isNpc`:

```typescript
export interface Character {
  id: string;
  slug: string;
  name: string;
  worldId: string;
  userId?: string;
  isNpc: boolean;
  isLocation: boolean;
  imageUrl?: string;
  // ... zbytek beze změny
```

Stejně tak v `CharacterDirectoryEntry`:

```typescript
export interface CharacterDirectoryEntry {
  id: string;
  slug: string;
  name: string;
  imageUrl?: string;
  isNpc: boolean;
  isLocation: boolean;
}
```

- [ ] **Step 4: Přidej `isLocation` do Character schema**

V `backend/src/modules/characters/schemas/character.schema.ts` přidej prop za `isNpc`:

```typescript
  @Prop({ default: false }) isNpc: boolean;
  @Prop({ default: false }) isLocation: boolean;
```

- [ ] **Step 5: Přidej `isLocation` do CreateCharacterDto**

V `backend/src/modules/characters/dto/create-character.dto.ts` přidej za `isNpc`:

```typescript
  @IsBoolean() isNpc: boolean;
  @IsOptional() @IsBoolean() isLocation?: boolean;
```

- [ ] **Step 6: Propaguj `isLocation` v CharactersService**

V `backend/src/modules/characters/characters.service.ts` najdi metodu `create`. Přidej `isLocation` do uloženého objektu a emitu události.

Najdi blok kde se ukládá postava (volání `charRepo.save`) — přidej `isLocation: dto.isLocation ?? false`:

```typescript
    const character = await this.charRepo.save({
      slug: dto.slug.toLowerCase(),
      name: dto.name,
      worldId,
      userId: dto.userId,
      isNpc: dto.isNpc,
      isLocation: dto.isLocation ?? false,
      imageUrl: dto.imageUrl,
      publicBio: dto.publicBio ?? '',
      publicInfoBlocks: (dto.publicInfoBlocks as unknown as Character['publicInfoBlocks']) ?? [],
      privateBio: dto.privateBio ?? '',
      privateInfoBlocks: (dto.privateInfoBlocks as unknown as Character['privateInfoBlocks']) ?? [],
      diaryData: {},
      extraBlocks: [],
      campaignSubjectId: dto.campaignSubjectId,
      accessRequirements: (dto.accessRequirements as unknown as Character['accessRequirements']) ?? [],
    });
```

Poté přidej `isLocation` do `character.created` emitu:

```typescript
    this.eventEmitter.emit('character.created', {
      characterId: character.id,
      worldId: character.worldId,
      userId: character.userId,
      isNpc: character.isNpc,
      isLocation: character.isLocation,
      name: character.name,
      imageUrl: character.imageUrl,
    });
```

- [ ] **Step 7: Aktualizuj `CharacterCreatedPayload` a logiku v CharacterSubdocsService**

V `backend/src/modules/character-subdocs/character-subdocs.service.ts` rozšiř interface:

```typescript
interface CharacterCreatedPayload {
  characterId: string;
  worldId: string;
  userId?: string;
  isNpc: boolean;
  isLocation?: boolean;
}
```

Poté nahraď tělo `onCharacterCreated`:

```typescript
  @OnEvent('character.created')
  async onCharacterCreated(payload: CharacterCreatedPayload): Promise<void> {
    const { characterId, worldId, isNpc, isLocation } = payload;

    await this.calendarRepo.create(characterId, worldId);

    if (!isLocation) {
      await Promise.all([
        this.diaryRepo.create(characterId, worldId),
        this.notesRepo.create(characterId),
        ...(!isNpc ? [
          this.financeRepo.create(characterId),
          this.inventoryRepo.create(characterId),
        ] : []),
      ]);
    }
  }
```

- [ ] **Step 8: Spusť testy — ověř PASS**

```bash
cd backend && npx jest --testPathPattern=character-subdocs.service --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] **Step 9: Spusť characters testy — ověř že nebyly rozbity**

```bash
cd backend && npx jest --testPathPattern=characters.service --no-coverage
```

Očekáváno: PASS (přidání `isLocation` je zpětně kompatibilní díky `?? false`)

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/characters/interfaces/character.interface.ts \
        backend/src/modules/characters/schemas/character.schema.ts \
        backend/src/modules/characters/dto/create-character.dto.ts \
        backend/src/modules/characters/characters.service.ts \
        backend/src/modules/character-subdocs/character-subdocs.service.ts \
        backend/src/modules/character-subdocs/character-subdocs.service.spec.ts
git commit -m "feat(characters): isLocation flag — lokace dostane jen kalendář"
```

---

## Task 1: Rozšířit CharacterCalendar interface, schema a repository

**Files:**
- Modify: `backend/src/modules/character-subdocs/interfaces/character-calendar.interface.ts`
- Modify: `backend/src/modules/character-subdocs/schemas/character-calendar.schema.ts`
- Modify: `backend/src/modules/character-subdocs/repositories/character-calendar.repository.ts`

- [ ] **Step 1: Aktualizuj interface**

Nahraď celý obsah `backend/src/modules/character-subdocs/interfaces/character-calendar.interface.ts`:

```typescript
export interface CalendarDisplaySettings {
  defaultView?: 'month' | 'week' | 'day';
  isHiddenInAggregate?: boolean;
}

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
  color: string;
  displaySettings: CalendarDisplaySettings;
  events: CalendarEvent[];
}
```

- [ ] **Step 2: Aktualizuj schema**

Nahraď celý obsah `backend/src/modules/character-subdocs/schemas/character-calendar.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CharacterCalendarDocument = HydratedDocument<CharacterCalendarSchemaClass>;

@Schema({ collection: 'character_calendars' })
export class CharacterCalendarSchemaClass {
  @Prop({ required: true, unique: true }) characterId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ default: '#3B82F6' }) color: string;
  @Prop({ type: Object, default: {} }) displaySettings: Record<string, unknown>;
  @Prop({ type: [Object], default: [] }) events: Record<string, unknown>[];
}

export const CharacterCalendarSchema = SchemaFactory.createForClass(CharacterCalendarSchemaClass);
CharacterCalendarSchema.index({ characterId: 1 }, { unique: true });
CharacterCalendarSchema.index({ worldId: 1 });
```

- [ ] **Step 3: Aktualizuj repository — přidej `findByWorldId` a oprav `toEntity`**

Nahraď celý obsah `backend/src/modules/character-subdocs/repositories/character-calendar.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterCalendarSchemaClass } from '../schemas/character-calendar.schema';
import { CharacterCalendar, CalendarEvent, CalendarDisplaySettings } from '../interfaces/character-calendar.interface';

@Injectable()
export class CharacterCalendarRepository {
  constructor(@InjectModel(CharacterCalendarSchemaClass.name) private readonly model: Model<CharacterCalendarSchemaClass>) {}

  async findByCharacterId(characterId: string): Promise<CharacterCalendar | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByWorldId(worldId: string): Promise<CharacterCalendar[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(characterId: string, worldId: string): Promise<CharacterCalendar> {
    const created = new this.model({ characterId, worldId, color: '#3B82F6', displaySettings: {}, events: [] });
    const saved = await created.save();
    return this.toEntity(saved.toObject() as unknown as Record<string, unknown>);
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
      color: (doc.color as string) ?? '#3B82F6',
      displaySettings: (doc.displaySettings as CalendarDisplaySettings) ?? {},
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

- [ ] **Step 4: Spusť existující testy — ověř že stále projdou**

```bash
cd backend && npx jest --testPathPattern=character-subdocs --no-coverage
```

Očekáváno: všechny testy PASS (interface změna je additivní, mockCalendar v testu nepotřebuje nová pole)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/character-subdocs/interfaces/character-calendar.interface.ts \
        backend/src/modules/character-subdocs/schemas/character-calendar.schema.ts \
        backend/src/modules/character-subdocs/repositories/character-calendar.repository.ts
git commit -m "feat(calendar): rozšířit CharacterCalendar o color, displaySettings a findByWorldId"
```

---

## Task 2: CharacterSubdocsService — getCalendarsByWorldId + export + PATCH→PUT

**Files:**
- Modify: `backend/src/modules/character-subdocs/character-subdocs.service.ts`
- Modify: `backend/src/modules/character-subdocs/character-subdocs.module.ts`
- Modify: `backend/src/modules/character-subdocs/character-subdocs.controller.ts`
- Test: `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts`

- [ ] **Step 1: Napiš failing test pro `getCalendarsByWorldId`**

Přidej tento `describe` blok do `backend/src/modules/character-subdocs/character-subdocs.service.spec.ts` — PŘED uzavírací `}` celého `describe('CharacterSubdocsService')`:

Nejdřív aktualizuj `mockCalendar` na řádku 6, aby obsahoval nová pole:

```typescript
const mockCalendar = { id: 'cal1', characterId: 'char1', worldId: 'w1', color: '#3B82F6', displaySettings: {}, events: [] };
```

Poté přidej blok:

```typescript
  describe('getCalendarsByWorldId', () => {
    it('vrátí pole kalendářů pro daný worldId', async () => {
      mockCalendarRepo.findByWorldId = jest.fn().mockResolvedValue([mockCalendar]);

      const result = await service.getCalendarsByWorldId('w1');

      expect(mockCalendarRepo.findByWorldId).toHaveBeenCalledWith('w1');
      expect(result).toEqual([mockCalendar]);
    });
  });
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend && npx jest --testPathPattern=character-subdocs.service --no-coverage
```

Očekáváno: FAIL — `service.getCalendarsByWorldId is not a function`

- [ ] **Step 3: Přidej metodu `getCalendarsByWorldId` do service**

V `backend/src/modules/character-subdocs/character-subdocs.service.ts` přidej novou metodu za `updateCalendar`:

```typescript
  async getCalendarsByWorldId(worldId: string): Promise<CharacterCalendar[]> {
    return this.calendarRepo.findByWorldId(worldId);
  }
```

Nezapomeň přidat import `CharacterCalendar` pokud chybí — je již importován přes `CharacterCalendar` v return type `getCalendar`.

- [ ] **Step 4: Exportuj `CharacterSubdocsService` z modulu**

V `backend/src/modules/character-subdocs/character-subdocs.module.ts` přidej `exports` pole:

```typescript
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
  exports: [CharacterSubdocsService],
})
export class CharacterSubdocsModule {}
```

- [ ] **Step 5: Změň PATCH → PUT v controlleru**

V `backend/src/modules/character-subdocs/character-subdocs.controller.ts` změň import a dekorátor:

Přidej `Put` do importu z `@nestjs/common`:
```typescript
import { Controller, Get, Patch, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
```

Najdi metodu `updateCalendar` (řádek ~48) a změň `@Patch('calendar')` na `@Put('calendar')`:
```typescript
  @Put('calendar')
  async updateCalendar(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.updateCalendar(character.id, body);
  }
```

- [ ] **Step 6: Spusť testy — ověř PASS**

```bash
cd backend && npx jest --testPathPattern=character-subdocs --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/character-subdocs/character-subdocs.service.ts \
        backend/src/modules/character-subdocs/character-subdocs.module.ts \
        backend/src/modules/character-subdocs/character-subdocs.controller.ts \
        backend/src/modules/character-subdocs/character-subdocs.service.spec.ts
git commit -m "feat(calendar): getCalendarsByWorldId, export service, PUT semantika"
```

---

## Task 3: CalendarsService — aggregate, settings, legacy operace

**Files:**
- Create: `backend/src/modules/calendars/interfaces/calendars.interface.ts`
- Create: `backend/src/modules/calendars/calendars.service.ts`
- Create: `backend/src/modules/calendars/calendars.service.spec.ts`

- [ ] **Step 1: Napiš failing testy**

Vytvoř `backend/src/modules/calendars/calendars.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockCalendar = (characterId: string, color = '#3B82F6', isHidden = false) => ({
  id: `cal-${characterId}`,
  characterId,
  worldId: 'w1',
  color,
  displaySettings: { isHiddenInAggregate: isHidden },
  events: [{ id: 'e1', title: 'Schůzka', start: '2026-05-10' }],
});

const mockChar = (id: string, slug: string, name: string) => ({
  id, slug, name, worldId: 'w1', isNpc: false, userId: 'user1',
});

describe('CalendarsService', () => {
  let service: CalendarsService;

  const mockSubdocs = {
    getCalendarsByWorldId: jest.fn(),
    getCalendar: jest.fn(),
    updateCalendar: jest.fn(),
  };
  const mockCharRepo = {
    findByWorld: jest.fn(),
    findBySlugAndWorld: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(),
  };
  const mockCharsService = {
    assertSubdocAccess: jest.fn(),
    findBySlugRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CalendarsService,
        { provide: 'CharacterSubdocsService', useValue: mockSubdocs },
        { provide: 'ICharactersRepository', useValue: mockCharRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'CharactersService', useValue: mockCharsService },
      ],
    }).compile();
    service = module.get(CalendarsService);
  });

  describe('aggregate', () => {
    it('vrátí sloučené události všech viditelných postav', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PomocnyPJ });
      mockSubdocs.getCalendarsByWorldId.mockResolvedValue([
        mockCalendar('char1', '#FF0000', false),
        mockCalendar('char2', '#00FF00', false),
      ]);
      mockCharRepo.findByWorld.mockResolvedValue([
        mockChar('char1', 'jan', 'Jan Novák'),
        mockChar('char2', 'eva', 'Eva Malá'),
      ]);

      const result = await service.aggregate('w1', 'requester1');

      expect(result.characters).toHaveLength(2);
      expect(result.events).toHaveLength(2);
      expect(result.events[0]).toMatchObject({ characterId: 'char1', slug: 'jan', name: 'Jan Novák', color: '#FF0000' });
    });

    it('vyfiltruje postavy s isHiddenInAggregate=true', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockSubdocs.getCalendarsByWorldId.mockResolvedValue([
        mockCalendar('char1', '#FF0000', false),
        mockCalendar('char2', '#00FF00', true),
      ]);
      mockCharRepo.findByWorld.mockResolvedValue([
        mockChar('char1', 'jan', 'Jan Novák'),
        mockChar('char2', 'eva', 'Eva Malá'),
      ]);

      const result = await service.aggregate('w1', 'requester1');

      expect(result.characters).toHaveLength(1);
      expect(result.events).toHaveLength(1);
      expect(result.characters[0].characterId).toBe('char1');
    });

    it('vyhodí ForbiddenException pokud requester je Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.aggregate('w1', 'requester1')).rejects.toThrow(ForbiddenException);
    });

    it('vyhodí ForbiddenException pokud requester není členem světa', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.aggregate('w1', 'requester1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateSettings', () => {
    it('aktualizuje color a displaySettings — PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockCharsService.findBySlugRaw.mockResolvedValue(mockChar('char1', 'jan', 'Jan Novák'));
      mockSubdocs.getCalendar.mockResolvedValue(mockCalendar('char1'));
      mockSubdocs.updateCalendar.mockResolvedValue({ ...mockCalendar('char1'), color: '#AABBCC' });

      const result = await service.updateSettings('w1', 'jan', { color: '#AABBCC' }, 'pj1');

      expect(mockSubdocs.updateCalendar).toHaveBeenCalledWith('char1', expect.objectContaining({ color: '#AABBCC' }));
      expect(result.color).toBe('#AABBCC');
    });

    it('PomocnyPJ smí updateSettings (per spec 2026-05-06: konzistence s ostatními moduly, ≥ PomocnyPJ)', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PomocnyPJ });
      mockCharsService.findBySlugRaw.mockResolvedValue(mockChar('char1', 'jan', 'Jan Novák'));
      mockSubdocs.getCalendar.mockResolvedValue(mockCalendar('char1'));
      mockSubdocs.updateCalendar.mockResolvedValue({ ...mockCalendar('char1'), color: '#AABBCC' });

      const result = await service.updateSettings('w1', 'jan', { color: '#AABBCC' }, 'pp1');
      expect(result.color).toBe('#AABBCC');
    });

    it('vyhodí ForbiddenException pro Korektor (role 1) — pod PomocnyPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Korektor });
      await expect(service.updateSettings('w1', 'jan', { color: '#000' }, 'requester')).rejects.toThrow(ForbiddenException);
    });

    it('merguje displaySettings — nepřepisuje celý objekt', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockCharsService.findBySlugRaw.mockResolvedValue(mockChar('char1', 'jan', 'Jan Novák'));
      mockSubdocs.getCalendar.mockResolvedValue({
        ...mockCalendar('char1'),
        displaySettings: { defaultView: 'month', isHiddenInAggregate: false },
      });
      mockSubdocs.updateCalendar.mockResolvedValue(mockCalendar('char1'));

      await service.updateSettings('w1', 'jan', { displaySettings: { isHiddenInAggregate: true } }, 'pj1');

      expect(mockSubdocs.updateCalendar).toHaveBeenCalledWith('char1', {
        displaySettings: { defaultView: 'month', isHiddenInAggregate: true },
      });
    });
  });

  describe('getBySlug (legacy)', () => {
    it('vrátí kalendář postavy', async () => {
      mockCharsService.assertSubdocAccess.mockResolvedValue(mockChar('char1', 'jan', 'Jan Novák'));
      mockSubdocs.getCalendar.mockResolvedValue(mockCalendar('char1'));

      const result = await service.getBySlug('jan', 'w1', 'user1');

      expect(mockCharsService.assertSubdocAccess).toHaveBeenCalledWith('jan', 'w1', 'user1');
      expect(result.characterId).toBe('char1');
    });
  });

  describe('updateBySlug (legacy)', () => {
    it('nahradí celé events pole', async () => {
      const newEvents = [{ id: 'e2', title: 'Nová' }];
      mockCharsService.assertSubdocAccess.mockResolvedValue(mockChar('char1', 'jan', 'Jan Novák'));
      mockSubdocs.updateCalendar.mockResolvedValue({ ...mockCalendar('char1'), events: newEvents });

      const result = await service.updateBySlug('jan', 'w1', newEvents as never, 'user1');

      expect(mockSubdocs.updateCalendar).toHaveBeenCalledWith('char1', { events: newEvents });
      expect(result.events).toEqual(newEvents);
    });
  });
});
```

- [ ] **Step 2: Spusť testy — ověř FAIL**

```bash
cd backend && npx jest --testPathPattern=calendars.service --no-coverage
```

Očekáváno: FAIL — `Cannot find module './calendars.service'`

- [ ] **Step 3: Vytvoř interfaces soubor**

Vytvoř `backend/src/modules/calendars/interfaces/calendars.interface.ts`:

```typescript
import { CalendarEvent, CalendarDisplaySettings } from '../../character-subdocs/interfaces/character-calendar.interface';

export interface CalendarCharacterInfo {
  characterId: string;
  slug: string;
  name: string;
  color: string;
  displaySettings: CalendarDisplaySettings;
}

export interface AggregatedCalendarEvent extends CalendarEvent {
  characterId: string;
  slug: string;
  name: string;
  color: string;
}

export interface CalendarAggregateResponse {
  characters: CalendarCharacterInfo[];
  events: AggregatedCalendarEvent[];
}

export interface UpdateCalendarSettingsDto {
  color?: string;
  displaySettings?: Partial<CalendarDisplaySettings>;
}
```

- [ ] **Step 4: Vytvoř CalendarsService**

Vytvoř `backend/src/modules/calendars/calendars.service.ts`:

```typescript
import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import type { CharacterSubdocsService } from '../character-subdocs/character-subdocs.service';
import type { CharactersService } from '../characters/characters.service';
import type { ICharactersRepository } from '../characters/interfaces/characters-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import type { CharacterCalendar, CalendarEvent } from '../character-subdocs/interfaces/character-calendar.interface';
import type { CalendarAggregateResponse, UpdateCalendarSettingsDto } from './interfaces/calendars.interface';

@Injectable()
export class CalendarsService {
  constructor(
    @Inject('CharacterSubdocsService') private readonly subdocsService: CharacterSubdocsService,
    @Inject('CharactersService') private readonly charactersService: CharactersService,
    @Inject('ICharactersRepository') private readonly charRepo: ICharactersRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async aggregate(worldId: string, requesterId: string): Promise<CalendarAggregateResponse> {
    const membership = await this.membershipRepo.findByUserAndWorld(requesterId, worldId);
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Přístup odepřen');
    }

    const [calendars, characters] = await Promise.all([
      this.subdocsService.getCalendarsByWorldId(worldId),
      this.charRepo.findByWorld(worldId),
    ]);

    const charMap = new Map(characters.map((c) => [c.id, c]));
    const visible = calendars.filter((cal) => !cal.displaySettings?.isHiddenInAggregate);

    const characterInfos = visible.map((cal) => {
      const char = charMap.get(cal.characterId);
      return {
        characterId: cal.characterId,
        slug: char?.slug ?? '',
        name: char?.name ?? '',
        color: cal.color,
        displaySettings: cal.displaySettings,
      };
    });

    const events = visible.flatMap((cal) => {
      const char = charMap.get(cal.characterId);
      return cal.events.map((event) => ({
        ...event,
        characterId: cal.characterId,
        slug: char?.slug ?? '',
        name: char?.name ?? '',
        color: cal.color,
      }));
    });

    return { characters: characterInfos, events };
  }

  async updateSettings(worldId: string, slug: string, dto: UpdateCalendarSettingsDto, requesterId: string): Promise<CharacterCalendar> {
    // Per spec 2026-05-06: ≥ PomocnyPJ (konzistence s WorldNews/Timeline/Calendar/Weather)
    // POZN.: Implementer subagent — pokud chce přidat plný auth pattern (Admin shortcut + anti-leak),
    // doplnit `requester: RequestUser` parametr a `assertCanModerate` helper. Aktuální zjednodušená verze
    // nemá Admin shortcut a anti-leak je implicit (membership lookup pro neexistující svět vrátí null → 403).
    const membership = await this.membershipRepo.findByUserAndWorld(requesterId, worldId);
    if (!membership || membership.role < WorldRole.PomocnyPJ) {
      throw new ForbiddenException('Přístup odepřen');
    }

    const character = await this.charactersService.findBySlugRaw(slug, worldId);
    const current = await this.subdocsService.getCalendar(character.id);

    const update: Partial<CharacterCalendar> = {};
    if (dto.color !== undefined) update.color = dto.color;
    if (dto.displaySettings !== undefined) {
      update.displaySettings = { ...current.displaySettings, ...dto.displaySettings };
    }

    return this.subdocsService.updateCalendar(character.id, update);
  }

  async getBySlug(slug: string, worldId: string, requesterId: string): Promise<CharacterCalendar> {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, requesterId);
    return this.subdocsService.getCalendar(character.id);
  }

  async updateBySlug(slug: string, worldId: string, events: CalendarEvent[], requesterId: string): Promise<CharacterCalendar> {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, requesterId);
    return this.subdocsService.updateCalendar(character.id, { events });
  }
}
```

- [ ] **Step 5: Spusť testy — ověř PASS**

```bash
cd backend && npx jest --testPathPattern=calendars.service --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/calendars/interfaces/calendars.interface.ts \
        backend/src/modules/calendars/calendars.service.ts \
        backend/src/modules/calendars/calendars.service.spec.ts
git commit -m "feat(calendar): CalendarsService — aggregate, settings, legacy ops"
```

---

## Task 4: Controllers, Module a registrace v App

**Files:**
- Create: `backend/src/modules/calendars/calendars.controller.ts`
- Create: `backend/src/modules/calendars/legacy-calenders.controller.ts`
- Create: `backend/src/modules/calendars/calendars.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř CalendarsController**

Vytvoř `backend/src/modules/calendars/calendars.controller.ts`:

```typescript
import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UpdateCalendarSettingsDto } from './interfaces/calendars.interface';

interface RequestUser { id: string }

@Controller('worlds/:worldId/calendars')
@UseGuards(JwtAuthGuard)
export class CalendarsController {
  constructor(private readonly calendarsService: CalendarsService) {}

  @Get('aggregate')
  async aggregate(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarsService.aggregate(worldId, user.id);
  }

  @Patch(':slug/settings')
  async updateSettings(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: UpdateCalendarSettingsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarsService.updateSettings(worldId, slug, body, user.id);
  }
}
```

- [ ] **Step 2: Vytvoř LegacyCalendersController**

Vytvoř `backend/src/modules/calendars/legacy-calenders.controller.ts`:

```typescript
import { Controller, Get, Put, Param, Query, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { CalendarsService } from './calendars.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CalendarEvent } from '../character-subdocs/interfaces/character-calendar.interface';

interface RequestUser { id: string }

@Controller('calenders')
@UseGuards(JwtAuthGuard)
export class LegacyCalendersController {
  constructor(private readonly calendarsService: CalendarsService) {}

  @Get(':slug')
  async getCalendar(
    @Param('slug') slug: string,
    @Query('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!worldId) throw new BadRequestException('worldId je povinný parametr');
    return this.calendarsService.getBySlug(slug, worldId, user.id);
  }

  @Put(':slug')
  async updateCalendar(
    @Param('slug') slug: string,
    @Query('worldId') worldId: string,
    @Body('events') events: CalendarEvent[],
    @CurrentUser() user: RequestUser,
  ) {
    if (!worldId) throw new BadRequestException('worldId je povinný parametr');
    return this.calendarsService.updateBySlug(slug, worldId, events ?? [], user.id);
  }
}
```

- [ ] **Step 3: Vytvoř CalendarsModule**

Vytvoř `backend/src/modules/calendars/calendars.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CharacterSubdocsModule } from '../character-subdocs/character-subdocs.module';
import { CharactersModule } from '../characters/characters.module';
import { WorldsModule } from '../worlds/worlds.module';
import { CalendarsService } from './calendars.service';
import { CalendarsController } from './calendars.controller';
import { LegacyCalendersController } from './legacy-calenders.controller';

@Module({
  imports: [CharacterSubdocsModule, CharactersModule, WorldsModule],
  controllers: [CalendarsController, LegacyCalendersController],
  providers: [
    CalendarsService,
    { provide: 'CharacterSubdocsService', useExisting: 'CharacterSubdocsService' },
    { provide: 'CharactersService', useExisting: 'CharactersService' },
  ],
})
export class CalendarsModule {}
```

> **Poznámka k `useExisting`:** `CharacterSubdocsService` a `CharactersService` jsou providery z importovaných modulů. Nestjs je automaticky zpřístupní — `useExisting` zajistí, že `CalendarsService` dostane správný token. Alternativně lze použít přímou injekci bez provide/useExisting pokud kompiler token přeloží správně. Pokud `useExisting` způsobí chybu, odstraň `providers` blok a injektuj service přímo:
> ```typescript
> @Inject(CharacterSubdocsService) private readonly subdocsService: CharacterSubdocsService,
> @Inject(CharactersService) private readonly charactersService: CharactersService,
> ```
> a v `CalendarsService` použij normální constructor injection bez `@Inject()` tokenu.

- [ ] **Step 4: Registruj CalendarsModule v App**

V `backend/src/app.module.ts` přidej import:

```typescript
import { CalendarsModule } from './modules/calendars/calendars.module';
```

A do `imports` pole přidej `CalendarsModule` za `CharacterSubdocsModule`:

```typescript
    CharacterSubdocsModule,
    CalendarsModule,
```

- [ ] **Step 5: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekáváno: všechny testy PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/calendars/calendars.controller.ts \
        backend/src/modules/calendars/legacy-calenders.controller.ts \
        backend/src/modules/calendars/calendars.module.ts \
        backend/src/app.module.ts
git commit -m "feat(calendar): CalendarsModule — aggregate + settings + legacy calenders endpoint"
```

---

## Task 5: Aktualizace roadmapy

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Zaškrtni checkboxy a aktualizuj stav**

V `docs/roadmap.md` najdi sekci `## Krok 10b — Calendar ⬜` a:

1. Změň `⬜` → `✅` v nadpisu
2. Zaškrtni všechny checkboxy (`- [ ]` → `- [x]`)
3. Přidej odkaz na spec a plán pod sekci:

```markdown
**Spec:** [docs/superpowers/specs/2026-05-04-krok-10b-calendar-design.md](superpowers/specs/2026-05-04-krok-10b-calendar-design.md)  
**Plán:** [docs/superpowers/plans/2026-05-04-krok-10b-calendar.md](superpowers/plans/2026-05-04-krok-10b-calendar.md)
```

4. V tabulce přehledu stavů změň řádek `| 10b | Calendar | ⬜ |` → `| 10b | Calendar | ✅ |`

- [ ] **Step 2: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs(roadmap): označit Krok 10b jako hotový"
```

---

## Self-Review

### Spec coverage
| Požadavek ze spec | Úkol |
|---|---|
| `isLocation` flag — lokace dostane jen kalendář | Task 0 |
| PATCH → PUT (full replace events) | Task 2 Step 5 |
| `color` + `displaySettings` na schema | Task 1 |
| Agregovaný PJ pohled `GET /worlds/:worldId/calendars/aggregate` | Task 3 + 4 |
| `PATCH /worlds/:worldId/calendars/:slug/settings` (PJ only) | Task 3 + 4 |
| Legacy `GET\|PUT /calenders/:slug?worldId=` | Task 3 + 4 |
| ForbiddenException pro Hráče na aggregate | Task 3 Step 1 |
| Merge displaySettings (ne replace) | Task 3 |
| 400 při chybějícím worldId | Task 4 Step 2 |

### Placeholder scan
Žádné TBD ani TODO.

### Type consistency
- `CalendarDisplaySettings` definován v `character-calendar.interface.ts`, importován v `calendars.interface.ts` ✓
- `CharacterCalendar` typ použit konzistentně v `CharacterCalendarRepository`, `CharacterSubdocsService`, `CalendarsService` ✓
- `getCalendarsByWorldId` přidán do service v Task 2 a volán v `CalendarsService.aggregate` v Task 3 ✓
- `findBySlugRaw` je existující metoda na `CharactersService` (ověřeno v kódu) ✓
