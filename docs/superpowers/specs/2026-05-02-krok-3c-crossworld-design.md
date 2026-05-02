# Krok 3c-crossworld — Interdimenzionální hospoda: Design

> **Pro agentické workery:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development nebo superpowers:executing-plans pro implementaci tohoto plánu task-by-task.

**Cíl:** Přidat globální chat ("Interdimenzionální hospoda") dostupný všem přihlášeným uživatelům platformy, nezávislý na světech. Zprávy se automaticky mažou po 1 hodině. Uživatelé vidí příchody/odchody ostatních.

**Architektura:** Nový `GlobalChatModule` s vlastním controllerem a service. Reusuje stávající `ChatMessageRepository` a Socket.IO infrastrukturu. Jeden speciální `ChatChannel` s `isGlobal: true` a `worldId: null` je seedován při startu aplikace.

**Tech stack:** NestJS 11, Mongoose 9, Socket.IO, EventEmitter2, class-validator

---

## Datový model

### ChatChannel — rozšíření

```typescript
isGlobal: boolean;  // default: false
```

Jeden globální kanál seedován při `onModuleInit` v `GlobalChatService`. `worldId: null`, `groupId: null`, `name: 'Interdimenzionální hospoda'`, `isGlobal: true`.

`groupId` musí být v `ChatChannel` schema volitelné (`@Prop({ type: Types.ObjectId, ref: 'ChatGroup', default: null })`). Stávající dotazy na kanály podle `groupId` musí ignorovat kanály kde `groupId: null`.

### ChatMessage — rozšíření

```typescript
expiresAt?: Date;  // MongoDB TTL index — dokument se smaže automaticky, když čas vyprší
```

Pro globální zprávy: `expiresAt = new Date(Date.now() + 3600000)` (now + 1h).
Pro normální zprávy: pole se vůbec nenastaví — TTL index je ignoruje.

Mongoose index:
```typescript
@Prop({ type: Date })
@Index({ expireAfterSeconds: 0 })
expiresAt?: Date;
```

### CreateGlobalMessageDto

```typescript
class CreateGlobalMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  content: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  visibleTo?: string[];  // šeptání — stejný mechanismus jako normální chat
}
```

Žádné `overrideName`, `overrideAvatarUrl`, `rpDate`, `attachments` — hospoda je OOC text chat.

---

## REST API

### GET /api/global-chat/messages

Vrátí historii zpráv (max posledních 50, keyset paginace).

**Auth:** `JwtAuthGuard` (všichni přihlášení)

**Query params:** `before?: string`, `limit?: number`

**Response `200`:**
```json
[
  {
    "_id": "...",
    "senderId": "...",
    "senderName": "aragorn",
    "content": "Dobrý večer všem!",
    "createdAt": "2026-05-02T20:00:00Z",
    "expiresAt": "2026-05-02T21:00:00Z",
    "visibleTo": []
  }
]
```

### POST /api/global-chat/messages

Odešle zprávu do hospody.

**Auth:** `JwtAuthGuard`

**Request body:** `CreateGlobalMessageDto`

**Response `201`:** nová zpráva

**Validace:**
- `content` povinný, 1–4000 znaků
- `visibleTo` volitelné — šeptání (zpráva jde jen daným uživatelům přes `user:{userId}` room)

### DELETE /api/global-chat/messages/:messageId

Smaže zprávu (soft delete).

**Auth:** `JwtAuthGuard` + `AdminGuard` (UserRole.Admin nebo vyšší)

**Response `200`:** `{ success: true }`

**Chyby:**
- `403 ForbiddenException` — uživatel není admin
- `404 NotFoundException` — zpráva neexistuje

---

## Socket.IO

### Rooms

Klienti se připojí do roomy `chat:{globalChannelId}` pomocí stávajícího `room:join` mechanismu — stejně jako jakýkoliv jiný kanál.

### Events (server → client)

| Event | Room | Payload | Kdy |
|---|---|---|---|
| `chat:message` | `chat:{globalChannelId}` nebo `user:{userId}` | zpráva | nová zpráva (šeptání → user room) |
| `chat:message:deleted` | `chat:{globalChannelId}` | `{ messageId }` | admin smaže |
| `chat:presence` | `chat:{globalChannelId}` | `{ userId, username, action: 'join'\|'leave' }` | příchod/odchod |

### Events (client → server)

| Event | Payload | Efekt |
|---|---|---|
| `chat:hospoda:join` | `{}` | `ChatGateway` broadcastuje `chat:presence` s `action: 'join'` na `chat:{globalChannelId}` |
| `chat:hospoda:leave` | `{}` | `ChatGateway` broadcastuje `chat:presence` s `action: 'leave'` na `chat:{globalChannelId}` |
| `room:join` | `{ room: 'chat:{globalChannelId}' }` | připojení do Socket.IO roomy |

**Presence zprávy nejsou uloženy v DB** — jsou efemérní. Frontend je zobrazí v chat streamu jako systémové zprávy ("🍺 aragorn vstoupil do hospody").

---

## Oprávnění

| Akce | Kdo může |
|---|---|
| Číst zprávy | Každý přihlášený uživatel |
| Psát zprávy | Každý přihlášený uživatel |
| Šeptat | Každý přihlášený uživatel |
| Mazat zprávy | `UserRole.Admin` nebo vyšší |

---

## Struktura souborů — nové a upravené

```
backend/src/
├── common/
│   └── guards/
│       └── admin.guard.ts                         ← NOVÝ — UserRole.Admin+ guard
│
├── modules/
│   ├── global-chat/                               ← NOVÝ modul
│   │   ├── global-chat.module.ts
│   │   ├── global-chat.service.ts                 ← seeder + business logika
│   │   ├── global-chat.controller.ts              ← GET/POST/DELETE endpointy
│   │   └── dto/
│   │       └── create-global-message.dto.ts
│   │
│   └── chat/
│       ├── schemas/
│       │   ├── chat-channel.schema.ts             ← + isGlobal: boolean
│       │   └── chat-message.schema.ts             ← + expiresAt?: Date (TTL index)
│       └── (ostatní beze změn)
│
└── app.module.ts                                  ← + GlobalChatModule
```

---

## Modulové závislosti

`GlobalChatModule` importuje `ChatModule`. `ChatModule` již exportuje `ChatService` (přidáno v 3c-upload).

`GlobalChatService` potřebuje:
- `ChatService.findChannelById` (nebo přímý přístup přes `ChatChannelRepository`) pro seed check
- `ChatMessageRepository` pro get/send/delete zpráv

`ChatModule` musí exportovat také `ChatMessageRepository` a `ChatChannelRepository` — přidat do `exports` v `chat.module.ts`.

`GlobalChatService` používá `EventEmitter2` pro broadcasting → `ChatGateway` zpracuje `chat.global.message` event a broadcastuje na Socket.IO room.

---

## Seeding

`GlobalChatService.onModuleInit`:

```typescript
async onModuleInit() {
  let channel = await this.channelRepo.findOne({ isGlobal: true });
  if (!channel) {
    channel = await this.channelRepo.create({
      name: 'Interdimenzionální hospoda',
      worldId: null,
      isGlobal: true,
      accessMode: 'all',
      order: 0,
    });
  }
  this.globalChannelId = channel._id.toString();
}
```

`globalChannelId` je uloženo v paměti pro efektivní přístup.

---

## Co není součástí 3c-crossworld

- Přílohy v hospodě (upload je jen pro world kanály)
- Typing indicators (YAGNI — OOC async chat)
- Reactions na globální zprávy (YAGNI)
- Moderační log / audit trail (odloženo)
- Frontend implementace (pouze backend API + Socket.IO)
