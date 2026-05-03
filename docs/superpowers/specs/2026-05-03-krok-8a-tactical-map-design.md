# Krok 8a — Taktická mapa: Design spec

**Datum:** 2026-05-03  
**Status:** Schváleno  
**Závisí na:** Krok 7b (NpcTemplates), Krok 7a (Characters + diaryData), Krok 3a (ChatGateway pattern)

---

## Přehled

Taktická hex mapa pro bojové scény. Každý svět má vlastní sadu map (MapScene), PJ je organizuje do složek. Tokeny postav jsou propojeny s jejich deníky — stats se inicializují z `diaryData`, ale combat změny (HP, injury) mění jen token. NPC mají dvouúrovňový bestiář (globální + per-world). Vše se synchronizuje real-time přes MapGateway (Socket.io).

Krok 8b (Dungeon Builder) je samostatný krok.

---

## Datové modely

### MapScene

MongoDB kolekce: `mapScenes`

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `worldId` | `string` | required | Vazba na svět |
| `name` | `string` | `""` | Název scény |
| `imageUrl` | `string` | `""` | URL podkladového obrázku |
| `folder` | `string?` | null | Složka pro organizaci (např. "Příběh", "Budoucí") |
| `config` | `HexConfig` | výchozí | Nastavení hex mřížky |
| `tokens` | `MapToken[]` | `[]` | Tokeny na mapě |
| `npcTemplates` | `MapSceneNpc[]` | `[]` | Lokální NPC šablony pro tuto scénu |
| `effects` | `MapEffect[]` | `[]` | Aktivní efekty |
| `fogEnabled` | `bool` | false | Válka mlhy |
| `revealedHexes` | `HexCoord[]` | `[]` | Odhalené hexy při aktivní mlze |
| `templateId` | `string?` | null | MapTemplate, ze které byla scéna vytvořena |
| `isActive` | `bool` | false | Právě zobrazovaná scéna (max. jedna aktivní per world) |
| `isHidden` | `bool` | false | Skrytá pro hráče |
| `isLocked` | `bool` | false | Hráči nemohou pohybovat tokeny |
| `activeSoundIds` | `string[]` | `[]` | ID aktivních zvuků |
| `lastModified` | `DateTime?` | null | UTC, nastavuje service |

Index: `{ worldId: 1 }`

---

### HexConfig

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| `size` | `number` | 40 | Velikost hexu v px |
| `originX` | `number` | 0 | Posun mřížky X |
| `originY` | `number` | 0 | Posun mřížky Y |
| `showGrid` | `bool` | true | Zobrazit mřížku |

---

### MapToken

Bojový snapshot postavy nebo NPC instance. Stats se inicializují z `Character.diaryData`, ale combat změny (HP, injury) ovlivňují jen token — ne originální postavu.

| Pole | Typ | Popis |
|------|-----|-------|
| `id` | `string` | Unikátní ID v rámci scény |
| `characterId` | `string` | userId pro hráče; vygenerované ID pro NPC |
| `characterSlug` | `string` | Slug postavy (pro link do deníku) |
| `q` | `number` | Hex souřadnice Q (axiální systém) |
| `r` | `number` | Hex souřadnice R (axiální systém) |
| `isNpc` | `bool` | True = NPC token |
| `templateId` | `string?` | Odkaz na `npcTemplates[].id` v této scéně |
| `instanceName` | `string?` | Přepsané jméno NPC instance |
| `currentHp` | `number` | Aktuální životy |
| `maxHp` | `number` | Maximální životy (po modifikátorech) |
| `baseHp` | `number` | Základní životy (bez modifikátorů) |
| `armor` | `number` | Aktuální brnění |
| `baseArmor` | `number` | Základní brnění |
| `injury` | `number` | Aktuální zranění/penalizace |
| `initiative` | `number` | Pořadí v iniciativě |
| `initiativeBase` | `number` | Základní hodnota iniciativy |
| `inCombat` | `bool` | Zda je token v bojovém módu |
| `movement` | `number` | Počet hexů pohybu za kolo (výchozí 5) |
| `abilities` | `{ name, description }[]` | Schopnosti tokenu |
| `personalDiarySchema` | `SchemaBlock[]?` | Schéma osobního deníku tokenu |
| `customData` | `Record<string, unknown>` | Volná data |

**Enrichment při GET `/api/maps/:id`:** backend doplní `characterData` na tokeny kde `characterSlug` existuje v Characters kolekci:

```ts
characterData?: {
  displayName: string
  imageUrl: string
  diaryData: Record<string, unknown>
}
```

---

### MapSceneNpc

Lokální NPC šablona embedovaná přímo ve scéně. PJ ji může upravit nezávisle na globálním bestiáři.

| Pole | Typ | Popis |
|------|-----|-------|
| `id` | `string` | Lokální ID v rámci scény |
| `originTemplateId` | `string?` | Odkaz na zdrojový `NpcTemplate._id` (global/world) |
| `name` | `string` | Jméno NPC |
| `imageUrl` | `string` | URL obrázku |
| `notes` | `string` | Poznámky PJ |
| `maxHp` | `number` | Maximální životy |
| `armor` | `number` | Brnění |
| `injury` | `number` | Zranění |
| `movement` | `number` | Pohyb (výchozí 5) |
| `initiativeBase` | `number` | Základní iniciativa |
| `abilities` | `{ label, value }[]` | Schopnosti (label/value páry) |
| `personalDiarySchema` | `SchemaBlock[]?` | Schéma osobního deníku |
| `customData` | `Record<string, unknown>` | Volná data |

---

### MapEffect

| Pole | Typ | Popis |
|------|-----|-------|
| `id` | `string` | Unikátní ID efektu |
| `type` | `string` | Typ (`fire`, `explosion`, `barrier`, …) |
| `hexes` | `HexCoord[]` | Pokryté hexy |
| `color` | `string?` | Barva efektu |
| `rings` | `{ radius, damage }[]?` | Prstence exploze |
| `variant` | `string?` | Vizuální varianta |
| `excludedHexes` | `HexCoord[]?` | Vyloučené hexy |
| `barrierDC` | `number?` | DC pro průchod bariérou |

---

### HexCoord

```ts
{ q: number, r: number }
```

---

### MapTemplate

Opakovaně použitelná předloha scény. Nemá `worldId`, `isActive`, `isHidden`, `isLocked`.

MongoDB kolekce: `mapTemplates`

| Pole | Typ |
|------|-----|
| `name` | `string` |
| `imageUrl` | `string` |
| `config` | `HexConfig` |
| `npcTemplates` | `MapSceneNpc[]` |
| `tokens` | `MapToken[]` |
| `effects` | `MapEffect[]` |
| `fogEnabled` | `bool` |
| `revealedHexes` | `HexCoord[]` |
| `activeSoundIds` | `string[]` |
| `lastModified` | `DateTime?` |

---

### NpcTemplate — rozšíření Kroku 7b

Přidáme nullable `worldId` pro dvouúrovňový bestiář:

- `worldId = null` → **globální bestiář** (viditelný všem PJ na platformě)
- `worldId = "xxx"` → **world-local bestiář** (jen pro daný svět)

Existující schema v Kroku 7b má `worldId: string` (required). Změníme na optional — migration: stávající záznamy zůstanou beze změny (mají worldId).

---

## REST API

### `/api/maps`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| GET | `/api/maps?worldId=` | anon | Všechny scény světa |
| GET | `/api/maps/active?worldId=` | anon | Aktivní scéna; 404 pokud žádná |
| GET | `/api/maps/:id` | anon | Scéna dle ID + `characterData` enrichment |
| POST | `/api/maps` | PJ+ | Vytvoř scénu; pokud `templateId` → init z šablony |
| POST | `/api/maps/:id/active` | PJ+ | Nastav jako aktivní; deaktivuje ostatní ve světě |
| PUT | `/api/maps/:id` | PJ+ | Full replace scény |
| PATCH | `/api/maps/:id/move-token` | JWT | Pohni tokenem (hráč jen svůj, PJ cokoliv) |
| PATCH | `/api/maps/:id/remove-token` | JWT | Odstraň token (stejná pravidla) |
| DELETE | `/api/maps/:id` | PJ+ | Smaž scénu |

> **PJ+** = `role <= UserRole.PJ` (PJ, Admin, Superadmin)

**Autorizace PATCH move/remove-token:**
- JWT claim `sub` = userId hráče
- `role <= PJ` → může pohybovat/odebírat libovolný token
- Hráč → smí jen token kde `token.characterId === userId`; jinak 403

**Init scény z šablony (POST s `templateId`):**
- Zkopíruje `config`, `npcTemplates`, `tokens`, `effects`, `fogEnabled`, `revealedHexes`, `activeSoundIds` ze šablony
- Nastaví `isActive = false`, `isHidden = false`, `isLocked = false`
- Nastaví `lastModified = now`

---

### `/api/map-templates`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| GET | `/api/map-templates` | anon | Všechny šablony |
| GET | `/api/map-templates/:id` | anon | Šablona dle ID |
| POST | `/api/map-templates` | PJ+ | Vytvoř šablonu |
| PUT | `/api/map-templates/:id` | PJ+ | Nahraď šablonu (upsert) |
| DELETE | `/api/map-templates/:id` | PJ+ | Smaž šablonu |

---

### `/api/npc-templates` — rozšíření Krok 7b

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| GET | `/api/npc-templates?worldId=` | JWT | World-local šablony (existující) |
| GET | `/api/npc-templates/global` | JWT | Globální bestiář (worldId = null) |
| POST | `/api/npc-templates/:id/import` | PJ+ | Zkopíruj globální šablonu do světa; vrátí novou world-local kopii s `originTemplateId` |

---

## MapGateway (Socket.io)

Nová třída `MapsGateway` s vlastním `@WebSocketGateway` dekorátorem na stejném portu jako ChatGateway (NestJS socket.io server je sdílený). Rooms jsou keyed by `sceneId`.

### Eventy

| Client → Server | Server → Client | Broadcast | Popis |
|-----------------|-----------------|-----------|-------|
| `map:join` (`sceneId`) | — | — | Přidá do room |
| `map:leave` (`sceneId`) | — | — | Odebere z room |
| `map:token-moved` (`sceneId, token`) | `map:token-moved` | ostatní | Pohyb tokenu |
| `map:config-updated` (`sceneId, config`) | `map:config-updated` | ostatní | Změna hex mřížky |
| `map:token-removed` (`sceneId, tokenId`) | `map:token-removed` | ostatní | Odebrání tokenu |
| `map:reload-scene` (`sceneId, scene`) | `map:scene-reloaded` | ostatní | Celá scéna po větší změně |
| `map:scene-cleared` (`sceneId`) | `map:scene-cleared` | ostatní | Vymazání scény |
| `map:ping` (`sceneId, x, y, userName`) | `map:pinged` | ostatní | Označení bodu |
| `map:effect-added` (`sceneId, effect`) | `map:effect-added` | ostatní | Přidání efektu |
| `map:effect-removed` (`sceneId, effectId`) | `map:effect-removed` | ostatní | Odebrání efektu |
| `map:fog-updated` (`sceneId, fogEnabled, revealedHexes`) | `map:fog-updated` | ostatní | Stav mlhy |
| `map:dice-rolled` (`sceneId, rollerId, rollerName, faces, total, skillLabel?, skillModifier?, type?, skinMapping?`) | `map:dice-rolled` | **všichni včetně odesílatele** | Hod kostkami |
| `map:scene-state-changed` (`sceneId, isHidden, isLocked`) | `map:scene-state-changed` | ostatní | Stav isHidden/isLocked |
| `map:sound-changed` (`sceneId, soundIds`) | `map:sound-changed` | ostatní | Aktivní zvuky |

**Pravidla:**
- Všechny eventy kromě `map:dice-rolled` → `socket.to(sceneId).emit(...)` (odesílatel nedostane echo)
- `map:dice-rolled` → `this.server.to(sceneId).emit(...)` (všichni včetně odesílatele)
- Gateway nevykonává žádnou business logiku ani DB operace — jen relay
- Persistence vždy přes REST API; gateway pouze synchronizuje klienty

---

## Struktura modulu

```
src/modules/maps/
  schemas/
    map-scene.schema.ts
    map-template.schema.ts
  interfaces/
    map-scene.interface.ts
    map-template.interface.ts
    maps-repository.interface.ts
    map-templates-repository.interface.ts
  repositories/
    maps.repository.ts
    map-templates.repository.ts
  dto/
    create-map.dto.ts
    update-map.dto.ts
    move-token.dto.ts
    remove-token.dto.ts
  maps.service.ts
  maps.controller.ts
  map-templates.controller.ts
  maps.gateway.ts
  maps.module.ts
```

NpcTemplates modul (Krok 7b) dostane rozšíření:
- `worldId` na schema změní z `required` na optional
- Přidat `GET /global` endpoint
- Přidat `POST /:id/import` endpoint

---

## Klíčové invarianty

1. **Max jedna aktivní scéna per world** — `SetActive` atomicky deaktivuje ostatní
2. **Hráč nemůže pohybovat cizím tokenem** — vynuceno v REST i gateway (gateway je relay, validace jen v REST)
3. **Token je bojový snapshot** — combat změny (HP, injury) nikdy nezapíší zpět do Character
4. **MapSceneNpc je lokální kopie** — nezávislá na globálním NpcTemplate; `originTemplateId` je jen informativní
5. **`characterData` enrichment je read-only** — při GET se dopočítá, nikdy se neukládá do MapScene
