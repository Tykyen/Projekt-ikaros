# Kampaně — dokumentace backendu

## 1. Přehled kampaní

Kampaňový systém slouží PJ (Game Masterovi) a hráčům ke správě herního světa. Každá entita patří konkrétnímu uživateli (`ownerId`) a světu (`worldId`). Systém tvoří šest nezávislých kolekcí propojených referencemi:

| Kolekce | Účel |
|---|---|
| `CampaignSubject` | Postavy, NPC, frakce, organizace — uzly pavučiny |
| `CampaignRelationship` | Vazby mezi dvěma subjekty |
| `CampaignStoryline` | Dějové linky (macro/mid/micro úroveň) |
| `CampaignQuickNote` | Rychlé poznámky / TODO |
| `CampaignScenario` | Scény storyboardu (Tiptap obsah + obrázky) |
| `CampaignShopItem` | Položky obchodu s cenami |

Všechny kolekce jsou uloženy v MongoDB. Každá entita nese `ownerId` (přiřazení uživateli) a `worldId` (přiřazení světu).

---

## 2. Datové modely

### CampaignSubject
Uzel pavučiny — NPC, PC, frakce nebo organizace.

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `WorldId` | `string?` | null | ID světa (null = Matrix world) |
| `OwnerId` | `string?` | null | ID vlastníka |
| `Type` | `string` | `"NPC"` | Typ: `PC`, `NPC`, `FACTION`, `ORG` |
| `Name` | `string` | povinné | Název (required) |
| `AvatarUrl` | `string?` | null | URL obrázku |
| `Tags` | `List<string>` | `[]` | Volné tagy |
| `Status` | `string` | `"active"` | `active`, `archived` |
| `LinkedPageSlug` | `string?` | null | Odkaz na encyklopedii |
| `LinkedDiarySlug` | `string?` | null | Odkaz na deník |
| `Notes` | `string?` | null | Volné poznámky |
| `CreatedAtUtc` | `DateTime` | now | Datum vytvoření |
| `UpdatedAtUtc` | `DateTime` | now | Datum poslední úpravy |

---

### CampaignRelationship
Vazba mezi dvěma subjekty. Obsahuje perspektivu obou stran + sdílenou vrstvu.

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `WorldId` | `string?` | null | ID světa |
| `OwnerId` | `string?` | null | ID vlastníka |
| `SubjectAId` | `string` | povinné | ID subjektu A (required) |
| `SubjectBId` | `string` | povinné | ID subjektu B (required) |
| `Shared.WhatHappened` | `string?` | null | Co se stalo (sdílená vrstva) |
| `Shared.BehindTheScenes` | `string?` | null | Zákulisí (sdílená vrstva) |
| `SideA.Tone` | `string?` | null | Tón vztahu ze strany A |
| `SideA.Behavior` | `string?` | null | Chování A vůči B |
| `SideA.GmIntent` | `string?` | null | Záměr GM pro stranu A |
| `SideB.Tone` | `string?` | null | Tón vztahu ze strany B |
| `SideB.Behavior` | `string?` | null | Chování B vůči A |
| `SideB.GmIntent` | `string?` | null | Záměr GM pro stranu B |
| `Status` | `string` | `"active"` | `active`, `dormant`, `crisis`, `closed` |
| `Priority` | `int` | `3` | Priorita (vyšší = důležitější) |
| `StorylineIds` | `List<string>` | `[]` | Propojené dějové linky |
| `LastChangeNote` | `string?` | null | Poznámka k poslední změně |
| `CreatedAtUtc` | `DateTime` | now | Datum vytvoření |
| `UpdatedAtUtc` | `DateTime` | now | Datum poslední úpravy |

---

### CampaignStoryline
Dějová linka na třech úrovních granularity.

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `WorldId` | `string?` | null | ID světa |
| `OwnerId` | `string?` | null | ID vlastníka |
| `Level` | `string` | `"mid"` | Úroveň: `macro`, `mid`, `micro` |
| `Title` | `string` | povinné | Název (required) |
| `Status` | `string` | `"active"` | `active`, `dormant`, `escalating`, `climax`, `closed` |
| `Phase` | `string?` | null | Aktuální fáze příběhu |
| `Summary` | `string?` | null | Shrnutí |
| `WhatHappened` | `string?` | null | Co se skutečně stalo |
| `Truth` | `string?` | null | Skutečná pravda (GM only) |
| `PlayersBelief` | `string?` | null | Co si myslí hráči |
| `GmIntent` | `string?` | null | Záměr GM |
| `NextStep` | `string?` | null | Příští krok (přítomnost = zobrazení v dashboardu) |
| `SubjectIds` | `List<string>` | `[]` | Zapojené subjekty |
| `RelationshipIds` | `List<string>` | `[]` | Zapojené vztahy |
| `CreatedAtUtc` | `DateTime` | now | Datum vytvoření |
| `UpdatedAtUtc` | `DateTime` | now | Datum poslední úpravy |

---

### CampaignScenario
Scéna storyboardu s Tiptap obsahem a obrázky.

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `WorldId` | `string` | povinné | ID světa (required, nenullable) |
| `OwnerId` | `string?` | null | ID vlastníka |
| `Title` | `string` | povinné | Název scény (required) |
| `Content` | `string` | `""` | HTML/markdown obsah (legacy) |
| `ContentData` | `object?` | null | Tiptap JSON strukturovaný obsah |
| `Order` | `int` | `0` | Pořadí (auto-increment při vytvoření) |
| `LinkedPageSlug` | `string?` | null | Odkaz na encyklopedii |
| `SubjectIds` | `List<string>` | `[]` | Propojené subjekty z pavučiny |
| `StorylineIds` | `List<string>` | `[]` | Propojené dějové linky |
| `Images` | `List<string>` | `[]` | URL obrázků pro storyboard galerii |
| `CreatedAt` | `DateTime` | now | Datum vytvoření |
| `UpdatedAt` | `DateTime` | now | Datum poslední úpravy |

---

### CampaignQuickNote
Rychlá poznámka / TODO s možností připnutí.

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `WorldId` | `string?` | null | ID světa |
| `OwnerId` | `string?` | null | ID vlastníka |
| `Title` | `string` | povinné | Titulek (required) |
| `Body` | `string?` | null | Tělo poznámky |
| `Status` | `string` | `"open"` | `open`, `done` |
| `Pinned` | `bool` | `false` | Připnutí na vrchol |
| `SubjectIds` | `List<string>` | `[]` | Propojené subjekty |
| `StorylineIds` | `List<string>` | `[]` | Propojené dějové linky |
| `CreatedAtUtc` | `DateTime` | now | Datum vytvoření |
| `UpdatedAtUtc` | `DateTime` | now | Datum poslední úpravy |

---

### CampaignShopItem
Položka obchodu s cenou, skupinou a propojenými položkami.

| Pole | Typ | Výchozí | Popis |
|---|---|---|---|
| `Id` | `string` (ObjectId) | — | MongoDB ID |
| `WorldId` | `string?` | null | ID světa |
| `OwnerId` | `string?` | null | ID vlastníka |
| `Name` | `string` | povinné | Název (required) |
| `Description` | `string?` | null | Popis |
| `Group` | `string` | `""` | Skupina (kategorie) |
| `Subgroup` | `string?` | null | Podskupina |
| `Price` | `double` | `0` | Cena |
| `CurrencyCode` | `string` | `""` | Kód měny |
| `LinkedItemIds` | `List<string>` | `[]` | Propojené položky (ObjectId) |
| `ReferenceLink` | `string?` | null | Odkaz na zdroj |
| `IsRecommended` | `bool` | `false` | Doporučená položka |
| `CreatedAtUtc` | `DateTime` | now | Datum vytvoření |
| `UpdatedAtUtc` | `DateTime` | now | Datum poslední úpravy |

---

## 3. API endpointy

Základní cesta: `/api/campaign`. Všechny endpointy vyžadují JWT autentizaci (`[Authorize]`).

| Metoda | Cesta | Query parametry | Popis |
|---|---|---|---|
| GET | `/api/campaign/players` | `worldId?` | Seznam hráčů (PJ only) |
| GET | `/api/campaign/dashboard` | `ownerId?`, `worldId?` | Dashboard agregace |
| GET | `/api/campaign/subjects` | `ownerId?`, `type?`, `status?`, `q?`, `worldId?` | Seznam subjektů |
| GET | `/api/campaign/subjects/{id}` | — | Jeden subjekt |
| POST | `/api/campaign/subjects` | `ownerId?` | Vytvoření subjektu |
| PUT | `/api/campaign/subjects/{id}` | — | Aktualizace subjektu |
| DELETE | `/api/campaign/subjects/{id}` | — | Smazání subjektu (+ kaskáda vztahů) |
| GET | `/api/campaign/relationships` | `ownerId?`, `subjectId?`, `status?`, `storylineId?`, `worldId?` | Seznam vztahů |
| GET | `/api/campaign/relationships/{id}` | — | Jeden vztah |
| POST | `/api/campaign/relationships` | `ownerId?` | Vytvoření vztahu |
| PUT | `/api/campaign/relationships/{id}` | — | Aktualizace vztahu |
| DELETE | `/api/campaign/relationships/{id}` | — | Smazání vztahu |
| GET | `/api/campaign/storylines` | `ownerId?`, `level?`, `status?`, `subjectId?`, `worldId?` | Seznam dějových linek |
| GET | `/api/campaign/storylines/{id}` | — | Jedna dějová linka |
| POST | `/api/campaign/storylines` | `ownerId?` | Vytvoření dějové linky |
| PUT | `/api/campaign/storylines/{id}` | — | Aktualizace dějové linky |
| DELETE | `/api/campaign/storylines/{id}` | — | Smazání dějové linky |
| GET | `/api/campaign/quicknotes` | `ownerId?`, `status?`, `pinned?`, `worldId?` | Seznam poznámek |
| GET | `/api/campaign/quicknotes/{id}` | — | Jedna poznámka |
| POST | `/api/campaign/quicknotes` | `ownerId?` | Vytvoření poznámky |
| PUT | `/api/campaign/quicknotes/{id}` | — | Aktualizace poznámky |
| DELETE | `/api/campaign/quicknotes/{id}` | — | Smazání poznámky |
| GET | `/api/campaign/scenarios` | `ownerId?`, `worldId?` | Seznam scén storyboardu |
| GET | `/api/campaign/scenarios/{id}` | — | Jedna scéna |
| POST | `/api/campaign/scenarios` | `ownerId?` | Vytvoření scény |
| PUT | `/api/campaign/scenarios/{id}` | — | Aktualizace scény |
| DELETE | `/api/campaign/scenarios/{id}` | — | Smazání scény |
| GET | `/api/campaign/shopitems` | `ownerId?`, `group?`, `worldId?` | Seznam položek obchodu |
| GET | `/api/campaign/shopitems/{id}` | — | Jedna položka |
| POST | `/api/campaign/shopitems` | `ownerId?` | Vytvoření položky |
| PUT | `/api/campaign/shopitems/{id}` | — | Aktualizace položky |
| DELETE | `/api/campaign/shopitems/{id}` | — | Smazání položky (+ čištění LinkedItemIds) |

Řazení výsledků:
- Subjects: abecedně podle `Name`
- Relationships: sestupně podle `Priority`, pak `UpdatedAtUtc`
- Storylines: sestupně podle `UpdatedAtUtc`
- QuickNotes: nejdříve připnuté (`Pinned desc`), pak `UpdatedAtUtc desc`
- Scenarios: vzestupně podle `Order`, pak `UpdatedAt desc`
- ShopItems: vzestupně podle `Group`, pak `Name`

---

## 4. CampaignService operace

### Metody přístupu

Každá kolekce má standardní CRUD sadu: `Get[Plural]`, `Get[Singular]`, `Create[Singular]`, `Update[Singular]`, `Delete[Singular]`.

Při `Create*` se nastaví `OwnerId`, `CreatedAtUtc` a `UpdatedAtUtc` serverově — klient je nemůže přepsat.

Při `Update*` se vždy serverově aktualizuje `UpdatedAtUtc`. Controller před voláním Update obnoví `OwnerId` a `CreatedAtUtc` z existujícího záznamu, aby je klient nemohl přepsat.

### Kaskádové mazání

**`DeleteSubject(id)`** — smaže subjekt a pak `DeleteMany` všechny vztahy, kde je tento subjekt na straně A nebo B:
```
SubjectAId == id OR SubjectBId == id
```

**`DeleteShopItem(id)`** — smaže položku a pak `UpdateMany` odstraní dané ID ze `LinkedItemIds` u všech ostatních položek (pull operace).

Ostatní entity (Storyline, QuickNote, Scenario, Relationship) nemají kaskádové mazání — reference na smazané entity zůstávají v polích jako `SubjectIds`, `StorylineIds` apod.

### Dashboard agregace (`GetDashboard`)

Endpoint `GET /api/campaign/dashboard` vrací objekt se čtyřmi sekcemi, vše filtrováno podle `ownerId` a `worldId`:

| Klíč | Zdroj | Filtr | Limit |
|---|---|---|---|
| `CrisisRelationships` | `_relationships` | `status == "crisis"`, řazeno `Priority desc` | 20 |
| `ActiveStorylines` | `_storylines` | `status != "closed"` AND `status != "dormant"` AND `nextStep` není null/prázdný | 20 |
| `PinnedNotes` | `_quickNotes` | `pinned == true` AND `status == "open"` | bez limitu |
| `RecentChanges` | `_subjects`, `_relationships`, `_storylines` | `updatedAtUtc > now - 7 dní` | 10 na kolekci |

---

## 5. Přístupová práva

### Role

- **Player / Korektor** — vidí a upravuje pouze vlastní data (`ownerId == currentUserId`), bez výjimky.
- **PJ / Admin / Superadmin** — může číst a upravovat data libovolného hráče, plus vlastní legacy data.

### Metody v controlleru

**`IsPJ()`** — vrátí `true` pro role `PJ`, `Admin`, `Superadmin`.

**`ResolveOwnerId(requestedOwnerId)`** — přeloží `ownerId` z query parametru na efektivní hodnotu:
- Pokud volající není PJ → vždy vrátí `currentUserId` (ignoruje `requestedOwnerId`).
- Pokud je PJ a `requestedOwnerId` je null/prázdný → vrátí `"PJ_BASE_" + currentUserId`.
- Pokud je PJ a `requestedOwnerId` je zadáno → vrátí `requestedOwnerId` (pohled na hráče).

**`CanModify(entityOwnerId)`** — PJ může vše; hráč jen když `entityOwnerId == currentUserId`.

### PJ_BASE_ token

Speciální prefix `"PJ_BASE_"` říká `StrictOwnerFilter`, že má vrátit dokumenty patřící PJ (`realOwnerId`) **nebo** legacy dokumenty bez `ownerId` (null / pole neexistuje). Slouží pro zobrazení "Moje Pavučina" z pohledu PJ — PJ vidí vlastní záznamy i stará data importovaná bez přiřazeného vlastníka.

Při **vytváření** entit se `PJ_BASE_` prefix stripuje (`Substring(8)`) — uloží se skutečné ID PJ, ne prefixovaný token.

```
PJ volá GET /api/campaign/subjects          → ownerId=null → effectiveOwnerId="PJ_BASE_{pjId}"
  → StrictOwnerFilter vrátí: ownerId==pjId OR ownerId==null OR ownerId neexistuje

PJ volá GET /api/campaign/subjects?ownerId={hracId}  → effectiveOwnerId="{hracId}"
  → StrictOwnerFilter vrátí: ownerId==hracId (přísně)
```

### World scoping

`WorldFilter` zajistí, že každý dotaz vrátí pouze dokumenty patřící do požadovaného světa. Speciální případ: `MatrixWorldId` zahrnuje i dokumenty bez `worldId` (legacy data).
