# Chat zprávy — dokumentace

Platí pro: `matrixBackend` (ASP.NET Core 8, MongoDB)

---

## Model ChatMessage

MongoDB kolekce: konfigurovatelná přes `MongoDBSettings.ChatMessagesCollectionName`

Index: `(channelId ASC, timestamp DESC)` pro rychlé načítání posledních N zpráv.

| Pole                | Typ                               | Povinné    | Popis                                                                      |
|---------------------|-----------------------------------|------------|----------------------------------------------------------------------------|
| `Id`                | ObjectId                          | auto       | MongoDB ID                                                                 |
| `ChannelId`         | string                            | ano        | Odkaz na `ChatChannel.Id`                                                  |
| `SenderId`          | string                            | ano        | `User.Id` odesílatele                                                      |
| `SenderName`        | string                            | ano        | `CharacterName` pokud existuje, jinak `Username`                           |
| `OverrideName`      | string?                           | ne         | Alternativní jméno místo SenderName — **nastavit může jen PJ**             |
| `OverrideAvatarUrl` | string?                           | ne         | Alternativní avatar URL — **nastavit může jen PJ**                         |
| `Content`           | string?                           | podmíněně  | Text zprávy; povinný pokud chybí `Image` i `Images`                        |
| `Image`             | string?                           | ne         | URL jednoho obrázku (legacy)                                               |
| `Images`            | List<string>?                     | ne         | URLs více obrázků                                                          |
| `Timestamp`         | DateTime                          | auto       | UTC čas vytvoření                                                          |
| `IsEdited`          | bool                              | auto       | Výchozí `false`; `true` po editaci                                         |
| `EditedAt`          | DateTime?                         | ne         | UTC čas poslední editace                                                   |
| `IsDeleted`         | bool?                             | auto       | Výchozí `false`; soft-delete nastaví `true` + přepíše content              |
| `Reactions`         | Dictionary<string, List<string>>? | ne         | Klíč = emoji, hodnota = seznam userId; null pokud žádné reakce             |
| `ReplyToId`         | string?                           | ne         | Id zprávy, na kterou se odpovídá                                           |
| `ReplyToPreview`    | string?                           | auto       | Auto-generovaný preview: `"<SenderName>: <prvních 80 znaků>"`, nastaveno serverem |
| `VisibleTo`         | List<string>?                     | ne         | Whisper: seznam userId, kteří vidí zprávu; null = vidí všichni             |
| `RpDate`            | string?                           | ne         | In-game datum (volný řetězec, např. "15. března 2031")                     |
| `CustomFont`        | string?                           | ne         | CSS font-family identifikátor pro speciální styl zprávy                    |

---

## Model ChannelReadStatus

MongoDB kolekce: konfigurovatelná přes `MongoDBSettings.ChannelReadStatusCollectionName`

Složený index: `(UserId ASC, ChannelId ASC)` pro rychlé vyhledávání.

| Pole          | Typ      | Popis                                     |
|---------------|----------|-------------------------------------------|
| `Id`          | ObjectId | MongoDB ID                                |
| `UserId`      | string   | Id uživatele                              |
| `ChannelId`   | string   | Id kanálu                                 |
| `LastReadUtc` | DateTime | UTC čas posledního označení jako přečteno |

---

## Klíčová chování

### Whisper (`VisibleTo`)

Zpráva s neprázdným `VisibleTo` je whisper — vidí ji jen uživatelé v tomto seznamu.

Server při odesílání **automaticky přidá odesílatele** do `VisibleTo`, aby viděl vlastní whisper.

Při načítání zpráv non-PJ uživatelem se filtruje:

```
WHERE ChannelId == channelId
  AND (VisibleTo == null OR VisibleTo.length == 0 OR VisibleTo obsahuje user.Id)
```

PJ / Admin / Superadmin dostane **všechny** zprávy bez filtru.

### PJ override

Pole `OverrideName` a `OverrideAvatarUrl` se uloží do zprávy **pouze pokud** `user.Role` je `PJ`, `Admin` nebo `Superadmin`. Pro ostatní jsou tyto hodnoty ignorovány (vždy `null`).

### Reakce — toggle logika

1. Uživatel se odstraní ze **všech** existujících reakcí
2. Klikl na jiné emoji než měl předtím → přidá se k novému emoji
3. Klikl na stejné emoji → zůstane bez reakce (toggle off)

### Mazání zpráv

**Soft delete (non-PJ):**
- Pouze vlastní zprávy
- Kostky (`🎲 HOD FATE:` nebo `Hod Kostkou`) **nelze smazat**
- Nastaví `IsDeleted = true`, přepíše `Content = "*Zpráva byla smazána autorem*"`, odstraní `Image`
- Broadcastuje `MessageUpdated` (ne delete event)

**Hard delete (PJ / Admin / Superadmin):**
- Může smazat libovolnou zprávu
- Fyzické odstranění z DB (`DeleteOne`)
- Broadcastuje `MessageDeleted` s `{ id, channelId, hardDelete: true }`

---

## Read status mechanismus

Každý záznam v kolekci `ChannelReadStatus` reprezentuje **jeden uživatel × jeden kanál** a ukládá timestamp posledního označení jako přečteno.

### Upsert

Endpoint: `POST /api/chat/messages/read/{channelId}`

```
filter: { UserId == userId, ChannelId == channelId }
update: { $set: { LastReadUtc: DateTime.UtcNow } }
options: { IsUpsert: true }
```

Pokud záznam neexistuje, vytvoří se nový. Pokud existuje, aktualizuje se `LastReadUtc`. Operace je atomická.

### Výpočet unread count

Provádí se batch agregací pro všechny kanály najednou (`GetUnreadCountsBatch`):

```
Pipeline:
  MATCH:
    ChannelId IN [channelIds]
    IsDeleted != true
    SenderId != userId           ← vlastní zprávy se nepočítají
    pro každý kanál: Timestamp > lastReadByChannel[channelId]
  GROUP BY ChannelId
    COUNT()
```

Výsledek je `Dictionary<channelId, count>` přiřazený do `channel.Unread` — nikdy se neukládá do DB.

Pokud uživatel kanál nikdy nečetl (`LastReadUtc` neexistuje), použije se `DateTime.MinValue` → všechny zprávy jsou "nepřečtené".

Obohacení se provádí **pouze** při `GET /api/chat/channels` (seznam kanálů).

---

## Push notifikace — určení příjemců

| Situace                              | Příjemci                                                        |
|--------------------------------------|-----------------------------------------------------------------|
| Whisper (`VisibleTo` neprázdné)      | Pouze uživatelé v `VisibleTo`                                   |
| Kanál s `Participants`               | Pouze účastníci (`channel.Participants`)                        |
| Kanál s `GroupRequired`              | Uživatelé ve skupině (`GetUserIdsByGroup(channel.GroupRequired)`) |
| Globální kanál (bez omezení)         | Všichni uživatelé s aktivní push subscription                   |

Odesílatel je vždy vyloučen z příjemců. Odeslání probíhá asynchronně (fire-and-forget).

---

## API endpointy zpráv

Základní cesta: `/api/chat/messages` — všechny endpointy vyžadují přihlášení (`[Authorize]`).

| Metoda | Cesta                                 | Popis                                          |
|--------|---------------------------------------|------------------------------------------------|
| GET    | `/api/chat/messages/{channelId}`      | Načte zprávy kanálu (stránkování, whisper filtr) |
| POST   | `/api/chat/messages`                  | Odešle novou zprávu                            |
| PUT    | `/api/chat/messages/{id}`             | Upraví zprávu (pouze vlastní)                  |
| DELETE | `/api/chat/messages/{id}`             | Smaže zprávu (soft/hard dle role)              |
| POST   | `/api/chat/messages/read/{channelId}` | Označí kanál jako přečtený                     |
| POST   | `/api/chat/messages/{id}/react`       | Přidá / odebere reakci (emoji toggle)          |

### GET `/api/chat/messages/{channelId}`

Query parametry:
- `limit` — počet zpráv, výchozí 30, min 1, max 500
- `before` — ISO 8601 UTC timestamp pro cursor-based stránkování (vrátí zprávy starší než toto datum)

Ověří `CanUserAccessChannel`; vrátí 403 pokud uživatel nemá přístup.

Hlavička odpovědi: `Cache-Control: private, max-age=5`

### POST `/api/chat/messages` — tělo požadavku (`ChatMessageCreateDto`)

| Pole                | Typ           | Povinné   | Popis                                                          |
|---------------------|---------------|-----------|----------------------------------------------------------------|
| `ChannelId`         | string        | ano       | Cílový kanál                                                   |
| `Content`           | string?       | podmíněně | Text; povinný pokud chybí `Image` i `Images`                   |
| `Image`             | string?       | ne        | URL jednoho obrázku                                            |
| `Images`            | List<string>? | ne        | URLs více obrázků                                              |
| `ReplyToId`         | string?       | ne        | Id zprávy pro odpověď; server doplní `ReplyToPreview`          |
| `VisibleTo`         | List<string>? | ne        | Whisper — seznam userId; server automaticky přidá odesílatele  |
| `RpDate`            | string?       | ne        | In-game datum                                                  |
| `CustomFont`        | string?       | ne        | CSS font identifikátor                                         |
| `OverrideName`      | string?       | ne        | **Ignorováno pro non-PJ uživatele**                            |
| `OverrideAvatarUrl` | string?       | ne        | **Ignorováno pro non-PJ uživatele**                            |

Po vytvoření se broadcastuje přes SignalR na skupinu `channel.Id` eventem `ReceiveMessage`.

### PUT `/api/chat/messages/{id}` — tělo požadavku (`ChatMessageUpdateDto`)

| Pole     | Typ           | Povinné | Popis                       |
|----------|---------------|---------|-----------------------------|
| `Content`| string        | ano     | Nový text zprávy             |
| `Images` | List<string>? | ne      | Nahradí celý seznam obrázků  |

Pouze vlastní zprávy. Smazaná zpráva nelze editovat. Nastaví `IsEdited = true`, `EditedAt = now`. Broadcastuje `MessageUpdated`.

### POST `/api/chat/messages/{id}/react` — tělo požadavku

```json
{ "emoji": "👍" }
```

Broadcastuje `ReactionUpdated` s `{ messageId, reactions }`.
