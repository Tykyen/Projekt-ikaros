# Uživatelé — dokumentace backendu

Zdroj: `Models/User.cs`, `Services/UserService.cs`, `Controllers/UsersController.cs`

---

## 1. Datový model User

Kolekce MongoDB, třída `matrixBackend.Models.User`. Atribut `[BsonIgnoreExtraElements]` — neznámá pole v DB jsou ignorována.

| Pole | Typ | Výchozí hodnota | Poznámka |
|---|---|---|---|
| `Id` | `string` | — | MongoDB ObjectId (`[BsonId]`, `[BsonRepresentation(ObjectId)]`) |
| `Username` | `string` | — | Přihlašovací jméno |
| `PasswordHash` | `string` | — | BCrypt hash hesla |
| `Role` | `UserRole` (enum) | `UserRole.User` | Uloženo jako string (`[BsonRepresentation(String)]`) |
| `AKJ` | `int` | `0` | Číslo AKJ |
| `CharacterPath` | `string?` | `null` | Cesta ke stránce postavy (slug) |
| `CharacterName` | `string?` | `null` | Název postavy — **nepočítá se z DB**, plní se za běhu přes `PopulateProfileImages` |
| `ProfileImageUrl` | `string?` | `null` | Vlastní URL profilového obrázku; pokud null, doplní se z character stránky |
| `CalendarMonth` | `string?` | `null` | Aktuální měsíc v kalendáři |
| `Groups` | `List<string>` | `[]` | Skupiny, do kterých uživatel patří |
| `FavoritePagesSlugs` | `List<string>` | `[]` | Slugy oblíbených stránek |
| `LastSeenUtc` | `DateTime?` | `null` | Čas poslední aktivity (UTC) |
| `CreatedAtUtc` | `DateTime?` | `null` | Čas registrace (UTC) |
| `RealName` | `string?` | `null` | Skutečné jméno |
| `City` | `string?` | `null` | Město |
| `AboutMe` | `string?` | `null` | Popis / bio |
| `IkarosAvatarUrl` | `string?` | `null` | Avatar pro Ikaros |
| `FavoriteDiscussionIds` | `List<string>` | `[]` | ID oblíbených diskuzí |
| `RozcestiCharacter` | `string?` | `null` | Postava na rozcestníku |
| `IkarosChatColor` | `string?` | `null` | Barva textu v Ikaros chatu |
| `IkarosSkin` | `string?` | `"default"` | Skin Ikarosu |
| `MatrixChatColor` | `string?` | `null` | Barva textu v Matrix chatu |
| `MatrixChatFont` | `string?` | `null` | Font v Matrix chatu |
| `MatrixChatFontSize` | `string?` | `null` | Velikost fontu v Matrix chatu |
| `ThemeSettings` | `Dictionary<string, string>` | `{}` | Nastavení vzhledu (klíč–hodnota) |
| `ChatPreferences` | `ChatPreferences?` | `null` | Preference chatu; `[BsonIgnoreIfNull]` — neuloží se pokud null |

### Vnořená třída ChatPreferences

| Pole | Typ | Popis |
|---|---|---|
| `GroupOrder` | `List<string>?` | Pořadí skupin v chatu |
| `ChannelOrders` | `Dictionary<string, List<string>>?` | Pořadí kanálů per skupina |
| `PinnedChannelIds` | `List<string>?` | Připnuté kanály |

### Vstupní DTO UserRegister

Používá se při `POST /api/users` a `PUT /api/users/{id}`. Obsahuje podmnožinu polí User — **neobsahuje** `PasswordHash`, `LastSeenUtc`, `CreatedAtUtc`, `IkarosAvatarUrl`, `RozcestiCharacter`, `IkarosChatColor`, `IkarosSkin`, `MatrixChat*`, `ThemeSettings`, `ChatPreferences`, `FavoriteDiscussionIds`.

---

## 2. Role

Enum `matrixBackend.Models.UserRole`, uložen v DB jako string.

| Hodnota | Číslo | Popis |
|---|---|---|
| `User` | 0 | Základní uživatel bez speciálních práv |
| `Player` | 1 | Hráč — přístup k herním sekcím (kalendář, atd.) |
| `PJ` | 2 | Pán Jeskyně — herní master; může editovat ostatní uživatele přes PATCH |
| `Korektor` | 3 | Korektor textů |
| `SpravceDisukzi` | 4 | Správce diskuzí |
| `SpravceClankuu` | 5 | Správce článků (překlep v názvu zachován z kódu) |
| `SpravceGalerie` | 6 | Správce galerie |
| `Admin` | 98 | Administrátor — může editovat ostatní uživatele přes PATCH |
| `Superadmin` | 99 | Superadministrátor — může měnit role, uživatelská jména, vše |

Poznámka: role `User` a `SpravceDisukzi`–`SpravceGalerie` nejsou uvedeny v `[Authorize(Roles = ...)]` anotacích, takže nemají přístup k endpointům vyžadujícím role PJ/Player/Korektor/Admin/Superadmin.

---

## 3. API endpointy

Základní cesta: `api/users`

| Metoda | URL | Auth | Popis | Vstup | Výstup |
|---|---|---|---|---|---|
| GET | `/api/users/debug` | Anonymní | Debug výpis všech uživatelů včetně citlivých dat | — | `List<User>` |
| GET | `/api/users` | JWT (libovolná role) | Všichni uživatelé (plný objekt) | — | `List<User>` |
| GET | `/api/users/{id}` | JWT, pouze vlastní ID | Plný profil konkrétního uživatele; cizí ID → 403 | — | `User` |
| GET | `/api/users/profile/{id}` | JWT (libovolná role) | Veřejný profil — bezpečná podmnožina polí | — | viz sekce 5 |
| GET | `/api/users/exists/{username}` | Anonymní | Kontrola, zda uživatelské jméno existuje | — | `bool` |
| GET | `/api/users/getCalendarMonth/{id}` | JWT, role: PJ/Player/Korektor/Admin/Superadmin | Vrátí `CalendarMonth` uživatele | — | `string` |
| POST | `/api/users` | Anonymní | Registrace nového uživatele; role se nastaví pevně na `Player` | `UserRegister` (JSON body) | `User` (201 Created) |
| PUT | `/api/users/{id}` | JWT, role: PJ/Player/Korektor/Admin/Superadmin | Plná aktualizace (přepis vybraných polí); heslo `"NaNull"` = beze změny | `UserRegister` (JSON body) | 204 |
| PATCH | `/api/users/{id}` | JWT; vlastní ID nebo PJ/Admin/Superadmin | Částečná aktualizace — jen odeslaná pole; změna `role` pouze Superadmin; změna `username` pouze Superadmin/PJ/Admin | `Dictionary<string, object>` (JSON body) | 204 |
| PUT | `/api/users/{id}/theme` | JWT, pouze vlastní ID | Přepis celého `ThemeSettings` | `Dictionary<string, string>` (JSON body) | 204 |
| PUT | `/api/users/updateCalendarMonth/{id}` | JWT, role: PJ/Player/Korektor/Admin/Superadmin | Aktualizace pole `CalendarMonth` | `string` (JSON body) | 204 |
| DELETE | `/api/users/{id}` | JWT (libovolná role) | Smazání uživatele | — | 204 |

### Poznámky k PATCH

Přijímá `Dictionary<string, object>`. Zpracované klíče:

`username`, `realName`, `city`, `aboutMe`, `rozcestiCharacter`, `profileImageUrl`, `ikarosAvatarUrl`, `ikarosChatColor`, `ikarosSkin`, `matrixChatColor`, `matrixChatFont`, `matrixChatFontSize`, `chatPreferences`, `role`

Ostatní klíče jsou tiše ignorovány. `chatPreferences` se deserializuje jako `ChatPreferences` objekt.

---

## 4. UserService operace

| Metoda | Signatura | Popis |
|---|---|---|
| `Get()` | `List<User> Get()` | Vrátí všechny uživatele; spustí `PopulateProfileImages` |
| `Get(id)` | `User Get(string id)` | Vrátí jednoho uživatele podle MongoDB `_id`; spustí `PopulateProfileImages` |
| `GetByUserName(name)` | `User GetByUserName(string name)` | Regex vyhledávání bez rozlišení velikosti písmen, kotvy `^...$` (přesná shoda) |
| `Create(user)` | `User Create(User user)` | `InsertOne` — vloží nový dokument |
| `Update(updated)` | `void Update(User updated)` | Načte existující dokument, přepíše pole, uloží přes `ReplaceOne`; pole `null` v `updated` ponechají stávající hodnotu (merge logika) |
| `UpdateCalendarMonth(id, month)` | `void UpdateCalendarMonth(string id, string month)` | Atomický `$set` pouze pole `CalendarMonth` |
| `Remove(id)` | `void Remove(string id)` | `DeleteOne` podle `_id` |
| `UpdateLastSeen(id)` | `void UpdateLastSeen(string id)` | Atomický `$set` pole `LastSeenUtc` na `DateTime.UtcNow` |
| `GetOnlineUserIds(hoursThreshold)` | `List<string> GetOnlineUserIds(int hoursThreshold = 25)` | Vrátí ID uživatelů, kteří měli `LastSeenUtc` v posledních N hodinách (výchozí 25h) |
| `GetUserIdsByGroup(groupName)` | `List<string> GetUserIdsByGroup(string groupName)` | Vrátí ID uživatelů, jejichž `Groups` obsahuje daný název skupiny |

### PopulateProfileImages (privátní)

Volá se automaticky uvnitř `Get()` a `Get(id)`. Logika:

1. Sbírá slugy z `CharacterPath` (část za posledním `/`).
2. Pro slugy končící `-denik` nebo `-denik-pj` odvodí základní slug postavy (odstraní suffix).
3. Načte stránky (`Pages` kolekce) pro všechny slugy najednou.
4. Uživatelům bez vlastního `ProfileImageUrl` nastaví `ProfileImageUrl` a `CharacterName` z nalezené stránky (přednost má základní slug před `-denik` variantou).
5. Uživatelům s rolí `PJ` bez `ProfileImageUrl` nastaví obrázek ze stránky se slugem `pan-jeskyne`.

### Merge logika v Update()

Pole přepsána vždy (i null): `Username`, `PasswordHash`, `Role`, `AKJ`, `CharacterPath`, `CalendarMonth`, `Groups`, `RozcestiCharacter`, `ThemeSettings`, `ChatPreferences`

Pole přepsána pouze pokud `updated.X != null`: `FavoritePagesSlugs`, `RealName`, `City`, `AboutMe`, `CreatedAtUtc`, `ProfileImageUrl`, `IkarosAvatarUrl`, `MatrixChatColor`, `MatrixChatFont`, `MatrixChatFontSize`, `IkarosChatColor`, `IkarosSkin`

---

## 5. Veřejný profil vs. plný profil

### Veřejný profil — `GET /api/users/profile/{id}`

Vrací anonymní objekt s těmito poli (dostupný každému přihlášenému uživateli):

| Pole |
|---|
| `Id` |
| `Username` |
| `Role` |
| `ProfileImageUrl` |
| `IkarosAvatarUrl` |
| `RealName` |
| `City` |
| `RozcestiCharacter` |
| `IkarosChatColor` |
| `MatrixChatColor` |
| `MatrixChatFont` |
| `CreatedAtUtc` |
| `LastSeenUtc` |

### Plný profil — `GET /api/users/{id}` nebo `GET /api/users`

Vrací celý objekt `User` — navíc oproti veřejnému profilu obsahuje:

| Pole | Poznámka |
|---|---|
| `PasswordHash` | **Citlivé** — BCrypt hash |
| `AKJ` | |
| `CharacterPath` | |
| `CharacterName` | |
| `CalendarMonth` | |
| `Groups` | |
| `FavoritePagesSlugs` | |
| `FavoriteDiscussionIds` | |
| `IkarosSkin` | |
| `MatrixChatFontSize` | |
| `ThemeSettings` | |
| `ChatPreferences` | |
| `AboutMe` | |

Přístup k plnému profilu: `GET /api/users/{id}` vrátí 403 pokud `currentUserId != id` — uživatel vidí jen svůj vlastní plný profil. `GET /api/users` (seznam všech) nemá tuto ochranu a vrátí plné objekty včetně `PasswordHash` všech uživatelů.
