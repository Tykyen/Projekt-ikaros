# Krok 3c-crossworld — Interdimenzionální hospoda: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat globální chat ("Interdimenzionální hospoda") dostupný všem přihlášeným uživatelům. Zprávy se automaticky mažou po 1 hodině (MongoDB TTL). Uživatelé vidí příchody/odchody ostatních jako efemérní Socket.IO eventy.

**Architecture:** `GlobalChatModule` importuje `ChatModule` a reusuje `IChatChannelRepository` + `IChatMessageRepository`. Jeden seeded kanál (`isGlobal: true`, `worldId: null`). REST API na `/api/global-chat/messages`. Socket.IO room `chat:{globalChannelId}`. `GlobalChatGateway` zpracovává presence eventy a broadcastuje zprávy.

**Tech Stack:** NestJS 11, Mongoose 9, Socket.IO, EventEmitter2, class-validator, Jest

---

## Mapa souborů

| Soubor | Akce | Co se mění |
|---|---|---|
| `backend/src/modules/worlds/worlds.service.ts` | Modify | `RequestUser` + `username: string` |
| `backend/src/modules/chat/interfaces/chat-channel.interface.ts` | Modify | `groupId?`, `worldId?` nullable, `isGlobal?: boolean` |
| `backend/src/modules/chat/interfaces/chat-channel-repository.interface.ts` | Modify | + `findGlobal()` |
| `backend/src/modules/chat/schemas/chat-channel.schema.ts` | Modify | `groupId`/`worldId` nepovinné, + `isGlobal` |
| `backend/src/modules/chat/repositories/chat-channel.repository.ts` | Modify | implement `findGlobal()`, update `toEntity` |
| `backend/src/modules/chat/interfaces/chat-message.interface.ts` | Modify | `worldId: string \| null`, + `expiresAt?: Date` |
| `backend/src/modules/chat/schemas/chat-message.schema.ts` | Modify | `worldId` nepovinné, + `expiresAt` TTL index |
| `backend/src/modules/chat/repositories/chat-message.repository.ts` | Modify | update `toEntity` |
| `backend/src/modules/chat/chat.module.ts` | Modify | exports `'IChatChannelRepository'`, `'IChatMessageRepository'` |
| `backend/src/common/guards/admin.guard.ts` | Create | `AdminGuard` — UserRole.Admin nebo vyšší |
| `backend/src/modules/global-chat/dto/create-global-message.dto.ts` | Create | DTO pro globální zprávu |
| `backend/src/modules/global-chat/global-chat.service.ts` | Create | seeder + business logika |
| `backend/src/modules/global-chat/global-chat.service.spec.ts` | Create | testy |
| `backend/src/modules/global-chat/global-chat.controller.ts` | Create | REST endpointy |
| `backend/src/modules/global-chat/global-chat.gateway.ts` | Create | Socket.IO presence + broadcast |
| `backend/src/modules/global-chat/global-chat.module.ts` | Create | NestJS modul |
| `backend/src/app.module.ts` | Modify | + `GlobalChatModule` |

---

## Task 1: RequestUser rozšíření + ChatChannel interface/schema/repository

**Files:**
- Modify: `backend/src/modules/worlds/worlds.service.ts:21-24`
- Modify: `backend/src/modules/chat/interfaces/chat-channel.interface.ts`
- Modify: `backend/src/modules/chat/interfaces/chat-channel-repository.interface.ts`
- Modify: `backend/src/modules/chat/schemas/chat-channel.schema.ts`
- Modify: `backend/src/modules/chat/repositories/chat-channel.repository.ts`

- [ ] **Krok 1: Rozšiř RequestUser o username**

V `backend/src/modules/worlds/worlds.service.ts` uprav rozhraní `RequestUser` (řádky 21–24):

```typescript
export interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
}
```

- [ ] **Krok 2: Uprav ChatChannel interface**

Nahraď celý obsah `backend/src/modules/chat/interfaces/chat-channel.interface.ts`:

```typescript
import type { WorldRole } from '../../worlds/interfaces/world-membership.interface';

export interface ChatChannel {
  id: string;
  groupId: string | null;
  worldId: string | null;
  name: string;
  isGlobal: boolean;
  accessMode: 'all' | 'roles' | 'members';
  allowedRoles: WorldRole[];
  allowedMemberIds: string[];
  lastMessageAt?: Date;
  order: number;
  isDeleted: boolean;
  createdAt: Date;
}
```

- [ ] **Krok 3: Přidej findGlobal do IChatChannelRepository**

Nahraď celý obsah `backend/src/modules/chat/interfaces/chat-channel-repository.interface.ts`:

```typescript
import type { ChatChannel } from './chat-channel.interface';

export interface IChatChannelRepository {
  findById(id: string): Promise<ChatChannel | null>;
  findGlobal(): Promise<ChatChannel | null>;
  findByGroupId(groupId: string): Promise<ChatChannel[]>;
  findByWorldId(worldId: string): Promise<ChatChannel[]>;
  save(data: Partial<ChatChannel>): Promise<ChatChannel>;
  update(id: string, data: Partial<ChatChannel>): Promise<ChatChannel | null>;
  delete(id: string): Promise<boolean>;
  softDeleteByWorldId(worldId: string): Promise<void>;
}
```

- [ ] **Krok 4: Uprav ChatChannel schema**

Nahraď celý obsah `backend/src/modules/chat/schemas/chat-channel.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatChannelDocument = HydratedDocument<ChatChannelSchemaClass>;

@Schema({ timestamps: true, collection: 'chatchannels' })
export class ChatChannelSchemaClass {
  @Prop({ type: String, default: null }) groupId: string | null;
  @Prop({ type: String, default: null }) worldId: string | null;
  @Prop({ required: true }) name: string;
  @Prop({ default: false }) isGlobal: boolean;
  @Prop({ default: 'all' }) accessMode: string;
  @Prop({ type: [Number], default: [] }) allowedRoles: number[];
  @Prop({ type: [String], default: [] }) allowedMemberIds: string[];
  @Prop() lastMessageAt?: Date;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: false }) isDeleted: boolean;
}

export const ChatChannelSchema = SchemaFactory.createForClass(ChatChannelSchemaClass);
ChatChannelSchema.index({ worldId: 1, groupId: 1 });
ChatChannelSchema.index({ worldId: 1, lastMessageAt: -1 });
ChatChannelSchema.index({ isGlobal: 1 });
```

- [ ] **Krok 5: Uprav ChatChannel repository — implementuj findGlobal a toEntity**

Nahraď celý obsah `backend/src/modules/chat/repositories/chat-channel.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatChannelSchemaClass } from '../schemas/chat-channel.schema';
import type { ChatChannel } from '../interfaces/chat-channel.interface';
import type { IChatChannelRepository } from '../interfaces/chat-channel-repository.interface';
import type { WorldRole } from '../../worlds/interfaces/world-membership.interface';

@Injectable()
export class MongoChatChannelRepository
  extends BaseMongoRepository<ChatChannel>
  implements IChatChannelRepository
{
  constructor(@InjectModel(ChatChannelSchemaClass.name) model: Model<ChatChannelSchemaClass>) {
    super(model as never);
  }

  async findGlobal(): Promise<ChatChannel | null> {
    const doc = await this.model.findOne({ isGlobal: true }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByGroupId(groupId: string): Promise<ChatChannel[]> {
    const docs = await this.model.find({ groupId, isDeleted: false }).sort({ order: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findByWorldId(worldId: string): Promise<ChatChannel[]> {
    const docs = await this.model.find({ worldId, isDeleted: false }).sort({ order: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async softDeleteByWorldId(worldId: string): Promise<void> {
    await this.model.updateMany({ worldId }, { $set: { isDeleted: true } }).exec();
  }

  protected toEntity(doc: Record<string, unknown>): ChatChannel {
    return {
      id: String(doc._id),
      groupId: (doc.groupId as string | null) ?? null,
      worldId: (doc.worldId as string | null) ?? null,
      name: doc.name as string,
      isGlobal: (doc.isGlobal as boolean) ?? false,
      accessMode: (doc.accessMode as ChatChannel['accessMode']) ?? 'all',
      allowedRoles: (doc.allowedRoles as WorldRole[]) ?? [],
      allowedMemberIds: (doc.allowedMemberIds as string[]) ?? [],
      lastMessageAt: doc.lastMessageAt as Date | undefined,
      order: (doc.order as number) ?? 0,
      isDeleted: (doc.isDeleted as boolean) ?? false,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Krok 6: Oprav TypeScript chyby v chat.service.ts způsobené nullable worldId**

`ChatService` interně předává `channel.worldId` do metod které očekávají `string`. V kontextu `ChatService` jsou to vždy world kanály kde `worldId != null`. Použij non-null assertion `!` na všech místech kde TypeScript hlásí chybu.

V `backend/src/modules/chat/chat.service.ts` nahraď všechna volání s `channel.worldId` non-null assertionem:

```typescript
// canManageChat
if (!(await this.canManageChat(requester, channel.worldId!))) {

// hasChannelAccess — metoda sama používá channel.worldId, ale channel je z world kontextu
// V hasChannelAccess.ts řádek s membershipRepo.findByUserAndWorld:
const membership = await this.membershipRepo.findByUserAndWorld(userId, channel.worldId!);

// EventEmitter emity:
this.eventEmitter.emit('chat.channel.created', { worldId: channel.worldId!, channel });
this.eventEmitter.emit('chat.channel.updated', { worldId: channel.worldId!, channel: updated });
this.eventEmitter.emit('chat.channel.deleted', { worldId: channel.worldId!, channelId, groupId: channel.groupId });
this.eventEmitter.emit('chat.group.deleted', { worldId: group.worldId!, groupId });
```

Hledej všechna místa kde TypeScript hlásí `Argument of type 'string | null' is not assignable to parameter of type 'string'` v `chat.service.ts` a přidej `!`.

- [ ] **Krok 7: Spusť TypeScript kontrolu**

```bash
cd backend && npx tsc --noEmit
```

Očekávané: žádné chyby.

- [ ] **Krok 8: Commit**

```bash
cd backend && git add src/modules/worlds/worlds.service.ts src/modules/chat/interfaces/chat-channel.interface.ts src/modules/chat/interfaces/chat-channel-repository.interface.ts src/modules/chat/schemas/chat-channel.schema.ts src/modules/chat/repositories/chat-channel.repository.ts src/modules/chat/chat.service.ts
git commit -m "feat: extend ChatChannel with isGlobal, nullable worldId/groupId, findGlobal"
```

---

## Task 2: ChatMessage interface/schema/repository — nullable worldId + expiresAt TTL

**Files:**
- Modify: `backend/src/modules/chat/interfaces/chat-message.interface.ts`
- Modify: `backend/src/modules/chat/schemas/chat-message.schema.ts`
- Modify: `backend/src/modules/chat/repositories/chat-message.repository.ts`

- [ ] **Krok 1: Uprav ChatMessage interface**

Nahraď celý obsah `backend/src/modules/chat/interfaces/chat-message.interface.ts`:

```typescript
import type { ChatAttachment } from './chat-attachment.interface';

export interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string | null;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  overrideName?: string;
  overrideAvatarUrl?: string;
  content: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  rpDate?: string;
  replyToId?: string;
  replyToPreview?: string;
  replyToSenderName?: string;
  visibleTo?: string[];
  reactions: Record<string, string[]>;
  attachments?: ChatAttachment[];
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Krok 2: Uprav ChatMessage schema**

Nahraď celý obsah `backend/src/modules/chat/schemas/chat-message.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatMessageDocument = HydratedDocument<ChatMessageSchemaClass>;

@Schema({ timestamps: true, collection: 'chatmessages' })
export class ChatMessageSchemaClass {
  @Prop({ required: true }) channelId: string;
  @Prop({ type: String, default: null }) worldId: string | null;
  @Prop({ required: true }) senderId: string;
  @Prop({ required: true }) senderName: string;
  @Prop({ type: String }) senderAvatarUrl?: string;
  @Prop({ type: String }) overrideName?: string;
  @Prop({ type: String }) overrideAvatarUrl?: string;
  @Prop({ type: String, default: null }) content: string | null;
  @Prop({ default: false }) isEdited: boolean;
  @Prop({ default: false }) isDeleted: boolean;
  @Prop({ type: String }) rpDate?: string;
  @Prop({ type: String }) replyToId?: string;
  @Prop({ type: String }) replyToPreview?: string;
  @Prop({ type: String }) replyToSenderName?: string;
  @Prop({ type: [String] }) visibleTo?: string[];
  @Prop({ type: Object, default: {} }) reactions: Record<string, string[]>;
  @Prop({ type: [Object], default: [] }) attachments: Record<string, unknown>[];
  @Prop({ type: Date }) expiresAt?: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageSchemaClass);
ChatMessageSchema.index({ channelId: 1, createdAt: -1 });
ChatMessageSchema.index({ worldId: 1 });
ChatMessageSchema.index({ senderId: 1 });
ChatMessageSchema.index({ channelId: 1, visibleTo: 1 });
ChatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

- [ ] **Krok 3: Uprav ChatMessage repository — update toEntity**

V `backend/src/modules/chat/repositories/chat-message.repository.ts` nahraď metodu `toEntity`:

```typescript
protected toEntity(doc: Record<string, unknown>): ChatMessage {
  return {
    id: String(doc._id),
    channelId: doc.channelId as string,
    worldId: (doc.worldId as string | null) ?? null,
    senderId: doc.senderId as string,
    senderName: doc.senderName as string,
    senderAvatarUrl: doc.senderAvatarUrl as string | undefined,
    overrideName: doc.overrideName as string | undefined,
    overrideAvatarUrl: doc.overrideAvatarUrl as string | undefined,
    content: doc.content as string | null,
    isEdited: (doc.isEdited as boolean) ?? false,
    isDeleted: (doc.isDeleted as boolean) ?? false,
    rpDate: doc.rpDate as string | undefined,
    replyToId: doc.replyToId as string | undefined,
    replyToPreview: doc.replyToPreview as string | undefined,
    replyToSenderName: doc.replyToSenderName as string | undefined,
    visibleTo: doc.visibleTo as string[] | undefined,
    reactions: (doc.reactions as Record<string, string[]>) ?? {},
    attachments: (doc.attachments as import('../interfaces/chat-attachment.interface').ChatAttachment[]) ?? [],
    expiresAt: doc.expiresAt as Date | undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}
```

- [ ] **Krok 4: Spusť TypeScript kontrolu**

```bash
cd backend && npx tsc --noEmit
```

Očekávané: žádné chyby.

- [ ] **Krok 5: Commit**

```bash
cd backend && git add src/modules/chat/interfaces/chat-message.interface.ts src/modules/chat/schemas/chat-message.schema.ts src/modules/chat/repositories/chat-message.repository.ts
git commit -m "feat: add expiresAt TTL to ChatMessage, make worldId nullable"
```

---

## Task 3: ChatModule — export repositories

**Files:**
- Modify: `backend/src/modules/chat/chat.module.ts`

- [ ] **Krok 1: Přidej exports do ChatModule**

V `backend/src/modules/chat/chat.module.ts` uprav `exports` pole:

```typescript
exports: [ChatService, 'IChatChannelRepository', 'IChatMessageRepository'],
```

- [ ] **Krok 2: Spusť TypeScript kontrolu**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Krok 3: Commit**

```bash
cd backend && git add src/modules/chat/chat.module.ts
git commit -m "feat: export IChatChannelRepository and IChatMessageRepository from ChatModule"
```

---

## Task 4: AdminGuard

**Files:**
- Create: `backend/src/common/guards/admin.guard.ts`

- [ ] **Krok 1: Napiš failing test**

Vytvoř `backend/src/common/guards/admin.guard.spec.ts`:

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UserRole } from '../../modules/users/interfaces/user.interface';

const makeContext = (role: UserRole) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u1', role } }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('should allow Superadmin (role=1)', () => {
    expect(guard.canActivate(makeContext(UserRole.Superadmin))).toBe(true);
  });

  it('should allow Admin (role=2)', () => {
    expect(guard.canActivate(makeContext(UserRole.Admin))).toBe(true);
  });

  it('should deny PJ (role=3)', () => {
    expect(() => guard.canActivate(makeContext(UserRole.PJ))).toThrow(ForbiddenException);
  });

  it('should deny Hrac (role=5)', () => {
    expect(() => guard.canActivate(makeContext(UserRole.Hrac))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Krok 2: Spusť test — ověř že selhává**

```bash
cd backend && npm run test -- --testPathPattern=admin.guard --no-coverage
```

Očekávané: FAIL — `AdminGuard` neexistuje.

- [ ] **Krok 3: Implementuj AdminGuard**

Vytvoř `backend/src/common/guards/admin.guard.ts`:

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../modules/users/interfaces/user.interface';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return true;
  }
}
```

- [ ] **Krok 4: Spusť test — ověř že prochází**

```bash
cd backend && npm run test -- --testPathPattern=admin.guard --no-coverage
```

Očekávané: PASS — 4 tests passed.

- [ ] **Krok 5: Commit**

```bash
cd backend && git add src/common/guards/admin.guard.ts src/common/guards/admin.guard.spec.ts
git commit -m "feat: add AdminGuard for admin/superadmin-only endpoints"
```

---

## Task 5: CreateGlobalMessageDto + GlobalChatService + testy

**Files:**
- Create: `backend/src/modules/global-chat/dto/create-global-message.dto.ts`
- Create: `backend/src/modules/global-chat/global-chat.service.ts`
- Create: `backend/src/modules/global-chat/global-chat.service.spec.ts`

- [ ] **Krok 1: Vytvoř CreateGlobalMessageDto**

Vytvoř `backend/src/modules/global-chat/dto/create-global-message.dto.ts`:

```typescript
import { IsString, MinLength, MaxLength, IsOptional, IsArray } from 'class-validator';

export class CreateGlobalMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  content: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  visibleTo?: string[];
}
```

- [ ] **Krok 2: Napiš failing testy pro GlobalChatService**

Vytvoř `backend/src/modules/global-chat/global-chat.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GlobalChatService } from './global-chat.service';
import type { IChatChannelRepository } from '../chat/interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import type { ChatChannel } from '../chat/interfaces/chat-channel.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockChannel: ChatChannel = {
  id: 'global-ch-id',
  name: 'Interdimenzionální hospoda',
  worldId: null,
  groupId: null,
  isGlobal: true,
  accessMode: 'all',
  allowedRoles: [],
  allowedMemberIds: [],
  order: 0,
  isDeleted: false,
  createdAt: new Date(),
};

const makeMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg1',
  channelId: 'global-ch-id',
  worldId: null,
  senderId: 'u1',
  senderName: 'gandalf',
  content: 'hello',
  isEdited: false,
  isDeleted: false,
  reactions: {},
  attachments: [],
  expiresAt: new Date(Date.now() + 3600000),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('GlobalChatService', () => {
  let service: GlobalChatService;
  let channelRepo: jest.Mocked<IChatChannelRepository>;
  let messageRepo: jest.Mocked<IChatMessageRepository>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    channelRepo = {
      findGlobal: jest.fn(),
      findById: jest.fn(),
      findByGroupId: jest.fn(),
      findByWorldId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      softDeleteByWorldId: jest.fn(),
    } as jest.Mocked<IChatChannelRepository>;

    messageRepo = {
      findById: jest.fn(),
      findByChannelId: jest.fn(),
      countAfter: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDeleteByChannelId: jest.fn(),
      softDeleteByWorldId: jest.fn(),
      addReaction: jest.fn(),
      removeReaction: jest.fn(),
    } as jest.Mocked<IChatMessageRepository>;

    eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    const module = await Test.createTestingModule({
      providers: [
        GlobalChatService,
        { provide: 'IChatChannelRepository', useValue: channelRepo },
        { provide: 'IChatMessageRepository', useValue: messageRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(GlobalChatService);
  });

  describe('onModuleInit', () => {
    it('should reuse existing global channel', async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
      expect(channelRepo.save).not.toHaveBeenCalled();
      expect(service.getGlobalChannelId()).toBe('global-ch-id');
    });

    it('should create global channel if none exists', async () => {
      channelRepo.findGlobal.mockResolvedValue(null);
      channelRepo.save.mockResolvedValue(mockChannel);
      await service.onModuleInit();
      expect(channelRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isGlobal: true, worldId: null, groupId: null }),
      );
      expect(service.getGlobalChannelId()).toBe('global-ch-id');
    });
  });

  describe('getMessages', () => {
    beforeEach(async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
    });

    it('should return all messages including deleted (frontend handles rendering)', async () => {
      const messages = [makeMsg(), makeMsg({ id: 'msg2', isDeleted: true })];
      messageRepo.findByChannelId.mockResolvedValue(messages);
      const result = await service.getMessages('u1', {});
      expect(result).toHaveLength(2);
    });

    it('should filter out whispers not visible to the user', async () => {
      const messages = [
        makeMsg({ visibleTo: ['u2', 'u3'] }),
        makeMsg({ id: 'msg2', visibleTo: ['u1', 'u2'] }),
        makeMsg({ id: 'msg3' }),
      ];
      messageRepo.findByChannelId.mockResolvedValue(messages);
      const result = await service.getMessages('u1', {});
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual(['msg2', 'msg3']);
    });

    it('should cap limit at 100', async () => {
      messageRepo.findByChannelId.mockResolvedValue([]);
      await service.getMessages('u1', { limit: 999 });
      expect(messageRepo.findByChannelId).toHaveBeenCalledWith('global-ch-id', { before: undefined, limit: 100 });
    });
  });

  describe('sendMessage', () => {
    const mockUser = { id: 'u1', role: UserRole.Hrac, username: 'gandalf' };

    beforeEach(async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
    });

    it('should save message with worldId=null, expiresAt=now+1h, senderName=username', async () => {
      const saved = makeMsg();
      messageRepo.save.mockResolvedValue(saved);
      const before = Date.now();

      await service.sendMessage({ content: 'hello' }, mockUser);

      const call = messageRepo.save.mock.calls[0][0];
      expect(call.worldId).toBeNull();
      expect(call.senderName).toBe('gandalf');
      expect(call.expiresAt).toBeInstanceOf(Date);
      expect((call.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(before + 3600000 - 100);
    });

    it('should emit chat.global.message.created event', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage({ content: 'hello' }, mockUser);
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.global.message.created', expect.objectContaining({
        channelId: 'global-ch-id',
      }));
    });

    it('should normalize visibleTo to always include sender', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage({ content: 'šeptám', visibleTo: ['u2'] }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.visibleTo).toEqual(['u1', 'u2']);
    });

    it('should not duplicate sender in visibleTo', async () => {
      messageRepo.save.mockResolvedValue(makeMsg());
      await service.sendMessage({ content: 'šeptám', visibleTo: ['u1', 'u2'] }, mockUser);
      const call = messageRepo.save.mock.calls[0][0];
      expect(call.visibleTo).toEqual(['u1', 'u2']);
    });
  });

  describe('deleteMessage', () => {
    beforeEach(async () => {
      channelRepo.findGlobal.mockResolvedValue(mockChannel);
      await service.onModuleInit();
    });

    it('should soft delete and emit event', async () => {
      messageRepo.findById.mockResolvedValue(makeMsg());
      messageRepo.update.mockResolvedValue(makeMsg({ isDeleted: true, content: null }));
      await service.deleteMessage('msg1');
      expect(messageRepo.update).toHaveBeenCalledWith('msg1', { isDeleted: true, content: null });
      expect(eventEmitter.emit).toHaveBeenCalledWith('chat.global.message.deleted', expect.any(Object));
    });

    it('should throw NotFoundException for unknown message', async () => {
      messageRepo.findById.mockResolvedValue(null);
      await expect(service.deleteMessage('unknown')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if message belongs to different channel', async () => {
      messageRepo.findById.mockResolvedValue(makeMsg({ channelId: 'other-channel' }));
      await expect(service.deleteMessage('msg1')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Krok 3: Spusť testy — ověř že selhávají**

```bash
cd backend && npm run test -- --testPathPattern=global-chat.service --no-coverage
```

Očekávané: FAIL — `GlobalChatService` neexistuje.

- [ ] **Krok 4: Implementuj GlobalChatService**

Vytvoř `backend/src/modules/global-chat/global-chat.service.ts`:

```typescript
import { Injectable, Inject, NotFoundException, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IChatChannelRepository } from '../chat/interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from '../chat/interfaces/chat-message-repository.interface';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import type { RequestUser } from '../worlds/worlds.service';
import type { CreateGlobalMessageDto } from './dto/create-global-message.dto';

@Injectable()
export class GlobalChatService implements OnModuleInit {
  private globalChannelId: string;

  constructor(
    @Inject('IChatChannelRepository') private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository') private readonly messageRepo: IChatMessageRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    let channel = await this.channelRepo.findGlobal();
    if (!channel) {
      channel = await this.channelRepo.save({
        name: 'Interdimenzionální hospoda',
        worldId: null,
        groupId: null,
        isGlobal: true,
        accessMode: 'all',
        allowedRoles: [],
        allowedMemberIds: [],
        order: 0,
        isDeleted: false,
      });
    }
    this.globalChannelId = channel.id;
  }

  getGlobalChannelId(): string {
    return this.globalChannelId;
  }

  async getMessages(userId: string, opts: { before?: string; limit?: number }): Promise<ChatMessage[]> {
    const limit = Math.min(opts.limit && opts.limit > 0 ? opts.limit : 50, 100);
    const messages = await this.messageRepo.findByChannelId(this.globalChannelId, {
      before: opts.before,
      limit,
    });
    return messages.filter((m) => {
      if (!m.visibleTo || m.visibleTo.length === 0) return true;
      return m.visibleTo.includes(userId);
    });
  }

  async sendMessage(dto: CreateGlobalMessageDto, user: RequestUser): Promise<ChatMessage> {
    let visibleTo: string[] | undefined;
    if (dto.visibleTo && dto.visibleTo.length > 0) {
      const recipients = dto.visibleTo.filter((id) => id !== user.id);
      visibleTo = [user.id, ...recipients];
    }

    const message = await this.messageRepo.save({
      channelId: this.globalChannelId,
      worldId: null,
      senderId: user.id,
      senderName: user.username,
      content: dto.content,
      isEdited: false,
      isDeleted: false,
      reactions: {},
      attachments: [],
      visibleTo,
      expiresAt: new Date(Date.now() + 3600000),
    });

    this.eventEmitter.emit('chat.global.message.created', { channelId: this.globalChannelId, message });
    return message;
  }

  async deleteMessage(messageId: string): Promise<void> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.channelId !== this.globalChannelId) {
      throw new NotFoundException('Zpráva nenalezena');
    }
    await this.messageRepo.update(messageId, { isDeleted: true, content: null });
    this.eventEmitter.emit('chat.global.message.deleted', { channelId: this.globalChannelId, messageId });
  }
}
```

- [ ] **Krok 5: Spusť testy — ověř že prochází**

```bash
cd backend && npm run test -- --testPathPattern=global-chat.service --no-coverage
```

Očekávané: PASS — 13 tests passed.

- [ ] **Krok 6: Commit**

```bash
cd backend && git add src/modules/global-chat/
git commit -m "feat: add GlobalChatService with seeder, getMessages, sendMessage, deleteMessage"
```

---

## Task 6: GlobalChatController

**Files:**
- Create: `backend/src/modules/global-chat/global-chat.controller.ts`

- [ ] **Krok 1: Implementuj GlobalChatController**

Vytvoř `backend/src/modules/global-chat/global-chat.controller.ts`:

```typescript
import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { GlobalChatService } from './global-chat.service';
import { CreateGlobalMessageDto } from './dto/create-global-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';

@Controller('global-chat')
@UseGuards(JwtAuthGuard)
export class GlobalChatController {
  constructor(private readonly globalChatService: GlobalChatService) {}

  @Get('messages')
  getMessages(
    @CurrentUser() user: RequestUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.globalChatService.getMessages(user.id, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('messages')
  sendMessage(
    @Body() dto: CreateGlobalMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.globalChatService.sendMessage(dto, user);
  }

  @Delete('messages/:messageId')
  @UseGuards(AdminGuard)
  deleteMessage(@Param('messageId') messageId: string) {
    return this.globalChatService.deleteMessage(messageId);
  }
}
```

- [ ] **Krok 2: Spusť TypeScript kontrolu**

```bash
cd backend && npx tsc --noEmit
```

Očekávané: žádné chyby.

- [ ] **Krok 3: Commit**

```bash
cd backend && git add src/modules/global-chat/global-chat.controller.ts
git commit -m "feat: add GlobalChatController (GET/POST/DELETE /api/global-chat/messages)"
```

---

## Task 7: GlobalChatGateway

**Files:**
- Create: `backend/src/modules/global-chat/global-chat.gateway.ts`

- [ ] **Krok 1: Implementuj GlobalChatGateway**

Vytvoř `backend/src/modules/global-chat/global-chat.gateway.ts`:

```typescript
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import type { ChatMessage } from '../chat/interfaces/chat-message.interface';
import { GlobalChatService } from './global-chat.service';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class GlobalChatGateway {
  @WebSocketServer() server: Server;

  constructor(private readonly globalChatService: GlobalChatService) {}

  @SubscribeMessage('chat:hospoda:join')
  handleHospodaJoin(
    @MessageBody() payload: { username: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;
    client.to(`chat:${channelId}`).emit('chat:presence', {
      username: payload.username,
      action: 'join',
    });
  }

  @SubscribeMessage('chat:hospoda:leave')
  handleHospodaLeave(
    @MessageBody() payload: { username: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const channelId = this.globalChatService.getGlobalChannelId();
    if (!channelId) return;
    client.to(`chat:${channelId}`).emit('chat:presence', {
      username: payload.username,
      action: 'leave',
    });
  }

  @OnEvent('chat.global.message.created')
  handleGlobalMessageCreated(payload: { channelId: string; message: ChatMessage }): void {
    if (payload.message.visibleTo && payload.message.visibleTo.length > 0) {
      for (const userId of payload.message.visibleTo) {
        this.server.to(`user:${userId}`).emit('chat:message', payload.message);
      }
    } else {
      this.server.to(`chat:${payload.channelId}`).emit('chat:message', payload.message);
    }
  }

  @OnEvent('chat.global.message.deleted')
  handleGlobalMessageDeleted(payload: { channelId: string; messageId: string }): void {
    this.server
      .to(`chat:${payload.channelId}`)
      .emit('chat:message:deleted', { messageId: payload.messageId, channelId: payload.channelId });
  }
}
```

- [ ] **Krok 2: Spusť TypeScript kontrolu**

```bash
cd backend && npx tsc --noEmit
```

Očekávané: žádné chyby.

- [ ] **Krok 3: Commit**

```bash
cd backend && git add src/modules/global-chat/global-chat.gateway.ts
git commit -m "feat: add GlobalChatGateway (presence events + message broadcast)"
```

---

## Task 8: GlobalChatModule + app.module.ts — zapojení

**Files:**
- Create: `backend/src/modules/global-chat/global-chat.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Krok 1: Vytvoř GlobalChatModule**

Vytvoř `backend/src/modules/global-chat/global-chat.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { GlobalChatService } from './global-chat.service';
import { GlobalChatController } from './global-chat.controller';
import { GlobalChatGateway } from './global-chat.gateway';

@Module({
  imports: [ChatModule],
  controllers: [GlobalChatController],
  providers: [GlobalChatService, GlobalChatGateway],
})
export class GlobalChatModule {}
```

- [ ] **Krok 2: Přidej GlobalChatModule do AppModule**

V `backend/src/app.module.ts` přidej import:

```typescript
import { GlobalChatModule } from './modules/global-chat/global-chat.module';
```

A do `imports` pole:

```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  EventEmitterModule.forRoot(),
  DatabaseModule,
  AuthModule,
  WorldsModule,
  ChatModule,
  UploadModule,
  GlobalChatModule,
  GatewaysModule,
],
```

- [ ] **Krok 3: Spusť TypeScript kontrolu**

```bash
cd backend && npx tsc --noEmit
```

Očekávané: žádné chyby.

- [ ] **Krok 4: Spusť všechny testy**

```bash
cd backend && npm run test -- --no-coverage
```

Očekávané: PASS — všechny existující testy + admin.guard + global-chat.service prochází.

- [ ] **Krok 5: Commit**

```bash
cd backend && git add src/modules/global-chat/global-chat.module.ts src/app.module.ts
git commit -m "feat: wire up GlobalChatModule — interdimenzionální hospoda complete"
```

---

## Poznámky pro implementátora

- **TTL index**: MongoDB aplikuje TTL index asynchronně (obvykle do 60 sekund). Zprávy se nemusí smazat přesně po 1 hodině — to je OK.
- **Presence payload**: `chat:hospoda:join/leave` přijímá `{ username }` od klienta. Jde o zobrazovací info bez bezpečnostních dopadů (OOC chat).
- **`globalChannelId` při startu**: NestJS zavolá `onModuleInit` před přijetím prvního requestu — race condition nehrozí.
- **`findByChannelId` vrací i `isDeleted: true` zprávy** — stejné chování jako normální chat. Frontend je zobrazí jako smazané.
- **Existující testy**: `worldId: string` → `worldId: string | null` může způsobit TypeScript chyby v `chat.service.ts` (uses `channel.worldId` as string in `canManageChat`, `hasChannelAccess`). Zkontroluj a přidej null guard pokud tsc hlásí chybu.
