# Krok 13 — Push notifikace: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat VAPID Web Push notifikace — subscription management, odeslání při nové chat zprávě, IkarosNews a GameEvent připomínce 24h předem.

**Architecture:** Nový `PushModule` (@Global) exportuje `PushService` který odesílá push přes knihovnu `web-push`. ChatService, GlobalChatService a IkarosNewsService volají PushService přímo po uložení entity. GameEvent připomínka běží jako cron job.

**Tech Stack:** NestJS, Mongoose, `web-push` npm, `@nestjs/schedule` (cron)

> **Poznámka:** GameEvent modul (Krok 10a) není v repozitáři přítomen. Úkol 9 vytvoří minimální GameEvent schema + repository potřebné pro reminder cron job.

---

## Přehled souborů

**Nové soubory:**
- `backend/src/modules/push/push.module.ts`
- `backend/src/modules/push/push.controller.ts`
- `backend/src/modules/push/push.service.ts`
- `backend/src/modules/push/push.service.spec.ts`
- `backend/src/modules/push/schemas/push-subscription.schema.ts`
- `backend/src/modules/push/interfaces/push-subscription.interface.ts`
- `backend/src/modules/push/interfaces/push-subscription-repository.interface.ts`
- `backend/src/modules/push/repositories/push-subscription.repository.ts`
- `backend/src/modules/push/dto/subscribe.dto.ts`
- `backend/src/modules/game-events/schemas/game-event.schema.ts`
- `backend/src/modules/game-events/interfaces/game-event.interface.ts`
- `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts`
- `backend/src/modules/game-events/repositories/game-event.repository.ts`
- `backend/src/modules/game-events/game-event-reminder.job.ts`
- `backend/src/modules/game-events/game-events.module.ts`

**Upravené soubory:**
- `backend/src/app.module.ts` — PushModule + GameEventsModule + ScheduleModule
- `backend/src/modules/chat/chat.service.ts` — push po sendMessage
- `backend/src/modules/chat/chat.module.ts` — import PushModule
- `backend/src/modules/global-chat/global-chat.service.ts` — push po sendMessage
- `backend/src/modules/global-chat/global-chat.module.ts` — import PushModule
- `backend/src/modules/ikaros-news/ikaros-news.service.ts` — push po create
- `backend/src/modules/ikaros-news/ikaros-news.module.ts` — import PushModule

---

## Task 1: Instalace závislostí a ENV

**Files:**
- Modify: `backend/package.json`
- Modify: `.env` (root nebo `backend/.env`)

- [ ] **Step 1: Nainstaluj web-push a @nestjs/schedule**

```bash
cd backend
npm install web-push @nestjs/schedule
npm install --save-dev @types/web-push
```

Očekávaný výstup: `added N packages`

- [ ] **Step 2: Vygeneruj VAPID klíče**

```bash
npx web-push generate-vapid-keys
```

Výstup bude vypadat takto:
```
Public Key: BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxB
Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 3: Přidej do .env**

```env
VAPID_PUBLIC_KEY=<hodnota z předchozího kroku>
VAPID_PRIVATE_KEY=<hodnota z předchozího kroku>
VAPID_SUBJECT=mailto:admin@ikaros.cz
```

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(push): install web-push and @nestjs/schedule"
```

---

## Task 2: PushSubscription schema + interface + DTO

**Files:**
- Create: `backend/src/modules/push/schemas/push-subscription.schema.ts`
- Create: `backend/src/modules/push/interfaces/push-subscription.interface.ts`
- Create: `backend/src/modules/push/interfaces/push-subscription-repository.interface.ts`
- Create: `backend/src/modules/push/dto/subscribe.dto.ts`

- [ ] **Step 1: Vytvoř interface**

```typescript
// backend/src/modules/push/interfaces/push-subscription.interface.ts
export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}
```

- [ ] **Step 2: Vytvoř repository interface**

```typescript
// backend/src/modules/push/interfaces/push-subscription-repository.interface.ts
import type { PushSubscription } from './push-subscription.interface';

export interface IPushSubscriptionRepository {
  findByUserId(userId: string): Promise<PushSubscription[]>;
  findAll(): Promise<PushSubscription[]>;
  upsertByEndpoint(data: Omit<PushSubscription, 'id' | 'createdAt'>): Promise<PushSubscription>;
  deleteByEndpoint(endpoint: string, userId: string): Promise<boolean>;
  deleteByEndpointOnly(endpoint: string): Promise<void>;
}
```

- [ ] **Step 3: Vytvoř Mongoose schema**

```typescript
// backend/src/modules/push/schemas/push-subscription.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PushSubscriptionDocument = HydratedDocument<PushSubscriptionSchemaClass>;

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, unique: true }) endpoint: string;
  @Prop({ required: true }) p256dh: string;
  @Prop({ required: true }) auth: string;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscriptionSchemaClass);
```

- [ ] **Step 4: Vytvoř DTO**

```typescript
// backend/src/modules/push/dto/subscribe.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class SubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
  @IsString() @IsNotEmpty() p256dh: string;
  @IsString() @IsNotEmpty() auth: string;
}

export class UnsubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/push/
git commit -m "feat(push): PushSubscription schema, interface, DTO"
```

---

## Task 3: PushSubscription repository

**Files:**
- Create: `backend/src/modules/push/repositories/push-subscription.repository.ts`

- [ ] **Step 1: Vytvoř repository**

```typescript
// backend/src/modules/push/repositories/push-subscription.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PushSubscriptionSchemaClass } from '../schemas/push-subscription.schema';
import type { PushSubscription } from '../interfaces/push-subscription.interface';
import type { IPushSubscriptionRepository } from '../interfaces/push-subscription-repository.interface';

@Injectable()
export class MongoPushSubscriptionRepository implements IPushSubscriptionRepository {
  constructor(
    @InjectModel(PushSubscriptionSchemaClass.name)
    private readonly model: Model<PushSubscriptionSchemaClass>,
  ) {}

  async findByUserId(userId: string): Promise<PushSubscription[]> {
    const docs = await this.model.find({ userId }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findAll(): Promise<PushSubscription[]> {
    const docs = await this.model.find().lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async upsertByEndpoint(
    data: Omit<PushSubscription, 'id' | 'createdAt'>,
  ): Promise<PushSubscription> {
    const doc = await this.model
      .findOneAndUpdate(
        { endpoint: data.endpoint },
        { $set: { userId: data.userId, p256dh: data.p256dh, auth: data.auth } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async deleteByEndpoint(endpoint: string, userId: string): Promise<boolean> {
    const result = await this.model.deleteOne({ endpoint, userId }).exec();
    return result.deletedCount > 0;
  }

  async deleteByEndpointOnly(endpoint: string): Promise<void> {
    await this.model.deleteOne({ endpoint }).exec();
  }

  private toEntity(doc: Record<string, unknown>): PushSubscription {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      endpoint: doc.endpoint as string,
      p256dh: doc.p256dh as string,
      auth: doc.auth as string,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/push/repositories/
git commit -m "feat(push): MongoPushSubscriptionRepository"
```

---

## Task 4: PushService + unit testy

**Files:**
- Create: `backend/src/modules/push/push.service.ts`
- Create: `backend/src/modules/push/push.service.spec.ts`

- [ ] **Step 1: Napiš failing testy**

```typescript
// backend/src/modules/push/push.service.spec.ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';
import type { IPushSubscriptionRepository } from './interfaces/push-subscription-repository.interface';
import type { PushSubscription } from './interfaces/push-subscription.interface';

jest.mock('web-push');
import * as webpush from 'web-push';

const makeSub = (overrides: Partial<PushSubscription> = {}): PushSubscription => ({
  id: 'sub1',
  userId: 'user1',
  endpoint: 'https://push.example.com/sub1',
  p256dh: 'key',
  auth: 'auth',
  createdAt: new Date(),
  ...overrides,
});

describe('PushService', () => {
  let service: PushService;
  let repo: jest.Mocked<IPushSubscriptionRepository>;

  beforeEach(async () => {
    repo = {
      findByUserId: jest.fn(),
      findAll: jest.fn(),
      upsertByEndpoint: jest.fn(),
      deleteByEndpoint: jest.fn(),
      deleteByEndpointOnly: jest.fn(),
    } as jest.Mocked<IPushSubscriptionRepository>;

    const module = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: 'IPushSubscriptionRepository', useValue: repo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                VAPID_PUBLIC_KEY: 'pubkey',
                VAPID_PRIVATE_KEY: 'privkey',
                VAPID_SUBJECT: 'mailto:test@test.com',
              };
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get(PushService);
    (webpush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
  });

  it('notify — odešle push na všechny subscriptions usera', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('notify — přeskočí usera bez subscriptions', async () => {
    repo.findByUserId.mockResolvedValue([]);
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('notifyUsers — odešle push každému userId', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    await service.notifyUsers(['user1', 'user2'], { title: 'Test', body: 'Ahoj' });
    expect(repo.findByUserId).toHaveBeenCalledTimes(2);
  });

  it('notifyAll — odešle push všem subscriptions', async () => {
    repo.findAll.mockResolvedValue([makeSub(), makeSub({ id: 'sub2', userId: 'user2', endpoint: 'https://push.example.com/sub2' })]);
    await service.notifyAll({ title: 'Test', body: 'Ahoj' });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('auto-cleanup — smaže subscription při 410', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(repo.deleteByEndpointOnly).toHaveBeenCalledWith('https://push.example.com/sub1');
  });

  it('auto-cleanup — smaže subscription při 404', async () => {
    repo.findByUserId.mockResolvedValue([makeSub()]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 404 });
    await service.notify('user1', { title: 'Test', body: 'Ahoj' });
    expect(repo.deleteByEndpointOnly).toHaveBeenCalledWith('https://push.example.com/sub1');
  });

  it('subscribe — upsertne subscription', async () => {
    repo.upsertByEndpoint.mockResolvedValue(makeSub());
    await service.subscribe('user1', { endpoint: 'https://...', p256dh: 'k', auth: 'a' });
    expect(repo.upsertByEndpoint).toHaveBeenCalledWith({ userId: 'user1', endpoint: 'https://...', p256dh: 'k', auth: 'a' });
  });

  it('unsubscribe — smaže subscription', async () => {
    repo.deleteByEndpoint.mockResolvedValue(true);
    await service.unsubscribe('user1', 'https://...');
    expect(repo.deleteByEndpoint).toHaveBeenCalledWith('https://...', 'user1');
  });
});
```

- [ ] **Step 2: Spusť testy — ověř že failují**

```bash
cd backend
npx jest push.service.spec --no-coverage
```

Očekávaný výstup: `FAIL` — `Cannot find module './push.service'`

- [ ] **Step 3: Implementuj PushService**

```typescript
// backend/src/modules/push/push.service.ts
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { IPushSubscriptionRepository } from './interfaces/push-subscription-repository.interface';
import type { PushSubscription } from './interfaces/push-subscription.interface';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject('IPushSubscriptionRepository')
    private readonly repo: IPushSubscriptionRepository,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    webpush.setVapidDetails(
      this.config.get<string>('VAPID_SUBJECT')!,
      this.config.get<string>('VAPID_PUBLIC_KEY')!,
      this.config.get<string>('VAPID_PRIVATE_KEY')!,
    );
  }

  getPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY')!;
  }

  async subscribe(userId: string, data: { endpoint: string; p256dh: string; auth: string }): Promise<PushSubscription> {
    return this.repo.upsertByEndpoint({ userId, ...data });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.repo.deleteByEndpoint(endpoint, userId);
  }

  async notify(userId: string, payload: PushPayload): Promise<void> {
    const subs = await this.repo.findByUserId(userId);
    await this.sendToSubscriptions(subs, payload);
  }

  async notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(userIds.map((id) => this.notify(id, payload)));
  }

  async notifyAll(payload: PushPayload): Promise<void> {
    const subs = await this.repo.findAll();
    await this.sendToSubscriptions(subs, payload);
  }

  private async sendToSubscriptions(subs: PushSubscription[], payload: PushPayload): Promise<void> {
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.repo.deleteByEndpointOnly(sub.endpoint);
          } else {
            this.logger.warn(`Push failed for ${sub.endpoint}: ${String(err)}`);
          }
        }
      }),
    );
  }
}
```

- [ ] **Step 4: Spusť testy — ověř že projdou**

```bash
npx jest push.service.spec --no-coverage
```

Očekávaný výstup: `PASS  src/modules/push/push.service.spec.ts` — 8 tests passed

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/push/push.service.ts backend/src/modules/push/push.service.spec.ts
git commit -m "feat(push): PushService s notify/notifyAll/subscribe/unsubscribe + testy"
```

---

## Task 5: PushController

**Files:**
- Create: `backend/src/modules/push/push.controller.ts`

- [ ] **Step 1: Implementuj controller**

```typescript
// backend/src/modules/push/push.controller.ts
import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { PushService } from './push.service';
import { SubscribeDto, UnsubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../worlds/worlds.service';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  getVapidPublicKey(): { publicKey: string } {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.pushService.subscribe(user.id, dto);
  }

  @Post('unsubscribe')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Body() dto: UnsubscribeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.pushService.unsubscribe(user.id, dto.endpoint);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/push/push.controller.ts
git commit -m "feat(push): PushController (vapid-public-key, subscribe, unsubscribe)"
```

---

## Task 6: PushModule + registrace v AppModule

**Files:**
- Create: `backend/src/modules/push/push.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř PushModule jako @Global**

```typescript
// backend/src/modules/push/push.module.ts
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushSubscriptionSchemaClass, PushSubscriptionSchema } from './schemas/push-subscription.schema';
import { MongoPushSubscriptionRepository } from './repositories/push-subscription.repository';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscriptionSchemaClass.name, schema: PushSubscriptionSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [
    PushService,
    { provide: 'IPushSubscriptionRepository', useClass: MongoPushSubscriptionRepository },
  ],
  exports: [PushService],
})
export class PushModule {}
```

- [ ] **Step 2: Přidej PushModule a ScheduleModule do AppModule**

V souboru `backend/src/app.module.ts`:

Na začátek importů přidej:
```typescript
import { ScheduleModule } from '@nestjs/schedule';
import { PushModule } from './modules/push/push.module';
```

Do pole `imports` přidej (za `EventEmitterModule.forRoot()`):
```typescript
ScheduleModule.forRoot(),
PushModule,
```

- [ ] **Step 3: Ověř kompilaci**

```bash
cd backend
npm run build 2>&1 | tail -20
```

Očekávaný výstup: `Successfully compiled` (žádné errory)

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/push/push.module.ts backend/src/app.module.ts
git commit -m "feat(push): PushModule (@Global) + registrace v AppModule + ScheduleModule"
```

---

## Task 7: GlobalChat integrace

**Files:**
- Modify: `backend/src/modules/global-chat/global-chat.service.ts`

- [ ] **Step 1: Injektuj PushService do GlobalChatService**

V `global-chat.service.ts` přidej import:
```typescript
import { PushService } from '../push/push.service';
```

Přidej do konstruktoru:
```typescript
private readonly pushService: PushService,
```

Konstruktor bude vypadat:
```typescript
constructor(
  @Inject('IChatChannelRepository') private readonly channelRepo: IChatChannelRepository,
  @Inject('IChatMessageRepository') private readonly messageRepo: IChatMessageRepository,
  private readonly eventEmitter: EventEmitter2,
  private readonly pushService: PushService,
) {}
```

- [ ] **Step 2: Přidej push po odeslání zprávy**

V metodě `sendMessage` na konci (po `this.eventEmitter.emit`), přidej:

```typescript
// fire-and-forget push — nečekáme na výsledek
void this.pushService.notifyAll({
  title: user.username,
  body: (dto.content ?? '').slice(0, 100),
}).catch(() => undefined);
```

- [ ] **Step 3: Ověř kompilaci**

```bash
cd backend
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Oprav existující global-chat.service.spec.ts**

V souboru `backend/src/modules/global-chat/global-chat.service.spec.ts` přidej mock PushService do `beforeEach`:

```typescript
// Přidej do importů:
import { PushService } from '../push/push.service';

// Do beforeEach — do createTestingModule providers:
{
  provide: PushService,
  useValue: { notifyAll: jest.fn().mockResolvedValue(undefined) },
},
```

Spusť testy:
```bash
npx jest global-chat.service.spec --no-coverage
```

Očekávaný výstup: `PASS`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/global-chat/global-chat.service.ts \
        backend/src/modules/global-chat/global-chat.service.spec.ts
git commit -m "feat(push): GlobalChatService — push notifikace při nové zprávě"
```

---

## Task 8: WorldChat integrace (ChatService)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts`

- [ ] **Step 1: Injektuj PushService do ChatService**

V `chat.service.ts` přidej import:
```typescript
import { PushService } from '../push/push.service';
```

Přidej do konstruktoru:
```typescript
private readonly pushService: PushService,
```

Konstruktor bude vypadat:
```typescript
constructor(
  @Inject('IChatGroupRepository') private readonly groupRepo: IChatGroupRepository,
  @Inject('IChatChannelRepository') private readonly channelRepo: IChatChannelRepository,
  @Inject('IChatMessageRepository') private readonly messageRepo: IChatMessageRepository,
  @Inject('IChannelReadStatusRepository') private readonly readRepo: IChannelReadStatusRepository,
  @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  private readonly eventEmitter: EventEmitter2,
  private readonly pushService: PushService,
) {}
```

- [ ] **Step 2: Přidej privátní metodu pro resolving příjemců**

Přidej novou privátní metodu do třídy `ChatService` (za `hasChannelAccess`):

```typescript
private async resolveChannelRecipients(
  channel: ChatChannel,
  senderUserId: string,
): Promise<string[]> {
  // whisper — příjemci jsou explicitně v visibleTo, sender se nepočítá
  // tato metoda se volá pro non-whisper zprávy
  if (channel.accessMode === 'members') {
    return channel.allowedMemberIds.filter((id) => id !== senderUserId);
  }

  const members = await this.membershipRepo.findByWorldId(channel.worldId!);
  const activeMemberIds = members
    .filter((m) => m.role !== 0 /* WorldRole.Pending */)
    .map((m) => m.userId);

  const recipientIds: string[] = [];
  for (const userId of activeMemberIds) {
    if (userId === senderUserId) continue;
    if (await this.hasChannelAccess(channel, userId)) {
      recipientIds.push(userId);
    }
  }
  return recipientIds;
}
```

- [ ] **Step 3: Přidej push po uložení zprávy v sendMessage**

V metodě `sendMessage`, po řádku `await this.broadcastUnreadUpdate(channel, requester.id);`, přidej:

```typescript
// Push notifikace — fire-and-forget
void (async () => {
  try {
    let recipientIds: string[];
    if (message.visibleTo && message.visibleTo.length > 0) {
      // whisper: push jen příjemcům (bez odesílatele)
      recipientIds = message.visibleTo.filter((id) => id !== requester.id);
    } else {
      recipientIds = await this.resolveChannelRecipients(channel, requester.id);
    }
    if (recipientIds.length > 0) {
      await this.pushService.notifyUsers(recipientIds, {
        title: message.overrideName ?? message.senderName,
        body: (message.content ?? '').slice(0, 100),
      });
    }
  } catch {
    // push je best-effort
  }
})();
```

- [ ] **Step 4: Ověř kompilaci**

```bash
cd backend
npm run build 2>&1 | tail -10
```

- [ ] **Step 5: Oprav existující chat.service.spec.ts**

V souboru `backend/src/modules/chat/chat.service.spec.ts` přidej mock PushService do `beforeEach`:

```typescript
// Přidej do importů:
import { PushService } from '../push/push.service';

// Do beforeEach — do createTestingModule providers:
{
  provide: PushService,
  useValue: { notifyUsers: jest.fn().mockResolvedValue(undefined) },
},
```

Spusť testy:
```bash
npx jest chat.service.spec --no-coverage
```

Očekávaný výstup: `PASS`

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/chat/chat.service.ts \
        backend/src/modules/chat/chat.service.spec.ts
git commit -m "feat(push): ChatService — push notifikace při nové world chat zprávě"
```

---

## Task 9: IkarosNews integrace

**Files:**
- Modify: `backend/src/modules/ikaros-news/ikaros-news.service.ts`

- [ ] **Step 1: Injektuj PushService do IkarosNewsService**

V `ikaros-news.service.ts` přidej import:
```typescript
import { PushService } from '../push/push.service';
```

Uprav konstruktor:
```typescript
constructor(
  @Inject('IIkarosNewsRepository') private readonly repo: IIkarosNewsRepository,
  private readonly pushService: PushService,
) {}
```

- [ ] **Step 2: Přidej push po vytvoření novinky**

V metodě `create`, po `return this.repo.create(...)` — protože create vrací hodnotu, nejdřív ji uložíme:

```typescript
async create(
  dto: CreateIkarosNewsDto,
  authorId: string,
  authorName: string,
  role: UserRole,
): Promise<IkarosNewsItem> {
  this.assertCanWrite(role);
  const item = await this.repo.create({
    title: dto.title,
    content: dto.content,
    authorId,
    authorName,
    createdAtUtc: new Date(),
    isActive: true,
  });

  void this.pushService.notifyAll({
    title: 'Nová novinka na Ikarosu',
    body: item.title.slice(0, 100),
  }).catch(() => undefined);

  return item;
}
```

- [ ] **Step 3: Ověř kompilaci**

```bash
cd backend
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/ikaros-news/ikaros-news.service.ts
git commit -m "feat(push): IkarosNewsService — push notifikace při nové novince"
```

---

## Task 10: GameEvent schema + minimální modul

**Files:**
- Create: `backend/src/modules/game-events/interfaces/game-event.interface.ts`
- Create: `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts`
- Create: `backend/src/modules/game-events/schemas/game-event.schema.ts`
- Create: `backend/src/modules/game-events/repositories/game-event.repository.ts`

> Tento task vytváří minimální GameEvent infrastrukturu potřebnou pro reminder cron job. Plný CRUD (Krok 10a) je samostatný úkol mimo tento plán.

- [ ] **Step 1: Vytvoř GameEvent interface**

```typescript
// backend/src/modules/game-events/interfaces/game-event.interface.ts
export interface GameEvent {
  id: string;
  worldId: string;
  title: string;
  date: string;       // ISO 8601 string, slouží jako sort key
  description?: string;
  reminderSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Vytvoř repository interface**

```typescript
// backend/src/modules/game-events/interfaces/game-event-repository.interface.ts
import type { GameEvent } from './game-event.interface';

export interface IGameEventRepository {
  findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]>;
  markReminderSent(id: string): Promise<void>;
}
```

- [ ] **Step 3: Vytvoř Mongoose schema**

```typescript
// backend/src/modules/game-events/schemas/game-event.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GameEventDocument = HydratedDocument<GameEventSchemaClass>;

@Schema({ timestamps: true, collection: 'game_events' })
export class GameEventSchemaClass {
  @Prop({ required: true, index: true }) worldId: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true, index: true }) date: string;
  @Prop() description?: string;
  @Prop({ default: false }) reminderSent: boolean;
}

export const GameEventSchema = SchemaFactory.createForClass(GameEventSchemaClass);
GameEventSchema.index({ date: 1 });
```

- [ ] **Step 4: Vytvoř repository**

```typescript
// backend/src/modules/game-events/repositories/game-event.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameEventSchemaClass } from '../schemas/game-event.schema';
import type { GameEvent } from '../interfaces/game-event.interface';
import type { IGameEventRepository } from '../interfaces/game-event-repository.interface';

@Injectable()
export class MongoGameEventRepository implements IGameEventRepository {
  constructor(
    @InjectModel(GameEventSchemaClass.name)
    private readonly model: Model<GameEventSchemaClass>,
  ) {}

  async findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]> {
    const from = fromDate.toISOString();
    const to = toDate.toISOString();
    const docs = await this.model
      .find({ date: { $gte: from, $lte: to }, reminderSent: false })
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async markReminderSent(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { $set: { reminderSent: true } }).exec();
  }

  private toEntity(doc: Record<string, unknown>): GameEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      title: doc.title as string,
      date: doc.date as string,
      description: doc.description as string | undefined,
      reminderSent: (doc.reminderSent as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game-events/
git commit -m "feat(game-events): minimální GameEvent schema + repository pro push reminder"
```

---

## Task 11: GameEventReminderJob + GameEventsModule

**Files:**
- Create: `backend/src/modules/game-events/game-event-reminder.job.ts`
- Create: `backend/src/modules/game-events/game-events.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Vytvoř cron job**

```typescript
// backend/src/modules/game-events/game-event-reminder.job.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { IGameEventRepository } from './interfaces/game-event-repository.interface';
import type { IWorldMembershipRepository } from '../worlds/interfaces/world-membership-repository.interface';
import { PushService } from '../push/push.service';

@Injectable()
export class GameEventReminderJob {
  private readonly logger = new Logger(GameEventReminderJob.name);

  constructor(
    @Inject('IGameEventRepository')
    private readonly gameEventRepo: IGameEventRepository,
    @Inject('IWorldMembershipRepository')
    private readonly membershipRepo: IWorldMembershipRepository,
    private readonly pushService: PushService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<void> {
    const now = new Date();
    const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    let events: Awaited<ReturnType<IGameEventRepository['findUpcoming']>>;
    try {
      events = await this.gameEventRepo.findUpcoming(from, to);
    } catch (err) {
      this.logger.error('GameEventReminderJob: chyba při načítání eventů', err);
      return;
    }

    for (const event of events) {
      try {
        const members = await this.membershipRepo.findByWorldId(event.worldId);
        const userIds = members
          .filter((m) => m.role !== 0 /* WorldRole.Pending */)
          .map((m) => m.userId);

        if (userIds.length > 0) {
          await this.pushService.notifyUsers(userIds, {
            title: 'Připomínka události',
            body: `${event.title} — začíná za 24 hodin`,
          });
        }

        await this.gameEventRepo.markReminderSent(event.id);
      } catch (err) {
        this.logger.warn(`GameEventReminderJob: chyba pro event ${event.id}`, err);
      }
    }
  }
}
```

- [ ] **Step 2: Vytvoř GameEventsModule**

```typescript
// backend/src/modules/game-events/game-events.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameEventSchemaClass, GameEventSchema } from './schemas/game-event.schema';
import { MongoGameEventRepository } from './repositories/game-event.repository';
import { GameEventReminderJob } from './game-event-reminder.job';
import { WorldsModule } from '../worlds/worlds.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameEventSchemaClass.name, schema: GameEventSchema },
    ]),
    WorldsModule,
  ],
  providers: [
    GameEventReminderJob,
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
  ],
})
export class GameEventsModule {}
```

- [ ] **Step 3: Přidej GameEventsModule do AppModule**

V `backend/src/app.module.ts` přidej import:
```typescript
import { GameEventsModule } from './modules/game-events/game-events.module';
```

Do pole `imports` přidej:
```typescript
GameEventsModule,
```

- [ ] **Step 4: Ověř kompilaci**

```bash
cd backend
npm run build 2>&1 | tail -10
```

Očekávaný výstup: `Successfully compiled`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game-events/game-event-reminder.job.ts \
        backend/src/modules/game-events/game-events.module.ts \
        backend/src/app.module.ts
git commit -m "feat(push): GameEventReminderJob — cron push 24h před eventem"
```

---

## Task 12: Spusť všechny testy + finální ověření

- [ ] **Step 1: Spusť push service testy**

```bash
cd backend
npx jest push.service.spec --no-coverage
```

Očekávaný výstup: `PASS` — 8 tests passed

- [ ] **Step 2: Spusť celou test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Ověř: žádné nové failing testy oproti baseline.

- [ ] **Step 3: Ověř endpointy manuálně**

Spusť backend:
```bash
npm run start:dev
```

Otestuj:
```bash
# Veřejný VAPID key
curl http://localhost:3000/api/push/vapid-public-key

# Očekávaný výstup:
# {"publicKey":"BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxB"}
```

- [ ] **Step 4: Závěrečný commit**

```bash
git add -A
git commit -m "feat(push): Krok 13 kompletní — VAPID push notifikace"
```
