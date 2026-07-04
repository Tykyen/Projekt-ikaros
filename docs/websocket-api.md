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
| `chat:channel:created` | `{ worldId: string }` | `world:{worldId}` | Nový kanál — W-4 leak-safe signál (FE refetchne filtrovaný `GET groups`, ne celý objekt → skrytý roles-kanál neleakne metadata) |
| `chat:channel:updated` | `{ worldId: string }` | `world:{worldId}` | Kanál upraven — W-4 leak-safe signál |
| `chat:channel:deleted` | `{ channelId: string; groupId: string }` | `world:{worldId}` | Kanál byl smazán |
| `chat:group:created` | `{ worldId: string }` | `world:{worldId}` | Nová skupina — W-4 leak-safe signál |
| `chat:group:updated` | `{ worldId: string }` | `world:{worldId}` | Skupina upravena — W-4 leak-safe signál |
| `chat:group:deleted` | `string` (groupId) | `world:{worldId}` | Skupina kanálů byla smazána |
| `chat:unread` | `{ channelId: string; count: number }` | `user:{userId}` | Aktualizace počtu nepřečtených zpráv |
| `chat:feed:bump` | `{ worldId: string }` | `user:{userId}` | 13.2a — signál „nová zpráva v některém z tvých kanálů" do user roomů příjemců; klient refetchne `GET /chat/feed` (leak-safe: bez obsahu, server filtruje). Vlastní zprávy se odesílateli neposílají. |
| `chat:presence` | `{ channelId: string; userId: string; username: string; avatarUrl?: string; worldRole: number; action: 'join' \| 'leave' }` | `chat:{channelId}` | Příchod/odchod uživatele v konverzaci (krok 6.1d); in-memory, jen běh procesu |

---

## 2. MapsGateway

**Operation-based model (10.2-prep-1+).** Mapa nepoužívá per-akci relay eventy —
veškeré herní mutace jdou přes **REST Operations API** (`POST /maps/:id/operations`),
server je atomicky aplikuje, zapíše do append-only logu se `seqNumber` a broadcastne
**jeden generický `map:operation`** do roomu scény. Klient drží `lastSeqNumber`,
detekuje mezery a dotahuje přes catch-up REST endpoint. JWT auth je povinná při
handshake (`handshake.auth.token`), po ověření server auto-joinne `user:{userId}`.

### Příchozí eventy (klient → server)

| Event | Payload | Auth | Popis |
|---|---|---|---|
| `map:join` | `string` (sceneId) | ano | Vstup do roomu scény (BE ověří read-access). **Po reconnectu klient re-emituje** (rooms se ztrácejí). |
| `map:leave` | `string` (sceneId) | ano | Odchod z roomu scény |
| `map:join-world` | `string` (worldId) | ano (**PJ+**) | Vstup do `world:{worldId}` roomu — PJ orchestrátor (cross-scene log) |
| `map:spotlight` | `{ sceneId: string; tokenId: string }` | ano (**PJ+**) | Ephemeral „ukazováček" PJ — rozsvítí token všem na scéně ~3 s |
| `map:ping` | `{ sceneId: string; x: number; y: number; userName: string }` | ano | Ephemeral ping na plochu (mapa-space `x`/`y`); relay ostatním na scéně |

> Pohyb tokenu / efekty / fog / scéna / combat / zvuky / kostky **nejsou** WS eventy —
> jdou přes `POST /maps/:id/operations` (per-scene) a `POST /worlds/:worldId/operations`
> (cross-scene, member.*). Autorizace per-op v `OperationsAuthorizer`.

### Odchozí eventy (server → klient)

| Event | Payload | Room | Popis |
|---|---|---|---|
| `map:operation` | `{ sceneId; seqNumber: number; op: MapOperation; byUserId; appliedAt }` | `{sceneId}` | Jedna aplikovaná operace scény (token/effect/fog/scene/combat/sound). Klient patchuje dle `seqNumber`. |
| `world:operation` | `{ worldId; seqNumber: number; op; byUserId; appliedAt }` | `world:{worldId}` | Cross-scene operace (member assignment) — PJ orchestrátor |
| `map:member-joined` | `{ sceneId; userId; … }` | `{sceneId}` | Hráč přiřazen na scénu (cascade z world op) |
| `map:member-left` | `{ sceneId; userId }` | `{sceneId}` | Hráč opustil scénu (cascade při `scene.deactivate`) |
| `map:reassigned` | `{ newSceneId: string \| null }` | `user:{userId}` | Privát: PJ přesunul mě na jinou scénu (`null` = unassign) |
| `map:spotlight` | `{ tokenId: string }` | `{sceneId}` | Ephemeral spotlight (relay z příchozího `map:spotlight`) |
| `map:pinged` | `x, y, userName` (poziční argumenty) | `{sceneId}` | Ephemeral ping (relay z `map:ping`) — pozor: poziční args, ne objekt |
| `weather:updated` | `{ worldId; generatorId: string \| null; generatorName: string \| null; weather: WeatherResult \| null; activeMapWeather?: null }` | `world:{worldId}` | Počasí vyslané/zrušené PJ (10.2i). `weather:null` = PJ vypnul počasí na mapě. Reaguje na interní `weather.updated`. |

### Catch-up (REST, ne WS)

| Endpoint | Popis |
|---|---|
| `GET /maps/:id/operations?since=N&limit=500` | Per-scene ops se `seqNumber > N` (ascending). Gap recovery + reconnect catch-up. |
| `GET /worlds/:id/operations?since=N&limit=200` | Cross-scene ops (PJ-only). |

> **Legacy relay handlery odstraněny (W-5, 2026-06-04):** `map:token-moved`,
> `map:config-updated`, `map:token-removed`, `map:reload-scene`, `map:scene-cleared`,
> `map:effect-added/removed`, `map:fog-updated`, `map:dice-rolled`,
> `map:scene-state-changed`, `map:sound-changed` byly smazány — nahrazeny operation
> modelem, FE je nepoužíval, tvořily mrtvý kód + relay surface. Ephemeral `map:ping`
> a `map:spotlight` zůstávají (živé).

---

## 3. GlobalChatGateway

Řídí přítomnost uživatelů v globálních místnostech a whisper zprávy. Místnosti
(`room`, krok 4.2a): `hospoda` (Hospoda) + `camp-1` / `camp-2` / `camp-3`
(Camp I.–III.). Každá je samostatný kanál — presence i historie jsou per-místnost.

### Příchozí eventy

| Event | Payload | Auth | Popis |
|---|---|---|---|
| `chat:hospoda:join` | `{ username: string; userId: string }` | ne | Registrace presence v Hospodě + vstup do `user:{userId}` roomu (krok 4.1, beze změny) |
| `chat:hospoda:leave` | `{ username: string }` | ne | Odregistrace presence z Hospody |
| `chat:room:join` | `{ room: RoomKey; username: string; userId: string }` | ne | Registrace presence v dané místnosti (Camp); `room` mimo povolené hodnoty se ignoruje |
| `chat:room:leave` | `{ room: RoomKey; username: string }` | ne | Odregistrace presence z místnosti |
| `ikaros:whisper` | `{ toUserId: string; content?: string; color?: string; room?: RoomKey; replyToId?: string; attachments?: ChatAttachment[] }` | ne | Šeptaná zpráva (vyžaduje předchozí `join`); `color` = hex barva textu; `room` určuje kanál uložení (default = místnost odesílatele); `replyToId` = ID zprávy, na kterou se odpovídá (krok 4.3a); `attachments` = přílohy nahrané přes `POST /global-chat/upload` (krok 4.3b — `content` smí být prázdné, má-li whisper přílohu) |
| `chat:heartbeat` | `{}` | ne | Udržuje presence „naživu" — obnovuje `lastSeen` socketu (krok 4.2c §5). FE posílá ~á 5 min; výpadek (zavřená/uspaná záložka) > 60 min → auto-odhlášení |
| `chat:reaction:toggle` | `{ room?: RoomKey; messageId: string; emoji: string }` | ne | Přepne emoji reakci odesílatele na zprávě (krok 4.3a). Druhá reakce stejným emoji ji odebere. U whisperu smí reagovat jen účastník. `emoji` max 16 znaků |

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `chat:presence` | `{ userId?: string; username: string; avatarUrl?: string; characterName?: string; characterAvatarUrl?: string; action: 'join' \| 'leave'; reason?: 'timeout' \| 'disconnect' \| 'explicit' }` | `chat:{channelId}` | Broadcast příchodu/odchodu uživatele — `server.to` (i samotnému joinerovi). `avatarUrl` = avatar účtu (Hospoda), `characterName`/`characterAvatarUrl` = postava (Camp, 4.2d §8). `reason` u `leave`: `timeout` (60min cleanup — FE ukáže overlay auto-odhlášení), `disconnect` (zavření/reload socketu), `explicit` (tlačítko Odejít) |
| `chat:message` | `ChatMessage` | `chat:{channelId}` nebo `user:{userId}` | Nová globální zpráva nebo whisper |
| `chat:message:deleted` | `{ messageId: string; channelId: string }` | `chat:{channelId}` | Smazaná globální zpráva |
| `chat:message:reaction` | `{ messageId: string; channelId: string; reactions: Record<string, string[]> }` | `chat:{channelId}` nebo `user:{userId}` | Změna emoji reakcí zprávy (krok 4.3a). `reactions` = emoji → pole `userId`. Whisper jde jen účastníkům (`user:` room) |
| `chat:room:environment` | `{ room: RoomKey; style: 'fantasy'\|'scifi'\|'mystic'; placeId: string }` | `chat:{channelId}` | Změna sdíleného prostředí Campu (styl + lokace); emituje BE po REST `PUT /global-chat/rooms/:room/environment` |
| `chat:rooms:presence` | `Record<RoomKey, number>` | *(broadcast všem)* | Počet přítomných pro každou místnost — pro odznak v navigaci. Emituje BE po každém join/leave/cleanup. Initial stav přes REST `GET /global-chat/rooms/presence` |

> `RoomKey` = `'hospoda' | 'camp-1' | 'camp-2' | 'camp-3'`.
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

## 8. PlatformChatGateway

Interní chat správy platformy (`/admin/chat`, 20.5). Sdílí socket server; room `platform-chat:{channelId}` je gated přes admin roli + členství (viz `PlatformChatService.canUserAccessChannel`).

### Příchozí eventy

| Event | Payload | Popis |
|---|---|---|
| `platform-chat:join` | `{ channelId }` | Vstup do room konverzace (BE ověří admin + přístup) |
| `platform-chat:leave` | `{ channelId }` | Opuštění room |
| `platform-chat:typing` | `{ channelId, isTyping }` | „Píše…" — BE broadcastuje ostatním v room (identita z `client.data.userId`) — 2026-07-04 |

### Odchozí eventy

| Event | Payload | Room | Popis |
|---|---|---|---|
| `platform-chat:message` | `ChatMessage` | `platform-chat:{channelId}` | Nová zpráva do otevřené konverzace |
| `platform-chat:activity` | `{ channelId }` | `user:{recipientId}` | In-app signál o nové zprávě příjemcům (badge i bez otevřeného chatu) — 2026-07-04 |
| `platform-chat:message:deleted` | `{ messageId, channelId }` | `platform-chat:{channelId}` | Zpráva smazána (Superadmin nebo odesílatel) — 2026-07-04 |
| `platform-chat:typing` | `{ channelId, username, isTyping }` | `platform-chat:{channelId}` | Kdo právě píše (broadcast ostatním, ne sobě) — 2026-07-04 |

---

## Rooms — přehled

| Room pattern | Kdo vstupuje | Popis |
|---|---|---|
| `chat:{channelId}` | klient (AppGateway `room:join`) | Chat kanál |
| `platform-chat:{channelId}` | klient (`platform-chat:join`, admin+člen) | Admin chat konverzace (20.5) |
| `world:{worldId}` | klient (AppGateway `room:join`) | Svět — globální eventy |
| `user:{userId}` | server automaticky nebo `chat:hospoda:join` | Privátní eventy pro konkrétního uživatele |
| `{sceneId}` | klient přes `map:join` | Mapa scény |
