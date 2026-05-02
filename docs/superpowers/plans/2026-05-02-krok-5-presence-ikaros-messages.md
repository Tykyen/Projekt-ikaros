# Krok 5 — Presence & IkarosMessages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat REST endpoint pro online uživatele a celý inbox systém (IkarosMessages) s WebSocket push notifikacemi a napojením na worlds join flow.

**Architecture:** EventEmitter2 loose coupling — WorldsService emituje `world.join.requested`, IkarosMessagesService poslouchá a vytváří zprávy. IkarosMessagesGateway poslouchá `ikaros.message.created` a pushuje WS event na room `user:{id}`. JWT z handshake = auto-join room.

**Tech Stack:** NestJS, Mongoose, Socket.io, EventEmitter2, Jest

---

## Přehled souborů

**Vytvořit:**
- `backend/src/modules/presence/presence.service.ts`
- `backend/src/modules/presence/presence.controller.ts`
- `backend/src/modules/presence/presence.module.ts`
- `backend/src/modules/presence/presence.service.spec.ts`
- `backend/src/modules/ikaros-messages/interfaces/ikaros-message.interface.ts`
- `backend/src/modules/ikaros-messages/interfaces/ikaros-messages-repository.interface.ts`
- `backend/src/modules/ikaros-messages/schemas/ikaros-message.schema.ts`
- `backend/src/modules/ikaros-messages/repositories/ikaros-messages.repository.ts`
- `backend/src/modules/ikaros-messages/dto/create-ikaros-message.dto.ts`
- `backend/src/modules/ikaros-messages/dto/resolve-ikaros-message.dto.ts`
- `backend/src/modules/ikaros-messages/ikaros-messages.service.ts`
- `backend/src/modules/ikaros-messages/ikaros-messages.service.spec.ts`
- `backend/src/modules/ikaros-messages/ikaros-messages.controller.ts`
- `backend/src/modules/ikaros-messages/ikaros-messages.gateway.ts`
- `backend/src/modules/ikaros-messages/ikaros-messages.module.ts`

**Upravit:**
- `backend/src/modules/users/schemas/user.schema.ts` — index na `lastSeenAt`
- `backend/src/modules/users/interfaces/users-repository.interface.ts` — přidat `findOnlineSince()`
- `backend/src/modules/users/users.repository.ts` — implementovat `findOnlineSince()`
- `backend/src/modules/worlds/worlds.service.ts` — idempotence guard + podmíněný emit
- `backend/src/modules/worlds/worlds.service.spec.ts` — doplnit testy join()
- `backend/src/app.module.ts` — registrace PresenceModule + IkarosMessagesModule

---

## Task 1: Users — index na lastSeenAt + findOnlineSince

**Files:**
- Modify: `backend/src/modules/users/schemas/user.schema.ts`
- Modify: `backend/src/modules/users/interfaces/users-repository.interface.ts`
- Modify: `backend/src/modules/users/users.repository.ts`

- [ ] **Step 1: Přidej index na lastSeenAt v user.schema.ts**

```typescript
// backend/src/modules/users/schemas/user.schema.ts
// Změň řádek:
@Prop({ default: Date.now }) lastSeenAt: Date;
// Na:
@Prop({ default: Date.now, index: true }) lastSeenAt: Date;

// A odstraň existující řádek:
UserSchema.index({ role: 1 });
// Nahraď dvěma:
UserSchema.index({ role: 1 });
UserSchema.index({ lastSeenAt: 1 });
```

Výsledný soubor `user.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole } from '../interfaces/user.interface';

export type UserDocument = HydratedDocument<UserSchemaClass>;

@Schema({ timestamps: true, collection: 'users' })
export class UserSchemaClass {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: Number, enum: UserRole, default: UserRole.Hrac })
  role: UserRole;

  @Prop() displayName?: string;
  @Prop() avatarUrl?: string;
  @Prop() characterPath?: string;
  @Prop() ikarosSkin?: string;

  @Prop({ default: false }) akj: boolean;
  @Prop({ type: Object, default: {} }) themeSettings: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) chatPreferences: Record<string, unknown>;

  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: Date.now }) lastSeenAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserSchemaClass);
UserSchema.index({ role: 1 });
UserSchema.index({ lastSeenAt: 1 });
```

- [ ] **Step 2: Přidej findOnlineSince do rozhraní**

```typescript
// backend/src/modules/users/interfaces/users-repository.interface.ts
import { User, UserRole } from './user.interface';

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findFirstByRole(role: UserRole): Promise<User | null>;
  findOnlineSince(since: Date): Promise<string[]>;
  save(user: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateLastSeen(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
}
```

- [ ] **Step 3: Implementuj findOnlineSince v MongoUsersRepository**

Přidej metodu do `backend/src/modules/users/users.repository.ts` za `updateLastSeen`:

```typescript
async findOnlineSince(since: Date): Promise<string[]> {
  const docs = await this.model
    .find({ lastSeenAt: { $gte: since } }, { _id: 1 })
    .lean()
    .exec();
  return docs.map((d) => String((d as { _id: unknown })._id));
}
```

- [ ] **Step 4: Spusť testy users**

```bash
cd backend && npx jest --testPathPattern=users --no-coverage
```

Očekávaný výstup: všechny testy PASS (findOnlineSince nemá unit test — testuje se přes PresenceService v Task 2).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/users/schemas/user.schema.ts \
        backend/src/modules/users/interfaces/users-repository.interface.ts \
        backend/src/modules/users/users.repository.ts
git commit -m "feat(users): index lastSeenAt, add findOnlineSince to repository"
```

---

## Task 2: PresenceModule

**Files:**
- Create: `backend/src/modules/presence/presence.service.ts`
- Create: `backend/src/modules/presence/presence.controller.ts`
- Create: `backend/src/modules/presence/presence.module.ts`
- Create: `backend/src/modules/presence/presence.service.spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Napiš failing test pro PresenceService**

```typescript
// backend/src/modules/presence/presence.service.spec.ts
import { Test } from '@nestjs/testing';
import { PresenceService } from './presence.service';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

describe('PresenceService', () => {
  let service: PresenceService;
  let usersRepo: jest.Mocked<IUsersRepository>;

  beforeEach(async () => {
    usersRepo = { findOnlineSince: jest.fn() } as unknown as jest.Mocked<IUsersRepository>;

    const module = await Test.createTestingModule({
      providers: [
        PresenceService,
        { provide: 'IUsersRepository', useValue: usersRepo },
      ],
    }).compile();

    service = module.get(PresenceService);
  });

  it('vrátí pole userIds od findOnlineSince', async () => {
    usersRepo.findOnlineSince.mockResolvedValue(['u1', 'u2']);
    const result = await service.getOnlineUserIds();
    expect(result).toEqual(['u1', 'u2']);
    expect(usersRepo.findOnlineSince).toHaveBeenCalledWith(expect.any(Date));
  });

  it('threshold je přibližně 25 hodin zpět', async () => {
    usersRepo.findOnlineSince.mockResolvedValue([]);
    const before = Date.now();
    await service.getOnlineUserIds();
    const after = Date.now();
    const call = usersRepo.findOnlineSince.mock.calls[0][0] as Date;
    const diffMs = before - call.getTime();
    expect(diffMs).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(diffMs).toBeLessThan(after - call.getTime() + 26 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend && npx jest --testPathPattern=presence.service.spec --no-coverage
```

Očekávaný výstup: FAIL — `Cannot find module './presence.service'`

- [ ] **Step 3: Implementuj PresenceService**

```typescript
// backend/src/modules/presence/presence.service.ts
import { Injectable, Inject } from '@nestjs/common';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface';

@Injectable()
export class PresenceService {
  private readonly thresholdMs: number;

  constructor(@Inject('IUsersRepository') private readonly usersRepo: IUsersRepository) {
    const hours = parseInt(process.env.PRESENCE_THRESHOLD_HOURS ?? '25', 10);
    this.thresholdMs = hours * 60 * 60 * 1000;
  }

  async getOnlineUserIds(): Promise<string[]> {
    const since = new Date(Date.now() - this.thresholdMs);
    return this.usersRepo.findOnlineSince(since);
  }
}
```

- [ ] **Step 4: Spusť test — ověř PASS**

```bash
cd backend && npx jest --testPathPattern=presence.service.spec --no-coverage
```

Očekávaný výstup: PASS

- [ ] **Step 5: Vytvoř PresenceController**

```typescript
// backend/src/modules/presence/presence.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Get('online')
  getOnline(): Promise<string[]> {
    return this.presenceService.getOnlineUserIds();
  }
}
```

- [ ] **Step 6: Vytvoř PresenceModule**

```typescript
// backend/src/modules/presence/presence.module.ts
import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';

@Module({
  controllers: [PresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}
```

- [ ] **Step 7: Zaregistruj v AppModule**

```typescript
// backend/src/app.module.ts — přidej import a do imports[]
import { PresenceModule } from './modules/presence/presence.module';

// do pole imports přidej:
PresenceModule,
```

- [ ] **Step 8: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: všechny PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/presence/ backend/src/app.module.ts
git commit -m "feat(presence): přidat PresenceModule s GET /api/presence/online"
```

---

## Task 3: IkarosMessage — interface, schema, repository

**Files:**
- Create: `backend/src/modules/ikaros-messages/interfaces/ikaros-message.interface.ts`
- Create: `backend/src/modules/ikaros-messages/interfaces/ikaros-messages-repository.interface.ts`
- Create: `backend/src/modules/ikaros-messages/schemas/ikaros-message.schema.ts`
- Create: `backend/src/modules/ikaros-messages/repositories/ikaros-messages.repository.ts`

- [ ] **Step 1: Vytvoř IkarosMessage interface**

```typescript
// backend/src/modules/ikaros-messages/interfaces/ikaros-message.interface.ts
export type IkarosMessageActionType = '' | 'world_join_request';

export interface IkarosMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  subject: string;
  body: string;
  sentAtUtc: Date;
  isRead: boolean;
  deletedBySender: boolean;
  deletedByRecipient: boolean;
  actionType: IkarosMessageActionType;
  actionWorldId?: string;
  actionUserId?: string;
  actionResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Vytvoř repository interface**

```typescript
// backend/src/modules/ikaros-messages/interfaces/ikaros-messages-repository.interface.ts
import { IkarosMessage } from './ikaros-message.interface';

export interface MessagePage {
  items: IkarosMessage[];
}

export interface IIkarosMessagesRepository {
  findById(id: string): Promise<IkarosMessage | null>;
  findInbox(recipientId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]>;
  findSent(senderId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]>;
  countUnreadMessages(recipientId: string): Promise<number>;
  countPendingRequests(recipientId: string): Promise<number>;
  findPjsForWorld(worldId: string): Promise<IkarosMessage[]>;
  save(msg: Partial<IkarosMessage>): Promise<IkarosMessage>;
  update(id: string, data: Partial<IkarosMessage>): Promise<IkarosMessage | null>;
}
```

- [ ] **Step 3: Vytvoř Mongoose schema**

```typescript
// backend/src/modules/ikaros-messages/schemas/ikaros-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type IkarosMessageDocument = HydratedDocument<IkarosMessageSchemaClass>;

@Schema({ timestamps: true, collection: 'ikarosmessages' })
export class IkarosMessageSchemaClass {
  @Prop({ required: true }) senderId: string;
  @Prop({ required: true }) senderName: string;
  @Prop({ required: true }) recipientId: string;
  @Prop({ required: true }) recipientName: string;
  @Prop({ required: true, maxlength: 200 }) subject: string;
  @Prop({ required: true, maxlength: 5000 }) body: string;
  @Prop({ default: Date.now }) sentAtUtc: Date;
  @Prop({ default: false }) isRead: boolean;
  @Prop({ default: false }) deletedBySender: boolean;
  @Prop({ default: false }) deletedByRecipient: boolean;
  @Prop({ default: '' }) actionType: string;
  @Prop() actionWorldId?: string;
  @Prop() actionUserId?: string;
  @Prop({ default: false }) actionResolved: boolean;
}

export const IkarosMessageSchema = SchemaFactory.createForClass(IkarosMessageSchemaClass);
IkarosMessageSchema.index({ sentAtUtc: 1 });
IkarosMessageSchema.index({ recipientId: 1, isRead: 1 });
```

- [ ] **Step 4: Implementuj MongoIkarosMessagesRepository**

```typescript
// backend/src/modules/ikaros-messages/repositories/ikaros-messages.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IkarosMessageSchemaClass } from '../schemas/ikaros-message.schema';
import { IkarosMessage, IkarosMessageActionType } from '../interfaces/ikaros-message.interface';
import { IIkarosMessagesRepository } from '../interfaces/ikaros-messages-repository.interface';
import { WorldRole } from '../../worlds/interfaces/world-membership.interface';

@Injectable()
export class MongoIkarosMessagesRepository implements IIkarosMessagesRepository {
  constructor(
    @InjectModel(IkarosMessageSchemaClass.name)
    private readonly model: Model<IkarosMessageSchemaClass>,
  ) {}

  async findById(id: string): Promise<IkarosMessage | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findInbox(recipientId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]> {
    const filter: Record<string, unknown> = { recipientId, deletedByRecipient: false };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter['_id'] = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ sentAtUtc: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findSent(senderId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]> {
    const filter: Record<string, unknown> = { senderId, deletedBySender: false };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter['_id'] = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ sentAtUtc: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async countUnreadMessages(recipientId: string): Promise<number> {
    return this.model.countDocuments({
      recipientId,
      isRead: false,
      deletedByRecipient: false,
      actionType: '',
    }).exec();
  }

  async countPendingRequests(recipientId: string): Promise<number> {
    return this.model.countDocuments({
      recipientId,
      actionResolved: false,
      deletedByRecipient: false,
      actionType: 'world_join_request',
    }).exec();
  }

  async findPjsForWorld(_worldId: string): Promise<IkarosMessage[]> {
    // Tato metoda se nepoužívá na repository level — lookup PJ probíhá v service
    return [];
  }

  async save(msg: Partial<IkarosMessage>): Promise<IkarosMessage> {
    const created = new this.model(msg);
    const saved = await created.save();
    return this.toEntity(saved.toObject());
  }

  async update(id: string, data: Partial<IkarosMessage>): Promise<IkarosMessage | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean()
      .exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  private toEntity(doc: Record<string, unknown>): IkarosMessage {
    return {
      id: String(doc._id),
      senderId: doc.senderId as string,
      senderName: doc.senderName as string,
      recipientId: doc.recipientId as string,
      recipientName: doc.recipientName as string,
      subject: doc.subject as string,
      body: doc.body as string,
      sentAtUtc: doc.sentAtUtc as Date,
      isRead: (doc.isRead as boolean) ?? false,
      deletedBySender: (doc.deletedBySender as boolean) ?? false,
      deletedByRecipient: (doc.deletedByRecipient as boolean) ?? false,
      actionType: (doc.actionType as IkarosMessageActionType) ?? '',
      actionWorldId: doc.actionWorldId as string | undefined,
      actionUserId: doc.actionUserId as string | undefined,
      actionResolved: (doc.actionResolved as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 5: Spusť testy (zatím žádné pro repo — typová kontrola)**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/ikaros-messages/interfaces/ \
        backend/src/modules/ikaros-messages/schemas/ \
        backend/src/modules/ikaros-messages/repositories/
git commit -m "feat(ikaros-messages): schema, interfaces a repository"
```

---

## Task 4: DTOs + IkarosMessagesService

**Files:**
- Create: `backend/src/modules/ikaros-messages/dto/create-ikaros-message.dto.ts`
- Create: `backend/src/modules/ikaros-messages/dto/resolve-ikaros-message.dto.ts`
- Create: `backend/src/modules/ikaros-messages/ikaros-messages.service.ts`
- Create: `backend/src/modules/ikaros-messages/ikaros-messages.service.spec.ts`

- [ ] **Step 1: Vytvoř DTOs**

```typescript
// backend/src/modules/ikaros-messages/dto/create-ikaros-message.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateIkarosMessageDto {
  @IsString() @MinLength(1) @MaxLength(200)
  subject: string;

  @IsString() @MinLength(1) @MaxLength(5000)
  body: string;

  @IsString() @MinLength(1)
  recipientId: string;

  @IsString() @MinLength(1)
  recipientName: string;
}
```

```typescript
// backend/src/modules/ikaros-messages/dto/resolve-ikaros-message.dto.ts
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveIkarosMessageDto {
  @IsBoolean()
  accept: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;
}
```

- [ ] **Step 2: Napiš failing testy pro IkarosMessagesService**

```typescript
// backend/src/modules/ikaros-messages/ikaros-messages.service.spec.ts
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IkarosMessagesService } from './ikaros-messages.service';
import type { IIkarosMessagesRepository } from './interfaces/ikaros-messages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IkarosMessage } from './interfaces/ikaros-message.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const makeMsg = (overrides: Partial<IkarosMessage> = {}): IkarosMessage => ({
  id: 'msg1',
  senderId: 'sender1',
  senderName: 'Alice',
  recipientId: 'recipient1',
  recipientName: 'Bob',
  subject: 'Ahoj',
  body: 'Jak se máš?',
  sentAtUtc: new Date(),
  isRead: false,
  deletedBySender: false,
  deletedByRecipient: false,
  actionType: '',
  actionResolved: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('IkarosMessagesService', () => {
  let service: IkarosMessagesService;
  let msgRepo: jest.Mocked<IIkarosMessagesRepository>;
  let membershipRepo: jest.Mocked<IWorldMembershipRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    msgRepo = {
      findById: jest.fn(),
      findInbox: jest.fn(),
      findSent: jest.fn(),
      countUnreadMessages: jest.fn(),
      countPendingRequests: jest.fn(),
      findPjsForWorld: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    } as jest.Mocked<IIkarosMessagesRepository>;

    membershipRepo = {
      findByWorldId: jest.fn(),
      findByUserAndWorld: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
      countByWorldId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IWorldMembershipRepository>;

    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    const module = await Test.createTestingModule({
      providers: [
        IkarosMessagesService,
        { provide: 'IIkarosMessagesRepository', useValue: msgRepo },
        { provide: 'IWorldMembershipRepository', useValue: membershipRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(IkarosMessagesService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('uloží zprávu a emituje event', async () => {
      const saved = makeMsg();
      msgRepo.save.mockResolvedValue(saved);
      const result = await service.create(
        { subject: 'Ahoj', body: 'Jak se máš?', recipientId: 'recipient1', recipientName: 'Bob' },
        { id: 'sender1', username: 'Alice' },
      );
      expect(result.senderId).toBe('sender1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('ikaros.message.created', expect.objectContaining({
        recipientId: 'recipient1',
        messageId: saved.id,
      }));
    });
  });

  describe('getUnreadCount', () => {
    it('vrátí messages a pendingRequests', async () => {
      msgRepo.countUnreadMessages.mockResolvedValue(3);
      msgRepo.countPendingRequests.mockResolvedValue(1);
      const result = await service.getUnreadCount('recipient1');
      expect(result).toEqual({ messages: 3, pendingRequests: 1 });
    });
  });

  describe('softDelete', () => {
    it('nastaví deletedByRecipient pokud je volající recipient', async () => {
      const msg = makeMsg({ recipientId: 'u1' });
      msgRepo.findById.mockResolvedValue(msg);
      msgRepo.update.mockResolvedValue({ ...msg, deletedByRecipient: true });
      await service.softDelete('msg1', 'u1');
      expect(msgRepo.update).toHaveBeenCalledWith('msg1', { deletedByRecipient: true });
    });

    it('nastaví deletedBySender pokud je volající sender', async () => {
      const msg = makeMsg({ senderId: 'u2' });
      msgRepo.findById.mockResolvedValue(msg);
      msgRepo.update.mockResolvedValue({ ...msg, deletedBySender: true });
      await service.softDelete('msg1', 'u2');
      expect(msgRepo.update).toHaveBeenCalledWith('msg1', { deletedBySender: true });
    });

    it('hodí ForbiddenException pro cizího uživatele', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg());
      await expect(service.softDelete('msg1', 'cizi')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resolve', () => {
    it('hodí ConflictException pokud je actionResolved=true', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg({
        recipientId: 'pj1',
        actionType: 'world_join_request',
        actionResolved: true,
        actionWorldId: 'w1',
        actionUserId: 'req1',
      }));
      await expect(service.resolve('msg1', { accept: true }, 'pj1')).rejects.toThrow(ConflictException);
    });

    it('hodí ForbiddenException pokud volající není recipient', async () => {
      msgRepo.findById.mockResolvedValue(makeMsg({
        recipientId: 'pj1',
        actionType: 'world_join_request',
        actionResolved: false,
      }));
      await expect(service.resolve('msg1', { accept: true }, 'jiny')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleJoinRequest', () => {
    it('vytvoří zprávu pro každého PJ a PomocnyPJ světa', async () => {
      membershipRepo.findByWorldId.mockResolvedValue([
        { id: 'm1', userId: 'pj1', worldId: 'w1', role: WorldRole.PJ, joinedAt: new Date(), akj: 0 },
        { id: 'm2', userId: 'pj2', worldId: 'w1', role: WorldRole.PomocnyPJ, joinedAt: new Date(), akj: 0 },
        { id: 'm3', userId: 'hrac1', worldId: 'w1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0 },
      ]);
      msgRepo.save.mockResolvedValue(makeMsg());

      await service.handleJoinRequest({
        worldId: 'w1',
        worldName: 'Matrix',
        requesterId: 'req1',
        requesterName: 'Frodo',
      });

      expect(msgRepo.save).toHaveBeenCalledTimes(2);
      const calls = msgRepo.save.mock.calls;
      expect(calls[0][0]).toMatchObject({ recipientId: 'pj1', actionType: 'world_join_request' });
      expect(calls[1][0]).toMatchObject({ recipientId: 'pj2', actionType: 'world_join_request' });
    });
  });
});
```

- [ ] **Step 3: Spusť test — ověř FAIL**

```bash
cd backend && npx jest --testPathPattern=ikaros-messages.service.spec --no-coverage
```

Očekávaný výstup: FAIL — `Cannot find module './ikaros-messages.service'`

- [ ] **Step 4: Implementuj IkarosMessagesService**

```typescript
// backend/src/modules/ikaros-messages/ikaros-messages.service.ts
import {
  Injectable, Inject, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { IIkarosMessagesRepository } from './interfaces/ikaros-messages-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { IkarosMessage } from './interfaces/ikaros-message.interface';
import type { CreateIkarosMessageDto } from './dto/create-ikaros-message.dto';
import type { ResolveIkarosMessageDto } from './dto/resolve-ikaros-message.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

interface SenderRef { id: string; username: string }

interface JoinRequestedPayload {
  worldId: string;
  worldName: string;
  requesterId: string;
  requesterName: string;
}

@Injectable()
export class IkarosMessagesService {
  constructor(
    @Inject('IIkarosMessagesRepository') private readonly msgRepo: IIkarosMessagesRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateIkarosMessageDto, sender: SenderRef): Promise<IkarosMessage> {
    const msg = await this.msgRepo.save({
      senderId: sender.id,
      senderName: sender.username,
      recipientId: dto.recipientId,
      recipientName: dto.recipientName,
      subject: dto.subject,
      body: dto.body,
      sentAtUtc: new Date(),
      isRead: false,
      deletedBySender: false,
      deletedByRecipient: false,
      actionType: '',
      actionResolved: false,
    });
    this.eventEmitter.emit('ikaros.message.created', {
      recipientId: msg.recipientId,
      messageId: msg.id,
      subject: msg.subject,
      senderName: msg.senderName,
      actionType: msg.actionType,
    });
    return msg;
  }

  async getInbox(recipientId: string, limit = 50, before?: string): Promise<IkarosMessage[]> {
    return this.msgRepo.findInbox(recipientId, { limit: Math.min(limit, 100), before });
  }

  async getSent(senderId: string, limit = 50, before?: string): Promise<IkarosMessage[]> {
    return this.msgRepo.findSent(senderId, { limit: Math.min(limit, 100), before });
  }

  async getUnreadCount(recipientId: string): Promise<{ messages: number; pendingRequests: number }> {
    const [messages, pendingRequests] = await Promise.all([
      this.msgRepo.countUnreadMessages(recipientId),
      this.msgRepo.countPendingRequests(recipientId),
    ]);
    return { messages, pendingRequests };
  }

  async getById(id: string, userId: string): Promise<IkarosMessage> {
    const msg = await this.msgRepo.findById(id);
    if (!msg) throw new NotFoundException('Zpráva nenalezena');
    if (msg.recipientId !== userId && msg.senderId !== userId) {
      throw new ForbiddenException('Přístup odepřen');
    }
    if (msg.recipientId === userId && !msg.isRead) {
      await this.msgRepo.update(id, { isRead: true });
    }
    return msg;
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const msg = await this.msgRepo.findById(id);
    if (!msg) throw new NotFoundException('Zpráva nenalezena');
    if (msg.recipientId === userId) {
      await this.msgRepo.update(id, { deletedByRecipient: true });
    } else if (msg.senderId === userId) {
      await this.msgRepo.update(id, { deletedBySender: true });
    } else {
      throw new ForbiddenException('Přístup odepřen');
    }
  }

  async resolve(id: string, dto: ResolveIkarosMessageDto, userId: string): Promise<void> {
    const msg = await this.msgRepo.findById(id);
    if (!msg) throw new NotFoundException('Zpráva nenalezena');
    if (msg.recipientId !== userId) throw new ForbiddenException('Přístup odepřen');
    if (msg.actionType !== 'world_join_request') {
      throw new ForbiddenException('Zpráva není žádost o vstup');
    }
    if (msg.actionResolved) throw new ConflictException('Žádost již byla vyřízena');

    await this.msgRepo.update(id, { actionResolved: true, isRead: true });

    if (dto.accept) {
      const membership = await this.membershipRepo.findByUserAndWorld(msg.actionUserId!, msg.actionWorldId!);
      if (membership && membership.role === WorldRole.Pending) {
        await this.membershipRepo.update(membership.id, { role: WorldRole.Hrac });
        this.eventEmitter.emit('world.membership.changed', { worldId: msg.actionWorldId, membership });
      }
      await this.msgRepo.save({
        senderId: userId,
        senderName: 'Systém',
        recipientId: msg.actionUserId!,
        recipientName: '',
        subject: 'Žádost o vstup přijata',
        body: `Tvoje žádost o vstup do světa byla přijata.`,
        sentAtUtc: new Date(),
        isRead: false,
        deletedBySender: false,
        deletedByRecipient: false,
        actionType: '',
        actionResolved: false,
      });
    } else {
      const reason = dto.reason?.trim() || 'byl jsi odmítnut';
      await this.msgRepo.save({
        senderId: userId,
        senderName: 'Systém',
        recipientId: msg.actionUserId!,
        recipientName: '',
        subject: 'Žádost o vstup zamítnuta',
        body: reason,
        sentAtUtc: new Date(),
        isRead: false,
        deletedBySender: false,
        deletedByRecipient: false,
        actionType: '',
        actionResolved: false,
      });
    }
  }

  @OnEvent('world.join.requested')
  async handleJoinRequest(payload: JoinRequestedPayload): Promise<void> {
    const memberships = await this.membershipRepo.findByWorldId(payload.worldId);
    const pjs = memberships.filter(
      (m) => m.role === WorldRole.PJ || m.role === WorldRole.PomocnyPJ,
    );
    await Promise.all(
      pjs.map((pj) =>
        this.msgRepo.save({
          senderId: payload.requesterId,
          senderName: payload.requesterName,
          recipientId: pj.userId,
          recipientName: '',
          subject: `Žádost o vstup do světa ${payload.worldName}`,
          body: `Uživatel ${payload.requesterName} žádá o vstup do světa ${payload.worldName}.`,
          sentAtUtc: new Date(),
          isRead: false,
          deletedBySender: false,
          deletedByRecipient: false,
          actionType: 'world_join_request',
          actionWorldId: payload.worldId,
          actionUserId: payload.requesterId,
          actionResolved: false,
        }).then((msg) => {
          this.eventEmitter.emit('ikaros.message.created', {
            recipientId: pj.userId,
            messageId: msg.id,
            subject: msg.subject,
            senderName: msg.senderName,
            actionType: msg.actionType,
          });
        }),
      ),
    );
  }
}
```

- [ ] **Step 5: Spusť testy — ověř PASS**

```bash
cd backend && npx jest --testPathPattern=ikaros-messages.service.spec --no-coverage
```

Očekávaný výstup: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/ikaros-messages/dto/ \
        backend/src/modules/ikaros-messages/ikaros-messages.service.ts \
        backend/src/modules/ikaros-messages/ikaros-messages.service.spec.ts
git commit -m "feat(ikaros-messages): DTOs a IkarosMessagesService s event handlery"
```

---

## Task 5: IkarosMessagesGateway

**Files:**
- Create: `backend/src/modules/ikaros-messages/ikaros-messages.gateway.ts`

- [ ] **Step 1: Vytvoř Gateway**

```typescript
// backend/src/modules/ikaros-messages/ikaros-messages.gateway.ts
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class IkarosMessagesGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket): void {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) return;
      const payload = this.jwtService.verify(token) as { sub: string };
      void client.join(`user:${payload.sub}`);
    } catch {
      // neplatný token — socket připojen bez user roomu
    }
  }

  @OnEvent('ikaros.message.created')
  handleMessageCreated(payload: {
    recipientId: string;
    messageId: string;
    subject: string;
    senderName: string;
    actionType: string;
  }): void {
    this.server.to(`user:${payload.recipientId}`).emit('ikaros:new-message', {
      messageId: payload.messageId,
      subject: payload.subject,
      senderName: payload.senderName,
      actionType: payload.actionType,
    });
  }
}
```

- [ ] **Step 2: Spusť typovou kontrolu**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ikaros-messages/ikaros-messages.gateway.ts
git commit -m "feat(ikaros-messages): IkarosMessagesGateway s auto-join user room"
```

---

## Task 6: IkarosMessagesController

**Files:**
- Create: `backend/src/modules/ikaros-messages/ikaros-messages.controller.ts`

- [ ] **Step 1: Implementuj controller**

```typescript
// backend/src/modules/ikaros-messages/ikaros-messages.controller.ts
import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { IkarosMessagesService } from './ikaros-messages.service';
import { CreateIkarosMessageDto } from './dto/create-ikaros-message.dto';
import { ResolveIkarosMessageDto } from './dto/resolve-ikaros-message.dto';

@Controller('ikaros-messages')
@UseGuards(JwtAuthGuard)
export class IkarosMessagesController {
  constructor(private readonly service: IkarosMessagesService) {}

  @Get('inbox')
  getInbox(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.service.getInbox(user.id, limit ? parseInt(limit, 10) : 50, before);
  }

  @Get('sent')
  getSent(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.service.getSent(user.id, limit ? parseInt(limit, 10) : 50, before);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: RequestUser) {
    return this.service.getUnreadCount(user.id);
  }

  @Get(':id')
  getById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getById(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateIkarosMessageDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, { id: user.id, username: user.username });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.service.softDelete(id, user.id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveIkarosMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.service.resolve(id, dto, user.id);
  }
}
```

- [ ] **Step 2: Spusť typovou kontrolu**

```bash
cd backend && npx tsc --noEmit
```

Očekávaný výstup: žádné chyby

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/ikaros-messages/ikaros-messages.controller.ts
git commit -m "feat(ikaros-messages): REST controller se 7 endpointy"
```

---

## Task 7: IkarosMessagesModule + AppModule

**Files:**
- Create: `backend/src/modules/ikaros-messages/ikaros-messages.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř IkarosMessagesModule**

```typescript
// backend/src/modules/ikaros-messages/ikaros-messages.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IkarosMessageSchemaClass, IkarosMessageSchema } from './schemas/ikaros-message.schema';
import { MongoIkarosMessagesRepository } from './repositories/ikaros-messages.repository';
import { IkarosMessagesService } from './ikaros-messages.service';
import { IkarosMessagesController } from './ikaros-messages.controller';
import { IkarosMessagesGateway } from './ikaros-messages.gateway';
import { WorldsModule } from '../worlds/worlds.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IkarosMessageSchemaClass.name, schema: IkarosMessageSchema },
    ]),
    WorldsModule,
    AuthModule,
  ],
  controllers: [IkarosMessagesController],
  providers: [
    IkarosMessagesService,
    { provide: 'IIkarosMessagesRepository', useClass: MongoIkarosMessagesRepository },
    IkarosMessagesGateway,
  ],
})
export class IkarosMessagesModule {}
```

- [ ] **Step 2: Zaregistruj v AppModule**

```typescript
// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    WorldsModule,
    ChatModule,
    UploadModule,
    GlobalChatModule,
    PresenceModule,
    IkarosMessagesModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
```

- [ ] **Step 3: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: všechny PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/ikaros-messages/ikaros-messages.module.ts \
        backend/src/app.module.ts
git commit -m "feat(ikaros-messages): modul zaregistrován v AppModule"
```

---

## Task 8: WorldsService — idempotence + emit world.join.requested

**Files:**
- Modify: `backend/src/modules/worlds/worlds.service.ts`
- Modify: `backend/src/modules/worlds/worlds.service.spec.ts`

- [ ] **Step 1: Napiš failing testy pro nové chování join()**

Přidej do `backend/src/modules/worlds/worlds.service.spec.ts` do bloku `describe('join')`:

```typescript
it('neemituje event pokud membership je již Pending', async () => {
  mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, accessMode: 'private' });
  mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
    id: 'm1', userId: 'user2', worldId: 'world1', role: WorldRole.Pending, joinedAt: new Date(), akj: 0,
  });
  const emit = service['eventEmitter'].emit as jest.Mock;
  await service.join('world1', 'user2', 'Frodo');
  expect(emit).not.toHaveBeenCalledWith('world.join.requested', expect.anything());
});

it('emituje world.join.requested s worldName a requesterName při private world', async () => {
  mockWorldsRepo.findById.mockResolvedValue({ ...mockWorld, name: 'Matrix', accessMode: 'private' });
  mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
  mockMembershipRepo.save.mockResolvedValue({
    id: 'm1', userId: 'user2', worldId: 'world1', role: WorldRole.Pending, joinedAt: new Date(), akj: 0,
  });
  const emit = service['eventEmitter'].emit as jest.Mock;
  await service.join('world1', 'user2', 'Frodo');
  expect(emit).toHaveBeenCalledWith('world.join.requested', {
    worldId: 'world1',
    worldName: 'Matrix',
    requesterId: 'user2',
    requesterName: 'Frodo',
  });
});
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend && npx jest --testPathPattern=worlds.service.spec --no-coverage
```

Očekávaný výstup: FAIL — `join` nemá parametr `requesterName`, event se neemituje

- [ ] **Step 3: Uprav WorldsService.join()**

Změň signaturu `join()` a přidej podmíněný emit v `backend/src/modules/worlds/worlds.service.ts`:

```typescript
async join(worldId: string, userId: string, requesterName: string = ''): Promise<WorldMembership> {
  const world = await this.worldsRepo.findById(worldId);
  if (!world) throw new NotFoundException('Svět nenalezen');
  if (world.accessMode === 'closed') throw new ForbiddenException('Svět je uzavřen');

  const existing = await this.membershipRepo.findByUserAndWorld(userId, worldId);
  if (existing) {
    if (existing.role !== WorldRole.Pending) throw new ConflictException('Již jsi členem tohoto světa');
    return existing; // idempotentní — žádost již odeslána, neemituj znovu
  }

  const role = world.accessMode === 'public' ? WorldRole.Hrac : WorldRole.Pending;
  const membership = await this.membershipRepo.save({
    userId,
    worldId,
    role,
    joinedAt: new Date(),
    akj: 0,
  });

  if (role === WorldRole.Hrac) {
    await this.worldsRepo.increment(worldId, 'playerCount', 1);
  }

  if (role === WorldRole.Pending) {
    this.eventEmitter.emit('world.join.requested', {
      worldId,
      worldName: world.name,
      requesterId: userId,
      requesterName,
    });
  }

  this.eventEmitter.emit('world.membership.changed', { worldId, membership });
  return membership;
}
```

- [ ] **Step 4: Uprav WorldsController — předej requesterName do join()**

Najdi v `backend/src/modules/worlds/worlds.controller.ts` volání `service.join()` a předej username:

```typescript
// Najdi endpoint POST /:id/join a uprav volání:
return this.worldsService.join(id, user.id, user.username);
```

- [ ] **Step 5: Spusť testy — ověř PASS**

```bash
cd backend && npx jest --testPathPattern=worlds.service.spec --no-coverage
```

Očekávaný výstup: PASS

- [ ] **Step 6: Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: všechny PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/worlds/worlds.service.ts \
        backend/src/modules/worlds/worlds.service.spec.ts \
        backend/src/modules/worlds/worlds.controller.ts
git commit -m "feat(worlds): join emituje world.join.requested, idempotentní Pending guard"
```

---

## Závěrečné ověření

- [ ] **Spusť build**

```bash
cd backend && npx nest build
```

Očekávaný výstup: Build successful

- [ ] **Spusť všechny testy**

```bash
cd backend && npx jest --no-coverage
```

Očekávaný výstup: všechny PASS

- [ ] **Commit finalizace pokud je potřeba**

```bash
git add -A
git commit -m "chore: krok 5 kompletní — presence + ikaros-messages"
```
