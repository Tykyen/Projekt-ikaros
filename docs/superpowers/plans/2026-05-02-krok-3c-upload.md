# Krok 3c-upload — File Upload: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat podporu nahrávání souborů (obrázky, GIFy, videa, dokumenty) do chat zpráv přes Cloudinary.

**Architecture:** Nový `UploadModule` s `UploadController` a `UploadService`. `ChatMessage` dostane `attachments` field. `content` se stane volitelným — validace na service vrstvě. Cleanup Cloudinary příloh při smazání zprávy přes EventEmitter (best-effort, bez circular dependency).

**Tech Stack:** NestJS 11, Mongoose 9, Multer (součást @nestjs/platform-express), cloudinary npm, class-validator, TypeScript 5

---

## Kontext projektu

```
backend/src/modules/chat/
├── interfaces/chat-message.interface.ts     ← Task 1: + attachments field
├── schemas/chat-message.schema.ts           ← Task 1: + attachments @Prop
├── repositories/chat-message.repository.ts  ← Task 1: + toEntity maps attachments
├── dto/create-message.dto.ts                ← Task 2: content optional + attachments
├── chat.service.ts                          ← Task 2: validace, findChannelForUpload, deleteMessage event
├── chat.service.spec.ts                     ← Tasks 1,2: aktualizace mockMsg, nové testy
└── chat.module.ts                           ← Task 4: export ChatService

backend/src/modules/upload/                  ← NOVÉ (Task 3 + 4)
├── upload.service.ts
├── upload.service.spec.ts
├── upload.controller.ts
├── upload.module.ts
└── filters/multer-exception.filter.ts

backend/src/app.module.ts                    ← Task 4: + UploadModule
```

**Nové interface soubory:**
- `backend/src/modules/chat/interfaces/chat-attachment.interface.ts` ← Task 1
- `backend/src/modules/chat/dto/chat-attachment.dto.ts` ← Task 2

Testovací příkaz: `cd backend && npx jest --no-coverage`
TypeScript check: `cd backend && npx tsc --noEmit`

**Existující WorldMembership**: `{ id, userId, worldId, role: WorldRole, avatarUrl?, characterPath?, akj }`
**RequestUser**: `{ id: string; role: UserRole }`
**ChatChannel**: `{ id, groupId, worldId, name, accessMode, allowedRoles, allowedMemberIds, order, isDeleted }`

---

## Task 1: ChatAttachment interface + schema + toEntity

**Files:**
- Create: `backend/src/modules/chat/interfaces/chat-attachment.interface.ts`
- Modify: `backend/src/modules/chat/interfaces/chat-message.interface.ts`
- Modify: `backend/src/modules/chat/schemas/chat-message.schema.ts`
- Modify: `backend/src/modules/chat/repositories/chat-message.repository.ts`
- Modify: `backend/src/modules/chat/chat.service.spec.ts`

- [ ] **Step 1: Přidej failing test do chat.service.spec.ts**

Otevři `backend/src/modules/chat/chat.service.spec.ts`. Najdi describe blok `'ChatMessage interface — reactions field'` na konci souboru a přidej za něj:

```typescript
describe('ChatMessage interface — attachments field', () => {
  it('mockMsg should have attachments field (type check)', () => {
    const msg: import('./interfaces/chat-message.interface').ChatMessage = {
      id: 'msg1', channelId: 'ch1', worldId: 'world1',
      senderId: 'user1', senderName: 'Elara',
      content: 'text', isEdited: false, isDeleted: false,
      reactions: {},
      attachments: [{ url: 'https://example.com/a.jpg', publicId: 'abc', type: 'image', mimeType: 'image/jpeg', filename: 'a.jpg', size: 1024 }],
      createdAt: new Date(), updatedAt: new Date(),
    };
    expect(msg.attachments![0].type).toBe('image');
  });
});
```

- [ ] **Step 2: Spusť TypeScript — ověř že selže**

```
cd backend && npx tsc --noEmit 2>&1 | Select-Object -First 10
```

Očekávaný výstup: chyba "Property 'attachments' does not exist on type 'ChatMessage'".

- [ ] **Step 3: Vytvoř chat-attachment.interface.ts**

Vytvoř soubor `backend/src/modules/chat/interfaces/chat-attachment.interface.ts`:

```typescript
export interface ChatAttachment {
  url: string;
  publicId: string;
  type: 'image' | 'video' | 'document';
  mimeType: string;
  filename: string;
  size: number;
}
```

- [ ] **Step 4: Uprav chat-message.interface.ts**

Nahraď celý obsah `backend/src/modules/chat/interfaces/chat-message.interface.ts`:

```typescript
import type { ChatAttachment } from './chat-attachment.interface';

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
  attachments?: ChatAttachment[];
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 5: Uprav chat-message.schema.ts**

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
  @Prop({ type: [Object], default: [] }) attachments: Record<string, unknown>[];
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageSchemaClass);
ChatMessageSchema.index({ channelId: 1, createdAt: -1 });
ChatMessageSchema.index({ worldId: 1 });
ChatMessageSchema.index({ senderId: 1 });
ChatMessageSchema.index({ channelId: 1, visibleTo: 1 });
```

- [ ] **Step 6: Uprav toEntity v chat-message.repository.ts**

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
    attachments: (doc.attachments as import('../interfaces/chat-attachment.interface').ChatAttachment[]) ?? [],
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}
```

- [ ] **Step 7: Přidej attachments: [] do všech mockMsg v chat.service.spec.ts**

V `chat.service.spec.ts` najdi všechny inline objekty zpráv (mají `isEdited: false, isDeleted: false, reactions: {}`) a přidej `attachments: []` ke každému. Příklady:

```typescript
// v describe('editMessage'), describe('deleteMessage'), describe('sendMessage'), describe('markAsRead'), describe('toggleReaction'), describe('getMessages')
const mockMsg = { id: 'msg1', ..., reactions: {}, attachments: [], createdAt: new Date(), updatedAt: new Date() };
```

Také aktualizuj všechny `baseMockMsg` a `replyMsg` objekty v describe blocích přidaných v 3b:
```typescript
const baseMockMsg = {
  id: 'msg1', channelId: 'ch1', worldId: 'world1',
  senderId: 'user1', senderName: 'Elara', senderAvatarUrl: 'http://avatar.png',
  content: 'ahoj', isEdited: false, isDeleted: false,
  reactions: {}, attachments: [],
  createdAt: new Date(), updatedAt: new Date(),
};
```

- [ ] **Step 8: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest chat.service.spec.ts --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 9: Commit**

```
git add backend/src/modules/chat/interfaces/chat-attachment.interface.ts
git add backend/src/modules/chat/interfaces/chat-message.interface.ts
git add backend/src/modules/chat/schemas/chat-message.schema.ts
git add backend/src/modules/chat/repositories/chat-message.repository.ts
git add backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(chat): add ChatAttachment interface and attachments field to ChatMessage"
```

---

## Task 2: DTOs + ChatService changes

**Files:**
- Create: `backend/src/modules/chat/dto/chat-attachment.dto.ts`
- Modify: `backend/src/modules/chat/dto/create-message.dto.ts`
- Modify: `backend/src/modules/chat/chat.service.ts`
- Modify: `backend/src/modules/chat/chat.service.spec.ts`
- Modify: `backend/src/modules/chat/chat.module.ts`

- [ ] **Step 1: Přidej failing testy do chat.service.spec.ts**

Na konec souboru (před závěrečnou `}`) přidej:

```typescript
describe('sendMessage — attachments', () => {
  const membership = { ...mockPJMembership, avatarUrl: undefined, characterPath: 'Elara' };
  const attachment = {
    url: 'https://res.cloudinary.com/test.jpg', publicId: 'chat/world1/ch1/abc',
    type: 'image' as const, mimeType: 'image/jpeg', filename: 'img.jpg', size: 1024,
  };

  it('should throw BadRequestException when neither content nor attachments provided', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    await expect(
      service.sendMessage('ch1', {} as any, mockPJ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should allow message with only attachments (no content)', async () => {
    const mockMsg = {
      id: 'msg1', channelId: 'ch1', worldId: 'world1', senderId: 'user1', senderName: 'Elara',
      content: null, isEdited: false, isDeleted: false, reactions: {}, attachments: [attachment],
      createdAt: new Date(), updatedAt: new Date(),
    };
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(membership);
    mockMembershipRepo.findByWorldId.mockResolvedValue([membership]);
    mockMessageRepo.save.mockResolvedValue(mockMsg);
    mockChannelRepo.update.mockResolvedValue(mockChannel);
    const result = await service.sendMessage('ch1', { attachments: [attachment] } as any, mockPJ);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe('image');
  });
});

describe('findChannelForUpload', () => {
  it('should return channel when user has access', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(mockPJMembership);
    const result = await service.findChannelForUpload('ch1', 'user1');
    expect(result.id).toBe('ch1');
  });

  it('should throw NotFoundException for unknown channel', async () => {
    mockChannelRepo.findById.mockResolvedValue(null);
    await expect(service.findChannelForUpload('unknown', 'user1')).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when no channel access', async () => {
    mockChannelRepo.findById.mockResolvedValue(mockChannel);
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
    await expect(service.findChannelForUpload('ch1', 'stranger')).rejects.toThrow(ForbiddenException);
  });
});
```

Také přidej `BadRequestException` do importu na řádku 2:
```typescript
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
```

- [ ] **Step 2: Spusť testy — ověř že selžou**

```
cd backend && npx jest chat.service.spec.ts --no-coverage 2>&1 | Select-Object -Last 15
```

Očekávaný výstup: nové testy selžou — `BadRequestException` a `findChannelForUpload` ještě neexistují.

- [ ] **Step 3: Vytvoř chat-attachment.dto.ts**

Vytvoř soubor `backend/src/modules/chat/dto/chat-attachment.dto.ts`:

```typescript
import { IsIn, IsInt, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class ChatAttachmentDto {
  @IsUrl() url: string;

  @IsString() @MaxLength(512) publicId: string;

  @IsIn(['image', 'video', 'document']) type: 'image' | 'video' | 'document';

  @IsString() @MaxLength(128) mimeType: string;

  @IsString() @MaxLength(255) filename: string;

  @IsInt() @Min(1) @Max(52428800) size: number;
}
```

- [ ] **Step 4: Uprav create-message.dto.ts**

Nahraď celý obsah `backend/src/modules/chat/dto/create-message.dto.ts`:

```typescript
import {
  IsString, MinLength, MaxLength, IsOptional, IsArray, Matches, IsUrl,
  ValidateNested, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatAttachmentDto } from './chat-attachment.dto';

export class CreateMessageDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000)
  content?: string;

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'rpDate musí být ve formátu YYYY-MM-DD' })
  rpDate?: string;

  @IsOptional() @IsString() @MaxLength(24)
  replyToId?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  visibleTo?: string[];

  @IsOptional() @IsString() @MaxLength(64)
  overrideName?: string;

  @IsOptional() @IsUrl() @MaxLength(512)
  overrideAvatarUrl?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @ArrayMaxSize(10) @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
```

- [ ] **Step 5: Uprav chat.service.ts — přidej BadRequestException import a validaci + findChannelForUpload + attachments v save + deleteMessage event**

Uprav import na začátku `backend/src/modules/chat/chat.service.ts` — přidej `BadRequestException`:

```typescript
import {
  Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
```

V metodě `sendMessage` přidej validaci hned po channel access check (za řádkem `throw new ForbiddenException('Nedostatečná oprávnění');`):

```typescript
if (!dto.content && (!dto.attachments || dto.attachments.length === 0)) {
  throw new BadRequestException('Zpráva musí obsahovat text nebo přílohu');
}
```

V `messageRepo.save({...})` volání uvnitř `sendMessage` přidej `attachments` field:

```typescript
const message = await this.messageRepo.save({
  channelId,
  worldId: channel.worldId,
  senderId: requester.id,
  senderName,
  senderAvatarUrl,
  overrideName: dto.overrideName,
  overrideAvatarUrl: dto.overrideAvatarUrl,
  content: dto.content ?? null,
  isEdited: false,
  isDeleted: false,
  rpDate: dto.rpDate,
  replyToId: dto.replyToId,
  replyToPreview,
  replyToSenderName,
  visibleTo,
  reactions: {},
  attachments: dto.attachments ?? [],
});
```

V metodě `deleteMessage` uprav emit aby obsahoval přílohy:

```typescript
// Před:
this.eventEmitter.emit('chat.message.deleted', { channelId: msg.channelId, messageId });
// Po:
this.eventEmitter.emit('chat.message.deleted', { channelId: msg.channelId, messageId, attachments: msg.attachments });
```

Na konec třídy `ChatService` (před poslední `}`) přidej novou metodu:

```typescript
async findChannelForUpload(channelId: string, userId: string): Promise<ChatChannel> {
  const channel = await this.channelRepo.findById(channelId);
  if (!channel || channel.isDeleted) throw new NotFoundException('Kanál nenalezen');
  if (!(await this.hasChannelAccess(channel, userId))) throw new ForbiddenException('Nedostatečná oprávnění');
  return channel;
}
```

- [ ] **Step 6: Uprav chat.module.ts — přidej export ChatService**

Otevři `backend/src/modules/chat/chat.module.ts`. Přidej `exports` sekci:

```typescript
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
  exports: [ChatService],
})
export class ChatModule {}
```

- [ ] **Step 7: Ověř TypeScript a testy**

```
cd backend && npx tsc --noEmit && npx jest chat.service.spec.ts --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené (počet vzroste na ~45+).

- [ ] **Step 8: Commit**

```
git add backend/src/modules/chat/dto/chat-attachment.dto.ts
git add backend/src/modules/chat/dto/create-message.dto.ts
git add backend/src/modules/chat/chat.service.ts
git add backend/src/modules/chat/chat.service.spec.ts
git add backend/src/modules/chat/chat.module.ts
git commit -m "feat(chat): make content optional, add attachments to CreateMessageDto, add findChannelForUpload"
```

---

## Task 3: UploadService

**Files:**
- Create: `backend/src/modules/upload/upload.service.ts`
- Create: `backend/src/modules/upload/upload.service.spec.ts`

- [ ] **Step 1: Nainstaluj dependencies**

```
cd backend && npm install cloudinary && npm install --save-dev @types/multer
```

Očekávaný výstup: `added N packages` bez chyb.

- [ ] **Step 2: Napiš failing testy**

Vytvoř soubor `backend/src/modules/upload/upload.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { UnsupportedMediaTypeException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { v2 as cloudinary } from 'cloudinary';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

const makeFile = (mimetype: string, size = 1024): Express.Multer.File => ({
  mimetype,
  originalname: 'test-file.jpg',
  size,
  buffer: Buffer.from('test-content'),
  fieldname: 'file',
  encoding: '7bit',
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
});

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-value') } },
      ],
    }).compile();
    service = module.get(UploadService);
    jest.clearAllMocks();
  });

  it('should throw UnsupportedMediaTypeException for blocked MIME type', async () => {
    await expect(
      service.uploadFile(makeFile('application/x-executable'), 'world1', 'ch1'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('should throw UnsupportedMediaTypeException for application/zip', async () => {
    await expect(
      service.uploadFile(makeFile('application/zip'), 'world1', 'ch1'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('should upload image/jpeg and return ChatAttachment with type image', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((_opts, cb) => {
      cb(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/abc.jpg', public_id: 'chat/world1/ch1/abc' });
      return mockWritable;
    });

    const result = await service.uploadFile(makeFile('image/jpeg'), 'world1', 'ch1');

    expect(result.type).toBe('image');
    expect(result.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/abc.jpg');
    expect(result.publicId).toBe('chat/world1/ch1/abc');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.filename).toBe('test-file.jpg');
    expect(result.size).toBe(1024);
  });

  it('should upload video/mp4 and return ChatAttachment with type video', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((_opts, cb) => {
      cb(null, { secure_url: 'https://res.cloudinary.com/demo/video/upload/v1/video.mp4', public_id: 'chat/world1/ch1/vid' });
      return mockWritable;
    });

    const result = await service.uploadFile(makeFile('video/mp4'), 'world1', 'ch1');
    expect(result.type).toBe('video');
  });

  it('should upload application/pdf and return ChatAttachment with type document', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((_opts, cb) => {
      cb(null, { secure_url: 'https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf', public_id: 'chat/world1/ch1/doc' });
      return mockWritable;
    });

    const result = await service.uploadFile(makeFile('application/pdf'), 'world1', 'ch1');
    expect(result.type).toBe('document');
  });

  it('should throw BadGatewayException when Cloudinary returns error', async () => {
    const mockWritable = { end: jest.fn() };
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation((_opts, cb) => {
      cb(new Error('Cloudinary unavailable'), null);
      return mockWritable;
    });

    await expect(
      service.uploadFile(makeFile('image/png'), 'world1', 'ch1'),
    ).rejects.toThrow(BadGatewayException);
  });

  it('should call cloudinary.destroy for each attachment in handleMessageDeleted', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({ result: 'ok' });

    await service.handleMessageDeleted({
      attachments: [
        { publicId: 'chat/abc', type: 'image', url: 'https://example.com', mimeType: 'image/jpeg', filename: 'a.jpg', size: 100 },
        { publicId: 'chat/def', type: 'document', url: 'https://example.com', mimeType: 'application/pdf', filename: 'b.pdf', size: 200 },
      ],
    });

    expect(cloudinary.uploader.destroy).toHaveBeenCalledTimes(2);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('chat/abc', { resource_type: 'image' });
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('chat/def', { resource_type: 'raw' });
  });

  it('should not throw when handleMessageDeleted receives empty attachments', async () => {
    await expect(service.handleMessageDeleted({})).resolves.not.toThrow();
    await expect(service.handleMessageDeleted({ attachments: [] })).resolves.not.toThrow();
  });

  it('should not throw when Cloudinary destroy fails (best-effort)', async () => {
    (cloudinary.uploader.destroy as jest.Mock).mockRejectedValue(new Error('Network error'));

    await expect(
      service.handleMessageDeleted({
        attachments: [{ publicId: 'chat/abc', type: 'image', url: '', mimeType: 'image/jpeg', filename: 'a.jpg', size: 100 }],
      }),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Spusť testy — ověř že selžou**

```
cd backend && npx jest upload.service.spec.ts --no-coverage 2>&1 | Select-Object -Last 10
```

Očekávaný výstup: `Cannot find module './upload.service'`.

- [ ] **Step 4: Implementuj upload.service.ts**

Vytvoř soubor `backend/src/modules/upload/upload.service.ts`:

```typescript
import { Injectable, UnsupportedMediaTypeException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { v2 as cloudinary } from 'cloudinary';
import type { ChatAttachment } from '../chat/interfaces/chat-attachment.interface';

const ALLOWED_MIME_TYPES: Record<string, 'image' | 'video' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
};

function getResourceType(type: 'image' | 'video' | 'document'): 'image' | 'video' | 'raw' {
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  return 'raw';
}

@Injectable()
export class UploadService {
  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: configService.get('CLOUDINARY_API_KEY'),
      api_secret: configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    worldId: string,
    channelId: string,
  ): Promise<ChatAttachment> {
    const type = ALLOWED_MIME_TYPES[file.mimetype];
    if (!type) {
      throw new UnsupportedMediaTypeException(`Nepodporovaný typ souboru: ${file.mimetype}`);
    }

    const resourceType = getResourceType(type);
    let result: { secure_url: string; public_id: string };

    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { folder: `chat/${worldId}/${channelId}`, resource_type: resourceType },
            (err, res) => {
              if (err || !res) reject(err ?? new Error('Cloudinary: no response'));
              else resolve(res as { secure_url: string; public_id: string });
            },
          )
          .end(file.buffer);
      });
    } catch {
      throw new BadGatewayException('Chyba při nahrávání souboru na Cloudinary');
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      type,
      mimeType: file.mimetype,
      filename: file.originalname,
      size: file.size,
    };
  }

  @OnEvent('chat.message.deleted')
  async handleMessageDeleted(payload: { attachments?: ChatAttachment[] }): Promise<void> {
    for (const att of payload.attachments ?? []) {
      try {
        await cloudinary.uploader.destroy(att.publicId, { resource_type: getResourceType(att.type) });
      } catch {
        console.error(`[UploadService] Failed to delete Cloudinary asset: ${att.publicId}`);
      }
    }
  }
}
```

- [ ] **Step 5: Spusť testy — ověř že jsou zelené**

```
cd backend && npx jest upload.service.spec.ts --no-coverage
```

Očekávaný výstup: `9 tests passed`.

- [ ] **Step 6: Ověř TypeScript**

```
cd backend && npx tsc --noEmit
```

Očekávaný výstup: `0 errors`

- [ ] **Step 7: Commit**

```
git add backend/src/modules/upload/upload.service.ts
git add backend/src/modules/upload/upload.service.spec.ts
git commit -m "feat(upload): add UploadService with Cloudinary integration and cleanup listener"
```

---

## Task 4: UploadController + UploadModule + wiring

**Files:**
- Create: `backend/src/modules/upload/filters/multer-exception.filter.ts`
- Create: `backend/src/modules/upload/upload.controller.ts`
- Create: `backend/src/modules/upload/upload.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř MulterExceptionFilter**

Vytvoř soubor `backend/src/modules/upload/filters/multer-exception.filter.ts`:

```typescript
import { Catch, ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ statusCode: 413, message: 'Soubor je příliš velký (max 50 MB)' });
    } else {
      response.status(400).json({ statusCode: 400, message: error.message });
    }
  }
}
```

- [ ] **Step 2: Vytvoř UploadController**

Vytvoř soubor `backend/src/modules/upload/upload.controller.ts`:

```typescript
import {
  Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException,
  UseFilters,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';
import { UploadService } from './upload.service';
import { ChatService } from '../chat/chat.service';
import { MulterExceptionFilter } from './filters/multer-exception.filter';

@Controller('upload')
@UseGuards(JwtAuthGuard)
@UseFilters(MulterExceptionFilter)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly chatService: ChatService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('channelId') channelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Soubor je povinný');
    if (!channelId) throw new BadRequestException('channelId je povinné');
    const channel = await this.chatService.findChannelForUpload(channelId, user.id);
    return this.uploadService.uploadFile(file, channel.worldId, channelId);
  }
}
```

- [ ] **Step 3: Vytvoř UploadModule**

Vytvoř soubor `backend/src/modules/upload/upload.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
```

- [ ] **Step 4: Přidej UploadModule do AppModule**

Nahraď obsah `backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { GatewaysModule } from './gateways/gateways.module';
import { WorldsModule } from './modules/worlds/worlds.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadModule } from './modules/upload/upload.module';
import { MatrixWorldSeed } from './database/seed/matrix-world.seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    AuthModule,
    WorldsModule,
    ChatModule,
    UploadModule,
    GatewaysModule,
  ],
  controllers: [AppController],
  providers: [MatrixWorldSeed],
})
export class AppModule {}
```

- [ ] **Step 5: Ověř TypeScript a všechny testy**

```
cd backend && npx tsc --noEmit && npx jest --no-coverage
```

Očekávaný výstup: `0 errors`, všechny testy zelené.

- [ ] **Step 6: Commit**

```
git add backend/src/modules/upload/filters/multer-exception.filter.ts
git add backend/src/modules/upload/upload.controller.ts
git add backend/src/modules/upload/upload.module.ts
git add backend/src/app.module.ts
git commit -m "feat(upload): add UploadController, UploadModule and wire into AppModule"
```

---

## Self-review checklist (proveď před PR)

```
cd backend && npx tsc --noEmit && npx jest --no-coverage
```

Ověř:
- [ ] `attachments: []` je ve všech mockMsg v chat.service.spec.ts
- [ ] `ChatService.findChannelForUpload` existuje a je exportována přes ChatModule
- [ ] `POST /api/upload` přijme `multipart/form-data` s `file` a `channelId`
- [ ] Nepodporované MIME typy vrátí 415
- [ ] Soubor > 50 MB vrátí 413
- [ ] Smazání zprávy s přílohami triggerne async Cloudinary cleanup
- [ ] `cloudinary` a `@types/multer` jsou v package.json
