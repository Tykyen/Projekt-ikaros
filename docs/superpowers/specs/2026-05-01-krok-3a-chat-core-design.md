# Krok 3a — Chat Core: Design

> **Pro agentické workery:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development nebo superpowers:executing-plans pro implementaci tohoto plánu task-by-task.

**Cíl:** Implementovat základní chatovací infrastrukturu v rámci světů — skupiny kanálů, kanály s řízením přístupu, textové zprávy, real-time WebSocket broadcast a sledování nepřečtených zpráv.

**Architektura:** Repository pattern identický s worlds modulem. Service emituje EventEmitter2 eventy, ChatGateway broadcastuje přes Socket.IO rooms. REST API pro CRUD, WebSocket pro real-time.

**Tech stack:** NestJS 11, Mongoose 9, Socket.IO, EventEmitter2, class-validator

---

## Datový model

### ChatGroup
Složka/kategorie kanálů v rámci světa. Při vytvoření světa vzniknou 2 systémové skupiny automaticky.

```typescript
interface ChatGroup {
  id: string;
  worldId: string;
  name: string;
  order: number;
  createdAt: Date;
}
```

### ChatChannel
Konkrétní chatovací místnost uvnitř skupiny.

```typescript
interface ChatChannel {
  id: string;
  groupId: string;
  worldId: string;          // denormalizováno pro rychlé queries
  name: string;
  accessMode: 'all' | 'roles' | 'members';
  allowedRoles?: WorldRole[];       // pokud accessMode = 'roles'
  allowedMemberIds?: string[];      // pokud accessMode = 'members'
  lastMessageAt?: Date;
  order: number;
  createdAt: Date;
}
```

### ChatMessage
Zpráva v kanálu. Soft-delete zachovává historii (content = null při smazání).

```typescript
interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string;          // denormalizováno
  senderId: string;
  senderName: string;       // snapshot jména v čase odeslání
  content: string | null;   // null = smazaná zpráva
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### ChannelReadStatus
Sleduje kdy naposledy uživatel četl daný kanál. Unique index na (userId, channelId).

```typescript
interface ChannelReadStatus {
  id: string;
  userId: string;
  channelId: string;
  lastReadMessageId: string;
  lastReadAt: Date;
}
```

---

## Automatické vytvoření při `world.created`

ChatService poslouchá event `world.created` a vytvoří:

| Skupina | Kanál | accessMode |
|---------|-------|------------|
| Globální | #obecný | all |
| Postavy | #hráči | all |

Obě skupiny a kanály jsou plně spravovatelné PJ — lze přejmenovat i smazat.

---

## REST API

Všechny endpointy vyžadují `JwtAuthGuard`. Prefix: `/api/worlds/:worldId/chat/...`

### Skupiny
```
GET    /groups                          seznam skupin s jejich kanály
POST   /groups                          vytvořit skupinu        [PJ/owner]
PATCH  /groups/:groupId                 přejmenovat / reorder   [PJ/owner]
DELETE /groups/:groupId                 smazat skupinu + kanály [PJ/owner]
```

### Kanály
```
POST   /groups/:groupId/channels        vytvořit kanál          [PJ/owner]
PATCH  /channels/:channelId             upravit kanál           [PJ/owner]
DELETE /channels/:channelId             smazat kanál            [PJ/owner]
```

### Zprávy
```
GET    /channels/:channelId/messages    zprávy (cursor-based stránkování ?before=messageId&limit=50)
POST   /channels/:channelId/messages    odeslat zprávu
PATCH  /messages/:messageId             editovat zprávu         [autor nebo PJ/owner]
DELETE /messages/:messageId             soft delete zprávy      [autor nebo PJ/owner]
```

### Nepřečtené zprávy
```
POST   /channels/:channelId/read        označit kanál jako přečtený
GET    /unread                          { channelId, count }[] pro celý svět
```

### Stránkování zpráv
Cursor-based: `GET /channels/:channelId/messages?before=<messageId>&limit=50`
- Vrací zprávy starší než `before` (nejnovější nahoře)
- Neinvaliduje se při příchodu nových zpráv
- Výchozí limit: 50, maximum: 100

---

## WebSocket

### Rooms
Klient se připojí do `chat:{channelId}` pro každý kanál ke kterému má přístup. Přístup se ověří při `room:join` (kanál existuje + uživatel je člen světa s oprávněním).

### Events (server → klient)
```
chat:message              { message: ChatMessage }
chat:message:updated      { message: ChatMessage }
chat:message:deleted      { messageId, channelId }
chat:channel:created      { channel: ChatChannel }
chat:channel:updated      { channel: ChatChannel }
chat:channel:deleted      { channelId, groupId }
chat:unread               { channelId: string, count: number }
```

### EventEmitter (service → gateway)
```
chat.message.created      → broadcast chat:message do room chat:{channelId}
chat.message.updated      → broadcast chat:message:updated
chat.message.deleted      → broadcast chat:message:deleted
chat.channel.created      → broadcast chat:channel:created do room world:{worldId}
chat.channel.updated      → broadcast chat:channel:updated do room world:{worldId}
chat.channel.deleted      → broadcast chat:channel:deleted do room world:{worldId}
chat.unread.updated       → broadcast chat:unread do room user:{userId} (každý klient se připojí do své user room při připojení)
```

---

## Oprávnění

### Číst zprávy
Člen světa s přístupem ke kanálu (dle accessMode).

### Psát zprávy
Člen světa s přístupem ke kanálu.

### Editovat / smazat zprávu
- Vlastní zprávu: autor (bez časového omezení)
- Cizí zprávu: PJ, PomocnyPJ nebo owner světa

### Spravovat skupiny a kanály (CRUD)
PJ, PomocnyPJ nebo owner světa.

### Mazání kanálů
Pouze PJ/owner. Kanál se nesmaže automaticky při odchodu hráče — zůstává jako historický záznam. PJ ho může smazat ručně.

### Přístup ke kanálu (accessMode)
- `all` → všichni členové světa
- `roles` → členové s konkrétní WorldRole (PJ, PomocnyPJ, Hrac, …)
- `members` → konkrétní seznam userId

---

## Návaznost na world.deleted

ChatService poslouchá `world.deleted` a soft-deletuje všechny kanály a zprávy světa (isDeleted = true). Data zůstanou v DB pro případnou obnovu, ale API je nebude vracet.

---

## Struktura souborů

```
modules/chat/
├── chat.module.ts
├── chat.controller.ts
├── chat.service.ts
├── chat.gateway.ts
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

---

## MongoDB indexy

```
chat_groups:     worldId, order
chat_channels:   worldId, groupId, lastMessageAt, order
chat_messages:   channelId + createdAt (compound), worldId, senderId
                 { channelId: 1, createdAt: -1 } pro cursor-based stránkování
channel_read_status: { userId: 1, channelId: 1 } unique
```

---

## Co není součástí 3a (odloženo na 3b)

- Whisper (viditelné jen konkrétním hráčům)
- Reakce (emoji na zprávy)
- Reply (odpověď na konkrétní zprávu)
- GIFy, obrázky, file upload
- PJ speciální funkce (herní datum, hraní za postavu)
- Typing indicator

## Co není součástí 3a ani 3b (odloženo na 3c)

- Interdimenzionální hospoda (cross-world chat)
- Rozcestí (nadsvětový herní prostor)
