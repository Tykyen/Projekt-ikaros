# Taktická mapa — rešerše Matrix implementace + příprava roadmap 10.2

> **Účel dokumentu.** Vstupní podklad pro **roadmap krok 10.2 (Taktická mapa)** v Ikaros FE. Dvě části:
> 1. **Sekce 1–17** = reverse-engineering Matrix implementace (zdrojový vzor herní logiky)
> 2. **Sekce 18** = mapping na podkroky **10.2a–m** + stav Ikaros BE/FE + delty Matrix → Ikaros + open questions pro spec-driven workflow
>
> **Co dokument NEPOKRÝVÁ:** UniverseMap (krok 10.1) a Dungeon Builder (krok 10.3) — samostatné kroky roadmapy. Tento dokument se týká **jen 10.2**.
>
> **Stav k 2026-05-27.** Při dalším čtení zkontroluj BE/FE stav — moduly se mezitím mohly posunout.

---

## 1. Co to je a co to dělá

**Taktická mapa** = realtime kolaborativní hex-grid prostor pro řešení boje (i mimo boj) v rámci jednoho světa. PJ připravuje scénu (obrázek pozadí + hex grid + tokeny + efekty), hráči se na ni díky SignalR připojují a vidí v reálném čase ostatní pohyby, hody kostkou, mlhu války atd.

**Klíčové fakty (high-level):**

- **Hex grid** s axiálními souřadnicemi `(q, r)`, plochou stranou nahoru, velikost a offset konfigurovatelné PJ.
- **Žetony** (`tokens`) jsou postavy hráčů (PC) i NPC; mají HP, zbroj, iniciativu, pohyb, schopnosti, deník.
- **Šablony NPC** (`npcTemplates`) — vzor, ze kterého PJ spawnuje instance na mapě (`tokens` typu NPC).
- **Efekty** (`effects`) — barevná pole, štítové bariéry (s DC), exploze (oheň/plyn/kouř s kruhy zranění).
- **Mlha války** (`fogEnabled` + `revealedHexes`) — PJ odhaluje hexy, hráči vidí jen revealed + vlastní pozici.
- **Iniciativa** — per-token číselný atribut, sortuje top-strip i tabulku iniciativy v toolbaru.
- **Kostky** — kompletní subsystém: per-systémové (Fate / d20 / d100 / pool / mixed), 3D animace přes three.js, skiny, "vězení" pro skiny, log hodů, broadcast hodů přes SignalR.
- **Zvuky** — playlist YouTube videí (PJ vybírá z globální zvukové databáze, přehrává všem v hidden iframe).
- **Knihovna map** — globální MapTemplates kolekce; PJ může uložit aktuální scénu jako šablonu a později ji načíst do jiné scény.
- **3 režimy zobrazení deníku** — overlay (modální), drag (volně tažitelné okno), dock (pravý sidebar).
- **5 herních systémů** — D&D, CoC, GURPS, Fate, DrD2 — každý má vlastní layout deníku, vlastní NPC modal, vlastní stat block. Univerzální `CustomDiaryBuilder` je doplněk.

**Routes integrace:**

- `/svet/:id/takticka-mapa` → `pages/World/WorldMap.tsx` → `<MapPage />` (běžný case, ve světě)
- `/map` + `/map/:sceneId` → `pages/MapPage.tsx` (standalone, mimo svět — fallback)
- `WorldLayout` má special-case branching pro `isMapPage` — žádný padding, hidden overflow (mapa zabírá plný viewport)

---

## 2. Architektura — orientační obrázek

```
┌─────────────────────────────────────────────────────────────────┐
│                       BROWSER (klient)                          │
│                                                                 │
│   ┌─── MapPage.tsx (3460 LOC, monolitický orchestrátor) ────┐   │
│   │                                                         │   │
│   │   ┌── MapToolbar ─────────────────────────────────────┐ │   │
│   │   │ Skupiny ▼  Iniciativa ▼  [token strip]  [CP/+] │ │   │
│   │   └────────────────────────────────────────────────────┘ │   │
│   │                                                         │   │
│   │   ┌── Map viewport (scroll + pan + pinch + zoom) ────┐  │   │
│   │   │                                                  │  │   │
│   │   │   SVG canvas (transform: scale(zoom))            │  │   │
│   │   │   ├─ <image> background                          │  │   │
│   │   │   ├─ <HexGrid>     (pattern fill, memoized)      │  │   │
│   │   │   ├─ <MapEffectOverlay> (color/barrier/explosion)│  │   │
│   │   │   ├─ <MapToken> × N (PC + NPC, HP bar, „i" btn)  │  │   │
│   │   │   ├─ <FogOfWar>   (mask + cloud feTurbulence)    │  │   │
│   │   │   └─ <MapPing> × N (dvouklik ping, 3s fade)      │  │   │
│   │   │                                                  │  │   │
│   │   └──────────────────────────────────────────────────┘  │   │
│   │                                                         │   │
│   │   Overlay vrstvy (mimo SVG):                            │   │
│   │   ├─ EffectsPalette (PJ jen)  ── 🎨 🛡 💣 🌫           │   │
│   │   ├─ Zoom + fullscreen + fog-perf + dice toggle         │   │
│   │   ├─ Playlist player (YouTube hidden iframe)            │   │
│   │   ├─ PJ Settings (sbalitelný panel)                     │   │
│   │   ├─ Diary (overlay / drag / dock režim)                │   │
│   │   │    ├─ <CharacterDiary> (PC)                         │   │
│   │   │    └─ <NpcDiary> (NPC šablona NEBO instance)        │   │
│   │   ├─ Modaly: NPC edit (per system), Map Library,        │   │
│   │   │   Sound Library, Global NPC, Mixed/Pool prompt,     │   │
│   │   │   Diary Builder                                     │   │
│   │   ├─ <DiceOverlay> (3D three.js, lazy 1MB)              │   │
│   │   ├─ <DiceLog>, <FateDicePicker>, <DiceJailTray>        │   │
│   │   └─ Placement banner, hidden/locked overlay            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   useMapDice (hook) ── skiny, vězení, log, broadcast            │
│                                                                 │
└──────────────────┬──────────────────────┬───────────────────────┘
                   │ REST                 │ SignalR
                   │ /api/Maps            │ /api/mapHub
                   │ /api/MapTemplates    │
                   ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (ASP.NET)                        │
│                                                                 │
│   MapsController        MapTemplatesController      MapHub      │
│   ├─ GET /              ├─ GET /                    ├─ JoinMap  │
│   ├─ GET /active        ├─ GET /{id}                ├─ TokenMv  │
│   ├─ GET /{id}          ├─ POST (PJ+)               ├─ EffAdded │
│   ├─ POST (PJ+)         ├─ PUT  (PJ+)               ├─ FogUpd…  │
│   ├─ POST /{id}/active  └─ DELETE (PJ+)             └─ DiceRll  │
│   ├─ PUT  /{id} (PJ+)                                           │
│   ├─ PATCH /{id}/move-token  ← atomic                           │
│   ├─ PATCH /{id}/remove-token ← atomic                          │
│   └─ DELETE /{id} (PJ+)                                         │
│            │                          │                         │
│            ▼                          ▼                         │
│      MapsService          (raw IMongoCollection<MapTemplate>)   │
│            │                                                    │
│            ▼                                                    │
│   MongoDB                                                       │
│   ├─ mapScenes (per-world live scény)                           │
│   └─ mapTemplates (globální knihovna map)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Datový model (backend entity)

Soubor: [Models/MapScene.cs](../../Matrix/backend/Models/MapScene.cs) (v Matrix repu).

### 3.1 `MapScene` — instance scény ve světě

| Pole | Typ | Smysl |
|---|---|---|
| `Id` | ObjectId | Mongo `_id` |
| `WorldId` | string? | Vazba na svět (null = legacy "Matrix" world) |
| `Name` | string | Pojmenování scény (PJ ji vidí v listu) |
| `ImageUrl` | string | FileId obrázku pozadí; resolvuje `resolveImageUrl()` |
| `Config` | `HexConfig` | grid: `size`, `originX`, `originY`, `showGrid` |
| `Tokens` | `List<MapToken>` | PC + NPC žetony na mapě |
| `NpcTemplates` | `List<NpcTemplate>` | Šablony CP dostupné v této scéně |
| `Effects` | `List<MapEffect>` | color / barrier / explosion |
| `FogEnabled` | bool | Mlha války zapnutá? |
| `RevealedHexes` | `List<HexCoord>` | Odhalené hexy (PJ tagy) |
| `TemplateId` | string? | Pokud scéna vzešla z MapTemplate, drží zpětný odkaz |
| `IsActive` | bool | Aktivní scéna ve světě (jen jedna může) |
| `IsHidden` | bool | Hráči vidí černou plachtu „MAPA SKRYTÁ" |
| `IsLocked` | bool | Hráči nemůžou hýbat tokeny (jen overlay banner) |
| `ActiveSoundIds` | `List<string>` | Aktivní zvukový playlist (Sound IDs) |
| `LastModified` | DateTime | UTC, server timestamp |

### 3.2 `HexConfig`

| Pole | Typ | Default | Smysl |
|---|---|---|---|
| `Size` | int | 40 | Délka hrany hexu v px |
| `OriginX` | int | 0 | X offset gridu od levého okraje SVG |
| `OriginY` | int | 0 | Y offset |
| `ShowGrid` | bool | true | Render `<HexGrid>` |

### 3.3 `MapToken` — jednotka na mapě

| Pole | Typ | Smysl |
|---|---|---|
| `Id` | string | `token-{characterId}` pro PC; `npc-{templateId}-{Date.now()}` pro NPC |
| `CharacterId` | string | userId (PC) nebo templateId (NPC) |
| `CharacterSlug` | string | Slug postavy ke spárování s `Character` / `Page` (PC); `"npc"` pro NPC |
| `Q`, `R` | int | Axiální souřadnice hexu |
| `IsNpc` | bool | true → použít NPC logiku zobrazení |
| `TemplateId` | string? | (NPC) zpětný odkaz na `NpcTemplate.Id` |
| `InstanceName` | string? | (NPC) přejmenování individuální instance (např. „Goblin 3") |
| `CurrentHp`, `MaxHp`, `BaseHp` | int | HP — `Base` slouží pro reset z `injury`, `derived = deriveCombatState()` |
| `Armor`, `BaseArmor` | int | Zbroj — stejně jako HP, `Base` pro reset |
| `Injury` | int | Aktuální zranění; přes `deriveCombatState` ovlivňuje currentHp/Armor |
| `Initiative`, `InitiativeBase` | int | Iniciativa pro round order |
| `InCombat` | bool | NPC mimo boj se nezobrazuje v hlavním token-stripu (jen v PJ sekci 🕊) |
| `Movement` | int | Pohybový stat (default 5) |
| `Abilities` | `List<MapTokenAbility>` | `name`/`description` páry (volně rozšiřitelné) |
| `PersonalDiarySchema` | `List<CustomDiaryBlock>?` | Override world.customDiarySchema na úrovni tokenu |
| `CustomData` | `Dictionary<string,object>?` | Per-system pole (`dnd_*`, `coc_*`, …) |

> ⚠️ **Pozor — `CustomData` normalizace.** `MapsController.NormalizeSceneCustomData` v POST/PUT prochází všechny NPC i tokeny a převádí `JsonElement` hodnoty na primitivní typy. Bez toho Mongo zapíše JSON struktury místo skalárů a UI to pak nepřečte.

### 3.4 `NpcTemplate` — vzor NPC

Pole: `Id`, `Name`, `ImageUrl`, `Abilities` (`MapTagValue` list), `MaxHp`, `Armor`, `Injury`, `Movement`, `InitiativeBase`, `Notes`, `PersonalDiarySchema`, `CustomData`.

> 💡 **Proč to existuje paralelně s `MapToken`.** Template = abstraktní popis ("Goblin Strážce"), Token = konkrétní instance na hexu (`Goblin Strážce 3`, currentHp 2). Instance si nese vlastní HP/Armor/Injury, ale když ji nově spawneš z templatu, výchozí hodnoty se z něj zkopírují.

### 3.5 `MapEffect` — efekt na hexech

| Pole | Použito pro typ | Smysl |
|---|---|---|
| `Id`, `Type` (`"color"`/`"barrier"`/`"explosion"`), `Hexes` | všechny | Společné |
| `Color` | color | rgba pro výplň |
| `Rings` (`List<ExplosionRing>` = `Radius`+`Damage`) | explosion | Soustředné kruhy zranění |
| `Variant` (`"fire"`/`"gas"`/`"smoke"`) | explosion | Barevná paleta + CSS animace |
| `ExcludedHexes` | explosion | Hexy odebrané z auto-spočítaného kruhu (PJ je vyklikal) |
| `BarrierDC` | barrier | Číslo zobrazené uprostřed bariéry (obtížnost překonání) |

### 3.6 `MapTemplate` — uložená šablona scény (globální knihovna)

Skoro stejná jako `MapScene`, ale **bez `WorldId`, bez `IsActive/IsHidden/IsLocked`**. Ukládá: `Name`, `ImageUrl`, `Config`, `NpcTemplates`, `Tokens`, `Effects`, `FogEnabled`, `RevealedHexes`, `ActiveSoundIds`, `LastModified`.

> 📚 **Co to je:** Knihovna map = globální, sdílená napříč světy. PJ si může uložit svou pečlivě připravenou scénu jako šablonu, později ji naloadovat do jiného světa. Hráči ji nevidí (jen PJ může číst i zapisovat — `MapLibraryModal` má `if (!isPJ) return null`).

---

## 4. Backend rozhraní

### 4.1 REST endpointy

**`MapsController` — `/api/Maps`** ([Controllers/MapsController.cs](../../Matrix/backend/Controllers/MapsController.cs))

| Method | Path | Role | Co dělá |
|---|---|---|---|
| GET | `/api/Maps?worldId=...` | auth | List všech scén ve světě (nebo Matrix world, když worldId=null) |
| GET | `/api/Maps/active?worldId=...` | auth | Aktivní scéna daného světa (404 pokud žádná) |
| GET | `/api/Maps/{id}` | auth | Detail scény |
| POST | `/api/Maps` | PJ+Admin+Superadmin | Vytvoří novou scénu (normalizuje customData) |
| POST | `/api/Maps/{id}/active` | PJ+ | Označí jako aktivní; **deaktivuje sourozence ve stejném světě** (cross-world nikdy neovlivní) |
| PUT | `/api/Maps/{id}` | PJ+ | **Replace whole scene** (debouncedSave volá tohle) |
| PATCH | `/api/Maps/{id}/move-token` | auth | **Atomic update `tokens.$.q` + `tokens.$.r`**. Hráč může jen vlastní token (`token.characterId === userId`), PJ libovolný. |
| PATCH | `/api/Maps/{id}/remove-token` | auth | **Atomic pull** z `tokens`. Hráč jen vlastní. |
| DELETE | `/api/Maps/{id}` | PJ+ | Smaže scénu |

> ⚠️ **Lost-update race.** `PUT /{id}` replace-uje celý dokument. Pokud dvě klientí změny překryjí (např. PJ přidá efekt, hráč v ten samý moment hne tokenem), debouncedSave 500 ms maskuje hodně případů, ale je to fragile. Proto existují atomic `move-token` a `remove-token` — to je jediná operace, která race řeší **správně**. **Všechno ostatní (effects, fog, npcTemplates, sound, isHidden/isLocked, config, name)** běží přes plný PUT.

**`MapTemplatesController` — `/api/MapTemplates`** ([Controllers/MapTemplatesController.cs](../../Matrix/backend/Controllers/MapTemplatesController.cs))

| Method | Path | Role | Co dělá |
|---|---|---|---|
| GET | `/api/MapTemplates` | auth | List všech globálních šablon |
| GET | `/api/MapTemplates/{id}` | auth | Detail šablony |
| POST | `/api/MapTemplates` | PJ+ | Uloží šablonu (Id se vynuluje a vygeneruje nové) |
| PUT | `/api/MapTemplates/{id}` | PJ+ | Upsert (IsUpsert = true) — aktualizuje existující nebo vytvoří |
| DELETE | `/api/MapTemplates/{id}` | PJ+ | Smaže šablonu |

### 4.2 SignalR — `MapHub` (`/api/mapHub`)

Soubor: [Hubs/MapHub.cs](../../Matrix/backend/Hubs/MapHub.cs). Klienti se autentizují přes `?access_token=` (factory v MapPage čte `localStorage.auth`).

**Klientské metody (volané invoke):**

| Metoda | Args | Server validace | Server broadcast (na `OthersInGroup` nebo `Group`) |
|---|---|---|---|
| `JoinMap` | `sceneId` | — | Přidá connection do groups[sceneId] |
| `LeaveMap` | `sceneId` | — | Odebere |
| `TokenMoved` | `sceneId`, `MapToken` | PJ jakýkoli, hráč jen `token.characterId === userId` | `OnTokenMoved` |
| `TokenRemoved` | `sceneId`, `tokenId` | jen auth | `OnTokenRemoved` |
| `ConfigUpdated` | `sceneId`, `HexConfig` | jen PJ | `OnConfigUpdated` |
| `ReloadScene` | `sceneId`, `MapScene` | jen PJ | `OnSceneReloaded` |
| `SceneCleared` | `sceneId` | jen PJ | `OnSceneCleared` |
| `PingMap` | `sceneId`, `x`, `y`, `userName` | — (kdokoli) | `OnMapPinged` |
| `EffectAdded` | `sceneId`, `MapEffect` | jen PJ | `OnEffectAdded` |
| `EffectRemoved` | `sceneId`, `effectId` | jen PJ | `OnEffectRemoved` |
| `FogUpdated` | `sceneId`, `bool fogEnabled`, `List<HexCoord> revealedHexes` | jen PJ | `OnFogUpdated` |
| `DiceRolled` | `sceneId`, `rollerId`, `rollerName`, `faces[]`, `total`, `skillLabel?`, `skillModifier?`, `type?`, `skinMapping?` | — | `OnDiceRolled` na **`Group`** (i sebe, ale klient sebe v listeneru ignoruje) |
| `SceneStateChanged` | `sceneId`, `isHidden`, `isLocked` | jen PJ | `OnSceneStateChanged` |
| `ActiveSoundChanged` | `sceneId`, `soundIds` | jen PJ | `OnActiveSoundChanged` |

> 💡 **Proč některé eventy posílají `Clients.Group` a jiné `Clients.OthersInGroup`.** OthersInGroup = optimistický UI update lokálně, broadcast jen ostatním (klient už ví, co udělal). DiceRolled jde i sobě, protože server přidá `skinMapping` autora — klient si nemusí synchronizovat svou vlastní mapu skinů a získá konzistentní zpracování.

> ⚠️ **PJ gate je server-side.** Klient může ručně zavolat `connection.invoke("FogUpdated", …)` jako hráč — server tichu odmítne. Útočník nemůže fakeovat autoritativní broadcast.

> 📚 **Co to je „group" v SignalR.** Logické pojmenované sdružení connection IDs. Když klient zavolá `JoinMap(sceneId)`, server ho přidá do `groups[sceneId]`. Broadcast pak chodí jen klientům v této skupině — netřeba ručně iterovat connections.

---

## 5. MapPage.tsx — orchestrátor (3460 LOC)

Hlavní soubor: [pages/MapPage.tsx](../../Matrix/frontend/src/pages/MapPage.tsx). Je to **monolit** — naprostá většina logiky mapy žije tady, komponenty v `components/Map/` jsou prezentační nebo úzce specializované.

### 5.1 Inicializace + detekce systému

```ts
const { sceneId } = useParams();                 // /map/:sceneId nebo /svet/:id/takticka-mapa (sceneId undefined → vezme aktivní)
const worldId = useWorldId();                    // z WorldContext
const isPJ = isPrivilegedRole(auth?.role);

// Po načtení worldu detekuje systém a kostky:
const [isDndWorld, isCocWorld, isGurpsWorld, isFateWorld, isDrd2World] = useState(false);
const [worldDice, setWorldDice] = useState<string[]>(['fate']);
const [customDiarySchema, setCustomDiarySchema] = useState<CustomDiaryBlock[]>([]);
const [worldGroups, setWorldGroups] = useState<string[]>([]);   // customGroups ze worldSettings
```

**Detekce systému:**
```
sys = world.system?.toLowerCase()
isDndWorld = sys.includes('dnd') || dice obsahuje 'k20'/'mixed'/'dnd'/'dnd5e'
isCocWorld = sys === 'coc'
isGurpsWorld = sys === 'gurps'
isFateWorld = ['fate','pribehy_imperia','pribehy','pi'].includes(sys) || dice obsahuje 'fate'/'fudge'
isDrd2World = sys === 'drd2'
```

> 💡 **Proč více příznaků místo jednoho enumu.** Aliasy systémů (`pribehy_imperia`/`pribehy`/`pi` = Fate variace pro „Příběhy Impéria"), edge-case mixed kostky pro DnD apod. Bool flagy umožňují snadné JSX přepínání. V Ikarosu se nabízí přejít na čistý enum.

### 5.2 State map (kategorizovaná)

**Scéna:**
- `scene: MapScene` — autoritativní state
- `sceneRef: MapScene` — vždy nejnovější (latch pro async callbacks, anti-StrictMode-double-run)

**Síť + reference:**
- `hubConnection: HubConnection | null`
- `npcHydrationInFlightRef: Promise | null` — guard aby více NPC dorazivších v jednom tiku spustilo jen jeden refetch templates
- `saveTimerRef` + `debouncedSave(500ms)`

**Viewport:**
- `viewportRef`, `containerRef`, `fileInputRef`
- `dimensions {width,height}` (viewportu)
- `imageDimensions {width,height}` (natural rozměry pozadí)
- `zoom` (persistnutý v `localStorage.ikr-map-zoom`)
- `zoomRef` (live ref pro pointer handlery)
- `isFullscreen`
- `isPanningRef`, `wasDraggingRef`, `panStartRef`, `activePointersRef`, `pinchRef`

**Selekce & interakce:**
- `selectedTokenId` — vybraný token, klik na hex ho přesune
- `placementMode: {type:'PC'|'NPC', id} | null` — režim umisťování (banner + klik = spawn)
- `selectedPlayer / selectedNpcInstanceId / selectedNpcTemplate` — co se zobrazí v deníku
- `diaryMode: 'overlay'|'drag'|'dock'` — kde se diary renderuje (`localStorage.ikr-diary-mode`)

**Efekty (PJ kreslicí nástroje):**
- `activeTool: 'color'|'barrier'|'explosion'|'fog'|null`
- `selectedColor`, `explosionRings: ExplosionRing[]`, `explosionVariant: 'fire'|'gas'|'smoke'`
- `fogBrushSize: 0|1|2`, `fogMode: 'reveal'|'fog'`
- `barrierDC`, `barrierShape: 'brush'|'circle'`, `barrierRadius`, `activeBarrierId`
- `isDrawingEffect`, `lastDrawnHex` (drag-paint state)

**Modaly:**
- `showNpcModal: Partial<NpcTemplate> | null` (přepíná per systém — DnD/CoC/GURPS/Fate/DrD2/generic)
- `showGlobalNpcModal`, `showMapLibraryModal`, `showGlobalEditModal`, `showNpcInstanceModal`
- `showSoundModal`, `showDiaryBuilder`
- `showJailWarning`, `showSkinPicker`, `showMixedPrompt`, `poolPrompt`

**Dice (z `useMapDice`):**
- `skinMapping`, `jailedDice`, `diceResult`, `diceLog`, `diceExpanded`, `mixedDiceCounts`, …

**Vizuální preferences (per device):**
- `fogHighPerf` (`localStorage.ikr-map-fog-perf`, default ON na touch zařízeních)
- `isSettingsCollapsed`
- `soundVolume` (`localStorage.ikr-map-sound-vol`)

**Pings:**
- `activePings: {id, x, y, userName}[]`

**Catalog data:**
- `allUsers`, `allCharacters`, `worldPages`, `teams: Record<string, User[]>`, `sounds`

### 5.3 Lifecycle effects (řazené)

1. **World load** — `getWorld(worldId)` + `getWorldSettings(worldId)` → nastaví systémové flagy, `worldDice`, `customDiarySchema`, `worldGroups`.

2. **Data load** — `getUsers()`, `getCharacters(worldId)`, `getWorldMembers(worldId)`, `getWorldPages(worldId)`, `getSounds()`. Tvoří `modifiedUsers` (User × WorldMember × Character × Page merging na portrét/jméno) a `teams` (skupiny per faction). Reactive na `usersRepairedTickAtom` — když backend opraví portréty, refresh tabulky.

3. **Scene load** — pokud `sceneId` v URL → `getMapScene(id)`. Jinak `getActiveMapScene(worldId)` → pokud existuje a worldId je set, načte přímo; jinak naviguje na `/map/:id`. Po načtení dedup tokenů podle `id`. Restore scroll z `localStorage.ikr-map-scrollX/Y`.

4. **SignalR setup** — `useEffect([scene.id])`:
   - Build connection s `accessTokenFactory` z `localStorage.auth`
   - `withAutomaticReconnect()`
   - `start()` → `invoke("JoinMap", scene.id)`
   - `onreconnected` → re-JoinMap + **catch-up `getMapScene(id)`** (events během disconnectu se nereplayují, takže pull autoritativního state)
   - Listeners pro všechny `On*` eventy (viz tabulka výše) — každý dělá `setScene(prev => …)` patch
   - **`OnTokenMoved` special** — pokud je to PC token, sync `currentHp` → `allCharacters` (deník v reálu); pokud je to NPC s `templateId` který lokálně chybí → trigger `getMapScene(id)` (s in-flight guard)
   - Cleanup: `connection.stop()`

5. **Dimensions** — ResizeObserver na viewport (přes `window.resize` event).

6. **Image dimensions** — když `imageUrl` změní, vytvoří `new Image()` a po `onload` uloží `naturalWidth/Height` → určuje canvas size.

7. **Pointer handlery** — `useEffect([activeTool, placementMode])`:
   - `pointerdown` / `pointermove` / `pointerup` / `pointercancel` na window
   - Sleduje `activePointersRef` Mapu pro pinch detection
   - `e.button === 1` (middle) = vždy pan
   - `e.button === 0` + nemáš tool/placement = pan
   - Dva touch pointery = pinch (start dist, start zoom, center)
   - `wasDraggingRef = true` pokud delta > 3px (chrání hex-click handler)
   - Ctrl+Wheel = zoom toward cursor

8. **Persist debounce** — zoom (250ms), scroll (250ms), všechno přes `localStorage`.

9. **YouTube IFrame API** — load `https://www.youtube.com/iframe_api` skript, create hidden `<div id="ikr-yt-root">` na `document.body` (1×1px, opacity 0.01). `ytPlayerRef` drží instanci přehrávače.

10. **Save flush** — cleanup unmount: pokud `saveTimerRef` čeká, okamžitě flush PUT.

### 5.4 Interakční rovina

**Klik na hex (`handleHexClick(q, r, isDrag)`):**

1. **Active tool režim (PJ)** — color / barrier / explosion / fog. Každý má svou větev:
   - color: vždy single-hex efekt
   - barrier brush: extend existující bariéry nebo create new (`activeBarrierId` určuje extend target); v drag nikdy netoggluje off
   - barrier circle: jediný klik, `getHexesInRadius`, ne na drag
   - explosion: single-hex efekt s `rings` (rendered jako concentric)
   - fog: brush (size 0/1/2) v `reveal` nebo `fog` módu mutuje `revealedHexes`
2. **Placement mode** — PC: spawn token; NPC: spawn z templatu (s `deriveCombatState` pokud ne DnD)
3. **Selected token** — pokud klikneš na prázdný hex se selektovaným tokenem → atomic `moveMapToken(sceneId, {id,q,r})` + SignalR broadcast

**Drag & Drop:** PJ může z `MapToolbar` táhnout postavu na canvas:
```
dataTransfer: { type: 'new', characterId, characterSlug }
onDrop → pokud existující token → moveTokenAtomic, jinak update full scene + broadcast
```

**Double-click anywhere v SVG = ping** — kdokoli (i hráč). Lokálně render `MapPing`, broadcast `PingMap`.

**Klik na token (`handleTokenClick`)** — toggle `selectedTokenId` (umožní pak klik na hex pro pohyb). Hráč může selektovat jen svůj token (`canMoveToken`).

**Klik na „i" badge na tokenu (`handleOpenDiary`)** — otevře CharacterDiary nebo NpcDiary.

### 5.5 SVG vrstvy (z-order)

```
<svg width={mapCanvasWidth * zoom} height={mapCanvasHeight * zoom}>
  <g transform={`scale(${zoom})`}>
    1. <image href={resolvedSceneImage} />            ← pozadí (volitelné)
    2. <HexGrid config={gridConfig} />                ← <pattern> fill
    3. <MapEffectOverlay effects={...} />             ← color → barrier → explosion (v pořadí pole)
    4. {scene.tokens.map(token => <MapToken />)}      ← s fog gate pro hráče
    5. <FogOfWar />                                   ← mask, kreslí PŘES tokeny
    6. {activePings.map(<MapPing />)}                 ← nejvyšší vrstva
  </g>
</svg>
```

> 💡 **Proč FogOfWar nad tokeny.** Mask zakryje i NPC, kteří jsou v nezrevealovaných hexech. Naopak PC tokeny mají `alwaysVisibleHexes` (jejich `q,r`), takže fog se přes ně nikdy nepřetáhne (hráč vidí sám sebe).

> ⚠️ **Canvas dimensions.** `mapCanvasWidth = max(viewportWidth/zoom, imageWidth + 600*2, 2500)`. To `600 * 2` je `MAP_IMAGE_SIDE_SPACE` — okraj kolem image, aby PJ mohl klást tokeny i mimo image. `gridOrigin = {x: config.originX + 600, y: config.originY}` (image se posune o 600px doprava, grid taky).

---

## 6. Map/ komponenty (per soubor)

Cesta: `frontend/src/components/Map/`.

### 6.1 Hex matematika

**`HexUtils.ts`** ([HexUtils.ts](../../Matrix/frontend/src/components/Map/HexUtils.ts))

| Funkce | Účel |
|---|---|
| `axialToPixel(q, r, size)` | Axial → SVG souřadnice (`x = size*(√3*q + √3/2*r)`, `y = size*(3/2)*r`) |
| `pixelToAxial(x, y, size)` | Reverse + `roundToHex` (cube-coord round trick) |
| `getHexCorner(center, size, i)` | Roh hexu i (0–5), úhel `60*i - 30°` (flat-top) |
| `getHexPoints(center, size)` | SVG `points` string pro `<polygon>` |
| `getHexNeighbor(q, r, dir)` | Soused (dir 0–5) — directions: `(1,0)(1,-1)(0,-1)(-1,0)(-1,1)(0,1)` |
| `getHexRing(cq, cr, radius)` | Hexy v jednom prstenci kolem středu |
| `getHexesInRadius(cq, cr, radius)` | Vyplněný disk (všechny prstence 0..radius) |

> 📚 **Co je „axial souřadnice".** Šestiúhelníkový grid má 3 pohledy: cube `(x,y,z)` s constraintem `x+y+z=0`, axial `(q,r)` (drop jedné souřadnice), offset `(col,row)`. Axial je ten nejvíc kompaktní pro uložení do DB i pro vzorce na sousedy. Matrix používá axial všude.

**`HexGrid.tsx`** ([HexGrid.tsx](../../Matrix/frontend/src/components/Map/HexGrid.tsx)) — render SVG `<pattern>` přes celý canvas. Memoized; pattern se přepočítá jen když se změní `config`. Trik: jediný pattern repeating-tiling, ne hex-per-hex.

### 6.2 Žetony

**`MapToken.tsx`** ([MapToken.tsx](../../Matrix/frontend/src/components/Map/MapToken.tsx), 249 LOC, `React.memo`)

- Render: hit-circle (transparent, +8px) → outline-circle (selected) → border-circle → bg-circle → `<image>` s `clipPath`, jinak fallback `<text>` (první písmeno jména)
- **Retry image load** — `MAX_RETRIES=2`, delays `[800, 1500]ms` (transient blip vs trvale chybějící NPC)
- HP bar dole (jen pokud `currentHp` & `maxHp` definované, a buď není NPC nebo je PJ)
- HP barva: PC special (maxHp=5: ≥4 zelená, ≥2 žlutá, jinak červená); NPC (≤0 šedá, ≤1 červená, ≤half žlutá, jinak zelená)
- "i" button vlevo nahoře → `onOpenDiary`
- Selected state: pulzující ring + brightness filter na image

**`MapToolbar.tsx`** ([MapToolbar.tsx](../../Matrix/frontend/src/components/Map/MapToolbar.tsx), 481 LOC, `React.memo`)

- **Skupiny ▼** (PJ only) — dropdown s frakcemi (filtered přes `worldGroups`); klik na avatar → `onCharacterClick` (placement mode PC).
- **Iniciativa ▼** — tabulka tokenů sortovaná desc, `<InitiativeInput>` pro edit (PJ all, hráč jen svůj token). Click row → `onActiveTokenClick`. Double-click → `onCenterOnToken` (smooth scroll do středu viewportu).
- **Token strip** (uprostřed) — `sortedTokens.filter(t => !t.isNpc || t.inCombat)` + non-combat NPCs za `🕊` divider (PJ only).
- **Bestiář strip** (vpravo, PJ only) — Map Library btn, Sound btn, Global NPC btn, compact/expanded toggle, „CP" label, "+" (new NPC), list templates, "✕" smazat all.
- Single-click vs double-click resolve přes 250ms timeout (`clickTimeoutRefs`).

### 6.3 Efekty

**`EffectsPalette.tsx`** ([EffectsPalette.tsx](../../Matrix/frontend/src/components/Map/EffectsPalette.tsx), 387 LOC)

- Tool buttons row: 🎨 Color, 🛡 Barrier, 💣 Explosion, 🌫 Fog. + Clear All (pokud `effectCount > 0`).
- Expanded panel pro aktivní tool:
  - **Color** — 8-barevný swatch grid
  - **Barrier** — brush/circle shape, DC input (0-99), radius slider (1-10) pro circle, "Nová bariéra" button (resetuje `activeBarrierId`)
  - **Explosion** — 3 variants (🔥 oheň, ☠ plyn, 💨 kouř), rings list s damage inputem; max 6 prstenců
  - **Fog** — Mlha aktivní toggle, reveal/fog mode, brush size 0/⬡/⬢, reset button (confirm)

**`MapEffectOverlay.tsx`** ([MapEffectOverlay.tsx](../../Matrix/frontend/src/components/Map/MapEffectOverlay.tsx), 202 LOC, `React.memo`)

Render switch podle `effect.type`:

- **color** — `<polygon>` per hex, fill effect.color, klikatelný (PJ → remove single hex)
- **barrier** — `<polygon>` per hex, žlutý fill + drop-shadow, uprostřed `<text>` s `barrierDC`. PJ klik na hex → remove WHOLE barrier (ne jednotlivý hex).
- **explosion** — for each ring (reverse order, aby vnější byly pod), pro každý hex v prstenci `<polygon>` + na 1. hexu `<text>` s `ring.damage`. CSS animace per variant (`map-effect-fire/gas/smoke--anim` ze `map.scss`); skip animací když `highPerf`.

Palety: `FIRE_COLORS`, `GAS_COLORS`, `SMOKE_COLORS` (6 odstínů s klesající alpha).

### 6.4 Fog of war

**`FogOfWar.tsx`** ([FogOfWar.tsx](../../Matrix/frontend/src/components/Map/FogOfWar.tsx), 160 LOC, `React.memo`)

SVG mask technika:
- `<rect>` 20000×20000 fill="white" + group `<polygon>` per revealed hex fill="black" → mask
- `<filter feGaussianBlur stdDeviation={size*0.18}>` → měkký feather okraj
- `<filter feTurbulence>` + `feBlend` + `feColorMatrix` + `feComponentTransfer` → cloud noise overlay (skip když `highPerf`)
- Dva final `<rect>` se stejným mask: base fog (tmavá pro PJ semi-transparent, světlá pro hráče opaque), cloud overlay
- **`alwaysVisibleHexes` = PC tokeny** — automaticky odkrytý hex pod každým PC tokenem, aby hráč viděl sám sebe i v zamlžené části (Matrix to dělá nečekaně: PC pozice se přidá k `revealedHexes` jen v UI mask, ne v DB).

> ⚠️ **PC always-visible je čistě UI trick.** V `scene.revealedHexes` (DB) jen to, co PJ explicitně reveal-uje. `alwaysVisibleHexes={scene.tokens.filter(!isNpc).map(t => ({q,r}))}` se přidává až v JSX. Pokud bys to dělal v DB, hráči pohybem tokenů „odhalovali" mapu pro ostatní.

> 💡 **`highPerf` mode.** Default ON pro `pointer:coarse` zařízení (mobil/tablet). Skip feTurbulence (drahý SVG filtr) → 2× FPS při pan/zoom. Toggle: ☁ → ⚡ v zoom-controls.

### 6.5 Ping

**`MapPing.tsx`** ([MapPing.tsx](../../Matrix/frontend/src/components/Map/MapPing.tsx), 150 LOC) — koncentrické pulsing circles + crosshair + username pod tím. Po 3 s `onExpire` (callback v MapPage filtruje pole).

### 6.6 Knihovna map + zvuků

**`MapLibraryModal.tsx`** ([MapLibraryModal.tsx](../../Matrix/frontend/src/components/Map/MapLibraryModal.tsx), 177 LOC, PJ only)

- Search input → filter `templates.filter(t => t.name.includes(query))`
- Grid `<MapTemplate>` karet: thumbnail (lazy), name, grid size, NPC count, smazat ✕ button
- `refreshTrigger` prop → re-fetch (refresh po uložení šablony z MapPage)

**`MapSoundLibraryModal.tsx`** ([MapSoundLibraryModal.tsx](../../Matrix/frontend/src/components/Map/MapSoundLibraryModal.tsx), 227 LOC, PJ only)

- Filter type (`mediaType`), filter env (`environment`), search query
- Klik na zvuk → toggle in/out of playlist
- Index badge ukazuje pořadí v playlistu
- Apply button → `onUpdatePlaylist(soundIds)` (parent broadcastne `ActiveSoundChanged`)

Sound entity (z `src/entities`): `id`, `name`, `mediaType`, `environment`, `youtubeUrl`. Přehrávání řídí MapPage:
- YouTube IFrame API se loaduje 1× per stránka
- `ytPlayerRef` drží `YT.Player` v hidden 1×1px divu na `document.body`
- `playlistSounds = scene.activeSoundIds.map(id => sounds.find).filter`
- PJ má play/stop, hráč jen "Aktivovat zvuk" (one-time, browser audio policy gesture)
- Volume slider visible always when playing (`localStorage.ikr-map-sound-vol`)

### 6.7 NPC modaly (per systém)

V `Map/` jsou per-systém edit modaly:

| Systém | Soubor | Specifika |
|---|---|---|
| D&D | `DndNpcEditModal.tsx` | Ability scores, prof bonus, CR, attacks |
| CoC | `CocNpcEditModal.tsx` | Sanity, characteristics, skills % |
| GURPS | `GurpsNpcEditModal.tsx` | DX/IQ/HT/ST, skill levels |
| Fate | `FateNpcEditModal.tsx` | Approaches, stunts, aspects |
| DrD2 | `Drd2NpcEditModal.tsx` | Vlastnosti (Sil/Obr/Odl/Roz/Char), zranění |
| Generic | `NpcEditModal.tsx` | Fallback — Name/Image/MaxHp/Armor/Movement/Abilities |

MapPage renderuje ten správný podle `isDndWorld/isCocWorld/.../else generic`.

Plus:
- `NpcEditInstanceModal.tsx` — edit konkrétní instance žetonu na mapě (instanceName, currentHp, customData override). Vždy jediná.
- `GlobalNpcModal.tsx` — výběr ze **globálního bestiáře** (`/api/NpcTemplates`, samostatná kolekce). PJ vybere → `Date.now()` nové ID → přidá do `scene.npcTemplates`.

### 6.8 NPC stat blocks

V `Map/` jsou per-systém stat blocky pro **read-only zobrazení v NpcDiary**:

- `DndNpcStatBlock.tsx`, `GurpsNpcStatBlock.tsx`, `FateNpcStatBlock.tsx`, `Drd2NpcStatBlock.tsx`
- (CoC nemá samostatný stat block, render uvnitř NpcDiary inline.)
- Plus helpers: `DndNpcHelpers.ts`, `CocNpcHelpers.ts`, `Drd2NpcHelpers.ts`, `drd2Abilities.ts`.

### 6.9 Deník PC / NPC

**`CharacterDiary.tsx`** ([CharacterDiary.tsx](../../Matrix/frontend/src/components/Map/CharacterDiary.tsx), 828 LOC, lazy)

Otevírá se nad mapou ve 3 režimech (`viewMode`):
- **overlay** — modální okno uprostřed (default, povinné na mobilu)
- **drag** — volně tažitelné okno (drag handle, `localStorage.diary-pos-char` pro pozici)
- **dock** — pravý sidebar 450px, mapa se vedle něj zmenší

Hlavní obsah:
- Header s portrétem, name, online status, viewMode picker
- Statistické bloky: `health`, `magicHealth`, `armor`, `tiredness` (přes `NumericInput`)
- **Pak per-systém overlay**: `DndMapDiaryOverlay`, `CocMapDiaryOverlay`, `GurpsMapDiaryOverlay`, `FateMapDiaryOverlay`, `Drd2MapDiaryOverlay`
- Action buttons: Add to map / Remove from map, Roll skill (per-systém dovednosti renderované v overlay)

`onUpdate` v MapPage synchronizuje `health` zpět do `MapToken.currentHp` + broadcast `TokenMoved` (i pro HP change!).

**`NpcDiary.tsx`** ([NpcDiary.tsx](../../Matrix/frontend/src/components/Map/NpcDiary.tsx), 533 LOC, lazy)

- Template nebo Instance? `isInstance = !!instance`
- Instance edit: instanceName quick edit (number suffix split: `"Goblin 3"` → base "Goblin" + num 3)
- D&D vs ostatní: `isDndNpc = customData.dnd_npc_type` → render `DndNpcStatBlock`, jinak `Drd2NpcStatBlock` / `GurpsNpcStatBlock` / `FateNpcStatBlock` nebo inline tag list
- HP/Armor/Injury number inputy (instance), `deriveCombatState` chování pro non-D&D
- Akce: Add to map (template), Remove from map (instance), Edit template, Edit instance, Delete template (+ jeho instance), Save Global (push do globálního bestiáře)
- Roll mechanika: `onRoll(npcName, skillName, skillValue)` → MapPage volá `handleNpcRoll` z `useMapDice`

### 6.10 Per-systém diary overlays

Soubory: `DndMapDiaryOverlay.tsx`, `CocMapDiaryOverlay.tsx`, `GurpsMapDiaryOverlay.tsx`, `FateMapDiaryOverlay.tsx`, `Drd2MapDiaryOverlay.tsx`.

Společný interface:
```ts
interface Props {
  characterData: Character;
  canSeeFullData: boolean;       // PJ nebo own profile
  onCommit: (key: string, value: string) => void;  // patch customData[key]
  onRoll?: (skillName: string, skillValue: string) => void;
}
```

Každý overlay zobrazuje příslušné stat-bloky:
- D&D: STR/DEX/CON/INT/WIS/CHA + modifier, prof bonus, skill list (18 skillů), profMode 0/1/2 (none/proficient/expert), currentHP/tempHP draft state proti race s focus tracking
- CoC: STR/CON/SIZ/DEX/APP/INT/POW/EDU + characteristics, skills jako %
- GURPS: DX/IQ/HT/ST + 4 levely skill ranks
- Fate: 6 approaches (Carefully/Cleverly/Flashily/Forcefully/Quickly/Sneakily) + stunts + aspects
- DrD2: Sil/Obr/Odl/Roz/Char + výška/váha + Zranění + vlastnosti

> 💡 **Co znamená `customData` patching přes `onCommit`.** Per-systém overlay si „přiznává" prefix (např. `dnd_currentHP`, `coc_strength`). `onCommit` se v CharacterDiary mapuje na `updateCharacter` API call, který patchuje `Character.customData[key]`. Stejný mechanismus pro NPC, ale tam patchujeme `MapToken.customData` (per-instance) nebo `NpcTemplate.customData` (per-template).

### 6.11 Custom Diary Builder

**`CustomDiaryBuilder.tsx`** ([CustomDiaryBuilder.tsx](../../Matrix/frontend/src/components/Map/CustomDiaryBuilder.tsx), 135 LOC)

Schema builder pro **univerzální deník** (alternativa k per-systém overlay). Block typy:
- `stat` — jednoduchá hodnota (label + number)
- `bar` — ukazatel (minValue, maxValue, current)
- `list` — list tagů
- `text` — textový blok / poznámky

Bloky mají `id`, `type`, `label`, `order`, `layoutArea: 'main'|'sidebar'`. Schema se ukládá do `world.customDiarySchema` přes `patchWorld(worldId, { customDiarySchema })`. Zobrazuje se v PJ panelu jako tlačítko "Univerzální Stavitel Deníků".

> ⚠️ V Matrixu žije **paralelně** s per-systém deníky. V Ikarosu se má zachovat per-systém deníky jako primární, builder jako doplněk (viz [project_takticka_mapa_multi_system](../memory ...)).

### 6.12 Drobnosti

- **`InitiativeInput.tsx`** ([InitiativeInput.tsx](../../Matrix/frontend/src/components/Map/InitiativeInput.tsx), 68 LOC) — text-based input, regex `^-?\d{1,2}$`, strip leading zeros, allow standalone `-`. Volá `onChange(number)` při validním stavu. Stop propagation na klik/double-click (chrání toolbar handler).
- **`DiceLog.tsx`** ([DiceLog.tsx](../../Matrix/frontend/src/components/Map/DiceLog.tsx), 83 LOC, `React.memo`) — fixed panel s posledními 8 hody (newest first). PJ vidí všechny, hráč jen vlastní. Auto-render Fate symbolů (+/−/0) vs generic faces. `isRecent < 5000ms` → glow třída.
- **`Builder/DungeonBuilder.tsx`** — samostatný feature pro tvorbu podzemí (procedurálních), bod admin `/svet/:id/admin/dungeon-builder`. **NEPATŘÍ k taktické mapě, jen sousedí v adresáři.**

---

## 7. Dice subsystém

### 7.1 `useMapDice` hook

Soubor: [hooks/useMapDice.ts](../../Matrix/frontend/src/hooks/useMapDice.ts) (341 LOC).

> 💡 **Účel.** Centralizovaný state pro vše kolem kostek na mapě. Inline player rolls (v `CharacterDiary.onRoll`) **zůstávají v MapPage**, protože musí mít side-effects na tokeny (např. propagace iniciativy do `MapToken.initiative`); ale state (`diceResult`, `diceLog`, `skinMapping`, `jailedDice`) i tři rollery (NPC / mixed / pool) žijí v hooku.

**Stav:**
- `skinMapping: Record<string, string>` — per die-type („fate", „d6", „d20", „default") → skin ID (např. „core-ivory"). Persist `localStorage.ikr-dice-skins-map` + legacy `ikr-fate-dice-skin`.
- `jailedDice: string[]` — list skin IDs uživatel „uvěznil" (jako vtipný protest proti smůle). Při rollu kontrolujeme přes `isRollJailed`; pokud je skin jailed, **roll se neprovede** a otevře se `FateDicePicker` s warningem.
- `diceResult: DiceResult | null` — poslední hod, který se aktuálně animuje v DiceOverlay
- `diceLog: DiceResult[]` — historie hodů (i ostatních hráčů přes SignalR)
- `diceExpanded: bool` — UI dropdown s die types
- `poolPrompt`, `poolPromptValue` — modal "kolik kostek hodit"
- `showMixedPrompt`, `mixedDiceCounts: Record<dieType, count>` — modal smíšeného hodu

**Funkce:**
- `isRollJailed(rollType)` — split `+`, resolve per part skin, check jail (`skinMappingRef` + `jailedDiceRef` živé refs, callback neměnný)
- `handleToggleJail(dieId)` — toggle + persist
- `broadcastResult(result)` — SignalR `DiceRolled` invoke (vrací včetně `skinMappingRef.current` autora)
- `executeMixedRoll()` — `rollMixedDice(counts)` → result.faceTypes pole („d6", „d20", ...)
- `handleNpcRoll(npcName, skillName, skillValue)` — parser pro 4 formáty skillValue (vis MapPage 5.4 sekce), s special iniciativa branch (skip broadcast jen log)
- `confirmMapPoolRoll()` — pool roll `Nd{sides}` z modal promptu

### 7.2 `DiceLogic.ts`

Soubor: [Dice/DiceLogic.ts](../../Matrix/frontend/src/components/Map/Dice/DiceLogic.ts) (137 LOC).

- `DiceResult` interface: `faces` (string|number[]), `faceTypes?` (pro mixed), `total`, `rollerName`, `rollerId`, `timestamp`, `skillLabel?`, `skillModifier?`, `type?`, `skinMapping?`
- `rollFateDice(): ('+'|'-'|'0')[]` — 4 dice, faces `++--00` random
- `calcTotal(faces)` — sum +1/-1/0
- `fateFaceValue(f)` — normalize symbolic vs numeric vs string-numeric Fate face
- **Target rotations** (3D animace): `D4_TARGETS` (4), `D6_TARGETS` (6), `FATE_TARGETS` (string→rot), `D8_TARGETS` (8), `D10_TARGETS` (10), `D12_TARGETS` (12), `D20_TARGETS` (20) — Euler angles `{rx, ry, rz}` přesné pro každou final tvář

### 7.3 `DiceOverlay.tsx` (3D — lazy, three.js ~1MB chunk)

Soubor: [Dice/DiceOverlay.tsx](../../Matrix/frontend/src/components/Map/Dice/DiceOverlay.tsx) (411 LOC).

- 3 fáze: `tumble` (0.9s) → `settle` (0.5s) → `show` (3.5s) → hidden. Animace per-frame přes `requestAnimationFrame`.
- Modely v `Map/Dice/models/`: `FateSkinModel`, `D4Model`, `D6Model`, `D8Model`, `D10Model`, `D100TensModel`, `D12Model`, `D20Model`.
- **Lazy mount** v MapPage: `hasRolled` latching state — overlay se mountuje až po prvním hodu v session (spectator nikdy nezaplatí 1MB chunk).
- Skins: `fateDiceSkins.ts` definuje balíky (`core-ivory`, ...) + `diceTexturePreloader.ts` preloaduje textury.

### 7.4 `FateDicePicker.tsx`, `DiceJailTray.tsx`

- **`FateDicePicker`** ([Dice/FateDicePicker.tsx](../../Matrix/frontend/src/components/Map/Dice/FateDicePicker.tsx), 270 LOC, lazy) — modální výběr skinu (rastr karet); jail/unjail toggle per skin; jail warning při pokusu hodit „uvězněnou" kostkou.
- **`DiceJailTray`** ([Dice/DiceJailTray.tsx](../../Matrix/frontend/src/components/Map/Dice/DiceJailTray.tsx), 58 LOC, lazy) — vizuálka „vězení" s odsouzenými skiny (vždy mountnutý, ale render jen pokud `jailedDice.length > 0`).

### 7.5 Roll flow (player)

1. PJ připraví scénu, hráč klikne `Iniciativa` nebo nějakou skill v deníku
2. CharacterDiary.onRoll → MapPage inline handler:
   - Parse skillValue (4 formáty: explicit `1d20: 15 + (+2) = 17`, generic `d20+2`, `fate-1`, bare modifier)
   - `isRollJailed` check
   - Roll (`rollFateDice` / `rollGenericDice` / `rollMixedDice`)
   - Vytvoří `DiceResult`, push do `diceLog`, set `diceResult` (trigger DiceOverlay)
   - `broadcastResult` přes SignalR
   - Special: pokud `skillName === 'Iniciativa'` → patch `MapToken.initiative` + broadcast `TokenMoved`
3. Ostatní hráči přijmou `OnDiceRolled` → MapPage listener vytvoří DiceResult, push do logu, set diceResult (s `rollerSkinMapping` → renderují kostku se skinem autora)

---

## 8. Realtime sync — connection lifecycle

```
   MapPage mount + scene.id loaded
            │
            ▼
   new HubConnectionBuilder()
     .withUrl(`${base}/api/mapHub`, {
        accessTokenFactory: read localStorage.auth
     })
     .withAutomaticReconnect()
     .build()
            │
   .start()
            │
   invoke("JoinMap", scene.id)
            │
            ▼
   Connection LIVE — listeners zaregistrovaný
            │
   ─── events tečou oba směry ───
            │
   onreconnected → JoinMap znova + getMapScene(id) catch-up
            │
   ─── cleanup ───
            │
   .stop()
```

> ⚠️ **SignalR neukládá historii eventů.** Když klient ztratí konekci na 30 s, eventy v té době jsou navždy ztracené. Catch-up = re-fetch celé scény z REST po `onreconnected`. Bez toho by lokální state driftoval (např. PJ smaže token, ty nevíš).

> 💡 **Per-token broadcast pattern.** Klient lokálně udělá optimistic update (`setScene + sceneRef`), pak invoke SignalR a paralelně volá REST (atomic patch nebo full PUT s debouncedSave). REST je autoritativní; SignalR je optimization broadcast (mimo PUT, který by trval).

---

## 9. Persistence

### 9.1 Debounced save (500ms)

```ts
const debouncedSave = useCallback((sceneData: MapScene) => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    if (sceneData.id) updateMapScene(sceneData.id, sceneData).catch(console.error);
    saveTimerRef.current = null;
  }, 500);
}, []);
```

Použito pro: **effects (color/barrier/explosion), fog (revealedHexes), initiative change**. NEpoužito pro: scene name (onBlur direct), config (PUT direct), set active (POST direct), token move (atomic PATCH), token remove (full PUT pro UI uspořádání).

Flush on unmount: cleanup hook volá `updateMapScene` synchronně.

### 9.2 Atomic vs full PUT

| Operace | Endpoint | Race-safe? |
|---|---|---|
| Move token | `PATCH /Maps/{id}/move-token` | ✅ atomic `$.q/$.r` update |
| Remove token | `PATCH /Maps/{id}/remove-token` | ✅ atomic `$pull` |
| **Vše ostatní** | `PUT /Maps/{id}` | ⚠️ replace whole document |

Race scénáře (nesprávně řešené v Matrixu):
- PJ kreslí fog + hráč hne tokenem současně — atomic move-token vyhraje, ale fog PUT může později replace-nout scénu **včetně staré pozice tokenu** (pokud klient PJ ještě nedostal `OnTokenMoved`)
- Dva PJové edituji efekty současně — poslední PUT vyhrává

V praxi to v Matrixu zatím nevyhořelo: jen jeden PJ, hráči mají úzký skill (move + remove), a debouncedSave 500ms smysluplně serializuje rychlé sekvence.

### 9.3 localStorage klíče (MapPage + komponenty)

| Klíč | Co drží |
|---|---|
| `ikr-map-zoom` | float 0.2–3.0, debounced 250ms |
| `ikr-map-scrollX` / `ikr-map-scrollY` | float scroll position, debounced 250ms |
| `ikr-map-fog-perf` | `'0'`/`'1'`, default `'1'` na touch zařízeních |
| `ikr-map-sound-vol` | int 0-100 |
| `ikr-diary-mode` | `'overlay'`/`'drag'`/`'dock'` |
| `ikr-bestiary-view` | `'compact'`/`'expanded'` |
| `ikr-dice-skins-map` | JSON Record<dieType,skinId> |
| `ikr-fate-dice-skin` | legacy, fallback pro 'default' v skinMapping |
| `ikr-jailed-dice` | JSON string[] of jailed skin IDs |
| `diary-pos-char` | JSON `{x,y}` pozice draggable CharacterDiary |
| `diary-pos-npc` | JSON `{x,y}` pozice draggable NpcDiary |
| `auth` | JSON s tokenem, čtený přes `accessTokenFactory` |

---

## 10. Permissions matrix

| Akce | PJ / Admin / Superadmin | Hráč |
|---|---|---|
| Vytvořit scénu (POST) | ✅ | ❌ |
| Změnit aktivní scénu | ✅ | ❌ |
| Editovat config (size/origin/image) | ✅ | ❌ |
| Vidět skrytou scénu (isHidden) | ✅ | ❌ overlay „MAPA SKRYTÁ" |
| Hýbat libovolným tokenem | ✅ | ❌ jen svým, a jen pokud `!isLocked` |
| Odebrat token | ✅ libovolný | ✅ jen svůj |
| Spawnovat PC token (placement) | ✅ (drag&drop, klik na avatar v Skupinách) | ❌ |
| Spawnovat NPC token | ✅ | ❌ |
| Editovat efekty (color/barrier/explosion) | ✅ | ❌ |
| Toggle mlhu, reveal/fog hexy | ✅ | ❌ |
| Vidět nezrevealovaný NPC token | ✅ | ❌ (`fogEnabled && !revealed && !isPJ` → null) |
| Měnit `isHidden` / `isLocked` | ✅ | ❌ |
| Měnit playlist zvuků (PJ controls) | ✅ (play/stop) | jen 1× „aktivovat zvuk" gesture |
| Otevřít Map Library | ✅ | ❌ |
| Otevřít Global NPC bestiář | ✅ | ❌ |
| Edit NPC template / instance | ✅ | ❌ |
| Hodit kostkou | ✅ | ✅ |
| Ping (double-click) | ✅ | ✅ |
| Editovat iniciativu | ✅ libovolnou | ✅ jen svou (token.characterId === userId) |
| Vidět cizí hod kostkou (DiceLog) | ✅ | ❌ jen své |

> ⚠️ **Server enforcement.** Všechny PJ-only operace mají double gate: REST `[Authorize(Roles="PJ, Admin, Superadmin")]` + MapHub server-side `IsPJ()` check. **Klient může spoof-nout invoke libovolný event, ale server tichu odmítne broadcast.**

---

## 11. Performance optimalizace (co Matrix dělá a proč)

| Optimalizace | Kde | Proč |
|---|---|---|
| **Lazy three.js** (DiceOverlay) | MapPage `React.lazy` + `hasRolled` gate | three.js ~1MB gzipped; spectator co nikdy nehodí kostkou ho nestáhne |
| **Lazy FateDicePicker, DiceJailTray** | `React.lazy` | Velké modaly, většinu času off-screen |
| **Lazy CharacterDiary, NpcDiary** | `React.lazy` | Otevírá se jen při explicitním kliku |
| **Image preload (concurrency 6)** | `preloadedImagesRef` v MapPage | Bez tohoto: 20 NPC tokenů = 20 paralelních requestů při prvním paintu (saturace mobilní sítě) |
| **`tokenImageUrls: Map`** | useMemo | Stabilní reference; bez ní `React.memo` na MapToken rebypasses každý render |
| **`gridOrigin`, `gridConfig`** | useMemo | Stabilní reference pro MapToken/FogOfWar/MapEffectOverlay (memo bypass guard) |
| **`alwaysVisibleHexes`** | useMemo s deps `[scene.tokens]` | Stejně |
| **`React.memo` na MapToken, MapEffectOverlay, FogOfWar, HexGrid, MapToolbar, DiceLog** | per komponenta | Re-render skip když props stejné |
| **`fogHighPerf` mode** | per-device localStorage | Skip feTurbulence (drahý SVG filtr); auto-on na `pointer:coarse` |
| **`debouncedSave(500ms)`** | MapPage | Batches rapid updateMapScene calls (fog brush paint = 50 events/s without debounce) |
| **scroll/zoom persist debounce (250ms)** | useEffect | Bez něj iOS Safari stall při scroll/pinch |
| **`sceneRef.current`** patterny | refs + useCallback | Závislosti nemusí re-binding; latest state vždy dostupný v async callbacks (StrictMode-safe) |
| **`npcHydrationInFlightRef`** | guard | Při flood `OnTokenMoved` NPC tokenů v jednom tiku jen jeden refetch templates |
| **Atomic `move-token`/`remove-token`** | REST PATCH | Konkurence-safe (`tokens.$.q` Mongo positional) |
| **Catch-up po onreconnected** | useEffect | Po výpadku resync REST místo replay |
| **CSS `touch-action: none`** na SVG | inline style | Disable browser pinch/zoom (custom handler) |

---

## 12. Souborová mapa (kde co žije v Matrixu)

**Backend (`backend/`)**
```
Models/
├─ MapScene.cs          ← MapScene + HexConfig + MapToken + MapEffect + NpcTemplate + …
├─ MapTemplate.cs       ← šablona scény pro knihovnu
└─ UniverseMap.cs       ← (mimo scope) hvězdná mapa

Controllers/
├─ MapsController.cs              ← /api/Maps (CRUD scén)
└─ MapTemplatesController.cs      ← /api/MapTemplates (knihovna)

Services/
└─ MapsService.cs       ← Mongo wrap, atomic move/remove

Hubs/
└─ MapHub.cs            ← SignalR realtime
```

**Frontend (`frontend/src/`)**
```
pages/
├─ MapPage.tsx                              ← MONOLIT 3460 LOC
└─ World/
   └─ WorldMap.tsx                          ← thin wrapper, jen renderuje MapPage

components/
└─ Map/
   ├─ HexGrid.tsx, HexUtils.ts              ← grid math
   ├─ MapToken.tsx                          ← žeton SVG render
   ├─ MapToolbar.tsx                        ← horní lišta
   ├─ EffectsPalette.tsx                    ← PJ tools panel
   ├─ MapEffectOverlay.tsx                  ← efekty render
   ├─ FogOfWar.tsx                          ← mlha SVG mask
   ├─ MapPing.tsx                           ← ping animace
   ├─ MapLibraryModal.tsx                   ← knihovna map (PJ)
   ├─ MapSoundLibraryModal.tsx              ← playlist editor (PJ)
   ├─ NpcEditModal.tsx                      ← generic NPC edit
   ├─ NpcEditInstanceModal.tsx              ← per-instance edit
   ├─ GlobalNpcModal.tsx                    ← globální bestiář (PJ)
   ├─ DndNpcEditModal.tsx, CocNpcEditModal.tsx, GurpsNpcEditModal.tsx,
   │  FateNpcEditModal.tsx, Drd2NpcEditModal.tsx           ← per-system edit
   ├─ DndNpcStatBlock.tsx, GurpsNpcStatBlock.tsx, FateNpcStatBlock.tsx,
   │  Drd2NpcStatBlock.tsx                                 ← per-system render
   ├─ DndNpcHelpers.ts, CocNpcHelpers.ts, Drd2NpcHelpers.ts,
   │  drd2Abilities.ts                                     ← per-system utils
   ├─ CharacterDiary.tsx, NpcDiary.tsx       ← deníky (lazy)
   ├─ CustomDiaryBuilder.tsx                 ← univerzální diary schema builder
   ├─ DndMapDiaryOverlay.tsx, CocMapDiaryOverlay.tsx,
   │  GurpsMapDiaryOverlay.tsx, FateMapDiaryOverlay.tsx,
   │  Drd2MapDiaryOverlay.tsx                              ← per-system diary content
   ├─ InitiativeInput.tsx                    ← numerický text input s validací
   ├─ DiceLog.tsx                            ← spodní log hodů
   ├─ Builder/
   │  └─ DungeonBuilder.tsx                  ← NE pro taktic.mapu, samostatná feature
   ├─ Dice/
   │  ├─ DiceLogic.ts                        ← logika + 3D rotation targets
   │  ├─ DiceOverlay.tsx                     ← 3D animace (lazy)
   │  ├─ FateDicePicker.tsx                  ← skin picker modal (lazy)
   │  ├─ DiceJailTray.tsx                    ← vězení skinů (lazy)
   │  ├─ diceTexturePreloader.ts             ← preload textur
   │  ├─ fateDiceSkins.ts                    ← skin definice
   │  └─ models/
   │     ├─ FateSkinModel.tsx, D4Model.tsx, D6Model.tsx,
   │     ├─ D8Model.tsx, D10Model.tsx, D100TensModel.tsx,
   │     ├─ D12Model.tsx, D20Model.tsx
   └─ DiceTray/                               ← (empty placeholder)

hooks/
└─ useMapDice.ts                              ← centralizovaný dice state

styles/
├─ map.scss                                   ← 2525 LOC; všechny .map-* třídy + animace
└─ MapDndOverlay.scss                         ← styles per-system overlay

utils/
├─ combatUtils.ts → deriveCombatState         ← HP/Armor derived ze Injury
├─ diceHelpers.ts → rollGenericDice, rollMixedDice
└─ resolveImageUrl.ts                         ← fileId/URL → final src

routes.ts
   └─ /svet/:id/takticka-mapa → World/WorldMap → MapPage
   └─ /map(/:sceneId) → MapPage (standalone)
```

---

## 13. Multi-system architektura (potvrzená pro Ikaros)

Z konverzace 2026-05-27 (zachyceno v memory [project_takticka_mapa_multi_system](../.claude/...)): Ikaros si **zachová** per-systémový model:

- `world.system` (např. `dnd`, `coc`, `gurps`, `fate`, `drd2`) → MapPage switch
- Per systém: vlastní layout deníku, vlastní NPC modal, vlastní stat block, vlastní default die type
- Změna `world.system` PJem → **okamžitý přepnutí všem hráčům ve světě** (přes realtime nebo refresh)
- `world.dice` array → MapPage dice tray filter
- `world.customDiarySchema` (CustomDiaryBuilder) zůstává jako **doplněk** nad systémem, ne jako náhrada

V Matrixu jsou jen 5 systémů hardcoded; pokud Ikaros přidá víc, je třeba:
1. Nový `Xxx_NpcEditModal.tsx`
2. Nový `XxxNpcStatBlock.tsx`
3. Nový `XxxMapDiaryOverlay.tsx`
4. Nový MapPage flag `isXxxWorld` + detekce v useEffect
5. Modal switch v `{showNpcModal && ...}` block
6. Nový roll logic branch v `useMapDice` (pokud má jiný die-type než worldDice obsáhne)

**Doporučení pro Ikaros:** Místo bool flagů → enum `world.system: SystemId`, modaly/overlays/statblocks jako mapa `Record<SystemId, ComponentType>`. Volání pak `<SystemModal[world.system] {...} />`.

---

## 14. Otevřené body / rozhodnutí pro Ikaros re-implementaci

### 14.1 Co určitě přebrat

- **Hex grid systém + axiální souřadnice + utily** (`HexUtils.ts` je čistá math, kopírovatelná 1:1)
- **SVG layered rendering** (image → grid → effects → tokens → fog → pings)
- **Atomic move-token / remove-token PATCH endpointy** (jediná správně-implementovaná race-safe operace)
- **SignalR group-per-scene model** (JoinMap/LeaveMap, OthersInGroup vs Group)
- **PJ catch-up po onreconnected** (re-fetch full state přes REST)
- **`alwaysVisibleHexes` pattern pro PC tokeny** (UI-only auto-reveal, ne DB)
- **`fogHighPerf` toggle** (zachovat — pomoc slabším strojům výrazná)
- **Lazy DiceOverlay s latching gate** (`hasRolled` — spectator nedostane 1MB chunk)
- **Image preloader s concurrency 6** (mobile performance)
- **Per-system architektura** (potvrzená výše)
- **3 režimy deníku** (overlay/drag/dock) — UX win
- **Initiative propagation z deníku do MapToken** (skill „Iniciativa" → automaticky patch)

### 14.2 Co předělat

- **Monolit MapPage.tsx 3460 LOC** → rozsekat. Návrhy:
  - `MapPageDataProvider` (load world/scene/users/chars/sounds) — context
  - `MapPageRealtimeProvider` (SignalR setup, listeners) — context
  - `MapCanvas` komponenta (SVG + interakce hex click/drag/pan/pinch/wheel)
  - `MapDiaryOrchestrator` komponenta (selected* state + per-system modal switch)
  - `MapPjPanel` komponenta (PJ Settings, isHidden/isLocked, name, config, repair tools)
- **Full PUT pro efekty/fog/templates/sound** → **atomic patche** pro všechno. Nový `PATCH /Maps/{id}/effects`, `/fog`, `/template-add`, atd. Race-resistance.
- **Repair portrétů utility** — Matrix-specific data fix; Ikaros má cleaner User↔Character model, není potřeba.
- **`customData.dnd_npc_type` flag** → enum `npc.systemKind` v top-level field (čistší).
- **localStorage klíče prefix** `ikr-map-*` → konzistentní `ikaros.map.*` namespace.
- **`extractSlugFromPath` parsing** — Matrix má hacky character-path resolution; Ikaros má sjednocené Page+Character (viz `project_pages_character_unification`), takže slug lookup může být přímý.
- **YouTube IFrame API hardcoded** → audio abstrakce (YouTube + lokální MP3 + soundcloud → driver pattern).
- **Bool flagy `isDndWorld/isCocWorld/.../isXxxWorld`** → jeden enum + Record-based component selector.

### 14.3 Otevřené otázky pro tým

1. **Per-world MapTemplates knihovna vs globální?** Matrix má globální, ale Ikaros má per-world izolaci (worldId). Sdílet šablony napříč světy ano/ne?
2. **Sounds entita per-svět nebo globální?** Stejná otázka.
3. **Globální NpcTemplates bestiář** (`/api/NpcTemplates` v Matrixu) — chceme zachovat globální „katalog příšer"?
4. **Multi-PJ podpora** — Matrix neřeší konflikty mezi dvěma PJem. V Ikarosu kolik PJ může editovat scénu paralelně?
5. **Dungeon Builder integrace** — má generovat mapy přímo pro `MapTemplate` (skin generated mapa), nebo zůstane samostatná feature?
6. **Mobile UX** — Matrix funguje, ale specifika (drag deníku off, fog highPerf default) jsou ad-hoc. Ikaros chce explicitní mobile design?
7. **Iniciativa rounds management** — Matrix má jen number per token (`initiative`), ale nemá „čí kolo je teď". Chceme „turn order" UI (kdo je na řadě, klik na další)?
8. **Combat state automatizace** — Matrix neřeší automatický apply damage z exploze na tokeny v zasaženém hexu. Ikaros chce auto?
9. **History / replay scény** — Matrix neukládá historii. Ikaros chce „rewind" pro debriefing po sezení?

---

## 15. Glossář pojmů použitých v dokumentu

| Pojem | Vysvětlení |
|---|---|
| **Axiální souřadnice (q, r)** | Hex grid souřadný systém; namísto čtvercového `(col, row)` se používá dvojice, kde sousedi mají vždy rozdíl 1 v jedné nebo obou. Vzorce v `HexUtils.ts`. |
| **Cube round** | Trik na převod fraction-axial → nearest integer hex. Předjde rounding error tím, že přepočítá přes cube souřadnice (`s = -q - r`). |
| **Atomic update** | Mongo positional operator (`tokens.$.q`) updatuje jediný embedded subdocument bez přepsání celého dokumentu — chrání před lost-update race. |
| **Lost-update race** | Klient A načte dokument, klient B načte stejný dokument, oba editují různé části a oba zapíšou — poslední zápis přepíše první. |
| **SignalR group** | Pojmenovaný subset connection IDs; broadcast jen členům skupiny. Matrix: 1 group = 1 scéna. |
| **Catch-up** | Po reconnect re-fetch full state přes REST, protože SignalR nedrží historii eventů. |
| **Fog mask** | SVG `<mask>` s bílým bg + černými hexy (revealed). Když se aplikuje na `<rect>` přes celý canvas, černé hexy „vyříznou" fog. |
| **feTurbulence** | SVG filtr generující procedurální šum (Perlin-like). Použit ve FogOfWar pro mlhový efekt; drahý na slabých GPU. |
| **highPerf mode** | Skip drahých vizuálních efektů (cloud noise, animace explozí) na touch/slabých zařízeních. |
| **Latching gate** | Boolean state, který se nastaví poprvé a už zůstane — používá se v MapPage pro `hasRolled` (DiceOverlay mount). |
| **Optimistic update** | UI aktualizuje state hned, neceká na server confirm. Pokud server odmítne, rollback. |
| **`React.memo` bypass** | Když parent předá nový object/array literal jako prop, memo dítěti se nikdy nestaví. Lék: `useMemo` na stabilní reference. |
| **Fate dice** | 4 šestistěnné kostky s tvářemi `++--00`. Faces summed: −4 až +4. |
| **Pool roll** | Hod N kostkami stejného typu (např. `5d6`). User zadá N v promptu. |
| **Mixed roll** | Hod různými kostkami současně (např. `2d6 + 1d20`). User vyklikne počty per type. |
| **Skin** | Vizuální vzhled 3D kostky (textura). Per die-type lze nastavit jiný skin. |
| **Jailed dice** | Vtipná feature — user „uvězní" skin, který mu nese smůlu. Před hodem se kontroluje a roll se zablokuje (dokud neunjail-uje). |
| **Custom diary block** | Schema item v `world.customDiarySchema`: `id`, `type` (`stat`/`bar`/`list`/`text`), `label`, `layoutArea`, optional `minValue/maxValue`. |
| **Placement mode** | Stav v MapPage, kdy klik na hex spawneuje token. Aktivní po `onCharacterClick` v toolbaru nebo `onAddToMap` v deníku. |
| **deriveCombatState** | Util `combatUtils.ts`: z `(maxHp, baseArmor, injury)` vypočte `(currentHp, currentArmor)` — Matrix-specific HP/Armor decay s injury. |
| **YouTube IFrame API** | Google JS API pro embeddování YT playeru s programmatic controlem. Matrix ho používá pro hidden ambient sound playback. |
| **Hex `polygon` `flat-top`** | Orientace hexu — plochá strana nahoře/dole, špičky vlevo/vpravo. Vs. `pointy-top` (špička nahoře). Matrix má flat-top (vidět v `getHexCorner` úhel `60*i - 30`). |

---

## 16. Otevřené nejasnosti z rešerše (v rámci Matrix kódu)

Tyto věci jsou v Matrixu nečisté/inkonzistentní; při re-implementaci v Ikarosu se k nim vrátím s konkrétní otázkou:

1. **`MAP_IMAGE_SIDE_SPACE = 600` magic number** — proč zrovna 600px? Asi historické, by mělo být přes config nebo proporcionálně k image size.
2. **`deriveCombatState` vs raw HP** přepínané přes `customData?.dnd_npc_type` — implicit branching. V Ikarosu by mělo být explicit `npc.combatModel: 'derived' | 'raw'`.
3. **PC token `maxHp = 5` hardcoded** v drop handleru + render — proč 5? Souvisí s DrD II vlivem? V Ikarosu by maxHp měla brát z Character entity konzistentně.
4. **`scene.tokens` dedup po načtení** (`uniqueTokens` filter podle `t.id`) — naznačuje, že někdy DB má duplikáty. Bug v save logice? V Ikarosu fix root cause.
5. **`extractSlugFromPath` parsing s `decodeURIComponent` + try/catch** — Matrix má character path jako URL fragment; Ikaros má cleaner ref → cleaner lookup.
6. **NPC token `currentHp` flow** — při spawnu z templatu: pokud D&D, `currentHp = maxHp - injury`; jinak přes `deriveCombatState`. Inkonzistentní → unify.
7. **Repair portrétů tlačítka v PJ panelu** — Matrix-specific data migration utility; v Ikarosu nepotřeba (cleaner data model).
8. **`tokenImageUrls` buildování** se 4 slug variantami (`base`, `-denik`, `-denik-pj`, page lookup) — historický artifact Matrix slugu konvence. V Ikarosu jednodušší lookup přes character ref.
9. **`onSceneReloaded` vs incremental events** — když PJ klikne „Načíst mapu z knihovny", broadcast `ReloadScene` s celou MapScene. Hráči dostanou full replace. Funguje, ale velký payload + ignoruje optimistic patches během loadu. Asi OK; přemyslet u edge cases.
10. **YouTube only ambient sound** — žádná abstrakce. Ikaros chce víc drivers (lokální MP3, SoundCloud, generic stream URL)?

---

## 17. TL;DR pro budoucí mě

Když se vrátíš k taktické mapě:

1. **Backend je jednoduchý:** 3 modely (MapScene, MapTemplate, NpcTemplate), 2 kontrolery, 1 service, 1 hub. Začni od `MapHub.cs` — eventy ti řeknou všechno o flow.
2. **Frontend je monolit:** MapPage.tsx je 3460 LOC, ale dobře strukturovaný. State map v sekci 5.2. Lifecycle v 5.3. Interakce v 5.4. Vrstvy SVG v 5.5.
3. **Per-system architektura je závazek** — viz [project_takticka_mapa_multi_system](../...). 5 systémů hardcoded v Matrixu, Ikaros to drží.
4. **Dice je samostatný subsystém** s vlastním hookem (`useMapDice`) + 3D animacemi (DiceOverlay, lazy).
5. **Realtime race conditions řešeny jen pro `move-token` a `remove-token`** atomic patchi; všechno ostatní je full PUT s debouncedSave 500ms. V Ikarosu vylepšit.
6. **Permissions jsou serveru i klienta** — neignoruj server-side `IsPJ()` check v MapHub.
7. **Performance triky** v sekci 11 jsou hodně důležité — bez lazy DiceOverlay, image preloaderu a fogHighPerf je mapa nepoužitelná na slabších strojích.
8. **Open questions** v sekci 14.3 vyžadují alignment s PJ-em **před** spec-driven workflow re-implementace.

---

> 📝 **Tento dokument je aktivní reference.** Když najdeš v Matrixu něco, co tu chybí nebo se v Ikarosu zachovává jinak, doplň ho. Lépe ho vést jako živý dokument, než rozplýtat informace do skipnutých commitů.

---

# Část 2: Mapping na roadmap krok 10.2

> Tato část propojuje **Matrix vzor (sekce 1–17 výše)** s **konkrétními podkroky 10.2a–m** v `Projekt-ikaros-FE/docs/roadmap-fe.md`. Pro každý podkrok: stav Ikaros BE/FE, co převzít z Matrixu, jaké jsou nové tech volby, open questions pro spec.

---

## 18. Stav Ikaros (k 2026-05-27) — co už existuje, co chybí

### 18.1 BE (`Projekt-ikaros/backend/src/modules/`)

| Modul | Stav | Souvislost s 10.2 |
|---|---|---|
| `maps/` | ✅ **Kompletní** (controller, service, gateway, schema, DTO, repo) | jádro 10.2c–i |
| `npc-templates/` | ✅ **Kompletní** (controller, admin-controller, service, schema) | 10.2d (NPC instancing) |
| `dungeon-maps/` | ✅ Kompletní vč. `export-template.dto` + `export-scene.dto` | 10.2c (template loading), 10.3d producent |
| `sounds/` | ✅ Hotový | 10.2k |
| `world-weather/` | ✅ Hotový, emituje event `weather.updated` → MapsGateway broadcastuje `weather:updated` na `world:{worldId}` | 10.2 napojení počasí |
| `characters/` + `pages/` | ✅ Hotové (po 9.1 sjednocení Page+Character) | 10.2d/e (token enrichment) |
| `world-memberships/` | ✅ Hotové | 10.2m (world-scoped role check) |
| Dice payload (krok 6.3) | ✅ Hotový — port z Matrixu, CSS 3D, `dicePayload` discriminated union, 30 skinů | 10.2j (sdílený engine) |

**Mongo kolekce relevantní pro 10.2:** `mapScenes` (per-world), `mapTemplates` (globální), `npcTemplates` (globální), `dungeonMaps` (per-world), `sounds`, `characters`, `pages`, `worldMemberships`, `worldCalendarConfig` (sice nemá přímou vazbu, ale spec 9.3 calendar config se může objevit v `MapScene.config` future).

### 18.2 FE (`Projekt-ikaros-FE/src/features/`)

| Soubor | Stav |
|---|---|
| `world/pages/MapPage.tsx` | **Stub 1 řádek** — `<WorldStubPage area="map" />`. Je to **placeholder pro Universe mapu (10.1)**, ne taktickou. |
| `world/pages/TacticalMapPage.tsx` | **Stub 1 řádek** — `<WorldStubPage area="tactical-map" />`. **Začneme zde 10.2.** |
| `features/admin/pages/DungeonBuilderPage.tsx` | Stub (10.3) — **routing oprava: má být per-world** `/svet/:worldSlug/admin/dungeon-builder`, ne `/ikaros/admin/dungeon-builder` (BE už wants worldId povinný) |
| Sdílený dice engine (krok 6.3) | ✅ Hotový — najdeš v FE feature pro chat; pro 10.2j stačí lazy-import |
| `WorldLayout` | Hotový — bude potřeba special branch pro `isTacticalMap` (full-bleed, žádný padding, hidden overflow — jako Matrix dělal) |

### 18.3 Otevřené FE závislosti

- **`pixi.js` + `@pixi/react`** — **nové balíčky** pro 10.2 (zatím v package.json nejsou). Lazy-load per route.
- **`konva` + `react-konva`** — pro 10.3 (Dungeon Builder), netýká se 10.2.
- **`three`** — pro 10.1 (universe) a 10.2j (DiceOverlay future), zatím není.
- **`socket.io-client`** — už je v projektu (používá ho chat 6.x).

---

## 19. Hlavní technologické delty Matrix → Ikaros 10.2

### 19.1 Tabulka klíčových změn

| Oblast | Matrix | Ikaros 10.2 | Důvod |
|---|---|---|---|
| **Renderer** | SVG (React) | **PixiJS / WebGL** (`@pixi/react`) | Matrix dokumentoval, že SVG mlha při `feTurbulence` na mobilu zaškrtí FPS → musel zavést `highPerf` toggle. WebGL je výkonový strop, GPU efekty zdarma. Vrstvy: pozadí / grid / efekty / tokeny / fog / ping. |
| **Realtime** | SignalR (ASP.NET) | **NestJS Socket.io Gateway** (`MapsGateway`) | Konzistence s zbytkem Ikaros BE; event prefix `map:*` kebab-case (vs Matrix `OnXxx` PascalCase) |
| **Backend stack** | ASP.NET / C# | NestJS / TS / Mongoose | Celý Ikaros BE v Nestu |
| **Role check** | Global `[Authorize(Roles="PJ,Admin,Superadmin")]` claim | **World-scoped** `WorldMembership.role >= WorldRole.PJ` v `assertCanManage` | Ikaros architektura: role je per-world, ne globální (kromě Sa/Admin) |
| **Hex grid render** | N polygonů (každý hex `<polygon>`) | **Dlaždicová textura, jeden draw call** (10.2b) | GPU efektivita |
| **Fog of war** | SVG `<mask>` per hex + `feTurbulence` cloud overlay | **Render-texture maska** (10.2h), brush reveal/fog jako paint do offscreen texture | WebGL nativní; eliminuje `feTurbulence` performance hit |
| **Token enrichment** | FE volá `getCharacters(worldId)` paralelně, sjednocuje slugy 4 variantami | **BE `enrichTokens` přidává `token.characterData = {name, imageUrl, diaryData}`** přímo při `GET /maps/:id` | Po 9.1 sjednocení Page+Character; FE má vše ready-to-render bez další query |
| **NpcTemplate v scéně** | Embedded `MapScene.npcTemplates: NpcTemplate[]` (kopie globální šablony bez zpětného linku) | **`MapSceneNpc`** má `originTemplateId` field — clean odkaz na globální `NpcTemplate` (samostatný modul `npc-templates/`) | Editace globální šablony se může propagovat zpět; rapid prototyping uvnitř scény zachován |
| **Atomic token operace** | ✅ Mongo positional `tokens.$.q` / `$pull` (Matrix `MapsService`) | ⚠️ **REGRESE** — `MapsService.moveToken/removeToken` dělá `findById → modify → repo.replace` (full `findByIdAndUpdate({overwrite:true})`); race s konkurentními edity zůstává | **Musí se opravit ve 10.2i** (atomic update operators v repository) |
| **Server-side PJ gate v gateway** | ✅ Matrix MapHub má `IsPJ()` check na všech PJ-only eventech | ⚠️ **BUG / GAP** — Ikaros `MapsGateway` jen relayuje, **bez role checku**. Klient hráč může spoofovat `map:effect-added` atd. a server přepošle | **Musí se opravit ve 10.2i** (přidat guard / decorator) |
| **Dice engine** | Vlastní v `Map/Dice/` + `useMapDice` hook | **Sdílený s krokem 6.3** (chat dice engine — port z Matrixu, CSS 3D, 0 KB three.js) | DRY, jeden zdroj pravdy; mapa jen broadcastuje výsledek přes `map:dice-rolled` |
| **3D dice overlay** | three.js per type model (`D4Model`, `D20Model`, …) v `Map/Dice/models/` | Pro 10.2j může být lazy-load `three` pro 3D overlay nad mapou, **ale chat 6.3d používá CSS 3D bez `three`** — zvážit jestli vůbec potřebujeme three na mapě | Otevřená otázka 18.4-#5 |
| **Sound playback** | YouTube IFrame API přímo v `MapPage.tsx`, hidden 1×1px iframe na `document.body` | Sjednocení s krokem **13.3** (Zvuková databáze) — driver abstrakce (YT + lokální audio?) | Roadmap 13.3e: „integrace s taktickou mapou" jako samostatný bod |
| **localStorage prefix** | `ikr-map-*` (legacy) | Konvence Ikaros — pravděpodobně `ikaros.map.*` (ověřit s existujícím chat / settings kódem) | Naming consistency |
| **Pohyby tokenů — payload** | Celý `MapToken` v `TokenMoved` invoke | `MoveTokenDto = { id, q, r }` (BE) + bohatší WS payload pro UI optimisticism | BE už dělá minimal payload; FE WS může mít víc kontextu |

### 19.2 Co ZŮSTÁVÁ stejné

- **Hex math** (axial q/r, neighbors, ring, radius) — `HexUtils.ts` z Matrixu je čistá math, copy-paste 1:1
- **Hex orientace** flat-top (úhel `60*i - 30°`)
- **MapScene základní pole** (`name, imageUrl, config, tokens, npcTemplates, effects, fogEnabled, revealedHexes, isActive, isHidden, isLocked, activeSoundIds, templateId`)
- **HexConfig** (`size, originX, originY, showGrid`) — Matrix struktura zachována 1:1
- **MapEffect** struktura (`type, hexes, color, rings, variant, excludedHexes, barrierDC`)
- **`MapToken`** základní pole (`q, r, characterId, characterSlug, isNpc, templateId, instanceName, currentHp, maxHp, baseHp, armor, baseArmor, injury, initiative, initiativeBase, inCombat, movement, abilities, personalDiarySchema, customData`)
- **MapTemplate** = globální šablona (samostatná kolekce)
- **Per-system architektura** (D&D/CoC/GURPS/Fate/DrD2) — zachovává se (viz sekce 13)
- **Multi-PJ semantika** = ServerEnforce PJ check + atomic operations (Ikaros tě k tomu nutí; Matrix měl klienta optimistic)

### 19.3 Ikaros REST endpointy (skutečné, ne Matrix)

```
GET    /maps?worldId=…              → list scén ve světě
GET    /maps/active?worldId=…       → aktivní scéna (404 = MAP_NO_ACTIVE_SCENE)
GET    /maps/:id                    → detail VČETNĚ characterData enrichmentu
POST   /maps                        → create (PJ membership; auto-copy z templateId)
POST   /maps/:id/active?worldId=…   → set active (204)
PUT    /maps/:id                    → replace (PJ membership)
PATCH  /maps/:id/move-token         → ⚠️ NEatomic (viz 19.1)
PATCH  /maps/:id/remove-token       → ⚠️ NEatomic (viz 19.1)
DELETE /maps/:id                    → delete (PJ membership, 204)
```

### 19.4 Ikaros Socket.io eventy (skutečné, ne Matrix)

**Server přijímá (klient `socket.emit('event', payload)`):**

| Event | Payload | Server akce |
|---|---|---|
| `map:join` | `sceneId: string` | `client.join(sceneId)` |
| `map:leave` | `sceneId: string` | `client.leave(sceneId)` |
| `map:token-moved` | `{ sceneId, token }` | relay `map:token-moved` to others |
| `map:config-updated` | `{ sceneId, config }` | relay |
| `map:token-removed` | `{ sceneId, tokenId }` | relay |
| `map:reload-scene` | `{ sceneId, scene }` | relay `map:scene-reloaded` to others |
| `map:scene-cleared` | `sceneId` | relay to others |
| `map:ping` | `{ sceneId, x, y, userName }` | relay `map:pinged` (x, y, userName) to others |
| `map:effect-added` | `{ sceneId, effect }` | relay to others |
| `map:effect-removed` | `{ sceneId, effectId }` | relay to others |
| `map:fog-updated` | `{ sceneId, fogEnabled, revealedHexes }` | relay (fogEnabled, revealedHexes) to others |
| `map:dice-rolled` | `{ sceneId, … }` | **broadcast `map:dice-rolled` to whole room** (vč. odesílatele) |
| `map:scene-state-changed` | `{ sceneId, isHidden, isLocked }` | relay (isHidden, isLocked) to others |
| `map:sound-changed` | `{ sceneId, soundIds }` | relay to others |

**Server-emit-only (klient jen poslouchá):**

| Event | Trigger | Payload |
|---|---|---|
| `weather:updated` | EventEmitter z `world-weather` modulu | `{ worldId, generatorId, generatorName, weather: WeatherResult }`. Emit na room `world:{worldId}` (NE per scéna). |

> ⚠️ **`weather:updated` jde na `world:{worldId}` room, ne na `sceneId` room.** Mapa musí join taky `world:{worldId}` (samostatným emitem), pokud chce počasí přijímat. Tohle není dokumentované — pre-spec ujasnit.

---

## 20. Mapping na 10.2a–m podkroky

### 10.2a — Rendering jádro + výkonová kostra

**Roadmap:** „PixiJS/WebGL plátno, oddělené vrstvy (pozadí / grid / efekty / tokeny / fog / ping), viewport culling, dirty-flag + RAF překreslení, pan (myš/touch) + zoom (pinch/wheel) s persistencí."

**Matrix vzor:**
- SVG layered render (sekce 2 + 5.5): `<image> → <HexGrid> → <MapEffectOverlay> → <MapToken>...  → <FogOfWar> → <MapPing>...`
- Pointer handlery: pan (middle/left bez tool), pinch-zoom, ctrl+wheel zoom toward cursor (sekce 5.3 #7)
- Persist zoom/scroll v localStorage (250ms debounce)

**Co přebrat 1:1:**
- Order vrstev (pozadí → grid → efekty → tokeny → fog → ping)
- Pinch-zoom math (start distance + start zoom + center anchor)
- Ctrl+wheel zoom math (cursor-anchored)
- `MAP_IMAGE_SIDE_SPACE` koncept (extra plocha kolem pozadí pro tokeny mimo image) — ale udělat to konfigurovatelné

**Co je nové:**
- **PixiJS containers** místo SVG `<g>`: jeden `Container` per vrstva, dirty-flag (re-paint jen změněnou vrstvu)
- **RAF redraw**, ne React re-render na každý setState
- **Viewport culling** — vykreslovat jen co je v `viewportRef.getBoundingClientRect()` (Matrix kreslil vše 20000×20000)
- **PixiJS Texture pool** pro tokeny (sprite atlas)
- **Touch handling** — pravděpodobně přes `@pixi/events` plugin nebo manuálně přes window pointer events nad canvasem

**Open questions pro spec 10.2a:**
1. **PixiJS verze**: v8 (nejnovější, ESM, jednodušší ale méně tutoriálů) vs v7 (zralejší, víc community kódu). Doporučení: **v8** (kompatibilita s React 18+ moderní toolchain).
2. **`@pixi/react` vs vanilla**: react-pixi v8 ještě v alfě (k 2026-05); jestli stabilizovaná, použít. Jinak vanilla Pixi s ref-based mountem.
3. **WebGL fallback**: `Konva` jako fallback pokud WebGL kontext fail? Roadmap to zmiňuje.
4. **`MAP_IMAGE_SIDE_SPACE` per scénu nebo globální konstanta?**
5. **Dirty-flag granularita**: per-vrstva nebo per-token? Per-vrstva je jednodušší, per-token je optimální.

### 10.2b — Hex mřížka

**Roadmap:** „axiální q/r, `HexUtils` (axial↔pixel, sousedé, radius, snap-to-grid); grid jako jeden draw (dlaždicová textura), ne N polygonů"

**Matrix vzor:**
- `HexUtils.ts` (sekce 6.1) — port 1:1
- `HexGrid.tsx` v Matrixu používá SVG `<pattern>` repeating tile (taky 1 draw v podstatě)

**Co přebrat:**
- `HexUtils.ts` math 1:1 (axialToPixel, pixelToAxial, getHexCorner, getHexPoints, getHexNeighbor, getHexRing, getHexesInRadius, roundToHex cube round)

**Co je nové:**
- **Grid jako jediná textura** v PixiJS: vygenerovat off-screen canvas s hex tile, použít jako `BaseTexture` pro `TilingSprite` přes celý canvas
- **Snap-to-grid** (pravděpodobně pro drag tokenů) — Matrix neměl explicitně, používal click+klik. Drag&drop podle 10.2d:
  - Cursor → axial round → snap target hex visual highlight
  - Mouse up → finalize position

**Open questions:**
1. **Hex orientation** zachovat flat-top (jako Matrix) nebo přepnout na pointy-top? Foundry VTT používá pointy-top. Matrix má flat-top → konzistence se starým UI.
2. **Snap-to-grid feedback** — visuál highlight cílového hexu při drag, nebo až po dropu?

### 10.2c — Scény (`MapScene`)

**Roadmap:** „načtení aktivní / konkrétní scény, pozadí mapy, přepínání, debounced uložení; stavy `isActive` / `isHidden` / `isLocked`"

**Matrix vzor:** sekce 5.3 (Scene load), 5.4 banner overlay pro hidden/locked, debouncedSave 500ms

**Co Ikaros BE už nabízí:**
- `GET /maps?worldId=` (list), `GET /maps/active?worldId=` (active), `GET /maps/:id` (detail s enrich)
- `POST /maps/:id/active` (set active, deactivates siblings v daném worldId)
- `PUT /maps/:id` (replace)
- `POST /maps` se `templateId` → server auto-loaduje template

**Co přebrat z Matrixu:**
- `placementMode` banner UI ("Klikněte na hex pro umístění X" — sekce 5.4 placement mode)
- Hidden overlay (full černá plachta pro hráče když `isHidden`)
- Locked overlay (transparentní s pulse "🔒 HRA ZASTAVENA")
- Debounced save 500ms koncept (s flush on unmount)

**Co je nové:**
- **Server-side `enrichTokens`** → FE nemusí samostatně volat `getCharacters` paralelně
- **MapTemplate auto-copy** v BE — FE jen pošle `{templateId, name, worldId}` a server naloaduje
- Trigger PUT jen pro **změny, které REST endpoint pokrývá** — všechno ostatní (efekty, fog, sound) přes atomic patche v 10.2i

**Open questions:**
1. **Folder field** v schemě (`folder?: string`) — k čemu slouží? V Matrixu chybí. Ikaros má pre-bake organize scénám?
2. **„Knihovna map"** (MapTemplate listing v UI) — kde to bude? Matrix měl `MapLibraryModal` přímo v MapPage. Ikaros: dedicated route nebo modal?
3. **`isHidden` plachta pro hráče** — má pokrýt celý viewport vč. toolbaru, nebo jen plátno? Matrix kryl jen plátno.

### 10.2d — Tokeny

**Roadmap:** „PC i NPC tokeny, drag&drop na hex, pozice q/r, vizuál (avatar ze sprite atlasu, ring, výběr); NPC instancované z `npc-templates` (krok 8.4); optimistický lokální pohyb"

**Matrix vzor:**
- `MapToken.tsx` SVG (sekce 6.2): clip-path circle, fallback text, HP bar, "i" badge
- Image retry 2× s delays [800, 1500]ms
- `tokenImageUrls: Map<string, string>` v MapPage (sekce 5.4 image preloader)
- Drag&drop z toolbaru: dataTransfer `{ type:'new', characterId, characterSlug }`

**Co Ikaros BE už nabízí:**
- `MapSceneNpc.originTemplateId` — clean odkaz na globální `NpcTemplate`
- `enrichTokens` → `token.characterData` má name + imageUrl + diaryData ready
- `npc-templates` modul (krok 8.4): `GET /npc-templates?worldId=…`, ADD/EDIT/DELETE

**Co přebrat z Matrixu:**
- Drag&drop UX (PJ z toolbaru, datatypes)
- Klik → select → klik na prázdný hex → move (alternative k drag)
- "i" badge pro otevření deníku
- HP bar barvy (PC: ≥4 zelená / ≥2 žlutá / jinak červená; NPC: ≤0 šedá / ≤1 červená / ≤half žlutá / jinak zelená)
- Selected ring pulsing animation

**Co je nové:**
- **Sprite atlas** pro tokeny — vygenerovat one-time texture atlas z portrétů (PixiJS `Spritesheet`), místo per-token `<image>`
- **Optimistický pohyb** — drag handler updatuje lokálně + WS emit + REST PATCH paralelně, žádný await
- **`originTemplateId` link** — když PJ edituje globální `NpcTemplate`, scéna na vyžádání refresh-uje data instance (UI tlačítko „Aktualizovat z šablony")

**Open questions:**
1. **Spawn NPC**: kopírovat `NpcTemplate` do `MapSceneNpc` při spawnu (Matrix-style), nebo držet jen `originTemplateId` ref a vždy resolve? **Kopie + ref** dává nejlepší trade-off (rapid edits ve scéně bez ovlivnění globálu, ale link zachován).
2. **PC token spawn**: drag&drop z toolbar postav (jako Matrix) nebo z deníku postavy?
3. **Snap-to-grid během drag** — visual cue cílového hexu?
4. **`maxHp = 5` hardcoded pro PC**: v Matrixu zvláštnost (sekce 16 #3). Ikaros: maxHp brát z `Character.diaryData.health` nebo systému?

### 10.2e — Staty tokenu

**Roadmap:** „HP / maxHP, zbroj, zranění, `currentHp`; HP bar barevně dle stavu; obousměrný sync se staty postavy (krok 8)"

**Matrix vzor:**
- `MapToken` má `currentHp/maxHp/baseHp/armor/baseArmor/injury` (sekce 3.3)
- `deriveCombatState(maxHp, armor, injury) → {currentHp, currentArmor}` util (Matrix util `combatUtils.ts`)
- Sync MapToken ↔ Character: změna v deníku → patch `MapToken.currentHp` → broadcast `TokenMoved`

**Co je nové:**
- **`token.characterData.diaryData`** server-side enriched (po 9.1 Page+Character unification)
- **Obousměrný sync** přes 10.2l (deník na mapě edituje → patch Character → BE event → MapsGateway → broadcast?) **Architektura toho sync flow je open question.**

**Open questions:**
1. **Sync direction priority**: token HP → Character (Matrix-style), nebo Character → token? Matrix má oboje, ale není explicitně řešeno koho vyhraje při konfliktu.
2. **`deriveCombatState` logika**: zachovat (DrD2-style injury), nebo systému-agnostic? Jak interagovat s D&D NPCs co používají raw HP (sekce 16 #6).
3. **HP bar logika `maxHp === 5` pro PC**: zrušit, brát z Character.

### 10.2f — Iniciativa

**Roadmap:** „tracker pořadí tahů, řazení dle iniciativy, indikace „koho je tah", `InitiativeInput`"

**Matrix vzor:**
- `MapToken.initiative` + `initiativeBase` (sekce 3.3)
- `InitiativeInput.tsx` (sekce 6.12) — text-based, regex `^-?\d{1,2}$`, strip leading zeros
- MapToolbar iniciativa dropdown (sekce 6.2): sort desc, tabulka
- **CHYBÍ v Matrixu**: „koho je tah" — Matrix má jen number, neřeší turn order pointer (sekce 14.3 #7)

**Co je nové:**
- **Turn order pointer** — kdo je teď na řadě, klik na „další tah". Matrix neměl, Ikaros to chce per roadmap.
- **WS event** `map:turn-changed`? Roadmap to nezmiňuje, pravděpodobně součást `map:scene-state-changed` payload extension.

**Open questions:**
1. **Turn order state**: kde žije? `MapScene.currentTurnTokenId: string`? Nebo client-only?
2. **Iniciativa autoroll**: skill rolování v deníku → `skillName === 'Iniciativa'` → patch tokenu (Matrix-style, sekce 5.4)? Nebo manuální zadání jen?
3. **Round counter** — držet číslo kola? End of round handlers (efekty co tikají)?

### 10.2g — Efekty

**Roadmap:** „`color` zóny / `barrier` (DC, kruh nebo brush) / `explosion` (soustředné rings, damage, variant fire / gas / smoke); paleta nástrojů"

**Matrix vzor:**
- `EffectsPalette.tsx` (sekce 6.3) — UI panel
- `MapEffectOverlay.tsx` (sekce 6.3) — render per type
- `MapEffect` struktura (sekce 3.5) — type/hexes/color/rings/variant/excludedHexes/barrierDC
- Per-variant CSS animace (`map-effect-fire/gas/smoke--anim`)

**Co Ikaros BE už nabízí:**
- `MapEffect` interface 1:1 jako Matrix (sekce 19.2)
- `map:effect-added` / `map:effect-removed` WS eventy

**Co přebrat z Matrixu:**
- 8-barevný color swatch grid
- Barrier brush/circle/DC math
- Explosion concentric rings rendering (reverse order draw)
- Variant palettes (FIRE_COLORS, GAS_COLORS, SMOKE_COLORS)

**Co je nové:**
- **PixiJS animace** — GPU shaders pro „ohnivé" pulsování (variant `fire`), drift „kouře" (variant `smoke`). Roadmap pilíř #2 (vzhled): GPU efekty „zdarma".
- **Brush paint multi-hex** v jediné WS broadcast batch (Matrix posílal per-hex eventy) — koalescing v 10.2i

**Open questions:**
1. **Excluded hexes (explosion)**: PJ vyklikne hex, který se vyloučí z auto-spočítaného kruhu. Matrix to má v poli `excludedHexes`. Ikaros zachovává; UI: shift+click? Right-click?
2. **Auto-apply damage** na tokeny v explosion zóně? Matrix neřeší (sekce 14.3 #8). Ikaros: explicit confirm dialog s preview?
3. **Variant palette extensibility**: jen 3 fixní (fire/gas/smoke) nebo PJ-customizable?

### 10.2h — Fog of war

**Roadmap:** „mlha + odhalování (brush reveal / fog) jako render-texture maska (ne per-hex polygony), tokeny PC vždy viditelné, odlišný pohled PJ vs hráč"

**Matrix vzor:**
- `FogOfWar.tsx` SVG mask (sekce 6.4): white rect + black hexes → mask → fog rect
- `alwaysVisibleHexes` = PC token pozice — UI trick, ne DB (sekce 6.4)
- PJ vs hráč: PJ vidí semi-transparent mlhu, hráč opaque
- `feTurbulence` cloud overlay (skip když `highPerf`)

**Co je nové (NEJVĚTŠÍ změna):**
- **Render-texture maska** v PixiJS:
  - Offscreen `RenderTexture` se stejnými rozměry jako canvas
  - PJ brush kreslí do textury (alpha 1 = reveal, alpha 0 = fog)
  - Mask aplikuje texture na fog overlay sprite
  - Žádné per-hex polygony — kontinuální brush stroke
- **PC always-visible**: stále UI trick (paint kruh kolem PC pozice před aplikací mask)
- **PJ vs hráč**: dvě různé render-texture (PJ vidí slabou mlhu, hráč fog opaque) nebo CSS opacity na top mlhové vrstvy

**Open questions:**
1. **Render-texture persistence**: bitmap maska se ukládá kam? Do `MapScene.fogMask` (base64 PNG?) nebo zachovat `revealedHexes` array a render-texture jen derivat? **Druhé** je lepší (audit log, ale render-texture jen jako paint result; finální data zůstanou hex array).
2. **Brush smooth interpolation**: mezi 2 mousemove pointmi paintit linii (Matrix v Bressenham-like)?
3. **Reveal animace** — fade-in odhaleného oblasti? Nebo instant?

### 10.2i — Real-time sync

**Roadmap:** „`MapsGateway` WS (`token-moved`, `config-updated`, `effect-added/removed`, `fog-updated`, `ping`, `scene-state-changed`, `sound-changed`); throttling + coalescing odchozích eventů, reconnect + catch-up"

**Matrix vzor:** sekce 8 (Realtime sync — connection lifecycle), sekce 5.3 #4 (SignalR setup)

**Co Ikaros BE už nabízí:** sekce 19.4 (seznam všech eventů)

**Co přebrat z Matrixu:**
- **Catch-up po reconnect**: `getMapScene(id)` REST refetch (SignalR ani Socket.io nemají persistent event log)
- `onreconnect` → re-join room
- Event coalescing logika

**Co je nové:**
- **Throttling + coalescing** (roadmap pilíř #1, výkon): fog brush emit 60×/s → coalesce do 10 Hz; token drag emit per pointer move → throttle na 30 Hz
- **Atomic Mongo positional update** v `move-token` a `remove-token`: **NUTNO opravit v BE před 10.2i FE** (regrese, viz 19.1)
- **PJ role gate v `MapsGateway`**: dnes chybí. Roadmap 10.2m permissions vyžaduje server enforce. **NUTNO opravit v BE**: Socket auth middleware (decorator?) + role check per event.

**Open questions:**
1. **Throttling target FPS**: 30 Hz pro pohyby? 10 Hz pro fog brush? Dynamic podle ping latency?
2. **Coalescing strategy**: time-window (last value wins) vs delta-merge (additive)?
3. **Optimistic vs pessimistic UI**: token move = optimistic (UI hned, REST async). Reload-scene = pessimistic (čekat na confirm).
4. **Reconnect token freshness**: po reconnect refetch celé scény, ale co lokální optimistic edity v mezičase (PJ hejbal tokenem v offline)? Buffer + retry, nebo discard?
5. **`weather:updated` event** přichází na `world:{worldId}` room — mapa musí join taky? Nebo BE má broadcastnout na `scene:{sceneId}` taky? (viz 19.4 ⚠️)

### 10.2j — Hod kostkou

**Roadmap:** „kostky na mapě, sdílený dice engine s krokem 6.3, 3D overlay (lazy-load `three`), broadcast výsledku (`map:dice-rolled`)"

**Matrix vzor:** sekce 7 (Dice subsystém: useMapDice + DiceLogic + 3D DiceOverlay)

**Co Ikaros má (krok 6.3 ✅ hotový):**
- Dice picker komponenta v composeru chatu (`6.3a`)
- Roll engine `diceHelpers` (Fate / generic XdN / pool / mixed / d100) — port z Matrixu (`6.3b`)
- Pool prompt modal (`6.3c`)
- 3D rendering CSS (NE three.js — port modelů ze starého Matrixu, 0 KB bundle) (`6.3d`)
- Skin systém (30 skinů, 1820 textur, `WorldMembership.diceSkinMapping`) (`6.3e`)
- Guards (`6.3f`)

**Co je nové pro 10.2j:**
- **Reuse dice engine**: nemusí být vlastní `useMapDice` hook; mapa volá existující `rollDice` funkci z 6.3 a jen broadcast přes `map:dice-rolled` WS event
- **3D overlay**: roadmap zmiňuje „lazy-load `three`" — ALE chat 6.3d používá CSS 3D, ne three.js. **Otázka: chceme jiný overlay pro mapu (three.js)?** Asi ne — keep CSS 3D pro konzistenci.
- **DiceLog** na mapě (sekce 6.12 Matrix) — reuse z 6.3?

**Open questions:**
1. **DiceLog UI**: jako Matrix (fixed bottom-left panel) nebo součást chat panelu (otevíratelného z mapy)?
2. **3D overlay tech**: CSS 3D (jako chat 6.3d, 0 KB) nebo three.js (lazy-load, jak roadmap zmiňuje)? Doporučení: **CSS 3D, vyhnout se 1 MB three.js chunk** — pokud výslovně nevypadá hůř na mapě.
3. **Roll trigger z deníku** (skill click) — propagovat do tokenu pro iniciativu (Matrix sekce 5.4)?
4. **Jail mechanika** — zachovat (per uživatel jailed dice skiny) nebo zrušit jako hříčku? **Zachovat** (uživatelská identita).

### 10.2k — Zvuky

**Roadmap:** „ambient playlist scény (`activeSoundIds`), YouTube přehrávač; napojení na zvukovou databázi (krok 13.3)"

**Matrix vzor:** sekce 6.6 (MapSoundLibraryModal + YouTube IFrame API)

**Co Ikaros má:**
- `sounds` BE modul ✅
- `MapScene.activeSoundIds: string[]` ✅
- `map:sound-changed` WS event ✅
- Krok **13.3** roadmapy: kompletní zvuková databáze (13.3a–e), bod **13.3e** je explicitně „Integrace s taktickou mapou"

**Závislost:** 10.2k závisí na 13.3. Roadmap zmínka „část napojení (zvuky) lze dotáhnout až po fázi 13" — tj. **10.2k MŮŽE BÝT DELAYED do fáze 13**.

**Co přebrat z Matrixu:**
- Playlist UI (sound list s order badges)
- YouTube IFrame API hidden iframe
- PJ play/stop control
- Player „aktivovat zvuk" gesture button (browser audio policy)
- Volume slider live

**Co je nové:**
- **Driver abstrakce**: YouTube vs lokální audio file vs SoundCloud — krok 13.3 to může adresovat
- **Crossfade** mezi tracky v playlistu (Matrix `loop: 1` jen na první track)

**Open questions:**
1. **Implementace 10.2k v 10.2, nebo defer do 13.3?** Doporučení: **stub v 10.2 (jen UI tlačítka co volají `setSceneActiveSounds`), real playback v 13.3e**.
2. **YouTube only nebo více providerů?** Záleží na 13.3.

### 10.2l — Deníky na mapě

**Roadmap:** „token → deník / staty postavy (overlay nebo dock panel), úprava HP / statů přímo z deníku (krok 8)"

**Matrix vzor:**
- `CharacterDiary.tsx`, `NpcDiary.tsx` (sekce 6.9) — lazy
- 3 režimy zobrazení: overlay / drag / dock (`diaryMode` state)
- Per-system overlays: `Dnd/Coc/Gurps/Fate/Drd2 MapDiaryOverlay` (sekce 6.10)
- `CustomDiaryBuilder` univerzální (sekce 6.11)

**Co Ikaros má:**
- Krok **8** (Character / NPC features) v roadmapě — předpoklad, že je hotový/v procesu
- Character schema má `diaryData: Record<string, unknown>` (z `enrichTokens` interface)

**Co přebrat z Matrixu:**
- **Tři režimy zobrazení** (overlay / drag / dock) — UX win, zachovat
- **Per-system overlay komponenty** — D&D / CoC / GURPS / Fate / DrD2 layouts
- **Quick edit instance** (instanceName, currentHp, customData přímo v dock)
- **Diary mode mobile fallback** (`window.innerWidth < 768` → always overlay)
- Otevírání z „i" badge tokenu

**Co je nové:**
- **Reuse Character diary komponent z kroku 8** — sjednocený zdroj (deník na stránce postavy = stejný komponent jako deník na mapě)
- **`token.characterData.diaryData`** ready z BE enrichmentu — žádný separátní fetch
- **WS sync HP**: změna v deníku → patch Character → BE event → WS broadcast → ostatní klienti vidí update tokenu

**Open questions:**
1. **Jeden Diary komponent pro stránku i mapu?** Asi ano (DRY); ale layout overrides per kontext.
2. **WS event pro `diaryData` change**: jaký? `map:token-updated`? `character:diary-changed`? Nebo broadcast přes existující `map:token-moved` (i s daty co se nezměnily, jen jako resync)?
3. **NPC instance edit perzistence**: NPC instance má svůj vlastní `customData`. Edit ho ovlivní globálně? V Matrixu jen lokálně ve scéně (sekce 3.3 + 6.9 NPC instance).

### 10.2m — Nástroje + oprávnění

**Roadmap:** „ping (double-click), fullscreen, měření vzdálenosti; PJ (tokeny / fog / efekty / scéna) vs hráč (jen vlastní token, respekt `isLocked`); `mobil-desktop` audit, `napoveda`"

**Matrix vzor:**
- Ping (sekce 6.5): double-click anywhere → emit + lokální `MapPing` animace, 3s fade
- Fullscreen toggle v zoom-controls
- Permissions matrix (sekce 10) — kompletní
- **Měření vzdálenosti CHYBÍ v Matrixu**

**Co je nové:**
- **Měření vzdálenosti**: nové ve 10.2m. Shift+drag → hex distance count? Hex distance formula: `(|dq| + |dq+dr| + |dr|) / 2`
- **Server-side PJ role check** v `MapsGateway` (oprava bug-u z 19.1) — guard middleware nebo per-event check, world-scoped
- **`mobil-desktop` audit** post-implementace
- **`napoveda` update** — bude potřeba `IkarosHelp` page sekce o taktické mapě

**Open questions:**
1. **Measure tool UI**: shift+drag continuous nebo dedicated tool button v EffectsPalette?
2. **Hex distance**: euclidean nebo manhattan (axial)? Roadmap to neřeší.
3. **Single-fire vs persistent**: PJ klikne „měřit" → ukáže vzdálenost mezi dvěma hexy. Dočasný overlay s line + číslem?

---

## 21. Pre-spec rozhodnutí (před 10.2a workflow) — REVIZE po §23

> ⚠️ **§23 mnohé z těchto bodů potvrdilo nebo přepsalo.** Tato sekce drží jen ZBÝVAJÍCÍ otevřené otázky pro spec workflow.

### 21.1 ✅ Potvrzená rozhodnutí (po §23)

| Bod | Rozhodnutí | Reference |
|---|---|---|
| Operations API + event log | ✅ ANO — `mapOperations` kolekce + `POST /maps/:id/operations` + `GET /operations?since=N` | §23.1 |
| Per-system plugin registry | ✅ ANO — `SYSTEMS: Record<SystemId, SystemPlugin>` | §23.2 |
| Per-systémové deníky | ✅ ANO — zachovat 5 systémů + custom fallback | [project_takticka_mapa_multi_system](../.claude/...) + §23.2 |
| Fog render-texture + hex log | ✅ Hybrid (texture cache + DB hex array) | §23.3 |
| Combat tracker subdoc | ✅ ANO — `MapScene.combat` state machine | §23.4 |
| A* měření | ✅ ANO — klient-side A* respekt barriers | §23.5 |
| Sprite atlas endpoint | ✅ ANO — `GET /maps/:id/sprite-atlas` | §23.6 |
| Undo/Redo (PJ jen) | ✅ ANO — via inverse ops, per-session stack 20 | §23.7 |
| Theming CSS vars | ✅ ANO — `--map-*` namespace, scoped `[data-theme]` | §23.8 |
| BE atomic operace | ✅ ANO — řešeno přes §23.1 (každá op je atomic) | §23.1 |
| BE PJ role gate v gateway | ✅ ANO — řešeno přes §23.1 `assertCanDo` | §23.1 |

### 21.2 Otevřené otázky vyžadující rozhodnutí PŘED spec 10.2a

**Technologie:**

1. **PixiJS v8 vs v7** — finální verze před `pnpm add`. *Doporučení: v8 (modernější, ESM-first).*
2. **`@pixi/react` vs vanilla PixiJS** — stabilita v8 react bindings k 2026-05. *Doporučení: zkusit `@pixi/react` v8 prototypem v 10.2-prep; pokud unstable, vanilla s `useRef` mount.*
3. **3D dice overlay tech** — CSS 3D z 6.3d (0 KB) nebo lazy three.js? *Doporučení: CSS 3D (DRY s chatem, žádný 1 MB chunk).*
4. **localStorage namespace** — `ikaros.map.*` nebo legacy `ikr-map-*`? *Doporučení: `ikaros.map.*` — konzistence s ostatním Ikaros kódem; potřeba ověřit existující konvenci v chat/settings.*

**Architektonické detaily (§23 follow-ups):**

5. **Operations TTL** — drop > 30 dní? Soft delete? Snapshot+compact? (Open §23.1)
6. **Operations read access** — PJ vidí všechny, hráč jen své? (Open §23.1)
7. **Sequence collision strategy** — Mongo `$inc` per scene counter, nebo timestamp-based? (Open §23.1)
8. **Sprite atlas update on token.add** — full regenerate (jednoduchá) vs incremental append (rychlá)? (Open §23.6)
9. **Sprite atlas scope** — per-scene nebo per-world? (Open §23.6)
10. **Combat: hráč vs PJ ovládá tah** — jen PJ klikne "Další", nebo hráč si "dokončí svůj"? (Open §23.4)
11. **Auto-apply damage z end-of-turn effects** — vyžaduje combatModel decision (DrD2 injury vs raw HP). (Open §23.4)
12. **Diagonální barrier traversal** v A* — blokuje, prochází, system-specific? (Open §23.5)

**Cross-cutting:**

13. **`weather:updated` join semantika** — FE musí join `world:{worldId}` room samostatně, nebo BE rebroadcastuje na `scene:{sceneId}` taky? *Pre-spec ujasnit s BE — pravděpodobně přidat join logic v 10.2c.*
14. **Hex orientation** — flat-top (Matrix consistency, default doporučeno) nebo pointy-top (Foundry VTT style)? *Doporučení: flat-top.*
15. **Stuby `MapPage` vs `TacticalMapPage`** — `MapPage` je v současnosti **stub pro universe (10.1)**, `TacticalMapPage` pro 10.2. Ověřit, že rename / přejmenování není potřeba před start.

**Tyto otázky budeme řešit jednotlivě na začátku spec workflow per podkrok / prep-fáze.**

---

## 22. Doporučené pořadí prací uvnitř 10.2

Roadmap pořadí podkroků 10.2a → 10.2m je logický postup, ale ne všechny musí jít striktně lineárně. Doporučené větvení:

```
10.2a (rendering jádro)
   │
   ├─→ 10.2b (hex mřížka)
   │
   ├─→ 10.2c (scény, isHidden/Locked) ── 10.2m parciální (ping, fullscreen)
   │
   ├─→ 10.2d (tokeny base) ── 10.2e (staty)
   │       │
   │       └─→ 10.2f (iniciativa)
   │
   ├─→ 10.2g (efekty)
   │
   ├─→ 10.2h (fog)
   │
   ├─→ 10.2i (real-time + BE fixy z 21) ── váže celý zbytek
   │
   ├─→ 10.2j (kostky — reuse 6.3 engine)
   │
   ├─→ 10.2k (zvuky — STUB v 10.2; real v 13.3e)
   │
   ├─→ 10.2l (deníky na mapě — váže na krok 8)
   │
   └─→ 10.2m (měření, oprávnění finalize, mobil-desktop audit, nápověda)
```

**Klíčové milníky:**

- **MVP 1 (po 10.2a–d)**: PixiJS canvas, hex grid, tokeny lze hýbat (single client, REST persist, žádný realtime). Demo PJ.
- **MVP 2 (po 10.2e–h)**: HP/iniciativa/efekty/fog. PJ má všechny tooly. Stále single-client.
- **MVP 3 (po 10.2i + BE fixy)**: Multi-client realtime, atomic operace, role gate. PvP rozdíl jasný.
- **MVP 4 (10.2j–l)**: Kostky, zvuky (stub), deníky. Plně funkční pro hraní.
- **Release (10.2m)**: Měření, mobil polish, dokumentace.

Každý MVP je vlastní spec-driven cyklus (spec → souhlas → impl. plán → souhlas → kód) per `feedback_workflow`.

> ⚠️ **§22 je REVIDOVÁNO po sekci 23.** Aktuální platná verze pořadí prací viz konec dokumentu (§22 REVIZE).

---

## 23. Architektonická rozhodnutí pro 10.2 (potvrzená 2026-05-27)

> Tato sekce shromažďuje **8 závazných principů**, kterými Ikaros 10.2 jde **nad rámec Matrix vzoru**. Každý z nich byl prodiskutován a potvrzen s uživatelem; konkrétní implementační detaily a edge cases se ladí ve spec-driven workflow per podkrok.

### 23.1 Operations API + server-side event log + per-player assignment

**Princip:** Operace = first-class entita. Místo paralelní cesty REST (PUT/PATCH) + WS broadcast má **každá mutace** scény i cross-scene assignment hráčů formu strukturované operace, kterou server přijme, atomic aplikuje na DB, ULOŽÍ do append-only logu a broadcastne klientům.

**Dvě paralelní cesty:**

- **Per-scene** (`mapOperations`): `POST /maps/:id/operations`, broadcast na room `sceneId`. Pokrývá token/effect/fog/scene/sound/combat/npcTemplate.
- **Cross-scene** (`worldOperations`): `POST /worlds/:worldId/operations`, broadcast na room `world:{worldId}`. Pokrývá `member.*` (assignment hráčů na scény).

**Per-player scene assignment** (potvrzeno uživatelem 2026-05-27 use case Matrixář-Lo3-Jirka): scéna nemá `audience` field. Místo toho **`WorldMembership.currentSceneId`** určuje, na které scéně právě hráč je. PJ to mění přes `member.assignToScene` ops. Víc scén může být `isActive: true` paralelně. Když PJ přesune hráče, jeho token **automaticky** zmizí ze staré scény (cascade `token.remove` op v `mapOperations`).

**Plný spec:** [`docs/arch/maps/operations/`](arch/maps/operations/) (8 souborů — index, purpose, data-models, api, errors, security, tests, ai-notes). **Stav: ✅ implementováno 2026-05-27** (commits `7cdf66f1` až `47b19d5e` v Projekt-ikaros, 11 commitů). Plán + souhrn: [`Projekt-ikaros-FE/docs/arch/phase-10/plan-10.2-prep-1.md`](../../Projekt-ikaros-FE/docs/arch/phase-10/plan-10.2-prep-1.md).

**Endpoint:**
```
POST   /maps/:id/operations
       Body: { type: 'token.move', tokenId, q, r }   (nebo jiná operace)
       Response: { seqNumber, appliedAt, op }
GET    /maps/:id/operations?since=N
       Response: [{ seqNumber, op, appliedAt, byUserId }, ...]
```

**Operation typy (v0):**
| Typ | Args | Atomic Mongo update |
|---|---|---|
| `token.add` | `{ token }` | `$push` do tokens |
| `token.move` | `{ tokenId, q, r }` | `tokens.$.q = q, tokens.$.r = r` |
| `token.remove` | `{ tokenId }` | `$pull` z tokens |
| `token.update` | `{ tokenId, patch }` | `tokens.$.* = ...` (per field) |
| `effect.add` | `{ effect }` | `$push` do effects |
| `effect.remove` | `{ effectId }` | `$pull` z effects |
| `effect.update` | `{ effectId, patch }` | per field |
| `fog.set` | `{ enabled, revealedHexes }` | `$set` (PJ-only) |
| `fog.brush` | `{ mode: 'reveal'\|'fog', hexes: HexCoord[] }` | `$addToSet` / `$pullAll` z `revealedHexes` |
| `scene.state` | `{ isHidden?, isLocked? }` | `$set` (PJ-only) |
| `scene.config` | `{ config }` | `$set` (PJ-only) |
| `scene.image` | `{ imageUrl }` | `$set` (PJ-only) |
| `sound.playlist` | `{ soundIds }` | `$set` (PJ-only) |
| `combat.start` | `{ orderTokenIds }` | viz 23.4 |
| `combat.turn` | `{}` (next) nebo `{ tokenId }` (jump) | viz 23.4 |
| `combat.end` | `{}` | viz 23.4 |
| `npcTemplate.add` / `.remove` / `.update` | per arg | per |

**Datový model — kolekce `mapOperations`:**
```ts
{
  _id: ObjectId,
  sceneId: string,
  worldId: string,
  seqNumber: number,    // monotonic per scéna; index { sceneId, seqNumber }
  op: { type, ...args },
  byUserId: string,
  byUserRole: WorldRole,  // PJ/Player při aplikaci
  appliedAt: Date,
  // pro undo: inverzní op
  inverse?: { type, ...args }
}
```

**Index:** `{ sceneId: 1, seqNumber: 1 }` (catch-up query, append-only).

**WS broadcast flow:**
```
klient → POST /maps/:id/operations (body: op)
   ↓
server: assertCanDo(user, scene, op) ← role + ownership check (jeden místo!)
        atomic Mongo update
        insert do mapOperations s seqNumber
        broadcast `map:operation` { sceneId, seqNumber, op, byUserId } všem v room
   ↓
klient: aplikuje na lokální scene, updatuje lastSeq
```

**Reconnect catch-up:**
```
klient (po reconnect): GET /maps/:id/operations?since=lastSeq
                       aplikuje vrácené ops v pořadí
```

**History / replay UI (defer do post-MVP):**
- PJ otevře "Záznam scény" → seekbar nad poslední 1 h ops → "Před 15 min byl Lo3 na hexu 2,3 s 4 HP"
- Replay = forward play + backward (apply inverse ops)

**Permissions (centralizováno):**
- Jeden `assertCanDo(user, scene, op)` v BE pokrývá VŠECHNY operace
- WS gateway pak relayuje jen po server-akceptaci → automaticky řeší **bod B z §19.1** (chybějící role gate v gateway) i **atomicita z bodu A**

**Otevřené otázky:**
- **TTL na operace:** drop > 30 dní? Soft delete? Compact (snapshot + log od snapshotu)?
- **Read access na log:** PJ vidí všechny, hráč jen své operace? Privacy?
- **Sequence collision:** Mongo `$inc` na scene-level counter (rychlý) vs ObjectId timestamp (lossy)?

---

### 23.2 Per-system plugin registry

**Princip:** Bool flagy (`isDndWorld`, `isCocWorld`, …) → typed registry mapující `world.system` na sadu systémových komponent.

**Interface:**
```ts
export type SystemId = 'dnd' | 'coc' | 'gurps' | 'fate' | 'drd2' | 'custom';

export interface SystemPlugin {
  id: SystemId;
  label: string;                     // "Dungeons & Dragons 5e"
  defaultDice: DieType[];            // ['k20', 'mixed']
  // UI komponenty
  NpcEditModal: React.FC<NpcEditModalProps>;
  NpcStatBlock: React.FC<NpcStatBlockProps>;
  DiaryOverlay: React.FC<DiaryOverlayProps>;
  // Logika
  rollSkill: (skill: string, value: string, modifiers?: Record<string, number>) => DiceResult;
  deriveCombatState?: (maxHp: number, armor: number, injury: number) => { currentHp: number; currentArmor: number };
  // Schema discovery — co customData drží, pro builder
  customDataSchema?: CustomDiaryBlock[];
}

export const SYSTEMS: Record<SystemId, SystemPlugin> = {
  dnd: dndPlugin,
  coc: cocPlugin,
  gurps: gurpsPlugin,
  fate: fatePlugin,
  drd2: drd2Plugin,
  custom: customPlugin,  // používá CustomDiaryBuilder schema
};
```

**Adresářová struktura (návrh):**
```
src/features/world/systems/
├─ index.ts              (export SYSTEMS, resolveSystemPlugin())
├─ types.ts              (SystemPlugin interface)
├─ dnd/
│  ├─ index.ts           (export const dndPlugin: SystemPlugin = {...})
│  ├─ NpcEditModal.tsx
│  ├─ NpcStatBlock.tsx
│  ├─ DiaryOverlay.tsx
│  └─ rolls.ts
├─ coc/
├─ gurps/
├─ fate/
├─ drd2/
└─ custom/
   ├─ index.ts           (customPlugin používá world.customDiarySchema)
   └─ CustomDiaryOverlay.tsx
```

**Použití v MapPage / TacticalMapPage:**
```ts
const plugin = SYSTEMS[world.system] ?? SYSTEMS.custom;
// ...
<plugin.NpcEditModal template={...} onSave={...} />
<plugin.DiaryOverlay characterData={...} onCommit={...} onRoll={plugin.rollSkill} />
```

**Aliasing:** Matrix má `pribehy_imperia` / `pribehy` / `pi` jako aliasy pro Fate. Registry řeší přes resolver:
```ts
const ALIASES: Record<string, SystemId> = { pribehy_imperia: 'fate', pribehy: 'fate', pi: 'fate' };
export const resolveSystemPlugin = (raw: string): SystemPlugin =>
  SYSTEMS[ALIASES[raw] ?? raw as SystemId] ?? SYSTEMS.custom;
```

**Custom plugin** je zvláštní — používá `world.customDiarySchema` jako runtime config; DiaryOverlay vyrenderuje bloky podle něj (port `CustomDiaryBuilder` logic).

**Bonus:** Stejný registry se hodí v krocích 8 (postavy / NPC) — `Character` stránka taky volá `plugin.DiaryOverlay`. **DRY napříč FE.**

---

### 23.3 Render-texture fog + parallel hex log

**Princip:** Vizuální vrstva mlhy = PixiJS render-texture (smooth brush), perzistovaný stav = `revealedHexes` array (audit, deltas, sync).

**Render side (klient PixiJS):**
```
fogTexture: RenderTexture (canvas-size, alpha channel)
   ├─ init: fill alpha=1 (vše zamlženo)
   ├─ při fog operaci → render brush stroke do textury (alpha=0 na reveal)
   └─ aplikuje na fog sprite jako alpha mask

PC tokens: kruh radius 1 hex kolem každého PC → před aplikací mask
           kreslen do té samé textury jako "always-visible"
```

**Persistence (server `revealedHexes`):**
- Hex-level reveal: PJ brush stroke → klient spočítá `coveredHexes` (hexy, kterých se brush dotkl) → `op: { type: 'fog.brush', mode, hexes }`
- Tj. DB stále drží hex array (sekce 19.2 zachováno), texture je jen render side cache

**Soft light kolem PC (bonus feature, Matrix neměl):**
- Volitelně PJ zapne "soft fog" — kruh kolem PC tokenu se odhalí postupně (alpha gradient, ne binary)
- Implementace: dual texture — `revealedTexture` (PJ paint) + `vibilityTexture` (auto-generated z PC token positions s gradient radial)
- Final fog = `min(revealedTexture, visibilityTexture)`

**WS broadcast strategie:**
- Brush stroke → klient throttle 10 Hz → koalesce hex set → emit `op: fog.brush` s batch
- Server $addToSet / $pullAll (set semantika — duplicates ignored)

**Otevřené:**
- **Brush stroke smooth**: interpolovat mezi 2 mouse pointmi (Bressenham linka)? Ano, ale jak často přepočítávat hex coverage?
- **Bitmap export/import**: pro export scény "do tisku" PJ chce rastr → render texture → toDataURL. Funguje out-of-box.

---

### 23.4 Combat tracker (skutečný, ne jen `initiative: number`)

**Princip:** Iniciativa je dnes prostá řadicí hodnota. Skutečný VTT potřebuje **turn state machine** se zarámovaným bojem.

**Datový model — `MapScene.combat` subdoc:**
```ts
combat?: {
  isActive: boolean;
  round: number;                                  // 1-based
  currentTokenId: string | null;                  // token, který je na řadě
  order: string[];                                // tokenIds v pořadí (snapshot iniciativy)
  endOfTurnEffects: {
    id: string;
    tokenId: string;
    label: string;                                // "Hořící: 1d6 dmg/tah"
    damageFormula?: string;                       // "1d6"
    damageType?: string;                          // "fire" — info-only
    roundsRemaining: number;                      // dec při end of token's turn
    triggeredAt: 'start-of-turn' | 'end-of-turn';
  }[];
  startedAt?: Date;
  startedByUserId?: string;
}
```

**State machine:**
```
[idle] ──"Začít boj"──> [active, round=1, currentIdx=0]
   ↑                          │
   │                          ↓
   │                  "Další tah" ──> currentIdx++
   │                          │       (po posledním → round++, currentIdx=0)
   │                          │
   │                          ↓
   │              tick endOfTurnEffects pro currentToken
   │                          │
   │                          ↓
   "Ukončit boj" ←────────────┘
```

**Operations:**
- `combat.start { orderTokenIds }` — snapshot z `initiative` desc sort, server validace (musí být tokeny na mapě)
- `combat.turn {}` (next) nebo `{ tokenId }` (jump) — inkrementuje, broadcastne, ticks effects
- `combat.end {}` — reset combat, ponechá `initiative` na tokenech
- `combat.effect.add { tokenId, ... }` — přidá efekt
- `combat.effect.tick { effectId }` — interní (server auto-ticks)
- `combat.effect.remove { effectId }` — manual

**UI feedback:**
- Aktivní token = glow pulse na canvasu (PixiJS shader/filter)
- Iniciativa tabulka v toolbaru: aktivní řádek inverzní barva
- "Další tah" tlačítko = velký primární CTA v PJ panelu (a klávesa Mezera)
- End-of-turn effects = banner top center "Hořící: Lo3 utrpí 4 dmg" (auto-roll když `damageFormula` set)

**Open:**
- **Hráč ovládá svůj tah, nebo PJ klikne "Další" za všechny?** Druhé snazší; první lepší pro tempo. Asi PJ defaultně, ale hráč si může taky "dokončit svůj tah" tlačítkem.
- **Automatický damage apply z end-of-turn effects?** Vyžaduje rozhodnout combatModel (DrD2 injury vs raw HP).

---

### 23.5 A* měření vzdálenosti (respekt překážek)

**Princip:** Místo prosté Manhattan-hex distance měření přes A* pathfinding, který respektuje `barrier` efekty.

**Hex distance vzorec (přímá):**
```ts
hexDistance(a: HexCoord, b: HexCoord): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
```

**A* implementace (klient-side):**
- Nodes: hexy
- Neighbors: `getHexNeighbor(...)` z `HexUtils`
- Cost: 1 per hex (bariéra = blocked, ne walkable)
- Heuristic: hex distance
- Knihovna: vlastní 60 řádků, ne závislost

**UI flow:**
1. PJ stiskne `shift` + mouse hover na hex → ukazuje vzdálenost od currently-selected token
2. PJ shift+drag → real-time path zobrazení (chain hexů s glow border)
3. Tooltip: "Vzdálenost: 7 hexů (přímo: 4, přes bariéru DC 12)"
4. Volitelně: PJ klikne "Změřit" tool → 2 hexy → trvale zobrazí lajnu+číslo do dalšího klikéntí

**Otevřené:**
- **Diagonální barrier traversal**: barrier blokuje samotné hexy, ale co diagonální přechod mezi 2 hexy oddělenými barrier hexem? Default: blokuje. Hra-systém specific?
- **Movement range overlay**: bonus feature — pro selected token zobrazí oblast dosažitelnou v 1 kole (movement hexů). Visual flood fill.

---

### 23.6 Sprite atlas endpoint

**Princip:** Místo N image requests = jeden kombinovaný PNG s JSON koordinátami; PixiJS `Spritesheet.from()` přímo konzumuje.

**BE endpoint:**
```
GET /maps/:id/sprite-atlas
   Response:
     - PNG (kombinovaný portrait atlas, ~2048×2048 sufficient pro ~100 tokenů á 200×200)
     - X-Spritesheet-Frames: JSON s frames mapou (Content-Disposition header nebo paralelní endpoint)

   ALTERNATIVA: /maps/:id/sprite-atlas.json + /maps/:id/sprite-atlas.png
```

**Server-side generování (NestJS service):**
1. Načti scénu, kolektuj distinct portrait URLs (PC charactery + NPC templates)
2. Stahuj zdrojové obrázky (with retry, fallback placeholder)
3. Resize na uniformní 200×200 (sharp / jimp)
4. Pack do PNG (knihovna `maxrects-packer` nebo manuální grid pack)
5. Generuj JSON s frames mapou
6. **Cache invalidace**: hash zdrojových URLs → cache key; invaliduj při `token.add/.remove` nebo `npcTemplate.update`

**Atlas struktura:**
```json
{
  "frames": {
    "char_lo3": { "frame": { "x": 0, "y": 0, "w": 200, "h": 200 } },
    "npc_goblin": { "frame": { "x": 200, "y": 0, "w": 200, "h": 200 } }
  },
  "meta": { "image": "sprite-atlas.png", "size": { "w": 2048, "h": 2048 } }
}
```

**Klient-side PixiJS:**
```ts
const atlas = await Assets.load(`/maps/${sceneId}/sprite-atlas.json`);
// atlas.textures['char_lo3'] → ready PixiJS texture
```

**Edge cases:**
- Fallback per-token GET když atlas selže (degraded mode)
- Hot-reload při WS `op: token.add` → invalidate atlas, refetch (alebo append jen nový sprite — pokročilejší)

**Open:**
- **Atlas update strategy on token.add:** full regenerate (jednoduchá, větší latency) vs incremental append (rychlá, složitější)?
- **Per-world cache nebo per-scene?** Globální atlas všech NPC v worldu = lepší kompozice, ale větší soubor.

---

### 23.7 Undo / Redo (PJ-only, per-session)

**Princip:** Operations API (23.1) ukládá `inverse` op pro každou mutaci → undo = aplikuj inverzní op. PJ má lokální stack, Ctrl+Z / Ctrl+Y.

**Inverzní páry:**
| Op | Inverse |
|---|---|
| `token.add { token }` | `token.remove { tokenId }` |
| `token.move { tokenId, q, r }` | `token.move { tokenId, oldQ, oldR }` |
| `token.remove { tokenId }` | `token.add { snapshotToken }` (kompletní snapshot stavu) |
| `token.update { tokenId, patch }` | `token.update { tokenId, oldPatch }` |
| `effect.add { effect }` | `effect.remove { effectId }` |
| `effect.remove { effectId }` | `effect.add { snapshotEffect }` |
| `fog.brush { mode: 'reveal', hexes }` | `fog.brush { mode: 'fog', hexes }` (inverze módu) |
| `combat.start { order }` | `combat.end {}` (po restart se order ztratí) |
| `scene.state { isHidden: true }` | `scene.state { isHidden: false }` |

**Server zaznamenává `inverse`** spolu s každou operací (computed v aplikační vrstvě), pak při undo:
```
PJ stiskne Ctrl+Z → klient: GET /maps/:id/operations?last=20&byUserId=me
                           pop poslední → POST /maps/:id/operations s op.inverse
                           server aplikuje → broadcast → ostatní vidí undo
```

**Stack management:**
- Limit 20 ops (lokálně), per PJ session
- Redo stack: undo'd ops jdou tam; nová akce = clear redo stack
- Vizuální feedback: "Vráceno: Lo3 přesunut z (2,3) na (4,1)" toast

**Permissions:**
- Jen PJ + Admin/Sa
- **Hráč NEUNDO-uje** — predictable hra (jinak by hráč mohl undo na špatný hod)
- Hráčův pohyb se počítá do PJ undo stacku (PJ může vrátit i hráčovu chybu)

**Open:**
- **Multi-PJ session**: pokud 2 PJ pracují, mají separátní stacky? Asi ano (per user).
- **Conflict při undo**: PJ chce undo "přidání tokenu", ale ten token mezitím někdo pohnul. Stačí ignorovat (token už neexistuje na původní pozici) nebo varovat?

---

### 23.8 Theming via world CSS vars

**Princip:** Per [feedback_theme_isolation](../.claude/...): všechny mapové barvy čerpají z `[data-theme="<worldSkinId>"]` scoped CSS variables. Žádné hardcoded barvy v PixiJS / SCSS.

**Navrhované CSS vars (namespace `--map-*`):**

| Var | Účel | Default (skin "ikaros") |
|---|---|---|
| `--map-canvas-bg` | Pozadí plátna (mimo image) | `#0a0814` |
| `--map-grid-stroke` | Linka hex gridu | `rgba(180, 120, 255, 0.3)` |
| `--map-grid-stroke-width` | Tloušťka linky | `1px` |
| `--map-token-ring-default` | Border kolem tokenu | `#3a3550` |
| `--map-token-ring-selected` | Border kolem selected tokenu | `#b48cff` |
| `--map-token-ring-active-turn` | Glow kolem tokenu na řadě (combat) | `#ffd700` |
| `--map-token-hp-bar-bg` | HP bar pozadí | `rgba(0,0,0,0.5)` |
| `--map-fog-pj-fill` | Mlha pro PJ (semi) | `rgba(70,75,95,0.16)` |
| `--map-fog-player-fill` | Mlha pro hráče (opaque) | `rgba(170,180,200,0.94)` |
| `--map-effect-color-default` | Default barevný efekt | `rgba(180,120,255,0.35)` |
| `--map-effect-barrier-fill` | Bariéra fill | `rgba(255,220,40,0.35)` |
| `--map-effect-barrier-glow` | Bariéra glow | `rgba(255,210,0,0.8)` |
| `--map-effect-fire-base` | Oheň základní barva | `#ff4444` |
| `--map-effect-gas-base` | Plyn | `#22cc44` |
| `--map-effect-smoke-base` | Kouř | `#aaaaaa` |
| `--map-ping-color` | Ping animace | `var(--primary)` |
| `--map-toolbar-bg` | Toolbar pozadí | inherit ze světa |
| `--map-toolbar-text` | Toolbar text | inherit |

**Načítání v PixiJS:**
PixiJS nemá CSS var support nativně; klient:
```ts
const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const colors = {
  canvasBg: cssVar('--map-canvas-bg'),
  gridStroke: cssVar('--map-grid-stroke'),
};

// při změně skinu (MutationObserver na data-theme nebo custom event):
window.addEventListener('skin-changed', () => { /* re-load colors + redraw */ });
```

**Skin packs:**
- Skin "ikaros" (fialové synthwave, default) — viz tabulka výše
- Skin "fantasy" (pergamen, perokresba) — grid jako tenké hnědé linky, fog jako mléčný opar
- Skin "scifi" (terminal green) — neonové linky, čistý tmavý pozadí
- PJ může customize skin v world settings

**Open:**
- **Theme-aware sprite atlas?** Ne, sprite atlas je portraitů, agnostický k tématu.
- **Per-effect skin variants:** "fire" v ikaros = ohňové cyber-flame, "fire" v fantasy = realistický plamen. Ano, ale defer post-MVP — palette swap stačí.

---

### 23.9 Souhrnný dopad těchto 8 principů na §20 mapping

| 10.2 podkrok | Dotčené principy | Důsledek |
|---|---|---|
| **10.2a** Rendering jádro | 23.8 (theming) | PixiJS čte CSS vars; init colors loader |
| **10.2b** Hex mřížka | 23.8 | Grid stroke z `--map-grid-stroke` |
| **10.2c** Scény | 23.1 (operations), 23.7 (undo) | Místo PUT scene → `op: scene.image` / `scene.config` |
| **10.2d** Tokeny | 23.1, 23.2 (plugin), 23.6 (atlas), 23.7 | Token ops přes `op:`, atlas endpoint, PixiJS Spritesheet |
| **10.2e** Staty tokenu | 23.1, 23.2 | `token.update` op; `plugin.deriveCombatState` |
| **10.2f** Iniciativa | 23.4 (combat tracker) | Plnohodnotný `combat` subdoc, ne jen number |
| **10.2g** Efekty | 23.1, 23.7, 23.8 | `effect.add/.remove` ops; theming variants |
| **10.2h** Fog of war | 23.1, 23.3 (render-texture) | `fog.brush` op + render-texture cache |
| **10.2i** Real-time sync | 23.1 (centrální!) | Operations API NAHRAZUJE separátní `move-token` PATCH + WS relay |
| **10.2j** Kostky | 23.2 (plugin.rollSkill) | Dice engine 6.3 + per-system rolls |
| **10.2k** Zvuky | 23.1 | `sound.playlist` op |
| **10.2l** Deníky na mapě | 23.2 (plugin.DiaryOverlay) | Per-system overlays z registry |
| **10.2m** Nástroje + oprávnění | 23.5 (A* measure), 23.7 (undo UI), 23.1 (centralizovaný role check) | Vše zapadá |

---

## 22 REVIZE. Doporučené pořadí prací uvnitř 10.2 (po §23)

S potvrzenými architektonickými principy se mění **pořadí prací** — některé refaktoringy musí proběhnout **PŘED** klasickými podkroky.

```
┌── PŘÍPRAVNÁ FÁZE (před 10.2a) — ✅ HOTOVO 2026-05-27 ───────────┐
│                                                                  │
│  ✅ 10.2-prep-1: BE Operations API + event log (23.1)            │
│     mapOperations/worldOperations kolekce, 21 per-scene + 3      │
│     cross-scene op typů, atomic Mongo, JWT WS auth, cascade      │
│     token.remove při scene přechodu. 11 commitů, 57 testů.       │
│                                                                  │
│  ✅ 10.2-prep-2: BE atomic legacy fix                            │
│     MapsService.moveToken/removeToken na $-positional / $pull    │
│     místo full repo.replace. Deprecated PATCH endpointy           │
│     race-safe. Commit 673ddb21.                                  │
│                                                                  │
│  ✅ 10.2-prep-3: FE Per-system plugin registry (23.2)            │
│     src/features/world/map-systems/ — types, plugins,            │
│     registry, 13 plugin stubů, getMapSystemPlugin resolver       │
│     s aliasy zarovnanými na diary-systems. 10 testů.             │
│     Commit 2df409c.                                              │
│                                                                  │
│  ✅ 10.2-prep-4: FE Theming CSS vars (23.8)                      │
│     src/themes/_shared/map-tokens.css — 17 --map-* proměnných    │
│     v :root, defaults pro skin ikaros. PixiJS čte přes           │
│     getComputedStyle v 10.2a. Commit 943d8cd.                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌── IMPL FÁZE — 13 podkroků s integrovanými principy ─────────────┐
│                                                                  │
│  10.2a Rendering jádro                                           │
│     │                                                            │
│     ├─→ 10.2b Hex mřížka                                         │
│     │                                                            │
│     ├─→ 10.2c Scény (přes op: scene.*)                           │
│     │                                                            │
│     ├─→ 10.2d Tokeny (op: token.*, sprite atlas 23.6)            │
│     │       │                                                    │
│     │       ├─→ 10.2e Staty (op: token.update, plugin combat)    │
│     │       │                                                    │
│     │       └─→ 10.2f Iniciativa + Combat tracker (23.4)         │
│     │                                                            │
│     ├─→ 10.2g Efekty (op: effect.*)                              │
│     │                                                            │
│     ├─→ 10.2h Fog (op: fog.*, render-texture 23.3)               │
│     │                                                            │
│     ├─→ 10.2i WS sync = THIN LAYER (jen routing op events)       │
│     │        + reconnect catch-up via /operations?since=N        │
│     │                                                            │
│     ├─→ 10.2j Kostky (plugin.rollSkill + map:dice-rolled stays)  │
│     │                                                            │
│     ├─→ 10.2k Zvuky (op: sound.playlist; stub do 13.3)           │
│     │                                                            │
│     ├─→ 10.2l Deníky (plugin.DiaryOverlay)                       │
│     │                                                            │
│     └─→ 10.2m Měření (23.5 A*) + Undo UI (23.7) + a11y/mobile    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌── POST-MVP (defer) ─────────────────────────────────────────────┐
│   - History/replay UI (23.1)                                     │
│   - Soft light kolem PC (23.3)                                   │
│   - Movement range overlay (23.5)                                │
│   - Skin-specific effect variants (23.8)                         │
│   - Multi-PJ CRDT (post-23.1 follow-up)                          │
└──────────────────────────────────────────────────────────────────┘
```

**MVP milníky (revize):**

| Milník | Po krocích | Funkce |
|---|---|---|
| **MVP 0** | 10.2-prep-1..4 | BE refaktor + FE infra (žádné UI změny ještě, ale architektura ready) |
| **MVP 1** | 10.2a–d | PixiJS canvas, hex grid, tokeny lze hýbat (PJ single-client + sprite atlas) |
| **MVP 2** | 10.2e–h | HP/iniciativa+combat tracker/efekty/fog. Všechny PJ tooly. |
| **MVP 3** | 10.2i | Multi-client realtime přes operations + catch-up; role gate works server-side |
| **MVP 4** | 10.2j–l | Kostky (reuse 6.3), zvuky (stub), deníky per-system |
| **Release** | 10.2m | Měření A*, undo UI, mobil polish, nápověda |

Každý milník je vlastní spec-driven cyklus dle `feedback_workflow`.

---

> 📝 **Tento dokument je aktivní reference.** Když najdeš v Matrixu něco, co tu chybí nebo se v Ikarosu zachovává jinak, doplň ho. Lépe ho vést jako živý dokument, než rozplýtat informace do skipnutých commitů.
