# Krok 17 — Opravy Feature Parity (17a–17d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opravit čtyři konkrétní mezery zjištěné analýzou po Kroku 16b — broken whisper routing, chybějící WS handler, room-info endpoint a user calendar-month endpointy.

**Charakter:** Opravy, ne nové funkce. Vše jde do existujících souborů. Žádné nové moduly.

**Tech Stack:** NestJS, Socket.IO, Mongoose, class-validator, Jest

---

## Přehled kroků

| Krok | Oprava | Soubory |
|------|--------|---------|
| **17a** | Fix `chat:hospoda:join` — přidat `userId` do payloadu + join `user:${userId}` room | `global-chat.gateway.ts` |
| **17b** | Implementovat `ikaros:whisper` WS handler (prerekvizita: 17a) | `global-chat.gateway.ts`, `global-chat.service.ts` |
| **17c** | `GET /api/global-chat/room-info` — kdo je online | `global-chat.controller.ts` |
| **17d** | `GET /api/users/getCalendarMonth/:id` + `PUT /api/users/updateCalendarMonth/:id` | `users.service.ts`, `users.controller.ts` |

---

## Kontext pro implementátora

### Jak spouštět testy

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage
# konkrétní soubor:
npx jest --config jest.override.config.js --no-coverage --testPathPattern global-chat.service
```

### Klíčový problém (proč je 17a oprava, ne funkce)

Kód v `handleGlobalMessageCreated` routuje whisper zprávy přes `server.to('user:${userId}')`, ale sockety se do těchto místností **nikdy nepřipojí** — `chat:hospoda:join` přijímá jen `{ username }` bez `userId`. Proto whisper routing nefunguje i přestože je v kódu. Krok 17a to opraví.

### Typy a kontrakty

```typescript
// Stávající connectedUsers mapa (gateway):
Map<socketId: string, { lastSeen: Date; username: string }>
// Po 17a bude:
Map<socketId: string, { lastSeen: Date; username: string; userId: string }>

// ChatMessage.visibleTo?: string[]
// prázdné = public; [id1, id2] = whisper jen pro tyto userId

// GlobalChatService.getGlobalChannelId(): string | undefined
// GlobalChatService má privátní globalChannelId nastaven v onModuleInit()

// themeSettings na User: Record<string, unknown> — calendarMonth uložen jako { calendarMonth: ... }
```

---

## Krok 17a: Fix `chat:hospoda:join` — userId tracking + personal rooms

**Files:**
- Modify: `backend/src/modules/global-chat/global-chat.gateway.ts`
- Create: `backend/src/modules/global-chat/global-chat.gateway.spec.ts`

- [ ] **Step 1: Napiš failing test**

Vytvoř `backend/src/modules/global-chat/global-chat.gateway.spec.ts`:

```typescript
import { GlobalChatGateway } from './global-chat.gateway';

const mockService = {
  getGlobalChannelId: jest.fn().mockReturnValue('chan1'),
  getRecentMessages: jest.fn().mockResolvedValue([]),
  sendWhisper: jest.fn(),
};

const makeClient = (id = 'socket1') => ({
  id,
  emit: jest.fn(),
  to: jest.fn().mockReturnThis(),
  join: jest.fn(),
  disconnect: jest.fn(),
} as any);

describe('GlobalChatGateway', () => {
  let gateway: GlobalChatGateway;
  let mockServer: any;

  beforeEach(() => {
    gateway = new GlobalChatGateway(mockService as any);
    mockServer = { to: jest.fn().mockReturnValue({ emit: jest.fn() }), sockets: { sockets: new Map() } };
    (gateway as any).server = mockServer;
    jest.clearAllMocks();
    mockService.getRecentMessages.mockResolvedValue([]);
  });

  describe('handleHospodaJoin', () => {
    it('joins socket to personal user room', async () => {
      const client = makeClient();
      await gateway.handleHospodaJoin({ username: 'Frodo', userId: 'u1' }, client);
      expect(client.join).toHaveBeenCalledWith('user:u1');
    });

    it('emits ikaros:load-history to joining client', async () => {
      const client = makeClient();
      mockService.getRecentMessages.mockResolvedValue([{ id: 'msg1' }]);
      await gateway.handleHospodaJoin({ username: 'Frodo', userId: 'u1' }, client);
      expect(client.emit).toHaveBeenCalledWith('ikaros:load-history', [{ id: 'msg1' }]);
    });

    it('broadcasts ikaros:user-list to channel after join', async () => {
      const emitFn = jest.fn();
      mockServer.to.mockReturnValue({ emit: emitFn });
      const client = makeClient();
      await gateway.handleHospodaJoin({ username: 'Gandalf', userId: 'u2' }, client);
      expect(mockServer.to).toHaveBeenCalledWith('chat:chan1');
      expect(emitFn).toHaveBeenCalledWith('ikaros:user-list', ['Gandalf']);
    });
  });

  describe('getPresence', () => {
    it('returns connected usernames', async () => {
      const c1 = makeClient('s1');
      const c2 = makeClient('s2');
      await gateway.handleHospodaJoin({ username: 'Frodo', userId: 'u1' }, c1);
      await gateway.handleHospodaJoin({ username: 'Sam', userId: 'u2' }, c2);
      expect(gateway.getPresence()).toEqual({ users: ['Frodo', 'Sam'] });
    });

    it('returns empty list when no users connected', () => {
      expect(gateway.getPresence()).toEqual({ users: [] });
    });
  });
});
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern global-chat.gateway
```

Očekáváno: FAIL — `join` is not called / `getPresence` doesn't exist

- [ ] **Step 3: Oprav `global-chat.gateway.ts`**

Tři změny:

**1) Změň typ `connectedUsers`:**
```typescript
// PŘED:
private readonly connectedUsers = new Map<string, { lastSeen: Date; username: string }>();
// PO:
private readonly connectedUsers = new Map<string, { lastSeen: Date; username: string; userId: string }>();
```

**2) Změň `handleHospodaJoin` — přidej `userId` do payloadu a `client.join`:**
```typescript
@SubscribeMessage('chat:hospoda:join')
async handleHospodaJoin(
  @MessageBody() payload: { username: string; userId: string },
  @ConnectedSocket() client: Socket,
): Promise<void> {
  this.connectedUsers.set(client.id, { lastSeen: new Date(), username: payload.username, userId: payload.userId });
  client.join(`user:${payload.userId}`);  // ← oprava: join personal room
  const channelId = this.globalChatService.getGlobalChannelId();
  if (!channelId) return;

  const history = await this.globalChatService.getRecentMessages(50);
  client.emit('ikaros:load-history', history);

  const userList = [...this.connectedUsers.values()].map((u) => u.username);
  this.server.to(`chat:${channelId}`).emit('ikaros:user-list', userList);

  client.to(`chat:${channelId}`).emit('chat:presence', { username: payload.username, action: 'join' });
}
```

**3) Přidej veřejnou metodu `getPresence()` za `getConnectedUserCount()`:**
```typescript
getPresence(): { users: string[] } {
  return { users: [...this.connectedUsers.values()].map((u) => u.username) };
}
```

- [ ] **Step 4: Spusť testy — ověř PASS**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern global-chat.gateway
```

- [ ] **Step 5: Spusť všechny testy**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/global-chat/global-chat.gateway.ts backend/src/modules/global-chat/global-chat.gateway.spec.ts
git commit -m "fix(global-chat): join personal user:userId room on hospoda:join — oprava broken whisper routing"
```

---

## Krok 17b: `ikaros:whisper` WS handler

**Prerekvizita:** Krok 17a musí být hotový.

**Files:**
- Modify: `backend/src/modules/global-chat/global-chat.service.ts`
- Modify: `backend/src/modules/global-chat/global-chat.service.spec.ts`
- Modify: `backend/src/modules/global-chat/global-chat.gateway.ts`
- Modify: `backend/src/modules/global-chat/global-chat.gateway.spec.ts`

- [ ] **Step 1: Napiš failing testy pro `sendWhisper` v service**

Přidej do `global-chat.service.spec.ts` za `describe('deleteMessage', ...)`:

```typescript
describe('sendWhisper', () => {
  beforeEach(async () => {
    channelRepo.findGlobal.mockResolvedValue(mockChannel);
    await service.onModuleInit();
  });

  it('uloží zprávu s visibleTo = [senderId, targetUserId]', async () => {
    const whisper = makeMsg({ visibleTo: ['u1', 'u2'] });
    messageRepo.save.mockResolvedValue(whisper);

    await service.sendWhisper({ senderId: 'u1', senderName: 'gandalf', targetUserId: 'u2', content: 'pst...' });

    expect(messageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'u1', senderName: 'gandalf', content: 'pst...', visibleTo: ['u1', 'u2'], worldId: null }),
    );
  });

  it('emituje chat.global.message.created event', async () => {
    messageRepo.save.mockResolvedValue(makeMsg({ visibleTo: ['u1', 'u2'] }));

    await service.sendWhisper({ senderId: 'u1', senderName: 'gandalf', targetUserId: 'u2', content: 'tajné' });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'chat.global.message.created',
      expect.objectContaining({ channelId: 'global-ch-id' }),
    );
  });

  it('hodí InternalServerErrorException pokud není inicializován', async () => {
    (service as any).globalChannelId = undefined;
    await expect(
      service.sendWhisper({ senderId: 'u1', senderName: 'g', targetUserId: 'u2', content: 'x' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('ukládá color pokud je zadána', async () => {
    messageRepo.save.mockResolvedValue(makeMsg({ color: '#ff0000' }));
    await service.sendWhisper({ senderId: 'u1', senderName: 'gandalf', targetUserId: 'u2', content: 'x', color: '#ff0000' });
    expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ color: '#ff0000' }));
  });
});
```

- [ ] **Step 2: Spusť test — ověř FAIL**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern global-chat.service
```

- [ ] **Step 3: Přidej `sendWhisper` do `global-chat.service.ts`**

Přidej za metodu `sendMessage`:

```typescript
async sendWhisper(payload: {
  senderId: string;
  senderName: string;
  targetUserId: string;
  content: string;
  color?: string;
}): Promise<void> {
  if (!this.globalChannelId) throw new InternalServerErrorException('Global channel not initialized');
  const message = await this.messageRepo.save({
    channelId: this.globalChannelId,
    worldId: null,
    senderId: payload.senderId,
    senderName: payload.senderName,
    content: payload.content,
    isEdited: false,
    isDeleted: false,
    reactions: {},
    attachments: [],
    visibleTo: [payload.senderId, payload.targetUserId],
    expiresAt: new Date(Date.now() + GlobalChatService.MESSAGE_TTL_MS),
    color: payload.color ?? null,
  });
  this.eventEmitter.emit('chat.global.message.created', { channelId: this.globalChannelId, message });
}
```

- [ ] **Step 4: Spusť service testy — ověř PASS**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern global-chat.service
```

- [ ] **Step 5: Napiš failing test pro gateway handler**

Přidej do `global-chat.gateway.spec.ts` uvnitř `describe('GlobalChatGateway')`:

```typescript
describe('handleWhisper', () => {
  it('volá globalChatService.sendWhisper se správným payloadem', async () => {
    const client = makeClient();
    const payload = { senderId: 'u1', senderName: 'Frodo', targetUserId: 'u2', content: 'pst' };
    await gateway.handleWhisper(payload, client);
    expect(mockService.sendWhisper).toHaveBeenCalledWith(payload);
  });
});
```

- [ ] **Step 6: Spusť test — ověř FAIL**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern global-chat.gateway
```

- [ ] **Step 7: Přidej `handleWhisper` handler do `global-chat.gateway.ts`**

Za `handleSetRoomStyle`:

```typescript
@SubscribeMessage('ikaros:whisper')
async handleWhisper(
  @MessageBody() payload: { senderId: string; senderName: string; targetUserId: string; content: string; color?: string },
  @ConnectedSocket() _client: Socket,
): Promise<void> {
  await this.globalChatService.sendWhisper(payload);
}
```

- [ ] **Step 8: Spusť všechny testy — ověř PASS**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage
```

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/global-chat/global-chat.service.ts backend/src/modules/global-chat/global-chat.service.spec.ts backend/src/modules/global-chat/global-chat.gateway.ts backend/src/modules/global-chat/global-chat.gateway.spec.ts
git commit -m "fix(global-chat): implementovat ikaros:whisper WS handler + sendWhisper service metoda"
```

---

## Krok 17c: GET /api/global-chat/room-info

**Files:**
- Modify: `backend/src/modules/global-chat/global-chat.controller.ts`

**Architektura:** `GlobalChatGateway` je `@Injectable()` provider registrovaný v `GlobalChatModule`. Injektovat gateway do controlleru (oba ve stejném modulu) je standardní NestJS pattern — bez cirkulárních závislostí.

Response: `{ channelId: string | null, users: string[] }`

- [ ] **Step 1: Ověř že testy z 17a procházejí (getPresence existuje)**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern global-chat.gateway
```

- [ ] **Step 2: Uprav `global-chat.controller.ts` — injektuj gateway + přidej endpoint**

```typescript
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { GlobalChatService } from './global-chat.service';
import { GlobalChatGateway } from './global-chat.gateway';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateGlobalMessageDto } from './dto/create-global-message.dto';
import type { RequestUser } from '../worlds/worlds.service';

@Controller('global-chat')
@UseGuards(JwtAuthGuard)
export class GlobalChatController {
  constructor(
    private readonly globalChatService: GlobalChatService,
    private readonly gateway: GlobalChatGateway,
  ) {}

  @Get('room-info')
  getRoomInfo() {
    return {
      channelId: this.globalChatService.getGlobalChannelId() ?? null,
      ...this.gateway.getPresence(),
    };
  }

  // ... zbytek existujících endpointů beze změny
```

**Poznámka:** Přidej jen `room-info` endpoint a uprav constructor. Ostatní endpointy (`GET /messages`, `POST /messages`, `DELETE /messages/:messageId`) zůstávají beze změny.

- [ ] **Step 3: Spusť všechny testy — ověř PASS**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/global-chat/global-chat.controller.ts
git commit -m "fix(global-chat): přidat GET /global-chat/room-info endpoint"
```

---

## Krok 17d: GET/PUT /api/users/getCalendarMonth/:id + updateCalendarMonth/:id

**Kontext:** Starý backend měl dedikované endpointy pro ukládání aktuálního zobrazovaného měsíce v UI kalendáři uživatele. V novém backendu je `themeSettings: Record<string, unknown>` — ukládáme `calendarMonth` jako klíč tam. Metoda `update()` v `UsersService` už merge themeSettings, takže implementace je jednoduchá.

**Files:**
- Create: `backend/src/modules/users/dto/update-calendar-month.dto.ts`
- Modify: `backend/src/modules/users/users.service.ts`
- Modify: `backend/src/modules/users/users.service.spec.ts`
- Modify: `backend/src/modules/users/users.controller.ts`

- [ ] **Step 1: Vytvoř DTO**

Vytvoř `backend/src/modules/users/dto/update-calendar-month.dto.ts`:

```typescript
import { IsOptional } from 'class-validator';

export class UpdateCalendarMonthDto {
  @IsOptional()
  month?: Record<string, unknown> | null;
}
```

- [ ] **Step 2: Napiš failing testy**

Přidej do `backend/src/modules/users/users.service.spec.ts` — ověř jak se jmenuje mock repo v existujícím spec souboru (pravděpodobně `mockUsersRepo` nebo `mockRepo`) a přidej za existující describe bloky:

```typescript
describe('getCalendarMonth', () => {
  it('vrátí calendarMonth z themeSettings', async () => {
    const calMonth = { year: 2026, month: 5 };
    mockUsersRepo.findById.mockResolvedValue({ id: 'u1', themeSettings: { calendarMonth: calMonth } });
    const result = await service.getCalendarMonth('u1');
    expect(result).toEqual({ month: calMonth });
  });

  it('vrátí null pokud calendarMonth není nastaven', async () => {
    mockUsersRepo.findById.mockResolvedValue({ id: 'u1', themeSettings: {} });
    const result = await service.getCalendarMonth('u1');
    expect(result).toEqual({ month: null });
  });

  it('hodí NotFoundException pro neznámé ID', async () => {
    mockUsersRepo.findById.mockResolvedValue(null);
    await expect(service.getCalendarMonth('unknown')).rejects.toThrow(NotFoundException);
  });
});

describe('updateCalendarMonth', () => {
  it('uloží calendarMonth do themeSettings přes existující update()', async () => {
    const calMonth = { year: 2026, month: 6 };
    // findById potřebuje vrátit user pro merge logiku uvnitř update()
    mockUsersRepo.findById.mockResolvedValue({ id: 'u1', themeSettings: {} });
    mockUsersRepo.update.mockResolvedValue({ id: 'u1', themeSettings: { calendarMonth: calMonth } });
    const result = await service.updateCalendarMonth('u1', { month: calMonth });
    expect(result).toEqual({ month: calMonth });
  });

  it('vrátí null pokud update nevrátí calendarMonth', async () => {
    mockUsersRepo.findById.mockResolvedValue({ id: 'u1', themeSettings: {} });
    mockUsersRepo.update.mockResolvedValue({ id: 'u1', themeSettings: {} });
    const result = await service.updateCalendarMonth('u1', { month: null });
    expect(result).toEqual({ month: null });
  });
});
```

**Pozor:** Název mock objektu musí odpovídat existujícímu spec souboru — zkontroluj `users.service.spec.ts` a uprav `mockUsersRepo` na správný název.

- [ ] **Step 3: Spusť test — ověř FAIL**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern users.service
```

- [ ] **Step 4: Přidej metody do `users.service.ts`**

Přidej import nahoře:
```typescript
import type { UpdateCalendarMonthDto } from './dto/update-calendar-month.dto';
```

Přidej metody na konec třídy:

```typescript
async getCalendarMonth(id: string): Promise<{ month: unknown }> {
  const user = await this.repo.findById(id);
  if (!user) throw new NotFoundException('Uživatel nenalezen');
  return { month: (user.themeSettings as Record<string, unknown>)?.calendarMonth ?? null };
}

async updateCalendarMonth(id: string, dto: UpdateCalendarMonthDto): Promise<{ month: unknown }> {
  const updated = await this.update(id, { themeSettings: { calendarMonth: dto.month ?? null } } as any);
  return { month: (updated.themeSettings as Record<string, unknown>)?.calendarMonth ?? null };
}
```

- [ ] **Step 5: Spusť testy — ověř PASS**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage --testPathPattern users.service
```

- [ ] **Step 6: Přidej endpointy do `users.controller.ts`**

**DŮLEŽITÉ:** Přidej PŘED `@Get('profile/:id')` a `@Get(':id')`, jinak NestJS zachytí `/getCalendarMonth/xxx` jako dynamické ID.

```typescript
import { UpdateCalendarMonthDto } from './dto/update-calendar-month.dto';

// V těle třídy — přidej před @Get('profile/:id'):
@Get('getCalendarMonth/:id')
@UseGuards(JwtAuthGuard)
getCalendarMonth(@Param('id') id: string) {
  return this.usersService.getCalendarMonth(id);
}

@Put('updateCalendarMonth/:id')
@UseGuards(JwtAuthGuard)
updateCalendarMonth(
  @Param('id') id: string,
  @Body() dto: UpdateCalendarMonthDto,
) {
  return this.usersService.updateCalendarMonth(id, dto);
}
```

- [ ] **Step 7: Spusť všechny testy — ověř PASS**

```bash
cd backend
npx jest --config jest.override.config.js --no-coverage
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/users/dto/update-calendar-month.dto.ts backend/src/modules/users/users.service.ts backend/src/modules/users/users.service.spec.ts backend/src/modules/users/users.controller.ts
git commit -m "fix(users): implementovat getCalendarMonth + updateCalendarMonth endpointy"
```

---

## Shrnutí po dokončení

Po merge tohoto plánu zůstávají otevřené:

| Oblast | Stav | Plán |
|--------|------|------|
| Pages favorites migrace | ❌ breaking change | Krok 18 |
| Admin global channels bez worldId | ❌ design rozhodnutí | TBD |
| Calenders / Timeline / News / IkarosChatHub room-info | ❌ vyžadují design spec | TBD |
