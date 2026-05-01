# Krok 3b — Chat Extensions: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rozšířit chat modul o whisper, reakce, reply, herní datum, NPC identitu a typing indicator bez přidání nových kolekcí nebo modulů.

**Architecture:** Všechny nové funkce jsou fieldy na `ChatMessage`. ChatService dostane nové metody `toggleReaction` a rozšíří `sendMessage` + `getMessages`. ChatGateway přidá typing eventy. Žádné nové soubory — pouze úpravy existujících 8 souborů.

**Tech Stack:** NestJS 11, Mongoose 9, Socket.IO, EventEmitter2, class-validator, TypeScript 5

---

## Kontext projektu (přečti před implementací)

```
backend/src/modules/chat/
├── interfaces/chat-message.interface.ts        ← Task 1
├── schemas/chat-message.schema.ts              ← Task 1
├── repositories/chat-message.repository.ts     ← Task 1, 2
├── interfaces/chat-message-repository.interface.ts  ← Task 2
├── dto/create-message.dto.ts                   ← Task 3
├── chat.service.ts                             ← Task 4
├── chat.service.spec.ts                        ← Tasks 1,2,4
├── chat.controller.ts                          ← Task 5
└── chat.gateway.ts                             ← Task 6
```

Existující `WorldMembership` interface (`backend/src/modules/worlds/interfaces/world-membership.interface.ts`):
```typescript
interface WorldMembership {
  id: string; userId: string; worldId: string;
  role: WorldRole;  // Pending=-1, Hrac=0, Korektor=1, PomocnyPJ=2, PJ=3
  joinedAt: Date; avatarUrl?: string; characterPath?: string;
  group?: string; akj: number;
}
```

Existující `RequestUser` (z `worlds.service.ts`): `{ id: string; role: UserRole }` kde `UserRole.Admin = 2`.

Testovací příkaz: `cd backend && npx jest chat.service.spec.ts --no-coverage`
TypeScript check: `cd backend && npx tsc --noEmit`

---

## Task 1: ChatMessage interface + schema + toEntity

**Files:**
- Modify: `backend/src/modules/chat/interfaces/chat-message.interface.ts`
- Modify: `backend/src/modules/chat/schemas/chat-message.schema.ts`
- Modify: `backend/src/modules/chat/repositories/chat-message.repository.ts`
- Modify: `backend/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 1: Přidej failing test do chat.service.spec.ts**

Otevři `backend/src/modules/chat/chat.service.spec.ts`. Najdi řádek kde je definováno `mockChannel` (přibližně řádek 12) a uprav všechny `mockMsg` definice v testech tak, aby zahrnovaly `reactions: {}`. Také aktualizuj `mockChannel` mock v sekci `sendMessage` a `deleteMessage` describe bloků.

Zároveň přidej `addReaction: jest.fn(), removeReaction: jest.fn()` do `mockMessageRepo` objektu (přibližně řádek 31):

```typescript
const mockMessageRepo = {
  findById: jest.fn(), findByChannelId: jest.fn(), countAfter: jest.fn(),
  save: jest.fn(), update: jest.fn(), softDeleteByChannelId: jest.fn(),
  softDeleteByWorldId: jest.fn(), addReaction: jest.fn(), removeReaction: jest.fn(),
};
```

Přidej nový describe blok na konec souboru (před uzavírající `}`):

```typescript
describe('ChatMessage interface — reactions field', () => {
  it('mockMsg should have reactions field (type check)', () => {
    const msg: import('./interfaces/chat-message.interface').ChatMessage = {
      id: 'msg1', channelId: 'ch1', worldId: 'world1',
      senderId: 'user1', senderName: 'Elara',
      content: 'text', isEdited: false, isDeleted: false,
      reactions: { '👍': ['user2'] },
      createdAt: new Date(), updatedAt: new Date(),
    };
    expect(msg.reactions['👍']).toContain('user2');
  });
});
```

- [ ] **Step 2: Spusť test — ověř že TypeScript selže**

```
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Očekávaný výstup: chyba "Property 'reactions' does not exist on type 'ChatMessage'" nebo podobná.

- [ ] **Step 3: Uprav ChatMessage interface**

Nahraď celý obsah `backend/src/modules/chat/interfaces/chat-message.interface.ts`:

```typescript
export interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string;
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
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 4: Uprav chat-message.schema.ts**

Nahraď celý obsah `backend/src/modules/chat/schemas/chat-message.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ChatMessageDocument = HydratedDocument<ChatMessageSchemaClass>;

@Schema({ timestamps: true, collection: 'chatmessages' })
export class ChatMessageSchemaClass {
  @Prop({ required: true }) channelId: string;
  @Prop({ required: true }) worldId: string;
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
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageSchemaClass);
ChatMessageSchema.index({ channelId: 1, createdAt: -1 });
ChatMessageSchema.index({ worldId: 1 });
ChatMessageSchema.index({ senderId: 1 });
ChatMessageSchema.index({ channelId: 1, visibleTo: 1 });
```

- [ ] **Step 5: Uprav toEntity v chat-message.repository.ts**

Nahraď metodu `toEntity` v `backend/src/modules/chat/repositories/chat-message.repository.ts`:

```typescript
protected toEntity(doc: Record<string, unknown>): ChatMessage {
  return {
    id: String(doc._id),
    channelId: doc.channelId as string,
    worldId: doc.worldId as string,
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
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}
```

- [ ] **Step 6: Aktualizuj všechny mockMsg v chat.service.spec.ts**

V `chat.service.spec.ts` najdi každý inline objekt který vypadá jako zpráva (má `isEdited: false, isDeleted: false`) a přidej `reactions: {}` pokud ho nemá. Příklady:

```typescript
// v describe('editMessage')
const mockMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
  senderName: 'user1', content: 'original', isEdited: false, isDeleted: false,
  reactions: {},  // ← přidat
  createdAt: new Date(), updatedAt: new Date() };

// v describe('deleteMessage')
const mockMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
  senderName: 'user1', content: 'text', isEdited: false, isDeleted: false,
  reactions: {},  // ← přidat
  createdAt: new Date(), updatedAt: new Date() };

// v describe('sendMessage') — mockMsg v mockMessageRepo.save.mockResolvedValue
const mockMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
  senderName: 'user1', content: 'ahoj', isEdited: false, isDeleted: false,
  reactions: {},  // ← přidat
  createdAt: new Date(), updatedAt: new Date() };

// v describe('markAsRead')
const mockMsg = { id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
  senderName: 'user1', content: 'x', isEdited: false, isDeleted: false,
  reactions: {},  // ← přidat
  createdAt: new Date(), updatedAt: new Date() };
```

- [ ] **Step 7: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest chat.service.spec.ts --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 8: Commit**

```
git add backend/src/modules/chat/interfaces/chat-message.interface.ts
git add backend/src/modules/chat/schemas/chat-message.schema.ts
git add backend/src/modules/chat/repositories/chat-message.repository.ts
git add backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): extend ChatMessage model with reactions, whisper, reply, rpDate, NPC fields"
```

---

## Task 2: IChatMessageRepository + addReaction/removeReaction

**Files:**
- Modify: `backend/src/modules/chat/interfaces/chat-message-repository.interface.ts`
- Modify: `backend/src/modules/chat/repositories/chat-message.repository.ts`

- [ ] **Step 1: Přidej metody do interface**

Otevři `backend/src/modules/chat/interfaces/chat-message-repository.interface.ts`. Přidej dvě metody:

```typescript
import type { ChatMessage } from './chat-message.interface';

export interface IChatMessageRepository {
  findById(id: string): Promise<ChatMessage | null>;
  findByChannelId(channelId: string, opts: { before?: string; limit: number }): Promise<ChatMessage[]>;
  countAfter(channelId: string, messageId: string): Promise<number>;
  save(data: Partial<ChatMessage>): Promise<ChatMessage>;
  update(id: string, data: Partial<ChatMessage>): Promise<ChatMessage | null>;
  softDeleteByChannelId(channelId: string): Promise<void>;
  softDeleteByWorldId(worldId: string): Promise<void>;
  addReaction(messageId: string, emoji: string, userId: string): Promise<ChatMessage | null>;
  removeReaction(messageId: string, emoji: string, userId: string): Promise<ChatMessage | null>;
}
```

- [ ] **Step 2: Implementuj addReaction a removeReaction v MongoChatMessageRepository**

Otevři `backend/src/modules/chat/repositories/chat-message.repository.ts`. Za metodu `softDeleteByWorldId` přidej:

```typescript
async addReaction(messageId: string, emoji: string, userId: string): Promise<ChatMessage | null> {
  if (!Types.ObjectId.isValid(messageId)) return null;
  const doc = await this.model
    .findByIdAndUpdate(
      messageId,
      { $addToSet: { [`reactions.${emoji}`]: userId } },
      { new: true },
    )
    .lean()
    .exec();
  return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
}

async removeReaction(messageId: string, emoji: string, userId: string): Promise<ChatMessage | null> {
  if (!Types.ObjectId.isValid(messageId)) return null;
  const doc = await this.model
    .findByIdAndUpdate(
      messageId,
      { $pull: { [`reactions.${emoji}`]: userId } },
      { new: true },
    )
    .lean()
    .exec();
  return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
}
```

- [ ] **Step 3: Ověř TypeScript**

```
cd backend && npx tsc --noEmit
```

Očekávaný výstup: `0 errors`

- [ ] **Step 4: Commit**

```
git add backend/src/modules/chat/interfaces/chat-message-repository.interface.ts
git add backend/src/modules/chat/repositories/chat-message.repository.ts
git commit -m "feat(chat): add addReaction/removeReaction to message repository"
```

---

## Task 3: CreateMessageDto rozšíření

**Files:**
- Modify: `backend/src/modules/chat/dto/create-message.dto.ts`

- [ ] **Step 1: Nahraď celý obsah create-message.dto.ts**

```typescript
import { IsString, MinLength, MaxLength, IsOptional, IsArray, Matches } from 'class-validator';

export class CreateMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content: string;

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'rpDate musí být ve formátu YYYY-MM-DD' })
  rpDate?: string;

  @IsOptional() @IsString()
  replyToId?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  visibleTo?: string[];

  @IsOptional() @IsString() @MaxLength(64)
  overrideName?: string;

  @IsOptional() @IsString() @MaxLength(512)
  overrideAvatarUrl?: string;
}
```

- [ ] **Step 2: Ověř TypeScript**

```
cd backend && npx tsc --noEmit
```

Očekávaný výstup: `0 errors`

- [ ] **Step 3: Commit**

```
git add backend/src/modules/chat/dto/create-message.dto.ts
git commit -m "feat(chat): extend CreateMessageDto with rpDate, replyToId, visibleTo, overrideName, overrideAvatarUrl"
```

---

## Task 4: ChatService — sendMessage + toggleReaction + getMessages whisper filter

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts`
- Modify: `backend/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 1: Napiš failing testy do chat.service.spec.ts**

Na konec souboru (před závěrečnou `}`) přidej:

```typescript
describe('sendMessage — new fields', () => {
  const baseMockMsg = {
    id: 'msg1', channelId: 'ch1', worldId: 'world1',
    senderId: 'user1', senderName: 'Elara', senderAvatarUrl: 'http://avatar.png',
    content: 'ahoj', isEdited: false, isDeleted: false,
    reactions: {}, createdAt: new Date(), updatedAt: new Date(),
  };

  it('should snapshot senderAvatarUrl from membership', async () => {
    const membership = { ...mockPJMembership, avatarUrl: 'http://avatar.png', characterPath: 'Elara' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(baseMockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage('ch1', { content: 'ahoj' }, mockPJ);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ senderAvatarUrl: 'http://avatar.png' }),
    );
  });

  it('should throw ForbiddenException when non-PJ sets overrideName', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    await expect(
      service.sendMessage('ch1', { content: 'x', overrideName: 'NPC' }, { id: 'user2', role: UserRole.Hrac }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow PJ to set overrideName', async () => {
    const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'PJ' };
    const msgWithOverride = { ...baseMockMsg, overrideName: 'Starý kovář' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(msgWithOverride);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    const result = await service.sendMessage('ch1', { content: 'x', overrideName: 'Starý kovář' }, mockPJ);
    expect(result.overrideName).toBe('Starý kovář');
  });

  it('should populate replyToPreview from cited message', async () => {
    const citedMsg = { ...baseMockMsg, id: 'cited1', content: 'původní zpráva', senderName: 'Elara' };
    const replyMsg = { ...baseMockMsg, replyToId: 'cited1', replyToPreview: 'původní zpráva', replyToSenderName: 'Elara' };
    const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'Elara' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.findById.mockResolvedValue(citedMsg);
    mockMessageRepo.save.mockResolvedValue(replyMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage('ch1', { content: 'odpověď', replyToId: 'cited1' }, mockPJ);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToId: 'cited1',
        replyToPreview: 'původní zpráva',
        replyToSenderName: 'Elara',
      }),
    );
  });

  it('should add senderId to visibleTo for whisper', async () => {
    const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'Elara' };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue({ ...baseMockMsg, visibleTo: ['user1', 'user2'] });
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    await service.sendMessage('ch1', { content: 'šepot', visibleTo: ['user2'] }, mockPJ);
    expect(mockMessageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ visibleTo: expect.arrayContaining(['user1', 'user2']) }),
    );
  });
});

describe('toggleReaction', () => {
  const mockMsg = {
    id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
    senderName: 'Elara', content: 'text', isEdited: false, isDeleted: false,
    reactions: {}, createdAt: new Date(), updatedAt: new Date(),
  };

  it('should add reaction when user has not reacted yet', async () => {
    mockMessageRepo.findById.mockResolvedValue(mockMsg);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.addReaction.mockResolvedValue({ ...mockMsg, reactions: { '👍': ['user2'] } });
    const result = await service.toggleReaction('msg1', '👍', { id: 'user2', role: UserRole.Hrac });
    expect(mockMessageRepo.addReaction).toHaveBeenCalledWith('msg1', '👍', 'user2');
    expect(result.reactions['👍']).toContain('user2');
  });

  it('should remove reaction when user already reacted', async () => {
    const msgWithReaction = { ...mockMsg, reactions: { '👍': ['user2'] } };
    mockMessageRepo.findById.mockResolvedValue(msgWithReaction);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.removeReaction.mockResolvedValue({ ...mockMsg, reactions: { '👍': [] } });
    await service.toggleReaction('msg1', '👍', { id: 'user2', role: UserRole.Hrac });
    expect(mockMessageRepo.removeReaction).toHaveBeenCalledWith('msg1', '👍', 'user2');
    expect(mockMessageRepo.addReaction).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException for missing message', async () => {
    mockMessageRepo.findById.mockResolvedValue(null);
    await expect(service.toggleReaction('unknown', '👍', mockPJ)).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when no channel access', async () => {
    mockMessageRepo.findById.mockResolvedValue(mockMsg);
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
    await expect(service.toggleReaction('msg1', '👍', { id: 'stranger', role: UserRole.Hrac }))
      .rejects.toThrow(ForbiddenException);
  });
});

describe('getMessages — whisper filtering', () => {
  const publicMsg = {
    id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1',
    senderName: 'Elara', content: 'veřejná', isEdited: false, isDeleted: false,
    reactions: {}, createdAt: new Date(), updatedAt: new Date(),
  };
  const whisperMsg = {
    ...publicMsg, id: 'msg2', content: 'šepot',
    visibleTo: ['user1', 'user2'],
  };

  it('should hide whisper from user not in visibleTo', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ ...mockHracMembership, userId: 'user3' });
    mockMessageRepo.findByChannelId.mockResolvedValue([publicMsg, whisperMsg]);
    const result = await service.getMessages('ch1', 'user3', {});
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('msg1');
  });

  it('should show whisper to sender', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockHracMembership);
    mockMessageRepo.findByChannelId.mockResolvedValue([publicMsg, whisperMsg]);
    const result = await service.getMessages('ch1', 'user1', {});
    expect(result).toHaveLength(2);
  });

  it('should show all whispers to PJ', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
    mockMessageRepo.findByChannelId.mockResolvedValue([publicMsg, whisperMsg]);
    const result = await service.getMessages('ch1', 'user1', {});
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Spusť testy — ověř že selžou**

```
cd backend && npx jest chat.service.spec.ts --no-coverage 2>&1 | tail -20
```

Očekávaný výstup: řada failujících testů (metody `toggleReaction` neexistuje apod.).

- [ ] **Step 3: Uprav ChatService**

Nahraď celý obsah `backend/src/modules/chat/chat.service.ts`:

```typescript
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
      await this.messageRepo.softDeleteByChannelId(ch.id);
      await this.channelRepo.delete(ch.id);
      this.eventEmitter.emit('chat.channel.deleted', { worldId: group.worldId, channelId: ch.id, groupId });
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
    await this.messageRepo.softDeleteByChannelId(channelId);
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
    const messages = await this.messageRepo.findByChannelId(channelId, {
      before: opts.before,
      limit: Math.min(Number.isFinite(opts.limit) && opts.limit! > 0 ? opts.limit! : 50, 100),
    });

    const membership = await this.membershipRepo.findByUserAndWorld(userId, channel.worldId);
    const canSeeAllWhispers = membership !== null && membership.role >= WorldRole.PomocnyPJ;

    return messages.filter((m) => {
      if (!m.visibleTo || m.visibleTo.length === 0) return true;
      if (canSeeAllWhispers) return true;
      return m.visibleTo.includes(userId);
    });
  }

  async sendMessage(channelId: string, dto: CreateMessageDto, requester: RequestUser): Promise<ChatMessage> {
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, requester.id))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }

    if (dto.overrideName !== undefined || dto.overrideAvatarUrl !== undefined) {
      if (!(await this.canManageChat(requester, channel.worldId))) {
        throw new ForbiddenException('Nedostatečná oprávnění pro NPC mód');
      }
    }

    const membership = await this.membershipRepo.findByUserAndWorld(requester.id, channel.worldId);
    const senderName = membership?.characterPath ?? requester.id;
    const senderAvatarUrl = membership?.avatarUrl;

    let replyToPreview: string | undefined;
    let replyToSenderName: string | undefined;
    if (dto.replyToId) {
      const cited = await this.messageRepo.findById(dto.replyToId);
      if (cited && !cited.isDeleted) {
        replyToPreview = cited.content?.slice(0, 200) ?? undefined;
        replyToSenderName = cited.overrideName ?? cited.senderName;
      }
    }

    let visibleTo: string[] | undefined;
    if (dto.visibleTo && dto.visibleTo.length > 0) {
      const recipients = dto.visibleTo.filter((id) => id !== requester.id);
      visibleTo = [requester.id, ...recipients];
    }

    const message = await this.messageRepo.save({
      channelId,
      worldId: channel.worldId,
      senderId: requester.id,
      senderName,
      senderAvatarUrl,
      overrideName: dto.overrideName,
      overrideAvatarUrl: dto.overrideAvatarUrl,
      content: dto.content,
      isEdited: false,
      isDeleted: false,
      rpDate: dto.rpDate,
      replyToId: dto.replyToId,
      replyToPreview,
      replyToSenderName,
      visibleTo,
      reactions: {},
    });

    await this.channelRepo.update(channelId, { lastMessageAt: message.createdAt });
    this.eventEmitter.emit('chat.message.created', { channelId, worldId: channel.worldId, message });
    await this.broadcastUnreadUpdate(channel.worldId, channelId, requester.id);
    return message;
  }

  async toggleReaction(messageId: string, emoji: string, requester: RequestUser): Promise<ChatMessage> {
    const message = await this.messageRepo.findById(messageId);
    if (!message || message.isDeleted) throw new NotFoundException('Zpráva nenalezena');

    const channel = await this.channelRepo.findById(message.channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, requester.id))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }

    const currentReactions = message.reactions[emoji] ?? [];
    const hasReacted = currentReactions.includes(requester.id);

    const updated = hasReacted
      ? await this.messageRepo.removeReaction(messageId, emoji, requester.id)
      : await this.messageRepo.addReaction(messageId, emoji, requester.id);

    if (!updated) throw new NotFoundException('Zpráva nenalezena');
    this.eventEmitter.emit('chat.message.updated', { channelId: message.channelId, message: updated });
    return updated;
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
    const channel = await this.channelRepo.findById(channelId);
    if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
    if (!(await this.hasChannelAccess(channel, userId))) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
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

- [ ] **Step 4: Spusť testy — ověř že jsou zelené**

```
cd backend && npx jest chat.service.spec.ts --no-coverage
```

Očekávaný výstup: všechny testy zelené (počet vzroste z 25 na ~40+).

- [ ] **Step 5: Ověř TypeScript**

```
cd backend && npx tsc --noEmit
```

Očekávaný výstup: `0 errors`

- [ ] **Step 6: Commit**

```
git add backend/src/modules/chat/chat.service.ts
git add backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): add toggleReaction, whisper filtering, NPC override, replyTo, rpDate to service"
```

---

## Task 5: ChatController — reakce endpoint

**Files:**
- Modify: `backend/src/modules/chat/chat.controller.ts`

- [ ] **Step 1: Přidej Put import a endpoint do ChatController**

Otevři `backend/src/modules/chat/chat.controller.ts`. Na řádku 1 uprav import NestJS dekorátorů — přidej `Put`:

```typescript
import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
```

Na konec třídy, za `getUnread`, přidej endpoint:

```typescript
  @Put('messages/:messageId/reactions/:emoji')
  toggleReaction(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.chatService.toggleReaction(messageId, emoji, user);
  }
```

- [ ] **Step 2: Ověř TypeScript**

```
cd backend && npx tsc --noEmit
```

Očekávaný výstup: `0 errors`

- [ ] **Step 3: Commit**

```
git add backend/src/modules/chat/chat.controller.ts
git commit -m "feat(chat): add PUT /messages/:messageId/reactions/:emoji endpoint"
```

---

## Task 6: ChatGateway — typing indicator + whisper broadcast

**Files:**
- Modify: `backend/src/modules/chat/chat.gateway.ts`

- [ ] **Step 1: Nahraď celý obsah chat.gateway.ts**

```typescript
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import type { ChatGroup } from './interfaces/chat-group.interface';
import type { ChatChannel } from './interfaces/chat-channel.interface';
import type { ChatMessage } from './interfaces/chat-message.interface';

@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' } })
export class ChatGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly typingTimeouts = new Map<string, NodeJS.Timeout>();

  handleDisconnect(client: Socket): void {
    for (const key of this.typingTimeouts.keys()) {
      if (key.startsWith(`${client.id}:`)) {
        clearTimeout(this.typingTimeouts.get(key)!);
        this.typingTimeouts.delete(key);
      }
    }
  }

  // ─── Typing indicator ────────────────────────────────────────────────────

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @MessageBody() payload: { channelId: string; characterName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const key = `${client.id}:${payload.channelId}`;
    const existing = this.typingTimeouts.get(key);
    if (existing) clearTimeout(existing);

    client.to(`chat:${payload.channelId}`).emit('chat:typing', {
      channelId: payload.channelId,
      characterName: payload.characterName,
      isTyping: true,
    });

    const timeout = setTimeout(() => {
      client.to(`chat:${payload.channelId}`).emit('chat:typing', {
        channelId: payload.channelId,
        characterName: payload.characterName,
        isTyping: false,
      });
      this.typingTimeouts.delete(key);
    }, 5000);

    this.typingTimeouts.set(key, timeout);
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @MessageBody() payload: { channelId: string; characterName: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const key = `${client.id}:${payload.channelId}`;
    const existing = this.typingTimeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.typingTimeouts.delete(key);
    }
    client.to(`chat:${payload.channelId}`).emit('chat:typing', {
      channelId: payload.channelId,
      characterName: payload.characterName,
      isTyping: false,
    });
  }

  // ─── Message events ──────────────────────────────────────────────────────

  @OnEvent('chat.message.created')
  handleMessageCreated(payload: { channelId: string; worldId: string; message: ChatMessage }): void {
    if (payload.message.visibleTo && payload.message.visibleTo.length > 0) {
      for (const userId of payload.message.visibleTo) {
        this.server.to(`user:${userId}`).emit('chat:message', payload.message);
      }
    } else {
      this.server.to(`chat:${payload.channelId}`).emit('chat:message', payload.message);
    }
  }

  @OnEvent('chat.message.updated')
  handleMessageUpdated(payload: { channelId: string; message: ChatMessage }): void {
    this.server.to(`chat:${payload.channelId}`).emit('chat:message:updated', payload.message);
  }

  @OnEvent('chat.message.deleted')
  handleMessageDeleted(payload: { channelId: string; messageId: string }): void {
    this.server
      .to(`chat:${payload.channelId}`)
      .emit('chat:message:deleted', { messageId: payload.messageId, channelId: payload.channelId });
  }

  // ─── Channel events ──────────────────────────────────────────────────────

  @OnEvent('chat.channel.created')
  handleChannelCreated(payload: { worldId: string; channel: ChatChannel }): void {
    this.server.to(`world:${payload.worldId}`).emit('chat:channel:created', payload.channel);
  }

  @OnEvent('chat.channel.updated')
  handleChannelUpdated(payload: { worldId: string; channel: ChatChannel }): void {
    this.server.to(`world:${payload.worldId}`).emit('chat:channel:updated', payload.channel);
  }

  @OnEvent('chat.channel.deleted')
  handleChannelDeleted(payload: { worldId: string; channelId: string; groupId: string }): void {
    this.server
      .to(`world:${payload.worldId}`)
      .emit('chat:channel:deleted', { channelId: payload.channelId, groupId: payload.groupId });
  }

  // ─── Group events ────────────────────────────────────────────────────────

  @OnEvent('chat.group.created')
  handleGroupCreated(payload: { worldId: string; group: ChatGroup }): void {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:created', payload.group);
  }

  @OnEvent('chat.group.updated')
  handleGroupUpdated(payload: { worldId: string; group: ChatGroup }): void {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:updated', payload.group);
  }

  @OnEvent('chat.group.deleted')
  handleGroupDeleted(payload: { worldId: string; groupId: string }): void {
    this.server.to(`world:${payload.worldId}`).emit('chat:group:deleted', payload.groupId);
  }

  // ─── Unread events ───────────────────────────────────────────────────────

  @OnEvent('chat.unread.updated')
  handleUnreadUpdated(payload: { userId: string; channelId: string; count: number }): void {
    this.server
      .to(`user:${payload.userId}`)
      .emit('chat:unread', { channelId: payload.channelId, count: payload.count });
  }
}
```

- [ ] **Step 2: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest chat.service.spec.ts --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 3: Commit**

```
git add backend/src/modules/chat/chat.gateway.ts
git commit -m "feat(chat): add typing indicator and whisper-aware broadcast to ChatGateway"
```

---

## Self-review checklist (proveď před PR)

```
cd backend && npx tsc --noEmit && npx jest --no-coverage
```

Ověř:
- [ ] Všechny testy zelené
- [ ] TypeScript 0 errors
- [ ] `reactions: {}` je ve všech mock zprávách v spec souboru
- [ ] `addReaction` a `removeReaction` jsou v mockMessageRepo
- [ ] `PUT /messages/:messageId/reactions/:emoji` existuje v controlleru
- [ ] `typing:start` a `typing:stop` jsou v gatewayi
- [ ] Whisper zprávy jdou do `user:{id}` room, ne do `chat:{channelId}`
