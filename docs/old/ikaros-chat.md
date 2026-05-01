# Ikaros Chat — technická dokumentace

## 1. Datový model IkarosMessage

Kolekce MongoDB, název konfigurovatelný přes `MongoDBSettings.IkarosMessagesCollectionName`.

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | ObjectId (string) | Primární klíč dokumentu |
| `SenderId` | ObjectId (string) | ID odesílatele |
| `SenderName` | string | Username odesílatele (snapshot v době odeslání) |
| `RecipientId` | ObjectId (string) | ID příjemce |
| `RecipientName` | string | Username příjemce (snapshot) |
| `Subject` | string | Předmět zprávy |
| `Body` | string | Tělo zprávy |
| `SentAtUtc` | DateTime | Čas odeslání v UTC |
| `IsRead` | bool | Označeno jako přečtené (nastavuje se při GET `/{id}` příjemcem) |
| `DeletedBySender` | bool | Soft-delete pro odesílatele |
| `DeletedByRecipient` | bool | Soft-delete pro příjemce |
| `ActionType` | string | Typ akce (viz níže), prázdný = běžná zpráva |
| `ActionWorldId` | ObjectId (string) | ID světa, kterého se akce týká |
| `ActionUserId` | ObjectId (string) | ID uživatele, který akci inicioval (= SenderId při odeslání) |
| `ActionResolved` | bool | Zda byla akce již vyřešena (schválena nebo zamítnuta) |

### ActionType — podporované hodnoty

| Hodnota | Popis |
|---------|-------|
| `""` (prázdný) | Běžná zpráva bez akce |
| `"world_join_request"` | Žádost hráče o vstup do světa — zpráva jde Vypravěči (owner světa), který ji může přijmout nebo zamítnout přes `/resolve` endpoint |

### ActionResolved

Pole zabraňuje dvojímu zpracování akce. Jakmile Vypravěč zavolá `POST /{id}/resolve`, server nastaví `ActionResolved = true` a každý další pokus o resolve vrátí `400 Bad Request`.

---

## 2. REST API endpointy

### IkarosChatController — `api/ikaros-chat`

Endpoint je veřejný (bez `[Authorize]`).

| Metoda | Cesta | Popis | Odpověď |
|--------|-------|-------|---------|
| GET | `/api/ikaros-chat/room-info` | Vrátí stav všech místností — počet online uživatelů, aktivní styl a seznam uživatelských jmen | `200` `{ hospoda: { count, style, users[] }, pokec: { … }, … }` |

### IkarosMessagesController — `api/ikarosmessages`

Všechny endpointy vyžadují JWT (`[Authorize]`). Identita se čte z claimu `NameIdentifier` nebo `sub`.

| Metoda | Cesta | Popis | Odpověď |
|--------|-------|-------|---------|
| GET | `/api/ikarosmessages/inbox` | Přijaté zprávy aktuálního uživatele (bez soft-smazaných), sestupně dle `SentAtUtc` | `200 List<IkarosMessage>` |
| GET | `/api/ikarosmessages/sent` | Odeslané zprávy aktuálního uživatele (bez soft-smazaných) | `200 List<IkarosMessage>` |
| GET | `/api/ikarosmessages/unread-count` | Počet nepřečtených zpráv v inboxu | `200 int` |
| GET | `/api/ikarosmessages/{id}` | Detail zprávy; přístup mají pouze odesílatel a příjemce; příjemci automaticky nastaví `IsRead = true` | `200 IkarosMessage` / `404` / `403` |
| POST | `/api/ikarosmessages` | Odeslání zprávy (`SendMessageDto`) | `201 IkarosMessage` / `400` / `403` |
| DELETE | `/api/ikarosmessages/{id}` | Soft-delete — nastaví `DeletedBySender` nebo `DeletedByRecipient` podle toho, kdo volá | `204` / `404` |
| POST | `/api/ikarosmessages/{id}/resolve` | Vyřeší akci (`world_join_request`); volá pouze příjemce; přijme `{ accept: bool }` | `200` / `400` / `403` / `404` |

#### SendMessageDto (tělo POST `/api/ikarosmessages`)

```json
{
  "recipientId": "<ObjectId>",
  "subject": "string",
  "body": "string",
  "actionType": "world_join_request",   // volitelné
  "actionWorldId": "<ObjectId>"         // volitelné
}
```

`ActionUserId` se vždy nastavuje na `SenderId` volajícího, klient ho neposílá.

#### ResolveActionDto (tělo POST `/{id}/resolve`)

```json
{ "accept": true }
```

---

## 3. IkarosChatHub

SignalR hub dostupný na `/hubs/ikaros-chat` (předpoklad — cesta se konfiguruje v `Program.cs`).

### Místnosti (rooms)

Pevný seznam — dynamické vytváření místností není podporováno.

| roomId | Zobrazovaný název |
|--------|-------------------|
| `hospoda` | Dimenzionální hospoda |
| `pokec` | Všehoherní pokec |
| `rozcesti` | Rozcestí I. |
| `rozcesti2` | Rozcestí II. |
| `rozcesti3` | Rozcestí III. |

### In-memory stav (statické `ConcurrentDictionary`)

| Proměnná | Typ | Obsah |
|----------|-----|-------|
| `_roomUsers` | `ConcurrentDictionary<roomId, ConcurrentDictionary<userId, TavernUser>>` | Online uživatelé v každé místnosti |
| `_roomMessages` | `ConcurrentDictionary<roomId, List<StoredMessage>>` | Historie zpráv (max 100 zpráv, max 2 hodiny) |
| `_roomStyles` | `ConcurrentDictionary<roomId, string>` | Aktivní styl místnosti (`F`=Fantasy, `S`=Scifi, `M`=Mystic); výchozí `F` |

`TavernUser` uchovává: `Username`, `UserId`, `AvatarUrl` (z DB pole `IkarosAvatarUrl`), `RozcestiCharacter`, `LastActivity`, `ConnectionIds` (HashSet — jeden uživatel může mít více záložek).

### Metody klient → server

| Metoda | Parametry | Chování |
|--------|-----------|---------|
| `JoinRoom` | `roomId, username, userId` | Přidá uživatele do skupiny SignalR; načte avatar z MongoDB; pošle historii volajícímu (`LoadHistory`); broadcast `UserJoined` (jen pokud jde o skutečně nového uživatele, ne reconnect); broadcast `UpdateUserList` |
| `LeaveRoom` | `roomId` | Odstraní uživatele ze skupiny; broadcast `UserLeft` + `UpdateUserList` |
| `SendMessage` | `roomId, username, message, color, target` | `target="all"` → uloží zprávu + broadcast `ReceiveMessage` skupině; `target=<username>` → whisper jen cílovému uživateli a odesílateli (neukládá se) |
| `SetRoomStyle` | `roomId, style` | Pouze pro místnosti `rozcesti*`; `style` ∈ `{ "fantasy", "scifi", "mystic" }`; broadcast `RoomStyleChanged` |

### Eventy server → klient

| Event | Payload | Kdy se posílá |
|-------|---------|---------------|
| `LoadHistory` | `List<{ username, text, color, time, isWhisper }>` | Po `JoinRoom`, pouze volajícímu; zprávy posledních 60 minut |
| `UserJoined` | `username, time` | Broadcast skupině při novém přístupu do místnosti |
| `UserLeft` | `username, time` | Broadcast skupině při odchodu nebo cleanup neaktivního uživatele |
| `UpdateUserList` | `List<{ username, avatarUrl, rozcestiCharacter }>` | Broadcast skupině po každé změně seznamu uživatelů |
| `ReceiveMessage` | `username, message, color, time, isWhisper (bool), target (string|null)` | Broadcast skupině (veřejná zpráva) nebo jen konkrétním klientům (whisper) |
| `RoomStyleChanged` | `style` (string) | Broadcast skupině po `SetRoomStyle` |

### Správa odpojení a cleanup

- `OnDisconnectedAsync` — odstraní `ConnectionId` ze všech místností a aktualizuje `LastActivity`; uživatel ale zůstává v `_roomUsers` dokud má alespoň jedno aktivní spojení.
- `CleanupInactiveUsersAsync` — voláno po každém `JoinRoom`, `LeaveRoom`, `SendMessage`; odstraní uživatele s nulovými spojeními, jejichž `LastActivity` je starší než **45 minut**; odstraněným pošle `UserLeft` skupině.
- `CleanMessages` — voláno při každém zápisu i čtení; odstraní zprávy starší než 2 hodiny, poté zkrátí seznam na max 100 záznamů (odstraní nejstarší).

---

## 4. Notifikační tok — zprávy jako akce

`IkarosMessage` slouží zároveň jako interní notifikační systém. Pole `ActionType`, `ActionWorldId`, `ActionUserId`, `ActionResolved` mění zprávu z pasivní komunikace na aktivní pracovní položku.

### Tok world_join_request

```
Hráč klikne "Žádost o vstup do světa"
        │
        ▼
POST /api/ikarosmessages
  {
    recipientId: <ID Vypravěče>,
    subject: "Žádost o vstup",
    body: "...",
    actionType: "world_join_request",
    actionWorldId: "<ID světa>"
  }
        │
        ▼
Server vytvoří IkarosMessage
  ActionUserId = SenderId (hráč)
  ActionResolved = false
        │
        ▼
Vypravěč vidí zprávu v inboxu s tlačítky Přijmout / Zamítnout
        │
        ├─── Přijmout ───▶ POST /{id}/resolve { accept: true }
        │                         │
        │                         ▼
        │                  WorldMembership.Role: Pending → Hrac
        │                  Systémová zpráva hráči: "Žádost přijata"
        │                  ActionResolved = true
        │
        └─── Zamítnout ──▶ POST /{id}/resolve { accept: false }
                                  │
                                  ▼
                           Membership zůstává Pending (TODO: smazání)
                           Systémová zpráva hráči: "Žádost ZAMÍTNUTA"
                           ActionResolved = true
```

### Klíčové vlastnosti tohoto toku

- **Idempotence**: `ActionResolved = true` zabraňuje dvojímu zpracování — druhý pokus o resolve vrátí `400`.
- **Autorizace**: Resolve může volat výhradně příjemce zprávy (`msg.RecipientId != userId` → `403`).
- **Zpětná vazba**: Server automaticky odešle novou `IkarosMessage` zpět žadateli (odesílatel = `SenderName: "Systém"`), takže hráč vidí výsledek ve svém inboxu bez dalšího polling.
- **Chybový stav**: Pokud v době resolve světa již neexistuje (`_worldService.Get` vrátí null), endpoint vrátí `404 "Světa již neexistuje."`.
- **Rozšiřitelnost**: Systém je připraven na více typů akcí — přidání nového `ActionType` znamená přidat větev v `switch` v `ResolveAction`; REST rozhraní se nemění.
