# Chat kanály — dokumentace

Platí pro: `matrixBackend` (ASP.NET Core 8, MongoDB)

---

## Model ChatChannel

MongoDB kolekce: konfigurovatelná přes `MongoDBSettings.ChatChannelsCollectionName`

| Pole            | Typ           | Povinné         | Popis                                                                       |
|-----------------|---------------|-----------------|-----------------------------------------------------------------------------|
| `Id`            | string        | ano             | Ručně zadané nebo auto-generované; např. `t_mi6_team_ic`                    |
| `WorldId`       | string?       | ne              | Null = Matrix kanál; ObjectId = kanál patří světu                           |
| `Name`          | string        | ano             | Zobrazovaný název kanálu                                                    |
| `Type`          | string        | ano             | Typ: `team_ic`, `team_ooc`, `team_pj`, `dm`, `pj_dm`, `pj_group`, `inter`  |
| `Team`          | string?       | ne              | Název týmu/skupiny pro organizaci (např. "MI6")                             |
| `Icon`          | string?       | ne              | Ikona kanálu                                                                |
| `RoleRequired`  | int?          | ne              | Minimální `UserRole` enum hodnota pro přístup                               |
| `GroupRequired` | string?       | ne              | Název skupiny (`user.Groups` musí obsahovat); null = veřejný kanál          |
| `Participants`  | List<string>? | ne              | Seznam userId pro DM/pj_dm/pj_group kanály                                  |
| `Description`   | string?       | ne              | Popis kanálu                                                                |
| `GroupId`       | string?       | ne              | Odkaz na `ChatGroup.Id` (zařazení do skupiny v sidebaru)                    |
| `IsActive`      | bool          | ne              | Výchozí `true`; neaktivní kanál je skrytý pro non-PJ                        |
| `Unread`        | int           | pouze odpověď   | Počet nepřečtených zpráv — **nikdy se neukládá do DB** (`[BsonIgnore]`)     |
| `LastMsg`       | string?       | pouze odpověď   | Zkrácený text poslední zprávy (max 50 znaků) — **nikdy se neukládá** (`[BsonIgnore]`) |

### Generování Id

Pokud `Id` není při vytváření zadáno, server ho generuje podle těchto pravidel:

- DM/pj_dm s účastníky → `dm_<userId1>_<userId2>` (účastníci seřazeni abecedně)
- Světový kanál → `w_<worldId>_<slug(name)>`
- Ostatní → `t_<slug(team)>_<slug(type)>` nebo `t_<slug(team)>_<slug(type)>_<slug(name)>`

Pokud Id chybí a nespadá do žádného vzoru, vygeneruje se nové `ObjectId`.

---

## Přístupová logika (`CanUserAccessChannel`)

Pravidla se vyhodnocují **v tomto pořadí** — první pravidlo, které se uplatní, rozhoduje:

1. **PJ / Admin / Superadmin** → přístup vždy povolen
2. `IsActive == false` → zamítnout
3. `RoleRequired` je nastaveno a `user.Role < RoleRequired` → zamítnout
4. `Type` je `dm`, `pj_dm` nebo `pj_group` → přístup jen pokud je `user.Id` v `channel.Participants`
5. `GroupRequired` je neprázdné → přístup jen pokud `user.Groups` obsahuje danou skupinu (case-insensitive)
6. Jinak → přístup povolen

### Světové kanály (`GetVisibleForWorld`)

Pro kanály světa se filtruje pouze `IsActive == true`, bez skupinových omezení.

---

## API endpointy kanálů

Základní cesta: `/api/chat/channels`

| Metoda | Cesta                     | Autorizace              | Query params | Popis                                                                        |
|--------|---------------------------|-------------------------|--------------|------------------------------------------------------------------------------|
| GET    | `/api/chat/channels`      | Přihlášený              | `worldId?`   | Vrátí kanály viditelné pro přihlášeného uživatele, obohacené o `Unread` a `LastMsg` |
| POST   | `/api/chat/channels`      | PJ / Admin / Superadmin | `worldId?`   | Vytvoří kanál; `Name` a `Type` jsou povinné; Id se auto-generuje pokud chybí |
| GET    | `/api/chat/channels/{id}` | PJ / Admin / Superadmin | —            | Vrátí kanál dle Id (přímý přístup bez viditelnostní logiky)                  |
| PUT    | `/api/chat/channels/{id}` | PJ / Admin / Superadmin | —            | Aktualizuje kanál; normalizuje `GroupRequired` ("Všichni" → null)            |
| DELETE | `/api/chat/channels/{id}` | PJ / Admin / Superadmin | —            | Smaže kanál **a všechny jeho zprávy** (kaskádové mazání)                     |

### Obohacení metadat (GET seznam)

Při volání `GET /api/chat/channels` se metadata doplňují dvěma batch agregacemi (ne 2N dotazy):

1. `GetUnreadCountsBatch` — počty nepřečtených zpráv pro všechny kanály najednou
2. `GetLastMessagesBatch` — poslední zprávy pro všechny kanály najednou

Přímý `GET /api/chat/channels/{id}` (PJ endpoint) metadata **neobohacuje**.
