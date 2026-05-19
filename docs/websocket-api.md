# WebSocket API — Projekt Ikaros

Všechny gateway sdílejí jednu Socket.io instanci (výchozí namespace `/`).
Připojení: `io('http://localhost:3000')` s `auth: { token: '<JWT>' }` nebo cookie.

---

## 1. ChatGateway

Zpracovává typing indikátory a presence konverzací. Zprávy, kanály, skupiny a unread počty jsou emitovány jako reakce na interní eventy (ne na klientský požadavek).

> Názvosloví: „kanál" = `ChatGroup` (kontejner), „konverzace" = `ChatChannel`. Eventy drží BE názvy (`channelId`, `chat:channel:*`).

### Příchozí eventy

| Event | Payload | Auth | Popis |
|---|---|---|---|
| `typing:start` | `{ channelId: string; characterName: string }` | ne | Zahájí indikátor psaní v dané konverzaci; automaticky expiruje po 5 s |
| `typing:stop` | `{ channelId: string; characterName: string }` | ne | Okamžitě ukončí indikátor psaní |
| `chat:channel:join` | `{ channelId: string; userId: string; username: string; avatarUrl?: string }` | ne | Přihlásí uživatele do presence konverzace (krok 6.1d); `worldRole` doplní server z membership |
| `chat:channel:leave` | `{ channelId: string }` | ne | Odhlásí socket z presence konverzace |

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
| `chat:presence` | `{ channelId: string; userId: string; username: string; avatarUrl?: string; worldRole: number; action: 'join' \| 'leave' }` | `chat:{channelId}` | Příchod/odchod uživatele v konverzaci (krok 6.1d); in-memory, jen běh procesu |

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

Řídí přítomnost uživatelů v globálních místnostech a whisper zprávy. Místnosti
(`room`, krok 4.2a): `hospoda` (Hospoda) + `rozcesti-1` / `rozcesti-2` / `rozcesti-3`
(Rozcestí I.–III.). Každá je samostatný kanál — presence i historie jsou per-místnost.

### Příchozí eventy

| Event | Payload | Auth | Popis |
|---|---|---|---|
| `chat:hospoda:join` | `{ username: string; userId: string }` | ne | Registrace presence v Hospodě + vstup do `user:{userId}` roomu (krok 4.1, beze změny) |
| `chat:hospoda:leave` | `{ username: string }` | ne | Odregistrace presence z Hospody |
| `chat:room:join` | `{ room: RoomKey; username: string; userId: string }` | ne | Registrace presence v dané místnosti (Rozcestí); `room` mimo povolené hodnoty se ignoruje |
| `chat:room:leave` | `{ room: RoomKey; username: string }` | ne | Odregistrace presence z místnosti |
| `ikaros:whisper` | `{ toUserId: string; content?: string; color?: string; room?: RoomKey; replyToId?: string; attachments?: ChatAttachment[] }` | ne | Šeptaná zpráva (vyžaduje předchozí `join`); `color` = hex barva textu; `room` určuje kanál uložení (default = místnost odesílatele); `replyToId` = ID zprávy, na kterou se odpovídá (krok 4.3a); `attachments` = přílohy nahrané přes `POST /global-chat/upload` (krok 4.3b — `content` smí být prázdné, má-li whisper přílohu) |
| `chat:heartbeat` | `{}` | ne | Udržuje presence „naživu" — obnovuje `lastSeen` socketu (krok 4.2c §5). FE posílá ~á 5 min; výpadek (zavřená/uspaná záložka) > 60 min → auto-odhlášení |
| `chat:reaction:toggle` | `{ room?: RoomKey; messageId: string; emoji: string }` | ne | Přepne emoji reakci odesílatele na zprávě (krok 4.3a). Druhá reakce stejným emoji ji odebere. U whisperu smí reagovat jen účastník. `emoji` max 16 znaků |

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `chat:presence` | `{ userId?: string; username: string; avatarUrl?: string; characterName?: string; characterAvatarUrl?: string; action: 'join' \| 'leave'; reason?: 'timeout' \| 'disconnect' \| 'explicit' }` | `chat:{channelId}` | Broadcast příchodu/odchodu uživatele — `server.to` (i samotnému joinerovi). `avatarUrl` = avatar účtu (Hospoda), `characterName`/`characterAvatarUrl` = postava (Rozcestí, 4.2d §8). `reason` u `leave`: `timeout` (60min cleanup — FE ukáže overlay auto-odhlášení), `disconnect` (zavření/reload socketu), `explicit` (tlačítko Odejít) |
| `chat:message` | `ChatMessage` | `chat:{channelId}` nebo `user:{userId}` | Nová globální zpráva nebo whisper |
| `chat:message:deleted` | `{ messageId: string; channelId: string }` | `chat:{channelId}` | Smazaná globální zpráva |
| `chat:message:reaction` | `{ messageId: string; channelId: string; reactions: Record<string, string[]> }` | `chat:{channelId}` nebo `user:{userId}` | Změna emoji reakcí zprávy (krok 4.3a). `reactions` = emoji → pole `userId`. Whisper jde jen účastníkům (`user:` room) |
| `chat:room:environment` | `{ room: RoomKey; style: 'fantasy'\|'scifi'\|'mystic'; placeId: string }` | `chat:{channelId}` | Změna sdíleného prostředí Rozcestí (styl + lokace); emituje BE po REST `PUT /global-chat/rooms/:room/environment` |
| `chat:rooms:presence` | `Record<RoomKey, number>` | *(broadcast všem)* | Počet přítomných pro každou místnost — pro odznak v navigaci. Emituje BE po každém join/leave/cleanup. Initial stav přes REST `GET /global-chat/rooms/presence` |

> `RoomKey` = `'hospoda' | 'rozcesti-1' | 'rozcesti-2' | 'rozcesti-3'`.
> Auto-odhlášení (krok 4.2c §5): cron á 5 min odebere z presence socket s `lastSeen`
> starším 60 min. Socket se **neodpojuje** (je sdílený celou aplikací) — jen padne
> `chat:presence` `leave` a `chat:rooms:presence`.
>
> Multi-room (krok 4.2d): jeden socket může být přítomný ve víc místnostech zároveň.
> Odchod je per-místnost (`chat:hospoda:leave` / `chat:room:leave`) — opuštění
> stránky z místnosti **neodhlašuje**, jen explicitní leave / 60min timeout /
> odpojení socketu. Odpojení socketu (zavření okna, reload) řeší
> `OnGatewayDisconnect` — odebere socket ze všech jeho místností.
> Příchod/odchod se navíc ukládá jako systémová zpráva (`isSystem: true`) a
> doručuje běžným `chat:message` — vidí ji i pozdější příchozí (TTL 1 h).
> Prostředí (`chat:room:environment`) je in-memory na BE — restart serveru ho resetuje
>
> Přílohy (krok 4.3b): soubor se nahraje přes REST `POST /global-chat/upload?room=`
> (multipart `file`, max 10 MB, jen obrázky a dokumenty — bez videa) → vrátí
> `ChatAttachment`. Ten se pak posílá v `attachments` při REST `POST /global-chat/messages`
> nebo ve WS `ikaros:whisper`. BE ověří, že příloha pochází z našeho Cloudinary
> uploadu (doména účtu + folder `global-chat/`).
> na default `{ style: 'fantasy', placeId: '1' }`. Měnit ho smí jen role s platformovou
> funkcí (REST endpoint je za `RolesGuard`).

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
