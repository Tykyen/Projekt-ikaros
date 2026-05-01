# Krok 3a — Chat Core: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat základní chat infrastrukturu — skupiny kanálů, kanály s řízením přístupu, textové zprávy, real-time WebSocket broadcast a sledování nepřečtených zpráv v rámci světů.

**Architecture:** Repository pattern identický s worlds modulem (Interface → Schema → Repository → Service → Controller → Gateway). Service emituje EventEmitter2 eventy, ChatGateway broadcastuje přes Socket.IO rooms. Při vytvoření světa se auto-vytvoří 2 skupiny a 2 kanály.

**Tech Stack:** NestJS 11, TypeScript 5, Mongoose 9, Socket.IO, EventEmitter2, class-validator, Jest

---

## Kontext pro implementátora

Projekt je NestJS 11 backend. Vzorový modul je `backend/src/modules/worlds/`. Každý modul má:
- `interfaces/` — TypeScript interfacy (domain objekty + repository interfacy)
- `schemas/` — Mongoose schémata
- `repositories/` — implementace repositorií rozšiřující `BaseMongoRepository<T>`
- `dto/` — class-validator DTO třídy
- `*.service.ts` — business logika, injectuje repository přes `@Inject('IXyzRepository')`
- `*.controller.ts` — REST API endpointy
- `*.gateway.ts` — WebSocket event handlery (přes `@OnEvent`)
- `*.module.ts` — registrace všeho

`RequestUser` interface (`{ id: string; role: UserRole }`) je exportován z `worlds.service.ts`.
`WorldRole` enum je v `modules/worlds/interfaces/world-membership.interface.ts`.
`UserRole` enum je v `modules/users/interfaces/user.interface.ts`.
`BaseMongoRepository<T>` je v `database/mongo/base-mongo.repository.ts`.

Všechny testy používají Jest + `@nestjs/testing`. Vzor testů viz `worlds.service.spec.ts`.

---

## Mapa souborů

**Vytvořit:**
```
backend/src/modules/chat/
├── chat.module.ts
├── chat.controller.ts
├── chat.service.ts
├── chat.gateway.ts
├── chat.service.spec.ts
├── interfaces/
│   ├── chat-group.interface.ts
│   ├── chat-channel.interface.ts
│   ├── chat-message.interface.ts
│   ├── channel-read-status.interface.ts
│   ├── chat-group-repository.interface.ts
│   ├── chat-channel-repository.interface.ts
│   ├── chat-message-repository.interface.ts
│   └── channel-read-status-repository.interface.ts
├── schemas/
│   ├── chat-group.schema.ts
│   ├── chat-channel.schema.ts
│   ├── chat-message.schema.ts
│   └── channel-read-status.schema.ts
├── repositories/
│   ├── chat-group.repository.ts
│   ├── chat-channel.repository.ts
│   ├── chat-message.repository.ts
│   └── channel-read-status.repository.ts
└── dto/
    ├── create-group.dto.ts
    ├── update-group.dto.ts
    ├── create-channel.dto.ts
    ├── update-channel.dto.ts
    ├── create-message.dto.ts
    └── update-message.dto.ts
```

**Upravit:**
```
backend/src/app.module.ts   — přidat ChatModule do imports
```

---

## Task 1: Domain interfacy a repository interfacy

**Files:**
- Create: `backend/src/modules/chat/interfaces/chat-group.interface.ts`
- Create: `backend/src/modules/chat/interfaces/chat-channel.interface.ts`
- Create: `backend/src/modules/chat/interfaces/chat-message.interface.ts`
- Create: `backend/src/modules/chat/interfaces/channel-read-status.interface.ts`
- Create: `backend/src/modules/chat/interfaces/chat-group-repository.interface.ts`
- Create: `backend/src/modules/chat/interfaces/chat-channel-repository.interface.ts`
- Create: `backend/src/modules/chat/interfaces/chat-message-repository.interface.ts`
- Create: `backend/src/modules/chat/interfaces/channel-read-status-repository.interface.ts`

- [ ] **Step 1: Vytvořit domain interfacy**

```typescript
// backend/src/modules/chat/interfaces/chat-group.interface.ts
export interface ChatGroup {
  id: string;
  worldId: string;
  name: string;
  order: number;
  createdAt: Date;
}
```

```typescript
// backend/src/modules/chat/interfaces/chat-channel.interface.ts
import type { WorldRole } from '../../worlds/interfaces/world-membership.interface';

export interface ChatChannel {
  id: string;
  groupId: string;
  worldId: string;
  name: string;
  accessMode: 'all' | 'roles' | 'members';
  allowedRoles: WorldRole[];
  allowedMemberIds: string[];
  lastMessageAt?: Date;
  order: number;
  isDeleted: boolean;
  createdAt: Date;
}
```

```typescript
// backend/src/modules/chat/interfaces/chat-message.interface.ts
export interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string;
  senderId: string;
  senderName: string;
  content: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

```typescript
// backend/src/modules/chat/interfaces/channel-read-status.interface.ts
export interface ChannelReadStatus {
  id: string;
  userId: string;
  channelId: string;
  lastReadMessageId: string;
  lastReadAt: Date;
}
```

- [ ] **Step 2: Vytvořit repository interfacy**

```typescript
// backend/src/modules/chat/interfaces/chat-group-repository.interface.ts
import type { ChatGroup } from './chat-group.interface';

export interface IChatGroupRepository {
  findById(id: string): Promise<ChatGroup | null>;
  findByWorldId(worldId: string): Promise<ChatGroup[]>;
  countByWorldId(worldId: string): Promise<number>;
  save(data: Partial<ChatGroup>): Promise<ChatGroup>;
  update(id: string, data: Partial<ChatGroup>): Promise<ChatGroup | null>;
  delete(id: string): Promise<boolean>;
}
```

```typescript
// backend/src/modules/chat/interfaces/chat-channel-repository.interface.ts
import type { ChatChannel } from './chat-channel.interface';

export interface IChatChannelRepository {
  findById(id: string): Promise<ChatChannel | null>;
  findByGroupId(groupId: string): Promise<ChatChannel[]>;
  findByWorldId(worldId: string): Promise<ChatChannel[]>;
  save(data: Partial<ChatChannel>): Promise<ChatChannel>;
  update(id: string, data: Partial<ChatChannel>): Promise<ChatChannel | null>;
  delete(id: string): Promise<boolean>;
  softDeleteByWorldId(worldId: string): Promise<void>;
}
```

```typescript
// backend/src/modules/chat/interfaces/chat-message-repository.interface.ts
import type { ChatMessage } from './chat-message.interface';

export interface IChatMessageRepository {
  findById(id: string): Promise<ChatMessage | null>;
  findByChannelId(channelId: string, opts: { before?: string; limit: number }): Promise<ChatMessage[]>;
  countAfter(channelId: string, messageId: string): Promise<number>;
  save(data: Partial<ChatMessage>): Promise<ChatMessage>;
  update(id: string, data: Partial<ChatMessage>): Promise<ChatMessage | null>;
  softDeleteByWorldId(worldId: string): Promise<void>;
}
```

```typescript
// backend/src/modules/chat/interfaces/channel-read-status-repository.interface.ts
import type { ChannelReadStatus } from './channel-read-status.interface';

export interface IChannelReadStatusRepository {
  findByUserAndChannel(userId: string, channelId: string): Promise<ChannelReadStatus | null>;
  findByUserAndChannels(userId: string, channelIds: string[]): Promise<ChannelReadStatus[]>;
  upsert(userId: string, channelId: string, lastReadMessageId: string): Promise<ChannelReadStatus>;
}
```

- [ ] **Step 3: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/chat/interfaces/
git commit -m "feat(chat): add domain and repository interfaces"
```

---

## Task 2: Mongoose schémata

**Files:**
- Create: `backend/src/modules/chat/schemas/chat-group.schema.ts`
- Create: `backend/src/modules/chat/schemas/chat-channel.schema.ts`
- Create: `backend/src/modules/chat/schemas/chat-message.schema.ts`
- Create: `backend/src/modules/chat/schemas/channel-read-status.schema.ts`

- [ ] **Step 1: ChatGroup schema**

```typescript
// backend/src/modules/chat/schemas/chat-group.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatGroupDocument = HydratedDocument<ChatGroupSchemaClass>;

@Schema({ timestamps: true, collection: 'chatgroups' })
export class ChatGroupSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: 0 }) order: number;
}

export const ChatGroupSchema = SchemaFactory.createForClass(ChatGroupSchemaClass);
ChatGroupSchema.index({ worldId: 1, order: 1 });
```

- [ ] **Step 2: ChatChannel schema**

```typescript
// backend/src/modules/chat/schemas/chat-channel.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatChannelDocument = HydratedDocument<ChatChannelSchemaClass>;

@Schema({ timestamps: true, collection: 'chatchannels' })
export class ChatChannelSchemaClass {
  @Prop({ required: true }) groupId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) name: string;
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
```

- [ ] **Step 3: ChatMessage schema**

```typescript
// backend/src/modules/chat/schemas/chat-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatMessageDocument = HydratedDocument<ChatMessageSchemaClass>;

@Schema({ timestamps: true, collection: 'chatmessages' })
export class ChatMessageSchemaClass {
  @Prop({ required: true }) channelId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) senderId: string;
  @Prop({ required: true }) senderName: string;
  @Prop({ type: String, default: null }) content: string | null;
  @Prop({ default: false }) isEdited: boolean;
  @Prop({ default: false }) isDeleted: boolean;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageSchemaClass);
ChatMessageSchema.index({ channelId: 1, createdAt: -1 });
ChatMessageSchema.index({ worldId: 1 });
ChatMessageSchema.index({ senderId: 1 });
```

- [ ] **Step 4: ChannelReadStatus schema**

```typescript
// backend/src/modules/chat/schemas/channel-read-status.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChannelReadStatusDocument = HydratedDocument<ChannelReadStatusSchemaClass>;

@Schema({ collection: 'channelreadstatus' })
export class ChannelReadStatusSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) channelId: string;
  @Prop({ required: true }) lastReadMessageId: string;
  @Prop({ required: true }) lastReadAt: Date;
}

export const ChannelReadStatusSchema = SchemaFactory.createForClass(ChannelReadStatusSchemaClass);
ChannelReadStatusSchema.index({ userId: 1, channelId: 1 }, { unique: true });
```

- [ ] **Step 5: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/chat/schemas/
git commit -m "feat(chat): add mongoose schemas"
```

---

## Task 3: Repository implementace

**Files:**
- Create: `backend/src/modules/chat/repositories/chat-group.repository.ts`
- Create: `backend/src/modules/chat/repositories/chat-channel.repository.ts`
- Create: `backend/src/modules/chat/repositories/chat-message.repository.ts`
- Create: `backend/src/modules/chat/repositories/channel-read-status.repository.ts`

- [ ] **Step 1: ChatGroup repository**

```typescript
// backend/src/modules/chat/repositories/chat-group.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatGroupSchemaClass } from '../schemas/chat-group.schema';
import { ChatGroup } from '../interfaces/chat-group.interface';
import type { IChatGroupRepository } from '../interfaces/chat-group-repository.interface';

@Injectable()
export class MongoChatGroupRepository
  extends BaseMongoRepository<ChatGroup>
  implements IChatGroupRepository
{
  constructor(@InjectModel(ChatGroupSchemaClass.name) model: Model<ChatGroupSchemaClass>) {
    super(model as never);
  }

  async findByWorldId(worldId: string): Promise<ChatGroup[]> {
    const docs = await this.model.find({ worldId }).sort({ order: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async countByWorldId(worldId: string): Promise<number> {
    return this.model.countDocuments({ worldId }).exec();
  }

  protected toEntity(doc: Record<string, unknown>): ChatGroup {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: doc.name as string,
      order: (doc.order as number) ?? 0,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 2: ChatChannel repository**

```typescript
// backend/src/modules/chat/repositories/chat-channel.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatChannelSchemaClass } from '../schemas/chat-channel.schema';
import { ChatChannel } from '../interfaces/chat-channel.interface';
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
      groupId: doc.groupId as string,
      worldId: doc.worldId as string,
      name: doc.name as string,
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

- [ ] **Step 3: ChatMessage repository**

```typescript
// backend/src/modules/chat/repositories/chat-message.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatMessageSchemaClass } from '../schemas/chat-message.schema';
import { ChatMessage } from '../interfaces/chat-message.interface';
import type { IChatMessageRepository } from '../interfaces/chat-message-repository.interface';

@Injectable()
export class MongoChatMessageRepository
  extends BaseMongoRepository<ChatMessage>
  implements IChatMessageRepository
{
  constructor(@InjectModel(ChatMessageSchemaClass.name) model: Model<ChatMessageSchemaClass>) {
    super(model as never);
  }

  async findByChannelId(
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<ChatMessage[]> {
    const filter: Record<string, unknown> = { channelId };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter._id = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>)).reverse();
  }

  async countAfter(channelId: string, messageId: string): Promise<number> {
    if (!Types.ObjectId.isValid(messageId)) return 0;
    return this.model
      .countDocuments({ channelId, _id: { $gt: new Types.ObjectId(messageId) } })
      .exec();
  }

  async softDeleteByWorldId(worldId: string): Promise<void> {
    await this.model
      .updateMany({ worldId }, { $set: { isDeleted: true, content: null } })
      .exec();
  }

  protected toEntity(doc: Record<string, unknown>): ChatMessage {
    return {
      id: String(doc._id),
      channelId: doc.channelId as string,
      worldId: doc.worldId as string,
      senderId: doc.senderId as string,
      senderName: doc.senderName as string,
      content: doc.content as string | null,
      isEdited: (doc.isEdited as boolean) ?? false,
      isDeleted: (doc.isDeleted as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 4: ChannelReadStatus repository**

```typescript
// backend/src/modules/chat/repositories/channel-read-status.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChannelReadStatusSchemaClass } from '../schemas/channel-read-status.schema';
import { ChannelReadStatus } from '../interfaces/channel-read-status.interface';
import type { IChannelReadStatusRepository } from '../interfaces/channel-read-status-repository.interface';

@Injectable()
export class MongoChannelReadStatusRepository implements IChannelReadStatusRepository {
  constructor(
    @InjectModel(ChannelReadStatusSchemaClass.name)
    private readonly model: Model<ChannelReadStatusSchemaClass>,
  ) {}

  async findByUserAndChannel(userId: string, channelId: string): Promise<ChannelReadStatus | null> {
    const doc = await this.model.findOne({ userId, channelId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByUserAndChannels(userId: string, channelIds: string[]): Promise<ChannelReadStatus[]> {
    const docs = await this.model.find({ userId, channelId: { $in: channelIds } }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async upsert(userId: string, channelId: string, lastReadMessageId: string): Promise<ChannelReadStatus> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId, channelId },
        { $set: { lastReadMessageId, lastReadAt: new Date() } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): ChannelReadStatus {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      channelId: doc.channelId as string,
      lastReadMessageId: doc.lastReadMessageId as string,
      lastReadAt: doc.lastReadAt as Date,
    };
  }
}
```

- [ ] **Step 5: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/chat/repositories/
git commit -m "feat(chat): add repository implementations"
```

---

## Task 4: DTOs

**Files:**
- Create: `backend/src/modules/chat/dto/create-group.dto.ts`
- Create: `backend/src/modules/chat/dto/update-group.dto.ts`
- Create: `backend/src/modules/chat/dto/create-channel.dto.ts`
- Create: `backend/src/modules/chat/dto/update-channel.dto.ts`
- Create: `backend/src/modules/chat/dto/create-message.dto.ts`
- Create: `backend/src/modules/chat/dto/update-message.dto.ts`

- [ ] **Step 1: Group DTOs**

```typescript
// backend/src/modules/chat/dto/create-group.dto.ts
import { IsString, MinLength, MaxLength, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateGroupDto {
  @IsString() @MinLength(1) @MaxLength(64) name: string;
  @IsOptional() @IsNumber() @Min(0) order?: number;
}
```

```typescript
// backend/src/modules/chat/dto/update-group.dto.ts
import { IsString, MinLength, MaxLength, IsOptional, IsNumber, Min } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) name?: string;
  @IsOptional() @IsNumber() @Min(0) order?: number;
}
```

- [ ] **Step 2: Channel DTOs**

```typescript
// backend/src/modules/chat/dto/create-channel.dto.ts
import { IsString, MinLength, MaxLength, IsOptional, IsIn, IsArray, IsNumber, Min } from 'class-validator';

export class CreateChannelDto {
  @IsString() @MinLength(1) @MaxLength(64) name: string;
  @IsOptional() @IsIn(['all', 'roles', 'members']) accessMode?: 'all' | 'roles' | 'members';
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) allowedRoles?: number[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedMemberIds?: string[];
  @IsOptional() @IsNumber() @Min(0) order?: number;
}
```

```typescript
// backend/src/modules/chat/dto/update-channel.dto.ts
import { IsString, MinLength, MaxLength, IsOptional, IsIn, IsArray, IsNumber, Min } from 'class-validator';

export class UpdateChannelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) name?: string;
  @IsOptional() @IsIn(['all', 'roles', 'members']) accessMode?: 'all' | 'roles' | 'members';
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) allowedRoles?: number[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedMemberIds?: string[];
  @IsOptional() @IsNumber() @Min(0) order?: number;
}
```

- [ ] **Step 3: Message DTOs**

```typescript
// backend/src/modules/chat/dto/create-message.dto.ts
import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content: string;
}
```

```typescript
// backend/src/modules/chat/dto/update-message.dto.ts
import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content: string;
}
```

- [ ] **Step 4: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/chat/dto/
git commit -m "feat(chat): add DTOs"
```

---

## Task 5: ChatService — skupiny a kanály

**Files:**
- Create: `backend/src/modules/chat/chat.service.ts`
- Create: `backend/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 1: Napsat failing testy pro skupiny**

```typescript
// backend/src/modules/chat/chat.service.spec.ts
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChatService } from './chat.service';
import { UserRole } from '../users/interfaces/user.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockPJ: { id: string; role: UserRole } = { id: 'user1', role: UserRole.Hrac };
const mockAdmin: { id: string; role: UserRole } = { id: 'admin1', role: UserRole.Admin };

const mockGroup = { id: 'group1', worldId: 'world1', name: 'Globální', order: 0, createdAt: new Date() };
const mockChannel = {
  id: 'ch1', groupId: 'group1', worldId: 'world1', name: 'obecný',
  accessMode: 'all' as const, allowedRoles: [], allowedMemberIds: [],
  order: 0, isDeleted: false, createdAt: new Date(),
};
const mockPJMembership = { id: 'm1', userId: 'user1', worldId: 'world1', role: WorldRole.PJ, joinedAt: new Date(), akj: 0 };
const mockHracMembership = { id: 'm2', userId: 'user2', worldId: 'world1', role: WorldRole.Hrac, joinedAt: new Date(), akj: 0 };

describe('ChatService', () => {
  let service: ChatService;
  const mockGroupRepo = {
    findById: jest.fn(), findByWorldId: jest.fn(), countByWorldId: jest.fn(),
    save: jest.fn(), update: jest.fn(), delete: jest.fn(),
  };
  const mockChannelRepo = {
    findById: jest.fn(), findByGroupId: jest.fn(), findByWorldId: jest.fn(),
    save: jest.fn(), update: jest.fn(), delete: jest.fn(), softDeleteByWorldId: jest.fn(),
  };
  const mockMessageRepo = {
    findById: jest.fn(), findByChannelId: jest.fn(), countAfter: jest.fn(),
    save: jest.fn(), update: jest.fn(), softDeleteByWorldId: jest.fn(),
  };
  const mockReadRepo = {
    findByUserAndChannel: jest.fn(), findByUserAndChannels: jest.fn(), upsert: jest.fn(),
  };
  const mockMembershipRepo = {
    findByUserAndWorld: jest.fn(), findByWorldId: jest.fn(),
    findByUserId: jest.fn(), findById: jest.fn(), countByWorldId: jest.fn(),
    save: jest.fn(), update: jest.fn(), delete: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: 'IChatGroupRepository', useValue: mockGroupRepo },
        { provide: 'IChatChannelRepository', useValue: mockChannelRepo },
        { provide: 'IChatMessageRepository', useValue: mockMessageRepo },
        { provide: 'IChannelReadStatusRepository', useValue: mockReadRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    it('should allow PJ to create group', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockGroupRepo.countByWorldId.mockResolvedValue(2);
      mockGroupRepo.save.mockResolvedValue({ ...mockGroup, name: 'Nová' });
      const result = await service.createGroup('world1', { name: 'Nová' }, mockPJ);
      expect(result.name).toBe('Nová');
    });

    it('should throw ForbiddenException for Hrac', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      await expect(service.createGroup('world1', { name: 'X' }, { id: 'user2', role: UserRole.Hrac }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should allow Admin regardless of membership', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      mockGroupRepo.countByWorldId.mockResolvedValue(0);
      mockGroupRepo.save.mockResolvedValue(mockGroup);
      const result = await service.createGroup('world1', { name: 'G' }, mockAdmin);
      expect(result).toBeDefined();
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and its channels', async () => {
      mockGroupRepo.findById.mockResolvedValue(mockGroup);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      mockChannelRepo.findByGroupId.mockResolvedValue([mockChannel]);
      mockChannelRepo.delete.mockResolvedValue(true);
      mockGroupRepo.delete.mockResolvedValue(true);
      await service.deleteGroup('group1', mockPJ);
      expect(mockChannelRepo.delete).toHaveBeenCalledWith('ch1');
      expect(mockGroupRepo.delete).toHaveBeenCalledWith('group1');
    });

    it('should throw NotFoundException for unknown group', async () => {
      mockGroupRepo.findById.mockResolvedValue(null);
      await expect(service.deleteGroup('unknown', mockPJ)).rejects.toThrow(NotFoundException);
    });
  });

  describe('hasChannelAccess', () => {
    it('returns true for accessMode=all when member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
      const result = await service.hasChannelAccess(mockChannel, 'user2');
      expect(result).toBe(true);
    });

    it('returns false for accessMode=all when not member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      const result = await service.hasChannelAccess(mockChannel, 'stranger');
      expect(result).toBe(false);
    });

    it('returns false for accessMode=all when Pending', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockHracMembership, role: WorldRole.Pending });
      const result = await service.hasChannelAccess(mockChannel, 'user2');
      expect(result).toBe(false);
    });

    it('returns true for accessMode=roles when role matches', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
      const roleChannel = { ...mockChannel, accessMode: 'roles' as const, allowedRoles: [WorldRole.PJ] };
      const result = await service.hasChannelAccess(roleChannel, 'user1');
      expect(result).toBe(true);
    });

    it('returns true for accessMode=members when userId in list', async () => {
      const membersChannel = { ...mockChannel, accessMode: 'members' as const, allowedMemberIds: ['user2'] };
      const result = await service.hasChannelAccess(membersChannel, 'user2');
      expect(result).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Spustit testy — ověřit RED**

```bash
cd backend && npx jest chat.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — ChatService not found

- [ ] **Step 3: Implementovat ChatService skeleton + skupiny + kanály**

```typescript
// backend/src/modules/chat/chat.service.ts
import {
  Injectable, Inject, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { IChatGroupRepository } from './interfaces/chat-group-repository.interface';
import type { IChatChannelRepository } from './interfaces/chat-channel-repository.interface';
import type { IChatMessageRepository } from './interfaces/chat-message-repository.interface';
import type { IChannelReadStatusRepository } from './interfaces/channel-read-status-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import type { ChatGroup } from './interfaces/chat-group.interface';
import type { ChatChannel } from './interfaces/chat-channel.interface';
import type { ChatMessage } from './interfaces/chat-message.interface';
import type { RequestUser } from '../worlds/worlds.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';
import type { CreateChannelDto } from './dto/create-channel.dto';
import type { UpdateChannelDto } from './dto/update-channel.dto';
import type { CreateMessageDto } from './dto/create-message.dto';
import type { UpdateMessageDto } from './dto/update-message.dto';
import type { World } from '../worlds/interfaces/world.interface';

@Injectable()
export class ChatService {
  constructor(
    @Inject('IChatGroupRepository') private readonly groupRepo: IChatGroupRepository,
    @Inject('IChatChannelRepository') private readonly channelRepo: IChatChannelRepository,
    @Inject('IChatMessageRepository') private readonly messageRepo: IChatMessageRepository,
    @Inject('IChannelReadStatusRepository') private readonly readRepo: IChannelReadStatusRepository,
    @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Permission helpers ───────────────────────────────────────────────────

  private async canManageChat(requester: RequestUser, worldId: string): Promise<boolean> {
    if (requester.role <= UserRole.Admin) return true;
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
    if (!membership) return false;
    return membership.role >= WorldRole.PomocnyPJ;
  }

  async hasChannelAccess(channel: ChatChannel, userId: string): Promise<boolean> {
    if (channel.accessMode === 'members') {
      return channel.allowedMemberIds.includes(userId);
    }
    const membership = await this.membershipRepo.findByUserAndWorld(userId, channel.worldId);
    if (!membership || membership.role === WorldRole.Pending) return false;
    if (channel.accessMode === 'all') return true;
    return channel.allowedRoles.includes(membership.role);
  }

  // ─── Groups ───────────────────────────────────────────────────────────────

  async getGroupsWithChannels(worldId: string): Promise<{ group: ChatGroup; channels: ChatChannel[] }[]> {
    const groups = await this.groupRepo.findByWorldId(worldId);
    const channels = await this.channelRepo.findByWorldId(worldId);
    return groups.map((group) => ({
      group,
      channels: channels.filter((c) => c.groupId === group.id),
    }));
  }

  async createGroup(worldId: string, dto: CreateGroupDto, requester: RequestUser): Promise<ChatGroup> {
    if (!(await this.canManageChat(requester, worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const count = await this.groupRepo.countByWorldId(worldId);
    const group = await this.groupRepo.save({
      worldId,
      name: dto.name,
      order: dto.order ?? count,
    });
    this.eventEmitter.emit('chat.group.created', { worldId, group });
    return group;
  }

  async updateGroup(groupId: string, dto: UpdateGroupDto, requester: RequestUser): Promise<ChatGroup> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new NotFoundException('Skupina nenalezena');
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const updated = await this.groupRepo.update(groupId, dto);
    if (!updated) throw new NotFoundException('Skupina nenalezena');
    this.eventEmitter.emit('chat.group.updated', { worldId: group.worldId, group: updated });
    return updated;
  }

  async deleteGroup(groupId: string, requester: RequestUser): Promise<{ message: string }> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new NotFoundException('Skupina nenalezena');
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const channels = await this.channelRepo.findByGroupId(groupId);
    for (const ch of channels) {
      await this.channelRepo.delete(ch.id);
    }
    await this.groupRepo.delete(groupId);
    this.eventEmitter.emit('chat.group.deleted', { worldId: group.worldId, groupId });
    return { message: 'Skupina smazána' };
  }

  // ─── Channels ─────────────────────────────────────────────────────────────

  async createChannel(groupId: string, dto: CreateChannelDto, requester: RequestUser): Promise<ChatChannel> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new NotFoundException('Skupina nenalezena');
    if (!(await this.canManageChat(requester, group.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const existing = await this.channelRepo.findByGroupId(groupId);
    const channel = await this.channelRepo.save({
      groupId,
      worldId: group.worldId,
      name: dto.name,
      accessMode: dto.accessMode ?? 'all',
      allowedRoles: dto.allowedRoles ?? [],
      allowedMemberIds: dto.allowedMemberIds ?? [],
      order: dto.order ?? existing.length,
      isDeleted: false,
    });
    this.eventEmitter.emit('chat.channel.created', { worldId: group.worldId, channel });
    return channel;
  }

  async updateChannel(channelId: string, dto: UpdateChannelDto, requester: RequestUser): Promise<ChatChannel> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.canManageChat(requester, channel.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const updated = await this.channelRepo.update(channelId, dto);
    if (!updated) throw new NotFoundException('Kanál nenalezen');
    this.eventEmitter.emit('chat.channel.updated', { worldId: channel.worldId, channel: updated });
    return updated;
  }

  async deleteChannel(channelId: string, requester: RequestUser): Promise<{ message: string }> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.canManageChat(requester, channel.worldId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    await this.channelRepo.delete(channelId);
    this.eventEmitter.emit('chat.channel.deleted', { worldId: channel.worldId, channelId, groupId: channel.groupId });
    return { message: 'Kanál smazán' };
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async getMessages(
    channelId: string,
    userId: string,
    opts: { before?: string; limit?: number },
  ): Promise<ChatMessage[]> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, userId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.messageRepo.findByChannelId(channelId, {
      before: opts.before,
      limit: Math.min(opts.limit ?? 50, 100),
    });
  }

  async sendMessage(channelId: string, dto: CreateMessageDto, requester: RequestUser): Promise<ChatMessage> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, requester.id))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, channel.worldId);
    const senderName = membership?.characterPath ?? requester.id;

    const message = await this.messageRepo.save({
      channelId,
      worldId: channel.worldId,
      senderId: requester.id,
      senderName,
      content: dto.content,
      isEdited: false,
      isDeleted: false,
    });
    await this.channelRepo.update(channelId, { lastMessageAt: message.createdAt });
    this.eventEmitter.emit('chat.message.created', { channelId, worldId: channel.worldId, message });
    await this.broadcastUnreadUpdate(channel.worldId, channelId, requester.id);
    return message;
  }

  async editMessage(messageId: string, dto: UpdateMessageDto, requester: RequestUser): Promise<ChatMessage> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    const canEdit = message.senderId === requester.id || (await this.canManageChat(requester, message.worldId));
    if (!canEdit) throw new ForbiddenException('Nedostatečná oprávnění');

    const updated = await this.messageRepo.update(messageId, { content: dto.content, isEdited: true });
    if (!updated) throw new NotFoundException('Zpráva nenalezena');
    this.eventEmitter.emit('chat.message.updated', { channelId: message.channelId, message: updated });
    return updated;
  }

  async deleteMessage(messageId: string, requester: RequestUser): Promise<{ message: string }> {
    const msg = await this.messageRepo.findById(messageId);
    if (!msg || msg.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    const canDelete = msg.senderId === requester.id || (await this.canManageChat(requester, msg.worldId));
    if (!canDelete) throw new ForbiddenException('Nedostatečná oprávnění');

    await this.messageRepo.update(messageId, { isDeleted: true, content: null });
    this.eventEmitter.emit('chat.message.deleted', { channelId: msg.channelId, messageId });
    return { message: 'Zpráva smazána' };
  }

  // ─── Read status ─────────────────────────────────────────────────────────

  async markAsRead(channelId: string, userId: string): Promise<void> {
    const messages = await this.messageRepo.findByChannelId(channelId, { limit: 1 });
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    await this.readRepo.upsert(userId, channelId, lastMessage.id);
    this.eventEmitter.emit('chat.unread.updated', { userId, channelId, count: 0 });
  }

  async getUnreadCounts(worldId: string, userId: string): Promise<{ channelId: string; count: number }[]> {
    const channels = await this.channelRepo.findByWorldId(worldId);
    const accessible = await Promise.all(
      channels.map(async (c) => ({ channel: c, access: await this.hasChannelAccess(c, userId) })),
    );
    const accessibleChannels = accessible.filter((a) => a.access).map((a) => a.channel);
    const channelIds = accessibleChannels.map((c) => c.id);
    const readStatuses = await this.readRepo.findByUserAndChannels(userId, channelIds);
    const readMap = new Map(readStatuses.map((r) => [r.channelId, r.lastReadMessageId]));

    return Promise.all(
      accessibleChannels.map(async (channel) => {
        const lastReadId = readMap.get(channel.id);
        const count = lastReadId ? await this.messageRepo.countAfter(channel.id, lastReadId) : 0;
        return { channelId: channel.id, count };
      }),
    );
  }

  private async broadcastUnreadUpdate(worldId: string, channelId: string, senderId: string): Promise<void> {
    const memberships = await this.membershipRepo.findByWorldId(worldId);
    for (const m of memberships) {
      if (m.userId === senderId) continue;
      this.eventEmitter.emit('chat.unread.updated', { userId: m.userId, channelId, count: -1 });
    }
  }

  // ─── World event listeners ────────────────────────────────────────────────

  @OnEvent('world.created')
  async handleWorldCreated(world: World): Promise<void> {
    const group1 = await this.groupRepo.save({ worldId: world.id, name: 'Globální', order: 0 });
    await this.channelRepo.save({
      groupId: group1.id, worldId: world.id, name: 'obecný',
      accessMode: 'all', allowedRoles: [], allowedMemberIds: [], order: 0, isDeleted: false,
    });
    const group2 = await this.groupRepo.save({ worldId: world.id, name: 'Postavy', order: 1 });
    await this.channelRepo.save({
      groupId: group2.id, worldId: world.id, name: 'hráči',
      accessMode: 'all', allowedRoles: [], allowedMemberIds: [], order: 0, isDeleted: false,
    });
  }

  @OnEvent('world.deleted')
  async handleWorldDeleted(payload: { worldId: string }): Promise<void> {
    await this.channelRepo.softDeleteByWorldId(payload.worldId);
    await this.messageRepo.softDeleteByWorldId(payload.worldId);
  }
}
```

- [ ] **Step 4: Spustit testy — ověřit GREEN**

```bash
cd backend && npx jest chat.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: všechny testy PASS

- [ ] **Step 5: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/chat/chat.service.ts backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): add ChatService with groups, channels, messages and read status"
```

---

## Task 6: ChatController

**Files:**
- Create: `backend/src/modules/chat/chat.controller.ts`

- [ ] **Step 1: Implementovat controller**

```typescript
// backend/src/modules/chat/chat.controller.ts
import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

@Controller('worlds/:worldId/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─── Groups ───────────────────────────────────────────────────────────────

  @Get('groups')
  getGroups(@Param('worldId') worldId: string) {
    return this.chatService.getGroupsWithChannels(worldId);
  }

  @Post('groups')
  createGroup(
    @Param('worldId') worldId: string,
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.createGroup(worldId, dto, user);
  }

  @Patch('groups/:groupId')
  updateGroup(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.updateGroup(groupId, dto, user);
  }

  @Delete('groups/:groupId')
  deleteGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteGroup(groupId, user);
  }

  // ─── Channels ─────────────────────────────────────────────────────────────

  @Post('groups/:groupId/channels')
  createChannel(
    @Param('groupId') groupId: string,
    @Body() dto: CreateChannelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.createChannel(groupId, dto, user);
  }

  @Patch('channels/:channelId')
  updateChannel(
    @Param('channelId') channelId: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.updateChannel(channelId, dto, user);
  }

  @Delete('channels/:channelId')
  deleteChannel(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteChannel(channelId, user);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  @Get('channels/:channelId/messages')
  getMessages(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(channelId, user.id, {
      before,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('channels/:channelId/messages')
  sendMessage(
    @Param('channelId') channelId: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.sendMessage(channelId, dto, user);
  }

  @Patch('messages/:messageId')
  editMessage(
    @Param('messageId') messageId: string,
    @Body() dto: UpdateMessageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.editMessage(messageId, dto, user);
  }

  @Delete('messages/:messageId')
  deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.deleteMessage(messageId, user);
  }

  // ─── Read status ─────────────────────────────────────────────────────────

  @Post('channels/:channelId/read')
  markAsRead(
    @Param('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.markAsRead(channelId, user.id);
  }

  @Get('unread')
  getUnread(
    @Param('worldId') worldId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.getUnreadCounts(worldId, user.id);
  }
}
```

- [ ] **Step 2: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/chat/chat.controller.ts
git commit -m "feat(chat): add ChatController"
```

---

## Task 7: ChatGateway

**Files:**
- Create: `backend/src/modules/chat/chat.gateway.ts`

- [ ] **Step 1: Implementovat gateway**

```typescript
// backend/src/modules/chat/chat.gateway.ts
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server } from 'socket.io';
import type { ChatGroup } from './interfaces/chat-group.interface';
import type { ChatChannel } from './interfaces/chat-channel.interface';
import type { ChatMessage } from './interfaces/chat-message.interface';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class ChatGateway {
  @WebSocketServer() server: Server;

  @OnEvent('chat.message.created')
  handleMessageCreated(payload: { channelId: string; worldId: string; message: ChatMessage }) {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message', payload.message);
  }

  @OnEvent('chat.message.updated')
  handleMessageUpdated(payload: { channelId: string; message: ChatMessage }) {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message:updated', payload.message);
  }

  @OnEvent('chat.message.deleted')
  handleMessageDeleted(payload: { channelId: string; messageId: string }) {
    this.server
      .to(`chat:${payload.channelId}`)
      .emit('chat:message:deleted', { messageId: payload.messageId, channelId: payload.channelId });
  }

  @OnEvent('chat.channel.created')
  handleChannelCreated(payload: { worldId: string; channel: ChatChannel }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:channel:created', payload.channel);
  }

  @OnEvent('chat.channel.updated')
  handleChannelUpdated(payload: { worldId: string; channel: ChatChannel }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:channel:updated', payload.channel);
  }

  @OnEvent('chat.channel.deleted')
  handleChannelDeleted(payload: { worldId: string; channelId: string; groupId: string }) {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:channel:deleted', { channelId: payload.channelId, groupId: payload.groupId });
  }

  @OnEvent('chat.group.created')
  handleGroupCreated(payload: { worldId: string; group: ChatGroup }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:created', payload.group);
  }

  @OnEvent('chat.group.updated')
  handleGroupUpdated(payload: { worldId: string; group: ChatGroup }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:updated', payload.group);
  }

  @OnEvent('chat.group.deleted')
  handleGroupDeleted(payload: { worldId: string; groupId: string }) {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:deleted', payload.groupId);
  }

  @OnEvent('chat.unread.updated')
  handleUnreadUpdated(payload: { userId: string; channelId: string; count: number }) {
    this.server
      .to(`user:${payload.userId}`)
      .emit('chat:unread', { channelId: payload.channelId, count: payload.count });
  }
}
```

- [ ] **Step 2: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/chat/chat.gateway.ts
git commit -m "feat(chat): add ChatGateway with real-time events"
```

---

## Task 8: ChatModule + registrace v AppModule

**Files:**
- Create: `backend/src/modules/chat/chat.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvořit ChatModule**

```typescript
// backend/src/modules/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatGroupSchemaClass, ChatGroupSchema } from './schemas/chat-group.schema';
import { ChatChannelSchemaClass, ChatChannelSchema } from './schemas/chat-channel.schema';
import { ChatMessageSchemaClass, ChatMessageSchema } from './schemas/chat-message.schema';
import { ChannelReadStatusSchemaClass, ChannelReadStatusSchema } from './schemas/channel-read-status.schema';
import { MongoChatGroupRepository } from './repositories/chat-group.repository';
import { MongoChatChannelRepository } from './repositories/chat-channel.repository';
import { MongoChatMessageRepository } from './repositories/chat-message.repository';
import { MongoChannelReadStatusRepository } from './repositories/channel-read-status.repository';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatGroupSchemaClass.name, schema: ChatGroupSchema },
      { name: ChatChannelSchemaClass.name, schema: ChatChannelSchema },
      { name: ChatMessageSchemaClass.name, schema: ChatMessageSchema },
      { name: ChannelReadStatusSchemaClass.name, schema: ChannelReadStatusSchema },
    ]),
    WorldsModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    { provide: 'IChatGroupRepository', useClass: MongoChatGroupRepository },
    { provide: 'IChatChannelRepository', useClass: MongoChatChannelRepository },
    { provide: 'IChatMessageRepository', useClass: MongoChatMessageRepository },
    { provide: 'IChannelReadStatusRepository', useClass: MongoChannelReadStatusRepository },
    ChatGateway,
  ],
})
export class ChatModule {}
```

- [ ] **Step 2: Registrovat ChatModule v AppModule**

Otevři `backend/src/app.module.ts` a přidej import:

```typescript
// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
import { ChatModule } from './modules/chat/chat.module';
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuthModule,
    WorldsModule,
    ChatModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
```

- [ ] **Step 3: Spustit všechny testy**

```bash
cd backend && npx jest --passWithNoTests 2>&1 | tail -10
```

Expected: všechny test suites PASS

- [ ] **Step 4: Ověřit TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádné chyby

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/chat/chat.module.ts backend/src/app.module.ts
git commit -m "feat(chat): wire ChatModule and register in AppModule"
```

---

## Finální ověření

- [ ] **Spustit všechny testy**

```bash
cd backend && npx jest --passWithNoTests 2>&1 | tail -15
```

Expected:
```
Test Suites: 11 passed, 11 total
Tests:       XX passed, XX total
```

- [ ] **TypeScript build**

```bash
cd backend && npx tsc --noEmit
```

Expected: žádný výstup (žádné chyby)

- [ ] **Ověřit endpoints existují**

```bash
cd backend && npx nest start --entryFile main 2>&1 | head -20
```

Expected: aplikace nastartuje bez chyb, RouteExplorer zobrazí `/api/worlds/:worldId/chat/...` endpointy

- [ ] **Finální commit**

```bash
git tag krok-3a-complete
```
