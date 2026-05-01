# SignalR huby — Matrix backend

## 1. Přehled

Matrix backend obsahuje tři SignalR huby, každý pro jinou doménu real-time komunikace.

| Hub | Třída | URL endpoint | Autentifikace |
|-----|-------|-------------|---------------|
| Chat kanálů | `ChatHub` | `/hubs/chat` | Žádná (dědí z `Hub`) |
| Herní mapa | `MapHub` | `/hubs/map` | Žádná (dědí z `Hub`) |
| Ikaros taverna | `IkarosChatHub` | `/hubs/ikaros-chat` | Žádná, ale `userId` se předává jako parametr metod |

Žádný z hubů nepoužívá `[Authorize]` atribut — autentifikace probíhá na aplikační úrovni (klient sám posílá `userId`/`username`).

---

## 2. ChatHub

**Soubor:** `backend/Hubs/ChatHub.cs`

Hub pro chat v herních kanálech (ne Ikaros taverna). Pracuje se skupinami pojmenovanými podle `channelId`.

### Metody klient → server

| Metoda | Parametry | Co dělá |
|--------|-----------|---------|
| `JoinChannel` | `channelId: string` | Přidá connection do SignalR skupiny daného kanálu |
| `LeaveChannel` | `channelId: string` | Odebere connection ze skupiny kanálu |
| `Typing` | `channelId: string`, `userId: string`, `userName: string` | Rozešle ostatním ve skupině událost `UserTyping` |

### Eventy server → klient

| Event | Kdy se posílá | Příjemci | Data |
|-------|--------------|----------|------|
| `UserTyping` | Při volání `Typing` | Všichni ve skupině **kromě volajícího** (`OthersInGroup`) | `channelId: string`, `userId: string`, `userName: string` |

> Samotné zprávy chatu (ukládání, broadcast `ReceiveMessage`, `MessageUpdated` apod.) jsou řešeny přes REST API + server-side push, nikoli přes tento hub. Hub zajišťuje pouze skupinové členství a signál "právě píše".

---

## 3. MapHub

**Soubor:** `backend/Hubs/MapHub.cs`

Hub pro synchronizaci stavu herní mapy. Skupiny jsou pojmenované podle `sceneId`. Téměř všechny metody fungují jako **relay** — přijmou data od jednoho klienta a přepošlou je ostatním ve scéně.

### Kompletní tabulka metod a eventů

| Metoda (klient → server) | Parametry | Event (server → klient) | Příjemci | Data eventu |
|--------------------------|-----------|------------------------|----------|-------------|
| `JoinMap` | `sceneId: string` | — | — | Přidá connection do skupiny scény |
| `LeaveMap` | `sceneId: string` | — | — | Odebere connection ze skupiny scény |
| `TokenMoved` | `sceneId: string`, `token: MapToken` | `OnTokenMoved` | OthersInGroup | `token: MapToken` |
| `ConfigUpdated` | `sceneId: string`, `config: HexConfig` | `OnConfigUpdated` | OthersInGroup | `config: HexConfig` |
| `TokenRemoved` | `sceneId: string`, `tokenId: string` | `OnTokenRemoved` | OthersInGroup | `tokenId: string` |
| `ReloadScene` | `sceneId: string`, `scene: MapScene` | `OnSceneReloaded` | OthersInGroup | `scene: MapScene` |
| `SceneCleared` | `sceneId: string` | `OnSceneCleared` | OthersInGroup | *(žádná data)* |
| `PingMap` | `sceneId: string`, `x: double`, `y: double`, `userName: string` | `OnMapPinged` | OthersInGroup | `x: double`, `y: double`, `userName: string` |
| `EffectAdded` | `sceneId: string`, `effect: MapEffect` | `OnEffectAdded` | OthersInGroup | `effect: MapEffect` |
| `EffectRemoved` | `sceneId: string`, `effectId: string` | `OnEffectRemoved` | OthersInGroup | `effectId: string` |
| `FogUpdated` | `sceneId: string`, `fogEnabled: bool`, `revealedHexes: List<HexCoord>` | `OnFogUpdated` | OthersInGroup | `fogEnabled: bool`, `revealedHexes: List<HexCoord>` |
| `DiceRolled` | `sceneId`, `rollerId`, `rollerName`, `faces: string[]`, `total: int`, `skillLabel?`, `skillModifier?`, `type?`, `skinMapping?: Dict<string,string>` | `OnDiceRolled` | **Celá skupina včetně volajícího** (`Group`) | stejná data bez `sceneId` |
| `SceneStateChanged` | `sceneId: string`, `isHidden: bool`, `isLocked: bool` | `OnSceneStateChanged` | OthersInGroup | `isHidden: bool`, `isLocked: bool` |
| `ActiveSoundChanged` | `sceneId: string`, `soundIds: List<string>` | `OnActiveSoundChanged` | OthersInGroup | `soundIds: List<string>` |

**Poznámka k `DiceRolled`:** Jediná metoda, kde event jde i volajícímu — používá `Clients.Group(sceneId)` místo `Clients.OthersInGroup`.

---

## 4. IkarosChatHub

**Soubor:** `backend/Hubs/IkarosChatHub.cs`

Hub pro Ikaros tavernu — veřejný chat rozdělený do místností. Má vlastní in-memory stav a dotazuje MongoDB pro avatary uživatelů.

### Místnosti

Pevně dané, nelze vytvářet nové:

| roomId | Zobrazovaný název |
|--------|------------------|
| `hospoda` | Dimenzionální hospoda |
| `pokec` | Všehoherní pokec |
| `rozcesti` | Rozcestí I. |
| `rozcesti2` | Rozcestí II. |
| `rozcesti3` | Rozcestí III. |

### In-memory stav (statický, sdílený mezi všemi connectionami)

| Pole | Typ | Popis |
|------|-----|-------|
| `_roomUsers` | `ConcurrentDictionary<string, ConcurrentDictionary<string, TavernUser>>` | `roomId → userId → TavernUser` |
| `_roomMessages` | `ConcurrentDictionary<string, List<StoredMessage>>` | `roomId → zprávy` (max 100, max 2 hodiny staré) |
| `_roomStyles` | `ConcurrentDictionary<string, string>` | `roomId → "F"/"S"/"M"` (výchozí `"F"`) |

**TavernUser** obsahuje: `Username`, `UserId`, `AvatarUrl?`, `RozcestiCharacter?`, `LastActivity`, `ConnectionIds: HashSet<string>` (jeden uživatel může mít více connections).

### Metody klient → server

#### `JoinRoom(roomId, username, userId)`
1. Ověří, zda `roomId` je platná místnost — jinak ignoruje.
2. Načte z MongoDB (`Users` kolekce) `IkarosAvatarUrl` a `RozcestiCharacter` uživatele.
3. Přidá uživatele do `_roomUsers[roomId]` (nebo aktualizuje existujícího).
4. Přidá connection do SignalR skupiny.
5. Spustí `CleanupInactiveUsers` (odstraní uživatele bez connection starší 45 minut).
6. Pošle volajícímu historii zpráv (posledních 60 minut).
7. Pokud jde o skutečně nového uživatele (ne reconnect), broadcastuje `UserJoined` celé skupině.
8. Broadcastuje aktualizovaný seznam uživatelů celé skupině.

#### `LeaveRoom(roomId)`
1. Najde uživatele podle `Context.ConnectionId`.
2. Odstraní ho z `_roomUsers[roomId]`.
3. Broadcastuje `UserLeft` a aktualizovaný `UpdateUserList`.

#### `SendMessage(roomId, username, message, color, target)`
- `target == "all"` → uloží zprávu do `_roomMessages`, broadcastuje `ReceiveMessage` **celé skupině**.
- `target != "all"` → šeptání (whisper): **neukládá** se, odesílá se pouze cílovému uživateli (všem jeho connectionům) a volajícímu.

#### `SetRoomStyle(roomId, style)`
- Funguje **pouze pro místnosti začínající `rozcesti`**.
- `style` mapování: `"scifi"` → `"S"`, `"mystic"` → `"M"`, cokoliv jiného → `"F"`.
- Broadcastuje `RoomStyleChanged` celé skupině.

### Eventy server → klient

| Event | Příjemci | Data |
|-------|----------|------|
| `LoadHistory` | Pouze volající (`Caller`) | `List<{ username, text, color, time, isWhisper }>` — zprávy posledních 60 minut |
| `UserJoined` | Celá skupina (`Group`) | `username: string`, `time: string` (formát `HH:mm:ss`) |
| `UserLeft` | Celá skupina | `username: string`, `time: string` (může obsahovat suffix ` (vypršel čas)` při automatickém odhlášení) |
| `UpdateUserList` | Celá skupina | `List<{ username, avatarUrl, rozcestiCharacter }>` seřazený abecedně |
| `ReceiveMessage` | Celá skupina (public) nebo cíl + volající (whisper) | `username: string`, `message: string`, `color: string`, `time: string`, `isWhisper: bool`, `target: string\|null` |
| `RoomStyleChanged` | Celá skupina | `style: string` (`"fantasy"` / `"scifi"` / `"mystic"`) |

### Odpojení (`OnDisconnectedAsync`)

Při odpojení se `ConnectionId` odstraní ze `HashSet<string> ConnectionIds` příslušného uživatele ve všech místnostech. Uživatel **zůstává** v `_roomUsers` dokud:
- sám nezavolá `LeaveRoom`, nebo
- neproběhne `CleanupInactiveUsers` (45 min bez connection).

### Statické pomocné metody (volané mimo hub, např. z REST controlleru)

| Metoda | Návratový typ | Popis |
|--------|---------------|-------|
| `GetRoomCounts()` | `Dictionary<string, int>` | Počet uživatelů v každé místnosti |
| `GetRoomInfo()` | `Dictionary<string, object>` | Pro každou místnost: `count`, `style`, `users: List<string>` |

---

## 5. Společné vzory

### Autentifikace
Žádný hub nepoužívá `[Authorize]`. Identita uživatele se předává jako parametr metod (`userId`, `username`). Backend **nekontroluje**, zda volající skutečně vlastní dané `userId` — důvěřuje klientovi.

### Connection management a skupiny
- Všechny tři huby používají **SignalR skupiny** (Groups API) pro scope broadcast zpráv.
- `ChatHub` a `MapHub` nedrží žádný vlastní in-memory stav — jsou čistě relay.
- `IkarosChatHub` drží vlastní stav v statických `ConcurrentDictionary` sdílených přes všechny instance hubu.

### Vzor relay (ChatHub, MapHub)
```
Klient A volá metodu → Hub přijme → Clients.OthersInGroup → Klient B, C, D obdrží event
```

### Vzor state + relay (IkarosChatHub)
```
Klient A volá metodu → Hub aktualizuje in-memory stav → broadcastuje event celé skupině
```

### Škálovatelnost
In-memory stav v `IkarosChatHub` (statické `ConcurrentDictionary`) **nefunguje při více instancích** serveru (bez Redis backplane). `ChatHub` a `MapHub` jsou bezstavové a horizontálně škálovatelné jen se SignalR backplane.
