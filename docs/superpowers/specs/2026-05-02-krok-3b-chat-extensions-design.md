# Krok 3b — Chat Extensions: Design

> **Pro agentické workery:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development nebo superpowers:executing-plans pro implementaci tohoto plánu task-by-task.

**Cíl:** Rozšířit chat modul o whisper, reakce, reply, herní datum, NPC identitu a typing indicator — vše jako rozšíření existující `ChatMessage` entity a ChatGateway.

**Architektura:** Žádné nové kolekce ani moduly — rozšíříme existující `ChatMessage` schéma o nové fieldy, `ChatService` o nové metody, `ChatGateway` o typing eventy a `ChatController` o endpoint pro reakce.

**Tech stack:** NestJS 11, Mongoose 9, Socket.IO, EventEmitter2, class-validator (identické s 3a)

---

## Datový model

### ChatMessage — rozšíření

K existujícím fieldům přibydou:

```typescript
interface ChatMessage {
  // --- existující fieldy (beze změny) ---
  id: string
  channelId: string
  worldId: string
  senderId: string
  senderName: string        // snapshot jména postavy odesílatele
  content: string | null
  isEdited: boolean
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date

  // --- nové fieldy ---
  senderAvatarUrl?: string        // snapshot avataru postavy při odeslání (automaticky)
  overrideName?: string           // PJ hraje za NPC — přepis jména
  overrideAvatarUrl?: string      // PJ hraje za NPC — přepis avataru

  rpDate?: string                 // herní datum "YYYY-MM-DD" (hráč i PJ)

  replyToId?: string              // ID citované zprávy (flat reply, bez threadů)
  replyToPreview?: string         // snapshot textu citované zprávy (max 200 znaků)
  replyToSenderName?: string      // snapshot jména odesílatele citované zprávy

  visibleTo?: string[]            // whisper: undefined = veřejná; [senderId, recipientId] = šepot
  reactions: Record<string, string[]>  // { "👍": ["userId1", "userId2"] }
}
```

**Poznámka k `senderName` a `senderAvatarUrl`:** V 3a se `senderName` nastavoval na `membership.characterPath`. V 3b rozšiřujeme snapshot o `senderAvatarUrl` — service ho dohledá z membership/charakteru při odeslání. `overrideName`/`overrideAvatarUrl` jsou nadřazené — pokud jsou vyplněné, frontend je použije místo `senderName`/`senderAvatarUrl`.

---

## REST API

### Rozšíření POST /channels/:channelId/messages

`CreateMessageDto` dostane volitelná nová pole:

```typescript
class CreateMessageDto {
  // existující
  content: string             // @MinLength(1) @MaxLength(4000)

  // nová
  rpDate?: string             // @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  replyToId?: string          // @IsOptional() @IsString()
  visibleTo?: string[]        // @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(1, { each: false }) — max 1 příjemce
  overrideName?: string       // @IsOptional() @IsString() @MaxLength(64) — jen PJ/PomocnyPJ
  overrideAvatarUrl?: string  // @IsOptional() @IsUrl() — jen PJ/PomocnyPJ
}
```

**Logika při odeslání zprávy (`sendMessage`):**
1. Dohledá membership odesílatele → snapshot `senderName` (jméno postavy) a `senderAvatarUrl`
2. Pokud `replyToId` vyplněno → dohledá citovanou zprávu, uloží snapshot `replyToPreview` (prvních 200 znaků content) a `replyToSenderName`
3. Pokud `overrideName`/`overrideAvatarUrl` vyplněno → ověří že requester je PJ/PomocnyPJ/Admin/Superadmin, jinak `ForbiddenException`
4. Pokud `visibleTo` vyplněno → přidá `senderId` do `visibleTo` (aby odesílatel vždy viděl vlastní šepot)

### Nový endpoint — reakce

```
PUT /messages/:messageId/reactions/:emoji
```

Toggle: pokud `userId` je v `reactions[emoji]` → odebere se; pokud není → přidá se. Vrátí aktualizovanou zprávu. Broadcastuje `chat.message.updated` přes EventEmitter → WebSocket.

**Validace emoji:** Max 10 znaků (pokryje multi-codepoint emoji). Uživatel musí mít přístup ke kanálu zprávy.

---

## WebSocket — typing indicator

### Klient → Server

```
typing:start   { channelId: string }
typing:stop    { channelId: string }
```

### Server → Klient

```
chat:typing    { channelId: string, characterName: string, isTyping: boolean }
```

**Logika v ChatGateway:**
- `@SubscribeMessage('typing:start')` — rebroadcastuje `chat:typing { isTyping: true }` do room `chat:{channelId}`, nastaví/resetuje server-side timeout 5 s
- Po 5 s bez `typing:start` → automaticky pošle `chat:typing { isTyping: false }`
- `@SubscribeMessage('typing:stop')` — okamžitě pošle `chat:typing { isTyping: false }`, zruší timeout
- Odesílatel nevidí vlastní indikátor (skip vlastní socket)
- `characterName` = jméno postavy uživatele v daném světě (dohledá z membership při prvním typing eventu per session)
- Timeouty ukládáme do `Map<string, NodeJS.Timeout>` kde klíč je `${userId}:${channelId}`

**Přístup:** Ověření že uživatel má přístup ke kanálu při `typing:start` (stejná logika jako `hasChannelAccess`).

---

## WebSocket — stávající eventy

Reakce se broadcastují jako `chat:message:updated` (celá aktualizovaná zpráva) — žádný nový event pro reakce není potřeba.

Whisper zprávy se broadcastují selektivně:
- `chat.message.created` event v service pošle zprávu normálně do room `chat:{channelId}`
- ChatGateway při `chat:message` broadcastu NEMĚNÍ chování — filtrování viditelnosti dělá **backend při GET** a **frontend ignoruje zprávy kde není příjemce**
- Pro lepší soukromí: whisper se broadcastuje pouze do `user:{senderId}` a `user:{recipientId}` roomů (ne do celého `chat:{channelId}`). EventEmitter payload `chat.message.created` musí obsahovat celou zprávu včetně `visibleTo` aby ChatGateway mohl rozhodnout kam broadcastovat.

---

## Oprávnění

| Akce | Kdo může |
|------|----------|
| Nastavit `rpDate` | Kdokoliv kdo může psát do kanálu (hráč i PJ) |
| Nastavit `overrideName`/`overrideAvatarUrl` | PJ, PomocnyPJ, Admin, Superadmin |
| Poslat whisper (`visibleTo`) | Kdokoliv kdo může psát do kanálu |
| Přidat/odebrat reakci | Kdokoliv kdo má přístup ke kanálu |
| Odpovědět (`replyToId`) | Kdokoliv kdo může psát do kanálu |
| Vidět šeptanou zprávu | Odesílatel + příjemce v `visibleTo` + PJ/PomocnyPJ světa |
| Typing indicator | Kdokoliv kdo má přístup ke kanálu |

**Whisper filtrování v `getMessages`:** Pro každou zprávu kde `visibleTo` není prázdné — zahrne ji pouze pokud: `userId` je v `visibleTo` NEBO membership uživatele je `>= WorldRole.PomocnyPJ`.

---

## Struktura souborů — změny

Žádné nové soubory. Upravují se:

```
modules/chat/
├── chat.service.ts
│   + toggleReaction(messageId, emoji, requester)
│   + rozšíření sendMessage o snapshot senderAvatarUrl, replyTo preview,
│     validaci overrideName, whisper visibleTo příprava
│   + rozšíření getMessages o whisper filtrování
│
├── chat.controller.ts
│   + PUT /messages/:messageId/reactions/:emoji
│
├── chat.gateway.ts
│   + @SubscribeMessage('typing:start')
│   + @SubscribeMessage('typing:stop')
│   + private typingTimeouts: Map<string, NodeJS.Timeout>
│   + selektivní broadcast whisper zpráv (user rooms místo channel room)
│
├── interfaces/
│   └── chat-message.interface.ts       ← nové fieldy
│
├── schemas/
│   └── chat-message.schema.ts          ← nové @Prop fieldy
│
├── repositories/
│   └── chat-message.repository.ts
│       + addReaction(messageId, emoji, userId): atomic $push do reactions[emoji]
│       + removeReaction(messageId, emoji, userId): atomic $pull z reactions[emoji]
│
└── dto/
    └── create-message.dto.ts           ← rpDate, replyToId, visibleTo,
                                           overrideName, overrideAvatarUrl
```

Nové metody v `IChatMessageRepository`:
```typescript
addReaction(messageId: string, emoji: string, userId: string): Promise<ChatMessage | null>
removeReaction(messageId: string, emoji: string, userId: string): Promise<ChatMessage | null>
```

---

## MongoDB — změny schématu

```typescript
// chat-message.schema.ts — nové @Prop
@Prop({ type: String }) senderAvatarUrl?: string
@Prop({ type: String }) overrideName?: string
@Prop({ type: String }) overrideAvatarUrl?: string
@Prop({ type: String }) rpDate?: string
@Prop({ type: String }) replyToId?: string
@Prop({ type: String }) replyToPreview?: string
@Prop({ type: String }) replyToSenderName?: string
@Prop({ type: [String] }) visibleTo?: string[]
@Prop({ type: Object, default: {} }) reactions: Record<string, string[]>
```

Nový index pro whisper queries:
```
{ channelId: 1, visibleTo: 1 }
```

---

## Co není součástí 3b

- GIFy, obrázky, file upload (odloženo na 3c-upload — vyžaduje storage infrastrukturu)
- Interdimenzionální hospoda / cross-world chat (odloženo na 3c)
