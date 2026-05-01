# Postavy, NPC šablony a Vesmír

## 1. Datový model Character

MongoDB kolekce: `CharactersCollectionName` (konfig v `MongoDBSettings`)

| Pole | Typ | Popis |
|------|-----|-------|
| `id` | `string` (ObjectId) | Interní MongoDB identifikátor |
| `WorldId` | `string?` | ID světa; `null` = hlavní Matrix svět |
| `slug` | `string?` | URL identifikátor, generuje se z `name` přes `Page.Slugify()` |
| `name` | `string` | Jméno postavy |
| `bornWhere` | `string` | Místo narození |
| `magicGene` | `string` | Magický gen postavy |
| `abilityPoints` | `int` | Body schopností |
| `fatePoints` | `int` | Body osudu |
| `health` | `int` | Životy |
| `magicHealth` | `int?` | Magické životy (default 0) |
| `armor` | `int?` | Brnění (default 0) |
| `tiredness` | `int` | Únava |
| `overPressure` | `OverPressure` | Přetlak ve 4 dimenzích (viz níže) |
| `languages` | `TagValue[]` | Jazyky (label + value) |
| `aspects` | `TagValue[]` | Aspekty |
| `abilities` | `TagValue[]` | Schopnosti |
| `inventory` | `string` | Inventář (plain text) |
| `contacts` | `Contact[]` | Kontakty (name + description) |
| `accessRequirements` | `List<AccessRequirement>` | Přístupová práva na kartu |
| `lastFatePointModification` | `string?` | Popis poslední změny bodů osudu |
| `PersonalDiarySchema` | `List<CustomDiaryBlock>?` | Schéma osobního deníku; ignorováno pokud null |
| `customData` | `Dictionary<string, object>?` | Libovolná rozšiřující data (string/number/bool) |

### OverPressure

```
physical    int  — fyzický přetlak
magical     int  — magický přetlak
diplomatic  int  — diplomatický přetlak
technical   int  — technický přetlak
```

### TagValue

```
label  string  — zobrazovaný název
value  string  — hodnota/identifikátor
```

### PlayerCharacter (projekce)

Redukovaný objekt vrácený endpointem `/players`: pouze `name` + `slug`.

---

## 2. API endpointy postav

Základní cesta: `/api/characters`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/characters` | ne | Všechny postavy |
| `GET` | `/api/characters/{slug}` | ne | Jedna postava podle slug; 404 pokud neexistuje |
| `GET` | `/api/characters/players` | PJ / Player / Korektor / Admin / Superadmin | Seznam hráčských postav (jen `name` + `slug`) |
| `POST` | `/api/characters` | PJ / Admin / Superadmin | Vytvoří postavu; slug se generuje automaticky z `name` |
| `PUT` | `/api/characters` | PJ / Player / Korektor / Admin / Superadmin | Přepíše celou postavu (podle slug v těle); 404 pokud neexistuje |
| `DELETE` | `/api/characters` | PJ / Admin / Superadmin | Smaže postavu; slug předán jako query param |

### Poznámky

- `POST` a `PUT` volají `NormalizeCustomData()` — hodnoty v `customData` jsou deserializovány z `JsonElement` na nativní C# typy (string, double, bool).
- `GET /players` filtruje postavy podle slug shody s Pages typu 0 (hráčské stránky) hlavního Matrix světa. Povolené slugy jsou: `{slug}`, `{slug}-denik`, `{slug}-denik-pj`.

---

## 3. CharacterService

Soubor: `backend/Services/CharacterService.cs`

Injektuje: `IMongoDatabase`, `IOptions<MongoDBSettings>`  
Používá kolekce: `Characters`, `Pages`

| Metoda | Signatura | Popis |
|--------|-----------|-------|
| `Get()` | `List<Character>` | Vrátí všechny postavy |
| `Get(slug)` | `Character` | Postava podle slug; null pokud nenalezena |
| `GetSlugs(worldId?)` | `string[]` | Slugy všech postav; pokud `worldId` != MatrixWorldId, filtruje podle světa |
| `GetPlayerCharacters()` | `List<PlayerCharacter>` | Hráčské postavy hlavního světa — křížuje Pages (type=0) s Characters |
| `Create(character)` | `Character` | InsertOne do MongoDB |
| `Update(character)` | `void` | ReplaceOne podle slug |
| `Delete(slug)` | `void` | DeleteOne podle slug |

#### GetPlayerCharacters — logika

1. Načte všechny Pages s `type == 0` patřící Matrix světu (WorldId null / neexistuje / MatrixWorldId).
2. Z jejich slugů sestaví set povolených slugů: `{slug}`, `{slug}-denik`, `{slug}-denik-pj`.
3. Načte Characters patřící Matrix světu.
4. Vrátí jen ty, jejichž slug je v povoleném setu.

---

## 4. NPC šablony

### Model NpcTemplate / NpcTemplateDocument

`NpcTemplate` je vstupní DTO. `NpcTemplateDocument` je uložená MongoDB verze s `Id`.

| Pole | Typ | Popis |
|------|-----|-------|
| `Id` | `string?` (ObjectId) | MongoDB identifikátor |
| `Name` | `string` | Název šablony |
| `ImageUrl` | `string` | URL obrázku |
| `Abilities` | `List<MapTagValue>` | Seznam schopností (tag+value) |
| `MaxHp` | `int` | Maximální životy (default 5) |
| `Armor` | `int` | Brnění |
| `Injury` | `int` | Zranění |
| `Notes` | `string` | Poznámky |

NPC šablony jsou znovupoužitelné předlohy pro nepřátelské postavy/NPC v soubojích. Nejde o živé instance — PJ z šablony vytváří konkrétní NPC v herní sesi.

Controller přistupuje přímo na MongoDB (bez service vrstvy).

### API endpointy NPC šablon

Základní cesta: `/api/npctemplates`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/npctemplates` | ne | Všechny šablony |
| `GET` | `/api/npctemplates/{id}` | ne | Jedna šablona podle MongoDB ObjectId; 404 pokud nenalezena |
| `POST` | `/api/npctemplates` | PJ / Admin / Superadmin | Vytvoří šablonu (vstup `NpcTemplate`, uloží `NpcTemplateDocument`) |
| `PUT` | `/api/npctemplates/{id}` | PJ / Admin / Superadmin | Přepíše šablonu; Id se zachová z originálu |
| `DELETE` | `/api/npctemplates/{id}` | PJ / Admin / Superadmin | Smaže šablonu; 404 pokud nenalezena |

---

## 5. Vesmír

### UniverseMap model

```
UniverseMap
  Id        string?          MongoDB ObjectId
  WorldId   string           Vazba na svět (MatrixWorldId nebo jiné)
  Nodes     List<UniverseNode>
  Links     List<UniverseLink>
```

#### UniverseNode

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `id` | `string` | — | Unikátní identifikátor uzlu (slug) |
| `name` | `string` | — | Zobrazované jméno planety/místa |
| `type` | `string?` | `"planet"` | Typ: `planet`, `star`, `nebula`, `asteroid`, `moon` |
| `color` | `string` | `"#ffffff"` | Barva uzlu na mapě (hex) |
| `size` | `double` | `5` | Vizuální velikost uzlu |
| `img` | `string?` | — | Název souboru obrázku |
| `alliance` | `string?` | — | Aliance (Glacijská, Asgardská, Alfská, Vanirská, Trpasličí, Nordská, Svobodná, Lidská…) |
| `x`, `y`, `z` | `double?` | — | Souřadnice pro ruční umístění na mapě |
| `IsPublic` | `bool` | `true` | Viditelný všem hráčům |
| `VisibleToPlayerIds` | `List<string>` | `[]` | IDs hráčů s individuálním přístupem (i když `IsPublic = false`) |

#### UniverseLink

| Pole | Typ | Popis |
|------|-----|-------|
| `source` | `string` | Id zdrojového uzlu |
| `target` | `string` | Id cílového uzlu |
| `isOrbit` | `bool?` | `true` = měsíc obíhá planetu (ne cestovní trasa) |

### Filtrování viditelnosti

Endpoint `GET /api/universe` aplikuje filtr na základě role volajícího:

- **PJ / Admin / Superadmin**: vidí všechny uzly a spoje bez omezení.
- **Hráč / nepřihlášený**: vidí pouze uzly kde `IsPublic == true` NEBO `VisibleToPlayerIds` obsahuje jeho userId. Spoje jsou pak vyfiltrované tak, aby odkazovaly pouze na viditelné uzly (nesmí prozrazovat existenci skrytého uzlu přes hranu).

### API endpointy vesmíru

Základní cesta: `/api/universe`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/universe?worldId={id}` | ne (filtr dle role) | Mapa světa; bez `worldId` vrátí Matrix (`MatrixWorldId`) |
| `PUT` | `/api/universe?worldId={id}` | PJ / Admin / Moderator / Superadmin | Přepíše celou mapu; pokud záznam neexistuje, vytvoří nový |

### Legacy seed data

`UniverseService.GetLegacyMatrixData()` obsahuje hardcodovaná data pro hlavní Matrix svět — 40 uzlů (planety, měsíce) a ~70 spojů. Seed se spustí automaticky pokud v DB není mapa pro MatrixWorldId nebo je prázdná.

Příklady uzlů: Midgard (velikost 8, bílá, Lidská), Asgard (velikost 6, žlutá, Asgardská), Alfheim (fialová, Alfská), Jotunheim (tyrkysová, Glacijská), Svartalfheim (tmavěčervená, Trpasličí).

---

## 6. Vztahy

### Postava ↔ Svět

- `Character.WorldId` určuje ke kterému světu postava patří.
- `null` nebo chybějící `WorldId` = hlavní Matrix svět (`MatrixConstants.MatrixWorldId`).
- `CharacterService.GetSlugs(worldId)` vrátí slugy postav filtrované na konkrétní svět; MatrixWorldId vrátí všechny bez filtru.

### Postava ↔ Stránka (Page)

- Hráčská postava (PlayerCharacter) je identifikována shodou slug s Page typu 0 (hráčská wiki stránka).
- Ke každé postavě slug `{x}` se automaticky sdruží i stránky `{x}-denik` a `{x}-denik-pj` — tj. deník hráče a deník PJ.

### NPC šablona ↔ Postava

- NPC šablony nejsou přímo navázány na `Character` model — jsou to oddělené dokumenty.
- Sdílí typ `MapTagValue` pro schopnosti (stejný typ používá `UniverseController` v NpcTemplatesController).
- Propojení probíhá pouze na úrovni PJ: PJ si ze šablony vytáhne stats a instancuje NPC v herní sesi (mimo tuto API vrstvu).

### Postava ↔ Vesmírná mapa

- `UniverseNode` nemá přímou referenci na Character.
- Vazba je sémantická: `UniverseNode.id` odpovídá slugům světů/lokací, které mohou být referencovány jako `Character.bornWhere` nebo v obsahu wiki stránek.
- Viditelnost uzlů (`VisibleToPlayerIds`) odkazuje na `userId` uživatele, nikoli na `Character.id` — viditelnost je tedy na úrovni účtu, ne postavy.
