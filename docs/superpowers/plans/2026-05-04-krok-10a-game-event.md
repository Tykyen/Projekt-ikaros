# GameEvent — Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat GameEvent modul — herní události světa s RSVP, skupinovou viditelností, diskusí (komentáře, vlákna, reakce, editace) a hodinovým cleanup cron jobem.

**Architecture:** Jeden MongoDB dokument `GameEvent` s embedded subdokumenty `confirmedBy` a `comments`. Viditelnost řízena přes `targetGroup` + `groupOnly` flag, kontrolovaná dle WorldMembership.group. Cron job každou hodinu maže eventy starší než 24h.

**Tech Stack:** NestJS 11, Mongoose 9, @nestjs/schedule (nová instalace), class-validator DTOs, Jest

---

## Přehled souborů

Vytvořit:
- `backend/src/modules/game-event/interfaces/game-event.interface.ts`
- `backend/src/modules/game-event/interfaces/game-event-repository.interface.ts`
- `backend/src/modules/game-event/schemas/game-event.schema.ts`
- `backend/src/modules/game-event/repositories/game-event.repository.ts`
- `backend/src/modules/game-event/dto/create-game-event.dto.ts`
- `backend/src/modules/game-event/dto/update-game-event.dto.ts`
- `backend/src/modules/game-event/dto/add-comment.dto.ts`
- `backend/src/modules/game-event/dto/react-comment.dto.ts`
- `backend/src/modules/game-event/game-event.service.ts`
- `backend/src/modules/game-event/game-event.service.spec.ts`
- `backend/src/modules/game-event/game-event-cleanup.service.ts`
- `backend/src/modules/game-event/game-event.controller.ts`
- `backend/src/modules/game-event/game-event.module.ts`

Upravit:
- `backend/src/app.module.ts` — přidat GameEventModule + ScheduleModule
- `backend/package.json` — přidat @nestjs/schedule (přes npm install)

---

### Task 1: Instalace @nestjs/schedule

**Files:**
- Modify: `backend/package.json` (přes npm install)
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Nainstalovat balíček**

```bash
cd backend
npm install @nestjs/schedule
```

Expected: Balíček přidán do `node_modules` a `package.json` dependencies.

- [ ] **Step 2: Přidat ScheduleModule do AppModule**

Uprav `backend/src/app.module.ts` — přidej `ScheduleModule.forRoot()`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadModule } from './modules/upload/upload.module';
import { GlobalChatModule } from './modules/global-chat/global-chat.module';
import { PresenceModule } from './modules/presence/presence.module';
import { IkarosMessagesModule } from './modules/ikaros-messages/ikaros-messages.module';
import { PagesModule } from './modules/pages/pages.module';
import { CharactersModule } from './modules/characters/characters.module';
import { CharacterSubdocsModule } from './modules/character-subdocs/character-subdocs.module';
import { NpcTemplatesModule } from './modules/npc-templates/npc-templates.module';
import { UniverseModule } from './modules/universe/universe.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { MapsModule } from './modules/maps/maps.module';
import { DungeonMapsModule } from './modules/dungeon-maps/dungeon-maps.module';
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    WorldsModule,
    ChatModule,
    UploadModule,
    GlobalChatModule,
    PresenceModule,
    IkarosMessagesModule,
    PagesModule,
    CharactersModule,
    CharacterSubdocsModule,
    NpcTemplatesModule,
    UniverseModule,
    CampaignModule,
    MapsModule,
    DungeonMapsModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/app.module.ts
git commit -m "feat(game-event): instalace @nestjs/schedule"
```

---

### Task 2: Interface + Schema

**Files:**
- Create: `backend/src/modules/game-event/interfaces/game-event.interface.ts`
- Create: `backend/src/modules/game-event/schemas/game-event.schema.ts`

- [ ] **Step 1: Vytvořit interfaces**

`backend/src/modules/game-event/interfaces/game-event.interface.ts`:

```typescript
export interface EventConfirmation {
  userId: string;
  userName: string;
}

export interface EventComment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;
  reactions: Record<string, string[]>;
  isDeleted: boolean;
}

export interface GameEvent {
  id: string;
  worldId: string;
  title: string;
  date: string;
  targetGroup: string | null;
  groupOnly: boolean;
  imageUrl: string | null;
  description: string;
  confirmable: boolean;
  confirmedBy: EventConfirmation[];
  comments: EventComment[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Vytvořit Mongoose schema**

`backend/src/modules/game-event/schemas/game-event.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GameEventDocument = HydratedDocument<GameEventSchemaClass>;

@Schema({ timestamps: true, collection: 'gameEvents' })
export class GameEventSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) date: string;
  @Prop({ default: null }) targetGroup: string | null;
  @Prop({ default: false }) groupOnly: boolean;
  @Prop({ default: null }) imageUrl: string | null;
  @Prop({ default: '' }) description: string;
  @Prop({ default: false }) confirmable: boolean;
  @Prop({ type: [Object], default: [] }) confirmedBy: Array<{ userId: string; userName: string }>;
  @Prop({ type: [Object], default: [] }) comments: Array<Record<string, unknown>>;
}

export const GameEventSchema = SchemaFactory.createForClass(GameEventSchemaClass);
GameEventSchema.index({ worldId: 1, date: 1 });
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/game-event/
git commit -m "feat(game-event): interface + schema"
```

---

### Task 3: Repository

**Files:**
- Create: `backend/src/modules/game-event/interfaces/game-event-repository.interface.ts`
- Create: `backend/src/modules/game-event/repositories/game-event.repository.ts`

- [ ] **Step 1: Vytvořit repository interface**

`backend/src/modules/game-event/interfaces/game-event-repository.interface.ts`:

```typescript
import type { GameEvent } from './game-event.interface';

export interface IGameEventRepository {
  findMany(filter: Record<string, unknown>, sort?: Record<string, unknown>): Promise<GameEvent[]>;
  findById(id: string): Promise<GameEvent | null>;
  create(data: Partial<GameEvent>): Promise<GameEvent>;
  update(id: string, data: Partial<GameEvent>): Promise<GameEvent | null>;
  delete(id: string): Promise<boolean>;
  deleteOlderThan(date: Date): Promise<number>;
}
```

- [ ] **Step 2: Implementovat repository**

`backend/src/modules/game-event/repositories/game-event.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { GameEventSchemaClass } from '../schemas/game-event.schema';
import type { GameEvent, EventConfirmation, EventComment } from '../interfaces/game-event.interface';
import type { IGameEventRepository } from '../interfaces/game-event-repository.interface';

@Injectable()
export class MongoGameEventRepository
  extends BaseMongoRepository<GameEvent>
  implements IGameEventRepository
{
  constructor(@InjectModel(GameEventSchemaClass.name) model: Model<GameEventSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { date: 1 }): Promise<GameEvent[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<GameEvent>): Promise<GameEvent> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<GameEvent>): Promise<GameEvent | null> {
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

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.model.deleteMany({ date: { $lt: date.toISOString() } }).exec();
    return result.deletedCount;
  }

  protected toEntity(doc: Record<string, unknown>): GameEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      title: doc.title as string,
      date: doc.date as string,
      targetGroup: (doc.targetGroup as string | null) ?? null,
      groupOnly: (doc.groupOnly as boolean) ?? false,
      imageUrl: (doc.imageUrl as string | null) ?? null,
      description: (doc.description as string) ?? '',
      confirmable: (doc.confirmable as boolean) ?? false,
      confirmedBy: ((doc.confirmedBy as EventConfirmation[]) ?? []).map((c) => ({
        userId: c.userId,
        userName: c.userName,
      })),
      comments: ((doc.comments as EventComment[]) ?? []).map((c) => ({
        id: c.id as string,
        parentId: (c.parentId as string | null) ?? null,
        authorId: c.authorId as string,
        authorName: c.authorName as string,
        content: (c.content as string) ?? '',
        createdAt: c.createdAt as Date,
        editedAt: (c.editedAt as Date | null) ?? null,
        reactions: (c.reactions as Record<string, string[]>) ?? {},
        isDeleted: (c.isDeleted as boolean) ?? false,
      })),
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/game-event/
git commit -m "feat(game-event): repository"
```

---

### Task 4: DTOs

**Files:**
- Create: `backend/src/modules/game-event/dto/create-game-event.dto.ts`
- Create: `backend/src/modules/game-event/dto/update-game-event.dto.ts`
- Create: `backend/src/modules/game-event/dto/add-comment.dto.ts`
- Create: `backend/src/modules/game-event/dto/react-comment.dto.ts`

- [ ] **Step 1: CreateGameEventDto**

`backend/src/modules/game-event/dto/create-game-event.dto.ts`:

```typescript
import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateGameEventDto {
  @IsString() title: string;
  @IsString() date: string;
  @IsOptional() @IsString() targetGroup?: string;
  @IsOptional() @IsBoolean() groupOnly?: boolean;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() confirmable?: boolean;
}
```

- [ ] **Step 2: UpdateGameEventDto**

`backend/src/modules/game-event/dto/update-game-event.dto.ts`:

```typescript
import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';

export class UpdateGameEventDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() targetGroup?: string;
  @IsOptional() @IsBoolean() groupOnly?: boolean;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() confirmable?: boolean;
  @IsOptional() @IsArray() confirmedBy?: Array<{ userId: string; userName: string }>;
}
```

- [ ] **Step 3: AddCommentDto + ReactCommentDto**

`backend/src/modules/game-event/dto/add-comment.dto.ts`:

```typescript
import { IsString, IsOptional } from 'class-validator';

export class AddCommentDto {
  @IsString() content: string;
  @IsOptional() @IsString() parentId?: string;
}
```

`backend/src/modules/game-event/dto/react-comment.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class ReactCommentDto {
  @IsString() emoji: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/game-event/dto/
git commit -m "feat(game-event): DTOs"
```

---

### Task 5: Service (TDD)

**Files:**
- Create: `backend/src/modules/game-event/game-event.service.spec.ts`
- Create: `backend/src/modules/game-event/game-event.service.ts`

- [ ] **Step 1: Napsat failing testy**

`backend/src/modules/game-event/game-event.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { GameEventService } from './game-event.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockRepo = {
  findMany: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  deleteOlderThan: jest.fn(),
};

const mockMembershipRepo = {
  findByUserAndWorld: jest.fn(),
};

const mockEvent = {
  id: 'event1',
  worldId: 'world1',
  title: 'Herní sezení',
  date: '2026-06-01T18:00:00.000Z',
  targetGroup: null,
  groupOnly: false,
  imageUrl: null,
  description: '',
  confirmable: true,
  confirmedBy: [],
  comments: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GameEventService', () => {
  let service: GameEventService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        GameEventService,
        { provide: 'IGameEventRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
      ],
    }).compile();
    service = module.get(GameEventService);
  });

  describe('getWorldRole', () => {
    it('vrátí PJ pro Admin uživatele bez ohledu na membership', async () => {
      const role = await service.getWorldRole('u1', UserRole.Admin, 'w1');
      expect(role).toBe(WorldRole.PJ);
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('vrátí WorldRole z membership pro běžného uživatele', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac, group: 'Lumíci' });
      const role = await service.getWorldRole('u1', UserRole.User, 'w1');
      expect(role).toBe(WorldRole.Hrac);
    });

    it('vrátí Hrac pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const role = await service.getWorldRole('u1', UserRole.User, 'w1');
      expect(role).toBe(WorldRole.Hrac);
    });
  });

  describe('canAccess', () => {
    it('PJ vidí vždy i groupOnly event', () => {
      expect(service.canAccess({ ...mockEvent, groupOnly: true, targetGroup: 'Lumíci' }, WorldRole.PJ, undefined)).toBe(true);
    });

    it('Hráč vidí event bez targetGroup', () => {
      expect(service.canAccess(mockEvent, WorldRole.Hrac, undefined)).toBe(true);
    });

    it('Hráč vidí event s targetGroup když groupOnly=false', () => {
      expect(service.canAccess({ ...mockEvent, targetGroup: 'Lumíci', groupOnly: false }, WorldRole.Hrac, 'MI6')).toBe(true);
    });

    it('Hráč nevidí groupOnly event jiné skupiny', () => {
      expect(service.canAccess({ ...mockEvent, targetGroup: 'Lumíci', groupOnly: true }, WorldRole.Hrac, 'MI6')).toBe(false);
    });

    it('Hráč vidí groupOnly event své skupiny', () => {
      expect(service.canAccess({ ...mockEvent, targetGroup: 'Lumíci', groupOnly: true }, WorldRole.Hrac, 'Lumíci')).toBe(true);
    });
  });

  describe('findGameEvents', () => {
    it('vrátí eventy filtrované dle worldId', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac, group: null });
      mockRepo.findMany.mockResolvedValue([mockEvent]);
      const result = await service.findGameEvents('u1', UserRole.User, 'world1', {});
      expect(mockRepo.findMany).toHaveBeenCalledWith(expect.objectContaining({ worldId: 'world1' }), expect.any(Object));
      expect(result).toHaveLength(1);
    });

    it('filtruje groupOnly eventy pro hráče jiné skupiny', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac, group: 'MI6' });
      const groupOnlyEvent = { ...mockEvent, id: 'event2', targetGroup: 'Lumíci', groupOnly: true };
      mockRepo.findMany.mockResolvedValue([mockEvent, groupOnlyEvent]);
      const result = await service.findGameEvents('u1', UserRole.User, 'world1', {});
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('event1');
    });
  });

  describe('createGameEvent', () => {
    it('PJ může vytvořit event', async () => {
      mockRepo.create.mockResolvedValue(mockEvent);
      const result = await service.createGameEvent(WorldRole.PJ, 'world1', { title: 'Test', date: '2026-06-01' });
      expect(mockRepo.create).toHaveBeenCalled();
      expect(result).toEqual(mockEvent);
    });

    it('Hráč nemůže vytvořit event', async () => {
      await expect(service.createGameEvent(WorldRole.Hrac, 'world1', { title: 'Test', date: '2026-06-01' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('vrátí 400 pokud groupOnly=true a targetGroup chybí', async () => {
      await expect(service.createGameEvent(WorldRole.PJ, 'world1', { title: 'Test', date: '2026-06-01', groupOnly: true }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('updateGameEvent', () => {
    it('zachová confirmedBy pokud dto.confirmedBy je undefined', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEvent, confirmedBy: [{ userId: 'u2', userName: 'Hráč' }] });
      mockRepo.update.mockResolvedValue({ ...mockEvent, confirmedBy: [{ userId: 'u2', userName: 'Hráč' }] });
      await service.updateGameEvent('event1', WorldRole.PJ, { title: 'Nový název' });
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        confirmedBy: [{ userId: 'u2', userName: 'Hráč' }],
      }));
    });

    it('Hráč nemůže editovat event', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent);
      await expect(service.updateGameEvent('event1', WorldRole.Hrac, { title: 'X' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirmEvent', () => {
    it('přidá userId do confirmedBy pokud tam není', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEvent, confirmable: true, confirmedBy: [] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.confirmEvent('event1', 'u1', 'Hráč1');
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        confirmedBy: [{ userId: 'u1', userName: 'Hráč1' }],
      }));
    });

    it('odebere userId z confirmedBy pokud tam je (toggle)', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEvent, confirmable: true, confirmedBy: [{ userId: 'u1', userName: 'Hráč1' }] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.confirmEvent('event1', 'u1', 'Hráč1');
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        confirmedBy: [],
      }));
    });

    it('vrátí 400 pokud event není confirmable', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEvent, confirmable: false });
      await expect(service.confirmEvent('event1', 'u1', 'Hráč1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('addComment', () => {
    it('přidá komentář do comments pole', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEvent, comments: [] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.addComment('event1', 'u1', 'Hráč1', { content: 'Přijdu!' });
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        comments: expect.arrayContaining([expect.objectContaining({ content: 'Přijdu!', authorId: 'u1' })]),
      }));
    });
  });

  describe('editComment', () => {
    it('upraví vlastní komentář', async () => {
      const comment = { id: 'c1', parentId: null, authorId: 'u1', authorName: 'Hráč1', content: 'Starý', createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...mockEvent, comments: [comment] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.editComment('event1', 'c1', 'u1', WorldRole.Hrac, 'Nový');
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        comments: expect.arrayContaining([expect.objectContaining({ content: 'Nový', id: 'c1' })]),
      }));
    });

    it('zabrání editaci cizího komentáře', async () => {
      const comment = { id: 'c1', parentId: null, authorId: 'u2', authorName: 'Jiný', content: 'X', createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...mockEvent, comments: [comment] });
      await expect(service.editComment('event1', 'c1', 'u1', WorldRole.Hrac, 'Nový'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteComment', () => {
    it('soft delete vlastního komentáře', async () => {
      const comment = { id: 'c1', parentId: null, authorId: 'u1', authorName: 'Hráč1', content: 'Text', createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...mockEvent, comments: [comment] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.deleteComment('event1', 'c1', 'u1', WorldRole.Hrac);
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        comments: expect.arrayContaining([expect.objectContaining({ isDeleted: true, content: '' })]),
      }));
    });

    it('PJ může smazat cizí komentář', async () => {
      const comment = { id: 'c1', parentId: null, authorId: 'u2', authorName: 'Jiný', content: 'Text', createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...mockEvent, comments: [comment] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.deleteComment('event1', 'c1', 'u1', WorldRole.PJ);
      expect(mockRepo.update).toHaveBeenCalled();
    });
  });

  describe('reactComment', () => {
    it('přidá emoji reakci', async () => {
      const comment = { id: 'c1', parentId: null, authorId: 'u2', authorName: 'Jiný', content: 'Text', createdAt: new Date(), editedAt: null, reactions: {}, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...mockEvent, comments: [comment] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.reactComment('event1', 'c1', 'u1', '👍');
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        comments: expect.arrayContaining([expect.objectContaining({ reactions: { '👍': ['u1'] } })]),
      }));
    });

    it('toggle — odebere reakci pokud userId už je v poli', async () => {
      const comment = { id: 'c1', parentId: null, authorId: 'u2', authorName: 'Jiný', content: 'Text', createdAt: new Date(), editedAt: null, reactions: { '👍': ['u1'] }, isDeleted: false };
      mockRepo.findById.mockResolvedValue({ ...mockEvent, comments: [comment] });
      mockRepo.update.mockResolvedValue(mockEvent);
      await service.reactComment('event1', 'c1', 'u1', '👍');
      expect(mockRepo.update).toHaveBeenCalledWith('event1', expect.objectContaining({
        comments: expect.arrayContaining([expect.objectContaining({ reactions: { '👍': [] } })]),
      }));
    });
  });
});
```

- [ ] **Step 2: Spustit testy — ověřit FAIL**

```bash
cd backend
npx jest game-event.service.spec --no-coverage 2>&1 | tail -20
```

Expected: Testy selžou s `Cannot find module './game-event.service'`

- [ ] **Step 3: Implementovat service**

`backend/src/modules/game-event/game-event.service.ts`:

```typescript
import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { GameEvent, EventComment } from './interfaces/game-event.interface';
import type { CreateGameEventDto } from './dto/create-game-event.dto';
import type { UpdateGameEventDto } from './dto/update-game-event.dto';
import type { AddCommentDto } from './dto/add-comment.dto';

@Injectable()
export class GameEventService {
  constructor(
    @Inject('IGameEventRepository') private readonly repo: IGameEventRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  ) {}

  async getWorldRole(userId: string, userRole: UserRole, worldId: string): Promise<WorldRole> {
    if (userRole <= UserRole.Admin) return WorldRole.PJ;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    return membership?.role ?? WorldRole.Hrac;
  }

  canAccess(event: GameEvent, worldRole: WorldRole, userGroup: string | undefined): boolean {
    if (worldRole >= WorldRole.PJ) return true;
    if (!event.groupOnly || !event.targetGroup) return true;
    return event.targetGroup === userGroup;
  }

  private requirePjOrHelper(worldRole: WorldRole): void {
    if (worldRole < WorldRole.PomocnyPJ) throw new ForbiddenException();
  }

  async findGameEvents(
    userId: string,
    userRole: UserRole,
    worldId: string,
    filters: { limit?: number; fromDate?: string },
  ): Promise<GameEvent[]> {
    const worldRole = await this.getWorldRole(userId, userRole, worldId);
    const membership = userRole > UserRole.Admin
      ? await this.membershipRepo.findByUserAndWorld(userId, worldId)
      : null;
    const userGroup = membership?.group;

    const filter: Record<string, unknown> = { worldId };
    if (filters.fromDate) filter['date'] = { $gte: filters.fromDate };

    let events = await this.repo.findMany(filter, { date: 1 });
    events = events.filter((e) => this.canAccess(e, worldRole, userGroup));

    if (filters.limit) events = events.slice(0, filters.limit);
    return events;
  }

  async createGameEvent(worldRole: WorldRole, worldId: string, dto: CreateGameEventDto): Promise<GameEvent> {
    this.requirePjOrHelper(worldRole);
    if (dto.groupOnly && !dto.targetGroup) {
      throw new BadRequestException('targetGroup musí být nastaven pokud groupOnly=true');
    }
    return this.repo.create({
      worldId,
      title: dto.title,
      date: dto.date,
      targetGroup: dto.targetGroup ?? null,
      groupOnly: dto.groupOnly ?? false,
      imageUrl: dto.imageUrl ?? null,
      description: dto.description ?? '',
      confirmable: dto.confirmable ?? false,
      confirmedBy: [],
      comments: [],
    });
  }

  async updateGameEvent(id: string, worldRole: WorldRole, dto: UpdateGameEventDto): Promise<GameEvent> {
    this.requirePjOrHelper(worldRole);
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException();
    if (dto.groupOnly === true && !dto.targetGroup && !event.targetGroup) {
      throw new BadRequestException('targetGroup musí být nastaven pokud groupOnly=true');
    }
    const update: Partial<GameEvent> = { ...dto } as Partial<GameEvent>;
    update.confirmedBy = (dto.confirmedBy != null) ? dto.confirmedBy : event.confirmedBy;
    update.comments = event.comments;
    return (await this.repo.update(id, update))!;
  }

  async deleteGameEvent(id: string, worldRole: WorldRole): Promise<void> {
    this.requirePjOrHelper(worldRole);
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException();
    await this.repo.delete(id);
  }

  async confirmEvent(id: string, userId: string, userName: string): Promise<GameEvent> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException();
    if (!event.confirmable) throw new BadRequestException('Tento event nepodporuje RSVP');
    const already = event.confirmedBy.some((c) => c.userId === userId);
    const confirmedBy = already
      ? event.confirmedBy.filter((c) => c.userId !== userId)
      : [...event.confirmedBy, { userId, userName }];
    return (await this.repo.update(id, { confirmedBy }))!;
  }

  async addComment(id: string, authorId: string, authorName: string, dto: AddCommentDto): Promise<GameEvent> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException();
    const comment: EventComment = {
      id: randomUUID(),
      parentId: dto.parentId ?? null,
      authorId,
      authorName,
      content: dto.content,
      createdAt: new Date(),
      editedAt: null,
      reactions: {},
      isDeleted: false,
    };
    return (await this.repo.update(id, { comments: [...event.comments, comment] }))!;
  }

  async editComment(id: string, commentId: string, userId: string, worldRole: WorldRole, content: string): Promise<GameEvent> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException();
    const comment = event.comments.find((c) => c.id === commentId);
    if (!comment) throw new NotFoundException();
    if (comment.authorId !== userId) throw new ForbiddenException();
    const comments = event.comments.map((c) =>
      c.id === commentId ? { ...c, content, editedAt: new Date() } : c,
    );
    return (await this.repo.update(id, { comments }))!;
  }

  async deleteComment(id: string, commentId: string, userId: string, worldRole: WorldRole): Promise<GameEvent> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException();
    const comment = event.comments.find((c) => c.id === commentId);
    if (!comment) throw new NotFoundException();
    if (comment.authorId !== userId && worldRole < WorldRole.PomocnyPJ) throw new ForbiddenException();
    const comments = event.comments.map((c) =>
      c.id === commentId ? { ...c, isDeleted: true, content: '' } : c,
    );
    return (await this.repo.update(id, { comments }))!;
  }

  async reactComment(id: string, commentId: string, userId: string, emoji: string): Promise<GameEvent> {
    const event = await this.repo.findById(id);
    if (!event) throw new NotFoundException();
    const comment = event.comments.find((c) => c.id === commentId);
    if (!comment || comment.isDeleted) return event;
    const current = comment.reactions[emoji] ?? [];
    const updated = current.includes(userId)
      ? current.filter((u) => u !== userId)
      : [...current, userId];
    const comments = event.comments.map((c) =>
      c.id === commentId ? { ...c, reactions: { ...c.reactions, [emoji]: updated } } : c,
    );
    return (await this.repo.update(id, { comments }))!;
  }

  async cleanupOldEvents(): Promise<number> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.repo.deleteOlderThan(cutoff);
  }
}
```

- [ ] **Step 4: Spustit testy — ověřit PASS**

```bash
cd backend
npx jest game-event.service.spec --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game-event/
git commit -m "feat(game-event): service s testy"
```

---

### Task 6: Controller + Module

**Files:**
- Create: `backend/src/modules/game-event/game-event.controller.ts`
- Create: `backend/src/modules/game-event/game-event.module.ts`

- [ ] **Step 1: Vytvořit controller**

`backend/src/modules/game-event/game-event.controller.ts`:

```typescript
import {
  Controller, Get, Post, Put, Delete, Patch, Param, Body, Query,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { GameEventService } from './game-event.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateGameEventDto } from './dto/create-game-event.dto';
import { UpdateGameEventDto } from './dto/update-game-event.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { ReactCommentDto } from './dto/react-comment.dto';

interface RequestUser { id: string; role: UserRole; username: string; }

@Controller('game-events')
@UseGuards(JwtAuthGuard)
export class GameEventController {
  constructor(private readonly service: GameEventService) {}

  private requireWorldId(worldId: string): void {
    if (!worldId) throw new BadRequestException('worldId je povinný parametr');
  }

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('limit') limit?: string,
    @Query('fromDate') fromDate?: string,
  ) {
    this.requireWorldId(worldId);
    return this.service.findGameEvents(user.id, user.role, worldId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      fromDate,
    });
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Body() dto: CreateGameEventDto,
  ) {
    this.requireWorldId(worldId);
    const worldRole = await this.service.getWorldRole(user.id, user.role, worldId);
    return this.service.createGameEvent(worldRole, worldId, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGameEventDto,
  ) {
    this.requireWorldId(worldId);
    const worldRole = await this.service.getWorldRole(user.id, user.role, worldId);
    return this.service.updateGameEvent(id, worldRole, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    this.requireWorldId(worldId);
    const worldRole = await this.service.getWorldRole(user.id, user.role, worldId);
    await this.service.deleteGameEvent(id, worldRole);
  }

  @Post(':id/confirm')
  async confirm(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.service.confirmEvent(id, user.id, user.username);
  }

  @Post(':id/comments')
  async addComment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.service.addComment(id, user.id, user.username, dto);
  }

  @Patch(':id/comments/:commentId')
  async editComment(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body('content') content: string,
  ) {
    this.requireWorldId(worldId);
    const worldRole = await this.service.getWorldRole(user.id, user.role, worldId);
    return this.service.editComment(id, commentId, user.id, worldRole, content);
  }

  @Delete(':id/comments/:commentId')
  async deleteComment(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    this.requireWorldId(worldId);
    const worldRole = await this.service.getWorldRole(user.id, user.role, worldId);
    return this.service.deleteComment(id, commentId, user.id, worldRole);
  }

  @Post(':id/comments/:commentId/react')
  async reactComment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() dto: ReactCommentDto,
  ) {
    return this.service.reactComment(id, commentId, user.id, dto.emoji);
  }
}
```

- [ ] **Step 2: Vytvořit module**

`backend/src/modules/game-event/game-event.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameEventSchemaClass, GameEventSchema } from './schemas/game-event.schema';
import { GameEventController } from './game-event.controller';
import { GameEventService } from './game-event.service';
import { GameEventCleanupService } from './game-event-cleanup.service';
import { MongoGameEventRepository } from './repositories/game-event.repository';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameEventSchemaClass.name, schema: GameEventSchema },
    ]),
    WorldsModule,
  ],
  controllers: [GameEventController],
  providers: [
    GameEventService,
    GameEventCleanupService,
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
  ],
})
export class GameEventModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/game-event/
git commit -m "feat(game-event): controller + module"
```

---

### Task 7: Cleanup Service + AppModule registrace

**Files:**
- Create: `backend/src/modules/game-event/game-event-cleanup.service.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvořit cleanup service**

`backend/src/modules/game-event/game-event-cleanup.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GameEventService } from './game-event.service';

@Injectable()
export class GameEventCleanupService {
  private readonly logger = new Logger(GameEventCleanupService.name);

  constructor(private readonly gameEventService: GameEventService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldEvents(): Promise<void> {
    const deleted = await this.gameEventService.cleanupOldEvents();
    if (deleted > 0) {
      this.logger.log(`Smazáno ${deleted} starých game eventů`);
    }
  }
}
```

- [ ] **Step 2: Přidat GameEventModule do AppModule**

Uprav `backend/src/app.module.ts` — přidej import GameEventModule (ScheduleModule byl přidán v Task 1):

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadModule } from './modules/upload/upload.module';
import { GlobalChatModule } from './modules/global-chat/global-chat.module';
import { PresenceModule } from './modules/presence/presence.module';
import { IkarosMessagesModule } from './modules/ikaros-messages/ikaros-messages.module';
import { PagesModule } from './modules/pages/pages.module';
import { CharactersModule } from './modules/characters/characters.module';
import { CharacterSubdocsModule } from './modules/character-subdocs/character-subdocs.module';
import { NpcTemplatesModule } from './modules/npc-templates/npc-templates.module';
import { UniverseModule } from './modules/universe/universe.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { MapsModule } from './modules/maps/maps.module';
import { DungeonMapsModule } from './modules/dungeon-maps/dungeon-maps.module';
import { GameEventModule } from './modules/game-event/game-event.module';
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    WorldsModule,
    ChatModule,
    UploadModule,
    GlobalChatModule,
    PresenceModule,
    IkarosMessagesModule,
    PagesModule,
    CharactersModule,
    CharacterSubdocsModule,
    NpcTemplatesModule,
    UniverseModule,
    CampaignModule,
    MapsModule,
    DungeonMapsModule,
    GameEventModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
```

- [ ] **Step 3: Build check**

```bash
cd backend
npx tsc --noEmit 2>&1 | head -30
```

Expected: Žádné TypeScript chyby

- [ ] **Step 4: Spustit všechny testy**

```bash
cd backend
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All test suites pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game-event/ backend/src/app.module.ts
git commit -m "feat(game-event): cleanup service + registrace v AppModule"
```
