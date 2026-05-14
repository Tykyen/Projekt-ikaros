# WebSocket API — Projekt Ikaros

Všechny gateway sdílejí jednu Socket.io instanci (výchozí namespace `/`).
Připojení: `io('http://localhost:3000')` s `auth: { token: '<JWT>' }` nebo cookie.

---

## 1. ChatGateway

Zpracovává typing indikátory. Zprávy, kanály, skupiny a unread počty jsou emitovány jako reakce na interní eventy (ne na klientský požadavek).

### Příchozí eventy

| Event | Payload | Auth | Popis |
|---|---|---|---|
| `typing:start` | `{ channelId: string; characterName: string }` | ne | Zahájí indikátor psaní v daném kanálu; automaticky expiruje po 5 s |
| `typing:stop` | `{ channelId: string; characterName: string }` | ne | Okamžitě ukončí indikátor psaní |

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `chat:typing` | `{ channelId: string; characterName: string; isTyping: boolean }` | `chat:{channelId}` | Broadcast stavu psaní ostatním v kanálu |
| `chat:message` | `ChatMessage` | `chat:{channelId}` nebo `user:{userId}` | Nová zpráva; privátní zprávy jdou do `user:` roomu |
| `chat:message:updated` | `ChatMessage` | `chat:{channelId}` | Zpráva byla upravena |
| `chat:message:deleted` | `{ messageId: string; channelId: string }` | `chat:{channelId}` | Zpráva byla smazána |
| `chat:channel:created` | `ChatChannel` | `world:{worldId}` | Nový kanál ve světě |
| `chat:channel:updated` | `ChatChannel` | `world:{worldId}` | Kanál byl upraven |
| `chat:channel:deleted` | `{ channelId: string; groupId: string }` | `world:{worldId}` | Kanál byl smazán |
| `chat:group:created` | `ChatGroup` | `world:{worldId}` | Nová skupina kanálů |
| `chat:group:updated` | `ChatGroup` | `world:{worldId}` | Skupina kanálů byla upravena |
| `chat:group:deleted` | `string` (groupId) | `world:{worldId}` | Skupina kanálů byla smazána |
| `chat:unread` | `{ channelId: string; count: number }` | `user:{userId}` | Aktualizace počtu nepřečtených zpráv |

---

## 2. MapsGateway

Relay gateway — klient posílá event, gateway ho přeposílá ostatním ve scéně.

### Příchozí eventy

| Event | Payload | Auth | Popis |
|---|---|---|---|
| `map:join` | `string` (sceneId) | ne | Vstup do Socket.io roomu scény |
| `map:leave` | `string` (sceneId) | ne | Odchod ze Socket.io roomu scény |
| `map:token-moved` | `{ sceneId: string; token: unknown }` | ne | Pohyb tokenu na mapě |
| `map:config-updated` | `{ sceneId: string; config: unknown }` | ne | Aktualizace konfigurace scény |
| `map:token-removed` | `{ sceneId: string; tokenId: string }` | ne | Odebrání tokenu ze scény |
| `map:reload-scene` | `{ sceneId: string; scene: unknown }` | ne | Požadavek na znovunačtení scény |
| `map:scene-cleared` | `string` (sceneId) | ne | Vymazání celé scény |
| `map:ping` | `{ sceneId: string; x: number; y: number; userName: string }` | ne | Ping na souřadnicích mapy |
| `map:effect-added` | `{ sceneId: string; effect: unknown }` | ne | Přidání vizuálního efektu |
| `map:effect-removed` | `{ sceneId: string; effectId: string }` | ne | Odebrání vizuálního efektu |
| `map:fog-updated` | `{ sceneId: string; fogEnabled: boolean; revealedHexes: unknown[] }` | ne | Aktualizace mlhy války |
| `map:dice-rolled` | `{ sceneId: string; [key: string]: unknown }` | ne | Výsledek hodu kostkami (broadcast všem včetně odesílatele) |
| `map:scene-state-changed` | `{ sceneId: string; isHidden: boolean; isLocked: boolean }` | ne | Změna stavu viditelnosti/zámku scény |
| `map:sound-changed` | `{ sceneId: string; soundIds: string[] }` | ne | Změna zvukové kulisy scény |

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `map:token-moved` | `unknown` (token) | `{sceneId}` | Relay pohybu tokenu |
| `map:config-updated` | `unknown` (config) | `{sceneId}` | Relay aktualizace konfigurace |
| `map:token-removed` | `string` (tokenId) | `{sceneId}` | Relay odebrání tokenu |
| `map:scene-reloaded` | `unknown` (scene) | `{sceneId}` | Relay znovunačtení scény |
| `map:scene-cleared` | _(bez payloadu)_ | `{sceneId}` | Relay vymazání scény |
| `map:pinged` | `x: number, y: number, userName: string` | `{sceneId}` | Relay pingu (3 samostatné argumenty) |
| `map:effect-added` | `unknown` (effect) | `{sceneId}` | Relay přidání efektu |
| `map:effect-removed` | `string` (effectId) | `{sceneId}` | Relay odebrání efektu |
| `map:fog-updated` | `fogEnabled: boolean, revealedHexes: unknown[]` | `{sceneId}` | Relay aktualizace mlhy (2 argumenty) |
| `map:dice-rolled` | `{ [key: string]: unknown }` (bez sceneId) | `{sceneId}` | Broadcast hodu kostkami (všem, včetně odesílatele) |
| `map:scene-state-changed` | `isHidden: boolean, isLocked: boolean` | `{sceneId}` | Relay změny stavu scény (2 argumenty) |
| `map:sound-changed` | `string[]` (soundIds) | `{sceneId}` | Relay změny zvuku |

---

## 3. GlobalChatGateway

Řídí přítomnost uživatelů v globální hospodě a whisper zprávy.

### Příchozí eventy

| Event | Payload | Auth | Popis |
|---|---|---|---|
| `chat:hospoda:join` | `{ username: string; userId: string }` | ne | Registrace presence a vstup do `user:{userId}` roomu |
| `chat:hospoda:leave` | `{ username: string }` | ne | Odregistrace presence |
| `ikaros:whisper` | `{ toUserId: string; content: string }` | ne | Odeslání šeptané zprávy (vyžaduje předchozí `join`) |

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `chat:presence` | `{ username: string; action: 'join' \| 'leave' }` | `chat:{channelId}` | Broadcast příchodu/odchodu uživatele |
| `chat:message` | `ChatMessage` | `chat:{channelId}` nebo `user:{userId}` | Nová globální zpráva nebo whisper |
| `chat:message:deleted` | `{ messageId: string; channelId: string }` | `chat:{channelId}` | Smazaná globální zpráva |

---

## 4. WorldsGateway

Pouze odchozí — žádné `@SubscribeMessage` handlery. Emituje jako reakce na interní eventy.

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `world:updated` | `World` | `world:{worldId}` | Svět byl aktualizován |
| `world:deleted` | `{ worldId: string }` | `world:{worldId}` | Svět byl smazán |
| `world:membership:changed` | `WorldMembership` | `world:{worldId}` | Členství uživatele bylo změněno |
| `world:membership:removed` | `string` (membershipId) | `world:{worldId}` | Členství uživatele bylo odebráno |

---

## 5. UniverseGateway

Pouze odchozí — žádné `@SubscribeMessage` handlery.

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `universe:updated` | `UniverseMap` | `world:{worldId}` | Mapa univerza byla aktualizována |

---

## 6. EmotesGateway

Pouze odchozí — žádné `@SubscribeMessage` handlery.

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `emote:created` | `CustomEmote` | `world:{worldId}` | Nová vlastní emote byla přidána do světa |

---

## 7. IkarosMessagesGateway

Pouze odchozí — žádné `@SubscribeMessage` handlery. Při připojení automaticky přiřazuje socket do `user:{sub}` roomu na základě JWT.

### Připojení

Při `handleConnection` gateway ověří JWT z `handshake.auth.token` a přidá socket do roomu `user:{sub}`. Bez platného tokenu socket zůstane bez user roomu.

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `ikaros:new-message` | `{ messageId: string; subject: string; senderName: string; actionType: string }` | `user:{recipientId}` | Notifikace o nové Ikaros zprávě |

---

## Rooms — přehled

| Room pattern | Kdo vstupuje | Popis |
|---|---|---|
| `chat:{channelId}` | klient (AppGateway `room:join`) | Chat kanál |
| `world:{worldId}` | klient (AppGateway `room:join`) | Svět — globální eventy |
| `user:{userId}` | server automaticky nebo `chat:hospoda:join` | Privátní eventy pro konkrétního uživatele |
| `{sceneId}` | klient přes `map:join` | Mapa scény |
