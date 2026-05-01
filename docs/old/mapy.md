# Mapy — dokumentace backendu

## 1. Datový model MapScene

MongoDB kolekce: `MapScenesCollectionName` (konfigurováno v `MongoDBSettings`).

### Hlavní pole

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string?` | auto (ObjectId) | Primární klíč |
| `WorldId` | `string?` | null | Vazba na svět; null = globální Matrix svět |
| `Name` | `string` | `""` | Název scény |
| `ImageUrl` | `string` | `""` | URL podkladového obrázku mapy |
| `Config` | `HexConfig` | výchozí instance | Nastavení hexové mřížky |
| `Tokens` | `List<MapToken>` | `[]` | Tokeny postav a NPC na mapě |
| `NpcTemplates` | `List<NpcTemplate>` | `[]` | Šablony NPC dostupné ve scéně |
| `Effects` | `List<MapEffect>` | `[]` | Aktivní efekty na hexech |
| `FogEnabled` | `bool` | `false` | Zda je aktivní válka mlhy |
| `RevealedHexes` | `List<HexCoord>` | `[]` | Odhalené hexy při aktivní mlze |
| `TemplateId` | `string?` | null | Odkaz na `MapTemplate`, ze které byla scéna vytvořena |
| `IsActive` | `bool` | `false` | Právě zobrazovaná scéna (max. jedna aktivní najednou) |
| `IsHidden` | `bool` | `false` | Scéna skrytá pro hráče |
| `IsLocked` | `bool` | `false` | Scéna uzamčená (hráči nemohou pohybovat tokeny) |
| `ActiveSoundIds` | `List<string>` | `[]` | ID zvuků přehrávaných na scéně |
| `LastModified` | `DateTime?` | null | Čas poslední změny (UTC, nastavuje service) |

### HexConfig

Konfigurace hexové mřížky; uložena v poli `config`.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Size` | `int` | `40` | Velikost hexu v pixelech |
| `OriginX` | `int` | `0` | Posun mřížky na ose X |
| `OriginY` | `int` | `0` | Posun mřížky na ose Y |
| `ShowGrid` | `bool` | `true` | Zobrazit mřížku |

### MapToken

Jednotlivý token na mapě (hráčská postava nebo NPC instance).

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string` | `""` | Unikátní ID tokenu v rámci scény |
| `CharacterId` | `string` | `""` | ID postavy / NPC (= `sub` v JWT pro hráče) |
| `CharacterSlug` | `string` | `""` | Slug postavy pro URL |
| `Q` | `int` | `0` | Hexová souřadnice Q (axiální systém) |
| `R` | `int` | `0` | Hexová souřadnice R (axiální systém) |
| `IsNpc` | `bool` | `false` | True = NPC token |
| `TemplateId` | `string?` | null | Odkaz na `NpcTemplate`, ze které byl token vytvořen |
| `InstanceName` | `string?` | null | Přepsatelné jméno instance NPC |
| `CurrentHp` | `int` | `0` | Aktuální životy |
| `MaxHp` | `int` | `0` | Maximální životy (po modifikátorech) |
| `BaseHp` | `int` | `0` | Základní životy (bez modifikátorů) |
| `Armor` | `int` | `0` | Aktuální brnění |
| `BaseArmor` | `int` | `0` | Základní brnění |
| `Injury` | `int` | `0` | Aktuální zranění/penalizace |
| `Initiative` | `int` | `0` | Pořadí v iniciativě |
| `InitiativeBase` | `int` | `0` | Základní hodnota iniciativy |
| `InCombat` | `bool` | `false` | Zda je token v bojovém módu |
| `Movement` | `int` | `5` | Počet hexů pohybu za kolo |
| `Abilities` | `List<MapTokenAbility>` | `[]` | Schopnosti tokenu |
| `PersonalDiarySchema` | `List<CustomDiaryBlock>?` | null | Schéma osobního deníku |
| `CustomData` | `Dictionary<string, object>?` | `{}` | Vlastní data (klíč–hodnota) |

### MapTokenAbility

Schopnost tokenu; uložena v `Tokens[].Abilities`.

| Pole | Typ | Popis |
|------|-----|-------|
| `Name` | `string` | Název schopnosti |
| `Description` | `string` | Popis schopnosti |

### NpcTemplate

Šablona NPC uložená přímo ve scéně (`NpcTemplates[]`). Slouží jako předloha pro instance tokenů.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string` | `""` | ID šablony |
| `Name` | `string` | `""` | Jméno NPC |
| `ImageUrl` | `string` | `""` | URL obrázku |
| `Abilities` | `List<MapTagValue>` | `[]` | Schopnosti jako dvojice label/value |
| `MaxHp` | `int` | `5` | Maximální životy |
| `Armor` | `int` | `0` | Brnění |
| `Injury` | `int` | `0` | Zranění |
| `Movement` | `int` | `5` | Pohyb |
| `InitiativeBase` | `int` | `0` | Základní iniciativa |
| `Notes` | `string` | `""` | Poznámky PJ |
| `PersonalDiarySchema` | `List<CustomDiaryBlock>?` | null | Schéma osobního deníku |
| `CustomData` | `Dictionary<string, object>?` | `{}` | Vlastní data |

### MapTagValue

Pomocný typ pro dvojice label/value (používán v `NpcTemplate.Abilities`).

| Pole | Typ |
|------|-----|
| `Label` | `string` |
| `Value` | `string` |

### MapEffect

Vizuální efekt pokrývající jeden nebo více hexů.

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | `string` | Unikátní ID efektu |
| `Type` | `string` | Typ efektu (např. `"fire"`, `"explosion"`, `"barrier"`) |
| `Hexes` | `List<HexCoord>` | Hexy pokryté efektem |
| `Color` | `string?` | Volitelná barva efektu |
| `Rings` | `List<ExplosionRing>?` | Prstence exploze s poloměrem a poškozením |
| `Variant` | `string?` | Vizuální varianta efektu |
| `ExcludedHexes` | `List<HexCoord>?` | Hexy vyloučené z efektu |
| `BarrierDC` | `int?` | DC pro průchod bariérou |

### HexCoord

Axiální souřadnice hexu.

| Pole | Typ |
|------|-----|
| `Q` | `int` |
| `R` | `int` |

### ExplosionRing

Jeden prstenec exploze; součást `MapEffect.Rings`.

| Pole | Typ | Popis |
|------|-----|-------|
| `Radius` | `int` | Poloměr prstence |
| `Damage` | `int` | Poškození na tomto prstenci |

---

## 2. Datový model MapTemplate

MongoDB kolekce: `MapTemplatesCollectionName`. Šablony jsou opakovaně použitelné předlohy scén — nemají vlastní `WorldId`, `IsActive`, `IsHidden`, `IsLocked`.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `Id` | `string?` | auto (ObjectId) | Primární klíč |
| `Name` | `string` | `""` | Název šablony |
| `ImageUrl` | `string` | `""` | URL podkladového obrázku |
| `Config` | `HexConfig` | výchozí instance | Nastavení hexové mřížky |
| `NpcTemplates` | `List<NpcTemplate>` | `[]` | Šablony NPC |
| `Tokens` | `List<MapToken>` | `[]` | Předpřipravené tokeny |
| `Effects` | `List<MapEffect>` | `[]` | Předpřipravené efekty |
| `FogEnabled` | `bool` | `false` | Válka mlhy |
| `RevealedHexes` | `List<HexCoord>` | `[]` | Odhalené hexy |
| `ActiveSoundIds` | `List<string>` | `[]` | ID zvuků |
| `LastModified` | `DateTime?` | null | Čas poslední změny (UTC, nastavuje controller) |

Šablona sdílí vnořené typy (`HexConfig`, `NpcTemplate`, `MapToken`, `MapEffect`, `HexCoord`) se `MapScene`.

---

## 3. API endpointy map

Základní cesta: `/api/maps`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/maps` | ne | Vrátí všechny scény. Query param `worldId` filtruje podle světa; bez něj (nebo `worldId == MatrixWorldId`) vrátí globální scény. |
| `GET` | `/api/maps/active` | ne | Vrátí aktivní scénu. Query param `worldId` pro filtr světa. 404 pokud žádná není aktivní. |
| `GET` | `/api/maps/{id}` | ne | Vrátí scénu podle ID. 404 pokud neexistuje. |
| `POST` | `/api/maps` | PJ / Admin / Superadmin | Vytvoří novou scénu. Normalizuje `CustomData` v tokenech a NPC. Vrátí 201 s lokací. |
| `POST` | `/api/maps/{id}/active` | PJ / Admin / Superadmin | Nastaví scénu jako aktivní (deaktivuje všechny ostatní). Vrátí 204. |
| `PUT` | `/api/maps/{id}` | PJ / Admin / Superadmin | Kompletně nahradí scénu. Normalizuje `CustomData`. Vrátí 204. |
| `PATCH` | `/api/maps/{id}/move-token` | přihlášený uživatel | Přesune token (aktualizuje `Q`, `R`). Hráč může přesouvat pouze svůj token (`token.CharacterId == userId`). PJ může přesouvat jakýkoli. Vrátí 200 s aktualizovaným tokenem. |
| `PATCH` | `/api/maps/{id}/remove-token` | přihlášený uživatel | Odstraní token ze scény. Stejná autorizační logika jako `move-token`. Body: `{ "tokenId": "..." }`. Vrátí 204. |
| `DELETE` | `/api/maps/{id}` | PJ / Admin / Superadmin | Smaže scénu. Vrátí 204. |

### Poznámky k autorizaci move/remove-token

Identita hráče se zjišťuje z JWT claimu `sub` (fallback: `sub`, `ClaimTypes.NameIdentifier`). PJ status se ověřuje přes `User.IsInRole("PJ")` nebo claim `role == "PJ"`. Pokud hráč nemá právo na token, vrátí se `403 Forbidden`.

---

## 4. API endpointy šablon

Základní cesta: `/api/maptemplates`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/maptemplates` | ne | Vrátí všechny šablony. |
| `GET` | `/api/maptemplates/{id}` | ne | Vrátí šablonu podle ID. 404 pokud neexistuje. |
| `POST` | `/api/maptemplates` | PJ / Admin / Superadmin | Vytvoří šablonu. ID se vynuluje (přidělí MongoDB). Nastaví `LastModified = UtcNow`. Vrátí 201. |
| `PUT` | `/api/maptemplates/{id}` | PJ / Admin / Superadmin | Nahradí šablonu (upsert). Nastaví `LastModified = UtcNow`. Vrátí 204. |
| `DELETE` | `/api/maptemplates/{id}` | PJ / Admin / Superadmin | Smaže šablonu. 404 pokud neexistuje. Vrátí 204. |

`MapTemplatesController` přistupuje k MongoDB přímo (bez dedikované service vrstvy), na rozdíl od `MapsController`.

---

## 5. MapsService operace

Třída: `matrixBackend.Services.MapsService`  
Kolekce: `IMongoCollection<MapScene>`, název z `MongoDBSettings.MapScenesCollectionName`.

| Metoda | Signatura | Co dělá |
|--------|-----------|---------|
| `GetAsync` | `Task<List<MapScene>>` | Vrátí scény, kde `WorldId == null` nebo `WorldId == MatrixConstants.MatrixWorldId` (globální Matrix svět). |
| `GetByWorldAsync` | `Task<List<MapScene>> (string worldId)` | Vrátí scény přesně pro daný `worldId`. |
| `GetActiveAsync` | `Task<MapScene?>` | Vrátí první scénu s `IsActive == true` v globálním světě. |
| `GetActiveForWorldAsync` | `Task<MapScene?> (string worldId)` | Vrátí první aktivní scénu pro konkrétní svět. |
| `GetByIdAsync` | `Task<MapScene?> (string id)` | Najde scénu podle `_id`. |
| `CreateAsync` | `Task (MapScene scene)` | Nastaví `LastModified = UtcNow`, vloží dokument. |
| `SetActiveAsync` | `Task (string id)` | Atomicky (dvě operace): 1) `UpdateMany` — nastaví `IsActive = false` na všech aktivních scénách; 2) `UpdateOne` — nastaví `IsActive = true` na cílové scéně. |
| `UpdateAsync` | `Task (string id, MapScene updatedScene)` | Nastaví `LastModified = UtcNow`, nahradí celý dokument (`ReplaceOne`). |
| `DeleteAsync` | `Task (string id)` | Smaže dokument (`DeleteOne`). |

---

## 6. Real-time integrace — MapHub (SignalR)

Třída: `matrixBackend.Hubs.MapHub`  
Klienti se přidávají do skupin pojmenovaných podle `sceneId`. Všechny zprávy kromě `DiceRolled` jdou na `OthersInGroup` (odesílatel nedostane echo).

### Metody volatelné klientem (server → server broadcast)

| Metoda hub | Parametry | Broadcast event | Popis |
|------------|-----------|-----------------|-------|
| `JoinMap` | `sceneId` | — | Přidá spojení do skupiny scény. |
| `LeaveMap` | `sceneId` | — | Odebere spojení ze skupiny. |
| `TokenMoved` | `sceneId, MapToken token` | `OnTokenMoved(token)` | Rozešle pohyb tokenu ostatním ve scéně. |
| `ConfigUpdated` | `sceneId, HexConfig config` | `OnConfigUpdated(config)` | Rozešle změnu konfigurace mřížky. |
| `TokenRemoved` | `sceneId, string tokenId` | `OnTokenRemoved(tokenId)` | Oznámí odebrání tokenu. |
| `ReloadScene` | `sceneId, MapScene scene` | `OnSceneReloaded(scene)` | Pošle celou scénu ostatním (použití po větší změně). |
| `SceneCleared` | `sceneId` | `OnSceneCleared()` | Oznámí vymazání scény. |
| `PingMap` | `sceneId, double x, double y, string userName` | `OnMapPinged(x, y, userName)` | Zobrazí ping na souřadnicích u ostatních. |
| `EffectAdded` | `sceneId, MapEffect effect` | `OnEffectAdded(effect)` | Oznámí přidání efektu. |
| `EffectRemoved` | `sceneId, string effectId` | `OnEffectRemoved(effectId)` | Oznámí odebrání efektu. |
| `FogUpdated` | `sceneId, bool fogEnabled, List<HexCoord> revealedHexes` | `OnFogUpdated(fogEnabled, revealedHexes)` | Synchronizuje stav mlhy a odhalených hexů. |
| `DiceRolled` | `sceneId, rollerId, rollerName, string[] faces, int total, skillLabel?, skillModifier?, type?, Dictionary<string,string>? skinMapping` | `OnDiceRolled(...)` | Rozešle výsledek hodu kostkami **všem** ve skupině včetně odesílatele (`Clients.Group`). |
| `SceneStateChanged` | `sceneId, bool isHidden, bool isLocked` | `OnSceneStateChanged(isHidden, isLocked)` | Synchronizuje stav `IsHidden` / `IsLocked`. |
| `ActiveSoundChanged` | `sceneId, List<string> soundIds` | `OnActiveSoundChanged(soundIds)` | Synchronizuje seznam aktivních zvuků. |

### Vzorový tok pro pohyb tokenu

1. Klient zavolá `PATCH /api/maps/{id}/move-token` — backend uloží změnu do MongoDB.
2. Klient (nebo backend) zavolá SignalR metodu `TokenMoved(sceneId, token)`.
3. Hub pošle `OnTokenMoved(token)` všem ostatním klientům ve skupině `sceneId`.
4. Klienti aktualizují pozici tokenu v lokálním stavu bez nutnosti dotazu na REST API.

REST API zajišťuje perzistenci; SignalR hub zajišťuje okamžitou synchronizaci mezi klienty.
