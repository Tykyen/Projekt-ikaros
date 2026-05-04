# Krok 12a — Custom Emotes & Image proxy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat per-world a globální custom emoji shortcody s Cloudinary uploadem, WebSocket broadcastem a kopírováním mezi světy; plus Cloudinary image proxy endpoint.

**Architecture:** Modul `emotes` s repository pattern (nullable `worldId` = globální), single controller s oddělenými `/global` a `/:worldId` routami (global musí být definována před dynamic param). Modul `images` obsahuje jediný controller s wildcard routou pro 302 redirect na Cloudinary.

**Tech Stack:** NestJS, Mongoose, Socket.io (EventEmitter2 pattern), class-validator

---

## Přehled souborů

**Vytvořit:**
```
backend/src/modules/emotes/
├── dto/
│   ├── create-emote.dto.ts
│   └── copy-emote.dto.ts
├── interfaces/
│   ├── custom-emote.interface.ts
│   └── custom-emotes-repository.interface.ts
├── repositories/
│   └── custom-emotes.repository.ts
├── schemas/
│   └── custom-emote.schema.ts
├── emotes.controller.ts
├── emotes.gateway.ts
├── emotes.module.ts
├── emotes.service.ts
└── emotes.service.spec.ts

backend/src/modules/images/
├── images.controller.ts
└── images.module.ts
```

**Upravit:**
- `backend/src/app.module.ts` — přidat `EmotesModule` a `ImagesModule`

---

## Task 1: Schema, interface a repository interface

**Files:**
- Create: `backend/src/modules/emotes/schemas/custom-emote.schema.ts`
- Create: `backend/src/modules/emotes/interfaces/custom-emote.interface.ts`
- Create: `backend/src/modules/emotes/interfaces/custom-emotes-repository.interface.ts`

- [ ] **Step 1: Vytvoř interface CustomEmote**

```typescript
// backend/src/modules/emotes/interfaces/custom-emote.interface.ts
export interface CustomEmote {
  id: string;
  worldId: string | null;
  name: string;
  shortcode: string;
  imageId: string;
  createdBy: string;
  createdAt: Date;
}
```

- [ ] **Step 2: Vytvoř repository interface**

```typescript
// backend/src/modules/emotes/interfaces/custom-emotes-repository.interface.ts
import { CustomEmote } from './custom-emote.interface';

export interface ICustomEmotesRepository {
  findByWorldId(worldId: string): Promise<CustomEmote[]>;
  findGlobal(): Promise<CustomEmote[]>;
  findById(id: string): Promise<CustomEmote | null>;
  findByShortcode(shortcode: string, worldId: string | null): Promise<CustomEmote | null>;
  create(data: Omit<CustomEmote, 'id' | 'createdAt'>): Promise<CustomEmote>;
  deleteById(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Vytvoř Mongoose schema**

```typescript
// backend/src/modules/emotes/schemas/custom-emote.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'custom_emotes', timestamps: { createdAt: true, updatedAt: false } })
export class CustomEmoteDocument extends Document {
  @Prop({ type: Types.ObjectId, default: null })
  worldId: Types.ObjectId | null;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  shortcode: string;

  @Prop({ required: true })
  imageId: string;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy: Types.ObjectId;

  createdAt: Date;
}

export const CustomEmoteSchema = SchemaFactory.createForClass(CustomEmoteDocument);
CustomEmoteSchema.index({ worldId: 1, shortcode: 1 }, { unique: true });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/emotes/
git commit -m "feat(emotes): schema, interfaces a repository interface"
```

---

## Task 2: DTOs

**Files:**
- Create: `backend/src/modules/emotes/dto/create-emote.dto.ts`
- Create: `backend/src/modules/emotes/dto/copy-emote.dto.ts`

- [ ] **Step 1: Vytvoř CreateEmoteDto**

```typescript
// backend/src/modules/emotes/dto/create-emote.dto.ts
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateEmoteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^[a-z0-9_]{2,32}$/, {
    message: 'Shortcode musí obsahovat jen a-z, 0-9, _ a mít 2–32 znaků',
  })
  shortcode: string;

  @IsString()
  @IsNotEmpty()
  imageId: string;
}
```

- [ ] **Step 2: Vytvoř CopyEmoteDto**

```typescript
// backend/src/modules/emotes/dto/copy-emote.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class CopyEmoteDto {
  @IsString()
  @IsNotEmpty()
  targetWorldId: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/emotes/dto/
git commit -m "feat(emotes): DTOs s validací"
```

---

## Task 3: Repository implementace

**Files:**
- Create: `backend/src/modules/emotes/repositories/custom-emotes.repository.ts`

- [ ] **Step 1: Napiš repository**

```typescript
// backend/src/modules/emotes/repositories/custom-emotes.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomEmoteDocument } from '../schemas/custom-emote.schema';
import { CustomEmote } from '../interfaces/custom-emote.interface';
import { ICustomEmotesRepository } from '../interfaces/custom-emotes-repository.interface';

@Injectable()
export class MongoCustomEmotesRepository implements ICustomEmotesRepository {
  constructor(
    @InjectModel(CustomEmoteDocument.name) private readonly model: Model<CustomEmoteDocument>,
  ) {}

  private toEntity(doc: Record<string, unknown>): CustomEmote {
    return {
      id: String(doc._id),
      worldId: doc.worldId ? String(doc.worldId) : null,
      name: doc.name as string,
      shortcode: doc.shortcode as string,
      imageId: doc.imageId as string,
      createdBy: String(doc.createdBy),
      createdAt: doc.createdAt as Date,
    };
  }

  async findByWorldId(worldId: string): Promise<CustomEmote[]> {
    const docs = await this.model
      .find({ worldId: new Types.ObjectId(worldId) })
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findGlobal(): Promise<CustomEmote[]> {
    const docs = await this.model.find({ worldId: null }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findById(id: string): Promise<CustomEmote | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByShortcode(shortcode: string, worldId: string | null): Promise<CustomEmote | null> {
    const query = worldId
      ? { shortcode, worldId: new Types.ObjectId(worldId) }
      : { shortcode, worldId: null };
    const doc = await this.model.findOne(query).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async create(data: Omit<CustomEmote, 'id' | 'createdAt'>): Promise<CustomEmote> {
    const doc = await this.model.create({
      worldId: data.worldId ? new Types.ObjectId(data.worldId) : null,
      name: data.name,
      shortcode: data.shortcode,
      imageId: data.imageId,
      createdBy: new Types.ObjectId(data.createdBy),
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/emotes/repositories/
git commit -m "feat(emotes): Mongo repository implementace"
```

---

## Task 4: Service — testy (TDD)

**Files:**
- Create: `backend/src/modules/emotes/emotes.service.spec.ts`

- [ ] **Step 1: Napiš failing testy**

```typescript
// backend/src/modules/emotes/emotes.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmotesService } from './emotes.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockEmote = {
  id: 'emote1',
  worldId: 'world1',
  name: 'Smích',
  shortcode: 'smich',
  imageId: 'ikaros/emotes/smich',
  createdBy: 'user1',
  createdAt: new Date(),
};

describe('EmotesService', () => {
  let service: EmotesService;
  const mockRepo = {
    findByWorldId: jest.fn(),
    findGlobal: jest.fn(),
    findById: jest.fn(),
    findByShortcode: jest.fn(),
    create: jest.fn(),
    deleteById: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        EmotesService,
        { provide: 'ICustomEmotesRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    service = module.get(EmotesService);
  });

  describe('assertIsMember', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertIsMember('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí člena světa s rolí Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertIsMember('user1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne Pending člena', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Pending });
      await expect(service.assertIsMember('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertIsMember('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertWorldCanManage', () => {
    it('propustí Admina bez kontroly membershipu', async () => {
      await expect(service.assertWorldCanManage('admin1', UserRole.Admin, 'world1')).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('propustí PomocnyPJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PomocnyPJ });
      await expect(service.assertWorldCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('propustí PJ', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      await expect(service.assertWorldCanManage('pj1', UserRole.Hrac, 'world1')).resolves.toBeUndefined();
    });

    it('odmítne Hrace', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.Hrac });
      await expect(service.assertWorldCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });

    it('odmítne pokud membership neexistuje', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.assertWorldCanManage('user1', UserRole.Hrac, 'world1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertGlobalCanManage', () => {
    it('propustí Admina', () => {
      expect(() => service.assertGlobalCanManage(UserRole.Admin)).not.toThrow();
    });

    it('propustí Superadmina', () => {
      expect(() => service.assertGlobalCanManage(UserRole.Superadmin)).not.toThrow();
    });

    it('odmítne PJ (globální roli)', () => {
      expect(() => service.assertGlobalCanManage(UserRole.PJ)).toThrow(ForbiddenException);
    });
  });

  describe('findByWorld', () => {
    it('vrátí emoty daného světa', async () => {
      mockRepo.findByWorldId.mockResolvedValue([mockEmote]);
      const result = await service.findByWorld('world1');
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorldId).toHaveBeenCalledWith('world1');
    });
  });

  describe('findGlobal', () => {
    it('vrátí globální emoty', async () => {
      const globalEmote = { ...mockEmote, worldId: null };
      mockRepo.findGlobal.mockResolvedValue([globalEmote]);
      const result = await service.findGlobal();
      expect(result).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('vytvoří emote a emituje událost', async () => {
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockEmote);
      const result = await service.create('world1', { name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'user1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', shortcode: 'smich', createdBy: 'user1' }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.created', { worldId: 'world1', emote: mockEmote });
      expect(result).toEqual(mockEmote);
    });

    it('vyhodí ConflictException pokud shortcode existuje', async () => {
      mockRepo.findByShortcode.mockResolvedValue(mockEmote);
      await expect(
        service.create('world1', { name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'user1'),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('createGlobal', () => {
    it('vytvoří globální emote s worldId null', async () => {
      const globalEmote = { ...mockEmote, worldId: null };
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(globalEmote);
      const result = await service.createGlobal({ name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'admin1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: null, createdBy: 'admin1' }),
      );
      expect(result.worldId).toBeNull();
    });

    it('vyhodí ConflictException pokud globální shortcode existuje', async () => {
      mockRepo.findByShortcode.mockResolvedValue({ ...mockEmote, worldId: null });
      await expect(
        service.createGlobal({ name: 'Smích', shortcode: 'smich', imageId: 'img1' }, 'admin1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteFromWorld', () => {
    it('smaže emote ze světa', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(service.deleteFromWorld('emote1', 'world1')).resolves.toBeUndefined();
      expect(mockRepo.deleteById).toHaveBeenCalledWith('emote1');
    });

    it('vyhodí NotFoundException pokud emote neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.deleteFromWorld('bad', 'world1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí NotFoundException pokud emote patří jinému světu', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEmote, worldId: 'world2' });
      await expect(service.deleteFromWorld('emote1', 'world1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteGlobal', () => {
    it('smaže globální emote', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockEmote, worldId: null });
      mockRepo.deleteById.mockResolvedValue(true);
      await expect(service.deleteGlobal('emote1')).resolves.toBeUndefined();
    });

    it('vyhodí NotFoundException pokud emote není globální', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      await expect(service.deleteGlobal('emote1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('copy', () => {
    it('zkopíruje emote do cílového světa a emituje událost', async () => {
      const copied = { ...mockEmote, id: 'emote2', worldId: 'world2' };
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.findByShortcode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(copied);
      const result = await service.copy('emote1', 'world1', 'world2', 'user1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world2',
          shortcode: 'smich',
          createdBy: 'user1',
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('emote.created', { worldId: 'world2', emote: copied });
      expect(result.worldId).toBe('world2');
    });

    it('vyhodí NotFoundException pokud zdrojový emote neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.copy('bad', 'world1', 'world2', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('vyhodí ConflictException pokud shortcode existuje v cílovém světě', async () => {
      mockRepo.findById.mockResolvedValue(mockEmote);
      mockRepo.findByShortcode.mockResolvedValue({ ...mockEmote, worldId: 'world2' });
      await expect(service.copy('emote1', 'world1', 'world2', 'user1')).rejects.toThrow(ConflictException);
    });
  });
});
```

- [ ] **Step 2: Spusť testy — musí FAIL**

```bash
cd backend && npx jest --testPathPattern="emotes.service" --no-coverage
```

Expected: FAIL — `EmotesService` není definován

- [ ] **Step 3: Commit testů**

```bash
git add backend/src/modules/emotes/emotes.service.spec.ts
git commit -m "test(emotes): service testy před implementací"
```

---

## Task 5: Service — implementace

**Files:**
- Create: `backend/src/modules/emotes/emotes.service.ts`

- [ ] **Step 1: Implementuj service**

```typescript
// backend/src/modules/emotes/emotes.service.ts
import { Injectable, Inject, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ICustomEmotesRepository } from './interfaces/custom-emotes-repository.interface';
import { CustomEmote } from './interfaces/custom-emote.interface';
import { CreateEmoteDto } from './dto/create-emote.dto';
// Ověř import path IWorldMembershipRepository — skopríruj z NpcTemplatesService
import { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

@Injectable()
export class EmotesService {
  constructor(
    @Inject('ICustomEmotesRepository') private readonly repo: ICustomEmotesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertIsMember(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role === WorldRole.Pending)
      throw new ForbiddenException('Nejste členem tohoto světa');
  }

  async assertWorldCanManage(userId: string, userRole: UserRole, worldId: string): Promise<void> {
    if (userRole <= UserRole.Admin) return;
    const membership = await this.membershipRepo.findByUserAndWorld(userId, worldId);
    if (!membership || membership.role < WorldRole.PomocnyPJ)
      throw new ForbiddenException('Nedostatečná oprávnění');
  }

  assertGlobalCanManage(userRole: UserRole): void {
    if (userRole > UserRole.Admin)
      throw new ForbiddenException('Vyžaduje Admin nebo Superadmin');
  }

  async findByWorld(worldId: string): Promise<CustomEmote[]> {
    return this.repo.findByWorldId(worldId);
  }

  async findGlobal(): Promise<CustomEmote[]> {
    return this.repo.findGlobal();
  }

  async create(worldId: string, dto: CreateEmoteDto, userId: string): Promise<CustomEmote> {
    const existing = await this.repo.findByShortcode(dto.shortcode, worldId);
    if (existing) throw new ConflictException(`Shortcode :${dto.shortcode}: je již použit`);
    const emote = await this.repo.create({ worldId, name: dto.name, shortcode: dto.shortcode, imageId: dto.imageId, createdBy: userId });
    this.eventEmitter.emit('emote.created', { worldId, emote });
    return emote;
  }

  async createGlobal(dto: CreateEmoteDto, userId: string): Promise<CustomEmote> {
    const existing = await this.repo.findByShortcode(dto.shortcode, null);
    if (existing) throw new ConflictException(`Shortcode :${dto.shortcode}: je již použit globálně`);
    return this.repo.create({ worldId: null, name: dto.name, shortcode: dto.shortcode, imageId: dto.imageId, createdBy: userId });
  }

  async deleteFromWorld(id: string, worldId: string): Promise<void> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== worldId) throw new NotFoundException('Emote nenalezen');
    await this.repo.deleteById(id);
  }

  async deleteGlobal(id: string): Promise<void> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== null) throw new NotFoundException('Globální emote nenalezen');
    await this.repo.deleteById(id);
  }

  async copy(id: string, sourceWorldId: string, targetWorldId: string, userId: string): Promise<CustomEmote> {
    const emote = await this.repo.findById(id);
    if (!emote || emote.worldId !== sourceWorldId) throw new NotFoundException('Emote nenalezen');
    const collision = await this.repo.findByShortcode(emote.shortcode, targetWorldId);
    if (collision) throw new ConflictException(`Shortcode :${emote.shortcode}: již existuje v cílovém světě`);
    const copied = await this.repo.create({
      worldId: targetWorldId,
      name: emote.name,
      shortcode: emote.shortcode,
      imageId: emote.imageId,
      createdBy: userId,
    });
    this.eventEmitter.emit('emote.created', { worldId: targetWorldId, emote: copied });
    return copied;
  }
}
```

- [ ] **Step 2: Spusť testy — musí PASS**

```bash
cd backend && npx jest --testPathPattern="emotes.service" --no-coverage
```

Expected: všechny testy PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/emotes/emotes.service.ts
git commit -m "feat(emotes): service implementace"
```

---

## Task 6: Gateway

**Files:**
- Create: `backend/src/modules/emotes/emotes.gateway.ts`

- [ ] **Step 1: Implementuj gateway**

```typescript
// backend/src/modules/emotes/emotes.gateway.ts
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import { CustomEmote } from './interfaces/custom-emote.interface';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' },
})
export class EmotesGateway {
  @WebSocketServer() server: Server;

  @OnEvent('emote.created')
  handleEmoteCreated(payload: { worldId: string; emote: CustomEmote }): void {
    this.server.to(`world:${payload.worldId}`).emit('emote:created', payload.emote);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/emotes/emotes.gateway.ts
git commit -m "feat(emotes): gateway pro WebSocket broadcast"
```

---

## Task 7: Controller

**Files:**
- Create: `backend/src/modules/emotes/emotes.controller.ts`

- [ ] **Step 1: Implementuj controller**

Důležité: trasy `/global` a `/global/:id` musí být deklarovány **před** dynamickými trasami `/:worldId`, jinak NestJS zachytí `"global"` jako `worldId`.

```typescript
// backend/src/modules/emotes/emotes.controller.ts
import {
  Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { EmotesService } from './emotes.service';
import { CreateEmoteDto } from './dto/create-emote.dto';
import { CopyEmoteDto } from './dto/copy-emote.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/request-user.interface';

@Controller('emotes')
export class EmotesController {
  constructor(private readonly service: EmotesService) {}

  // ── Globální (musí být před /:worldId) ──────────────────────

  @Get('global')
  @UseGuards(JwtAuthGuard)
  findGlobal() {
    return this.service.findGlobal();
  }

  @Post('global')
  @UseGuards(JwtAuthGuard)
  async createGlobal(@Body() dto: CreateEmoteDto, @CurrentUser() user: RequestUser) {
    this.service.assertGlobalCanManage(user.role);
    return this.service.createGlobal(dto, user.id);
  }

  @Delete('global/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteGlobal(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    this.service.assertGlobalCanManage(user.role);
    await this.service.deleteGlobal(id);
  }

  // ── Per-world ────────────────────────────────────────────────

  @Get(':worldId')
  @UseGuards(JwtAuthGuard)
  async findByWorld(@Param('worldId') worldId: string, @CurrentUser() user: RequestUser) {
    await this.service.assertIsMember(user.id, user.role, worldId);
    return this.service.findByWorld(worldId);
  }

  @Post(':worldId')
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('worldId') worldId: string,
    @Body() dto: CreateEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user.id, user.role, worldId);
    return this.service.create(worldId, dto, user.id);
  }

  @Delete(':worldId/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deleteFromWorld(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user.id, user.role, worldId);
    await this.service.deleteFromWorld(id, worldId);
  }

  @Post(':worldId/:id/copy')
  @UseGuards(JwtAuthGuard)
  async copy(
    @Param('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CopyEmoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.assertWorldCanManage(user.id, user.role, worldId);
    await this.service.assertWorldCanManage(user.id, user.role, dto.targetWorldId);
    return this.service.copy(id, worldId, dto.targetWorldId, user.id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/emotes/emotes.controller.ts
git commit -m "feat(emotes): controller s per-world a globálními routami"
```

---

## Task 8: EmotesModule + registrace v AppModule

**Files:**
- Create: `backend/src/modules/emotes/emotes.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř EmotesModule**

```typescript
// backend/src/modules/emotes/emotes.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomEmoteDocument, CustomEmoteSchema } from './schemas/custom-emote.schema';
import { MongoCustomEmotesRepository } from './repositories/custom-emotes.repository';
import { EmotesService } from './emotes.service';
import { EmotesGateway } from './emotes.gateway';
import { EmotesController } from './emotes.controller';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomEmoteDocument.name, schema: CustomEmoteSchema }]),
    WorldsModule,
  ],
  controllers: [EmotesController],
  providers: [
    EmotesService,
    EmotesGateway,
    { provide: 'ICustomEmotesRepository', useClass: MongoCustomEmotesRepository },
  ],
})
export class EmotesModule {}
```

- [ ] **Step 2: Přidej EmotesModule do AppModule**

V souboru `backend/src/app.module.ts` přidej import:

```typescript
import { EmotesModule } from './modules/emotes/emotes.module';
```

A do pole `imports` přidej `EmotesModule` za `IkarosDiscussionsModule`.

- [ ] **Step 3: Spusť build pro ověření kompilace**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 4: Spusť testy ještě jednou**

```bash
cd backend && npx jest --testPathPattern="emotes.service" --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/emotes/emotes.module.ts backend/src/app.module.ts
git commit -m "feat(emotes): modul zaregistrován v AppModule"
```

---

## Task 9: Image proxy

**Files:**
- Create: `backend/src/modules/images/images.controller.ts`
- Create: `backend/src/modules/images/images.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř ImagesController**

```typescript
// backend/src/modules/images/images.controller.ts
import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Controller('images')
export class ImagesController {
  private readonly cloudName: string;

  constructor(private readonly configService: ConfigService) {
    this.cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
  }

  @Get('*')
  redirect(@Req() req: Request, @Res() res: Response): void {
    const path = (req.params as Record<string, string>)[0];
    res.redirect(302, `https://res.cloudinary.com/${this.cloudName}/image/upload/${path}`);
  }
}
```

- [ ] **Step 2: Vytvoř ImagesModule**

```typescript
// backend/src/modules/images/images.module.ts
import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';

@Module({
  controllers: [ImagesController],
})
export class ImagesModule {}
```

- [ ] **Step 3: Přidej ImagesModule do AppModule**

V souboru `backend/src/app.module.ts` přidej import:

```typescript
import { ImagesModule } from './modules/images/images.module';
```

A do pole `imports` přidej `ImagesModule` za `EmotesModule`.

- [ ] **Step 4: Spusť build**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/images/
git commit -m "feat(images): Cloudinary image proxy endpoint"
```

```bash
git add backend/src/app.module.ts
git commit -m "feat(app): registrace EmotesModule a ImagesModule"
```

---

## Task 10: Ověření endpointů

- [ ] **Step 1: Spusť backend**

```bash
cd backend && npm run start:dev
```

- [ ] **Step 2: Otestuj GET /api/emotes/global**

```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:3000/api/emotes/global
```

Expected: `[]` nebo seznam globálních emotů

- [ ] **Step 3: Otestuj GET /api/images/ikaros/test**

```bash
curl -v http://localhost:3000/api/images/ikaros/test
```

Expected: `HTTP/1.1 302 Found` s `Location: https://res.cloudinary.com/<cloud>/image/upload/ikaros/test`

- [ ] **Step 4: Závěrečný commit**

```bash
cd backend && npx jest --no-coverage 2>&1 | tail -5
```

Expected: test suite projde bez nových chyb
