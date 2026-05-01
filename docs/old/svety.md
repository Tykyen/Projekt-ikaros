# Světy (Worlds) — dokumentace backendu

## 1. Datový model World

Kolekce MongoDB: `WorldsCollectionName`

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string` (ObjectId) | auto | MongoDB primární klíč |
| `Name` | `string` | `""` | Zobrazovaný název světa |
| `Slug` | `string` | `""` | URL-friendly identifikátor (např. `matrix`) |
| `Description` | `string?` | null | Popis světa |
| `ImageUrl` | `string?` | null | URL obrázku světa |
| `Genre` | `string?` | null | Žánr: `"cyberpunk"`, `"fantasy"`, `"postapo"`, `"space-opera"` atd. |
| `Tones` | `List<string>?` | null | Tóny světa (temný, epický, humoristický…) |
| `PlayersWanted` | `string?` | null | Text náboru hráčů (zveřejněný) |
| `PlayerCount` | `int` | `0` | Maximální kapacita hráčů |
| `Dice` | `List<string>?` | null | Typy kostek (d20, d6…) |
| `System` | `string` | `"matrix"` | TTRPG systém (`matrix`, `dnd5e`, `fate`, `vlastni`…) |
| `CustomDiarySchema` | `List<CustomDiaryBlock>?` | null | Schéma deníku pro vlastní systém sestavené PJ; pokud prázdné, doplní se z `SystemPresetsService` |
| `OwnerId` | `string` (ObjectId) | povinné | ID vlastníka (PJ) světa |
| `CreatedAtUtc` | `DateTime` | `UtcNow` | Datum vytvoření |
| `IsActive` | `bool` | `true` | Soft-delete flag — smazaný svět má `false` |
| `AccessMode` | `string` | `"private"` | Mód vstupu: `public` / `open` / `private` / `closed` |
| `OfferedCharacters` | `List<OfferedCharacter>?` | null | Nabízené postavy v otevřeném náboru (`Slug`, `Name`) |
| `CalendarConfig` | `WorldCalendarConfig?` | null | Konfigurace herního kalendáře |

### OfferedCharacter

| Pole | Typ |
|------|-----|
| `Slug` | `string` |
| `Name` | `string` |

### WorldCalendarConfig

| Pole | Typ | Výchozí |
|------|-----|---------|
| `DaysOfWeek` | `List<string>` | `["Pondělí"…"Neděle"]` |
| `Months` | `List<MonthConfig>` | `[]` |
| `CelestialBodies` | `List<CelestialBody>` | `[]` |

**MonthConfig:** `Name` (string), `DaysCount` (int, default 30)

**CelestialBody:** `Name` (string), `OrbitalPeriodDays` (int, default 28), `Color` (string hex, default `#ffffff`)

---

## 2. WorldSettings

Kolekce MongoDB: `WorldSettingsCollectionName` — jeden dokument na svět.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string` (ObjectId) | auto | MongoDB klíč |
| `WorldId` | `string` (ObjectId) | povinné | Odkaz na svět |
| `HiddenNavItems` | `List<string>` | `[]` | Klíče navigačních položek skrytých PJ-em |
| `CustomGroups` | `List<string>` | `[]` | Vlastní názvy skupin hráčů definované PJ-em |
| `GroupColors` | `Dictionary<string,string>` | `{}` | Barvy skupin: klíč = název skupiny, hodnota = hex barva |
| `CustomHeadline` | `List<HeadlineNode>` | `[]` | Vlastní navigační strom PJ-em |
| `Currencies` | `List<WorldCurrencyItem>` | `[]` | Měny světa (seeded při vytvoření dle žánru) |
| `HideDefaultWeather` | `bool` | `false` | Skrýt výchozí real-world generátor počasí |
| `WeatherGenerators` | `List<WorldWeatherGenerator>` | `[]` | Vlastní generátory počasí |
| `UpdatedAtUtc` | `DateTime` | `UtcNow` | Poslední změna |

### HeadlineNode (položka navigačního stromu)

| Pole | Typ | Popis |
|------|-----|-------|
| `id` | `string` | GUID |
| `label` | `string` | Zobrazovaný text |
| `isGroup` | `bool` | Zda jde o skupinu (složku) |
| `to` | `string?` | Route cílová cesta (null pro skupiny) |
| `children` | `List<HeadlineNode>?` | Vnořené položky |

### WorldCurrencyItem

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string` | GUID | Interní ID měny |
| `Code` | `string` | `""` | Kód měny (např. `ZL`, `CR`, `ZAT`) |
| `Name` | `string` | `""` | Název (např. `Zlaťák`, `Kredit`) |
| `Symbol` | `string` | `""` | Symbol (např. `Zl`, `Cr`, `$`) |
| `Rate` | `double` | `1.0` | Kurz vůči základní měně |

**Seed dle žánru při vytvoření světa:**

| Žánr | Měny |
|------|------|
| `cyberpunk`, `sci-fi`, `hard-sci-fi`, `soft-sci-fi`, `biopunk` | Kredit (CR, 1.0), NUSA Dolar (NUSD, 2.5) |
| `space-opera`, `military` | Kredit (CR, 1.0), Krystal (KR, 100.0) |
| `postapo`, `post-postapo`, `dieselpunk` | Zátka (ZAT, 1.0), Příděl (PR, 50.0) |
| `fantasy`, `dark-fantasy`, `heroic-fantasy`, `sword-sorcery`, `grimdark`, `mytologicky` | Zlaťák (ZL, 1.0), Stříbrňák (ST, 0.1), Měďák (MD, 0.01) |
| vše ostatní | Mince (MNC, 1.0) |

### WorldWeatherGenerator

| Pole | Typ | Výchozí |
|------|-----|---------|
| `Id` | `string` | GUID |
| `Name` | `string` | `""` |
| `Description` | `string` | `""` |
| `Regions` | `List<WeatherRegion>` | `[]` |
| `Seasons` | `List<string>` | `["Jaro","Léto","Podzim","Zima"]` |
| `Conditions` | `List<WeatherConditionDef>` | `[]` |
| `Hazards` | `List<WeatherHazardDef>` | `[]` |

**WeatherRegion:** `Name`, `Locations` (List<string>), `TempWarmMax` (30), `TempWarmMin` (18), `TempColdMax` (5), `TempColdMin` (-10), `PrecipChance` (40), `WindBase` (15)

**WeatherConditionDef:** `Name`, `Icon`, `Weight` (default 5)

**WeatherHazardDef:** `Name`, `Description`, `Chance` (default 10 %)

### WorldPage (stránky světa v lore sekci)

Kolekce: `WorldPagesCollectionName`

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | `string?` (ObjectId) | MongoDB klíč |
| `WorldId` | `string` (ObjectId) | Odkaz na svět |
| `Slug` | `string` | URL slug (`pravidla`, `technologie`…) |
| `Title` | `string` | Zobrazovaný název |
| `Content` | `string` | HTML/Markdown obsah, edituje PJ |
| `PlaceholderText` | `string` | Vodící text pro PJ dokud je obsah prázdný |
| `ImageUrl` | `string?` | Hlavičkový obrázek (null = gradient) |
| `Order` | `int` | Pořadí v navigaci |
| `CreatedAtUtc` | `DateTime` | — |
| `UpdatedAtUtc` | `DateTime` | Automaticky aktualizuje `UpdateWorldPage()` |

---

## 3. WorldMembership

Kolekce MongoDB: `WorldMembershipsCollectionName`

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string` (ObjectId) | auto | MongoDB klíč |
| `UserId` | `string` (ObjectId) | povinné | ID uživatele |
| `WorldId` | `string` (ObjectId) | povinné | ID světa |
| `Role` | `WorldRole` | `Hrac` | Role ve světě (viz tabulka níže) |
| `JoinedAtUtc` | `DateTime` | `UtcNow` | Datum vstupu |
| `AvatarUrl` | `string?` | null | Profilový obrázek hráče v tomto světě |
| `CharacterPath` | `string?` | null | Slug/cesta přiřazené postavy (např. `aranil`) |
| `Group` | `string?` | null | Vlastní skupina přiřazená PJ-em (např. `"Elfové"`) |
| `AKJ` | `int` | `0` | Bodové ohodnocení hráče (Aktivity Karty Jízdy) pro tento svět |

### WorldRole enum

| Hodnota | Číslo | Popis |
|---------|-------|-------|
| `Pending` | -1 | Čekatel na schválení žádosti o vstup |
| `Hrac` | 0 | Běžný hráč |
| `Korektor` | 1 | Korektor — může editovat obecné stránky světa, ne postavy hráčů |
| `PomocnyPJ` | 2 | Pomocný PJ — má pravomoci PJ, ale není vlastníkem světa |
| `PJ` | 3 | Pán Jeskyně — plná správa světa |
| `Cekatel` | 4 | Čekatel (starší varianta, viz Pending) |

---

## 4. API endpointy

Základní prefix: `/api/worlds`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/worlds` | Anonymní | Seznam všech aktivních světů (základní pole + MemberCount) |
| `GET` | `/api/worlds/{id}` | Anonymní | Detail světa; pokud `CustomDiarySchema` prázdné, doplní preset dle systému |
| `GET` | `/api/worlds/my` | JWT | Světy přihlášeného uživatele (membership + vlastnictví) |
| `GET` | `/api/worlds/{id}/members` | Anonymní | Memberships světa |
| `POST` | `/api/worlds/{id}/join` | JWT | Žádost o vstup / vstup do světa |
| `POST` | `/api/worlds` | JWT | Vytvoření nového světa |
| `PATCH` | `/api/worlds/{worldId}` | JWT (owner/admin) | Partial update světa (name, description, genre, imageUrl, accessMode, tones, dice, offeredCharacters, customDiarySchema, playerCount, playersWanted, system) |
| `GET` | `/api/worlds/{worldId}/settings` | Anonymní | Nastavení světa |
| `PUT` | `/api/worlds/{worldId}/settings` | JWT (owner/admin) | Upsert nastavení světa (merge dle poslaných polí) |
| `PUT` | `/api/worlds/{worldId}/calendarconfig` | JWT (owner/admin) | Aktualizace konfigurace herního kalendáře |
| `PATCH` | `/api/worlds/{worldId}/members/{membershipId}/group` | JWT (owner/admin) | Změna skupiny člena |
| `PATCH` | `/api/worlds/{worldId}/members/{membershipId}/role` | JWT (owner/admin) | Změna role člena |
| `PATCH` | `/api/worlds/{worldId}/members/{membershipId}/akj` | JWT (owner/admin/PJ/PomocnyPJ) | Změna AKJ hodnoty člena |
| `PATCH` | `/api/worlds/{worldId}/members/{membershipId}/character` | JWT (owner/admin) | Přiřazení postavy členovi |
| `GET` | `/api/worlds/{worldId}/pages` | Anonymní | Všechny stránky světa |
| `GET` | `/api/worlds/{worldId}/pages/{slug}` | Anonymní | Konkrétní stránka dle slugu |
| `POST` | `/api/worlds/{worldId}/pages` | JWT (owner/admin) | Vytvoření nové stránky (slug se generuje ze title) |
| `PUT` | `/api/worlds/{worldId}/pages/{slug}` | JWT (owner/admin/PJ/PomocnyPJ/Korektor/Hrac dle pravidel) | Aktualizace stránky |
| `DELETE` | `/api/worlds/{worldId}/pages/{slug}` | JWT (owner/admin) | Smazání stránky |
| `DELETE` | `/api/worlds/{id}` | JWT (owner/admin) | Soft-delete světa; notifikace všem členům přes IkarosMessage |
| `GET` | `/api/worlds/{worldId}/channels` | JWT | Chat kanály světa viditelné pro přihlášeného uživatele |
| `POST` | `/api/worlds/{worldId}/channels` | JWT (owner/admin) | Vytvoření chat kanálu ve světě |

### Pravidla editace stránek (CanEditWorldPage)

- **Owner / Superadmin / Admin** → vše
- **PJ / PomocnyPJ** → vše
- **Korektor** → obecné a světové stránky (`type != 1`), ne stránky s přiřazeným vlastníkem (UserId requirement)
- **Hrac** → pouze vlastní postavu (`type == 0`), slug musí odpovídat `CharacterPath` (normalizovaný base slug, oříznutý o `-denik`/`-denik-pj` suffix)

---

## 5. WorldService operace

### Základní CRUD světů

| Metoda | Popis |
|--------|-------|
| `GetAll()` | Vrátí všechny světy kde `IsActive == true` |
| `GetOwnedWorlds(userId)` | Aktivní světy vlastněné daným uživatelem |
| `Get(id)` | Jeden svět dle ID (bez filtru na IsActive — vrátí i smazané) |
| `GetBySlug(slug)` | Aktivní svět dle slugu |
| `Create(world)` | Insert do MongoDB |
| `Update(world)` | ReplaceOne dle Id |

### Membership management

| Metoda | Popis |
|--------|-------|
| `GetMemberships(worldId)` | Všichni členové světa |
| `GetUserMemberships(userId)` | Všechna členství uživatele (napříč světy) |
| `GetMembership(userId, worldId)` | Konkrétní membership |
| `CreateMembership(membership)` | Insert nového membership |
| `UpdateMembership(membership)` | ReplaceOne dle membership.Id |
| `GetMemberCount(worldId)` | Count dokumentů v memberships pro daný svět |

### Join logika (POST `/join`)

1. Ověř že svět existuje a `AccessMode != "closed"` (jinak 403).
2. Pokud membership existuje a `Role != Pending` → 409 Conflict.
3. Pokud membership neexistuje: vytvoř s rolí `Hrac` (accessMode == `"public"`) nebo `Pending` (ostatní módy).
4. Pokud `AccessMode != "public"` a svět má OwnerId: pošli `IkarosMessage` PJ-ovi s `ActionType = "world_join_request"` a `ActionResolved = false`.

### Seed při vytvoření světa (POST `/api/worlds`)

Při úspěšném vytvoření světa controller automaticky spustí v tomto pořadí:

1. `CreateMembership` — owner dostane roli `PJ`
2. `PagesService.SeedWorldPages(worldId)` — 5 šablonových stránek (pravidla, technologie, magie, videa, timeline) s prázdným obsahem a placeholderem pro PJ
3. `ChatChannelsService.SeedWorldChannels(worldId)` — výchozí chat kanály
4. `ChatGroupsService.SeedWorldGroups(worldId)` — výchozí chat skupiny
5. `WorldService.UpsertSettings` — uloží `WorldSettings` s měnami dle žánru (viz tabulka v sekci 2)

### Settings upsert

`UpsertSettings(worldId, settings, sentFields)` funguje jako **partial merge**:
- Pokud settings pro svět existují, aktualizuje pouze pole přítomná v `sentFields` (case-insensitive).
- Podporovaná pole pro merge: `hiddenNavItems`, `customGroups`, `groupColors`, `currencies`, `hideDefaultWeather`, `weatherGenerators`.
- Vždy aktualizuje `UpdatedAtUtc`.
- Pokud settings neexistují, vloží nový dokument.

---

## 6. Matrix World

### MatrixConstants.MatrixWorldId

```
"6d6174726978000000000001"
```

Fixní ObjectId konzistentní napříč všemi prostředími (dev, prod). Definováno v `MatrixConstants` jako `const string`.

### SeedMatrixIfNeeded()

Voláno při startu aplikace. Zkontroluje existenci světa se slugem `"matrix"`. Pokud neexistuje:

1. Vytvoří svět s ID `MatrixConstants.MatrixWorldId`, `Name = "Matrix"`, `Slug = "matrix"`, `IsActive = true`.
2. Owner: první uživatel s `UserRole.PJ` v databázi. Pokud neexistuje, `OwnerId = ""`.
3. Přidá membership PJ uživatele s rolí `WorldRole.PJ`.
4. Najde **všechny** uživatele s `UserRole.Korektor` a přidá každému membership s rolí `WorldRole.Korektor` v Matrix světě.

### Speciální chování Matrix světa

- Identifikován fixním ID — ostatní služby mohou toto ID využívat pro specifickou logiku.
- Seed proběhne **pouze jednou** — pokud svět se slugem `matrix` v DB existuje, seed se přeskočí.
- Korektoři na systémové úrovni (`UserRole.Korektor`) jsou automaticky přidáni jako korektoři v Matrix světě při seedu.
- Matrix svět nemá při seedu nastavený žánr — měny ani stránky se při seedu neseedují (seed světa probíhá jen přes controller, ne přes `SeedMatrixIfNeeded`).
