# Návrh: Krok 7a — Characters RPG rozšíření

## Přehled

Rozšíření existujícího Character modulu (Krok 6) o plný systém deníků postav. Deník je složen z bloků definovaných PJ — buď z world template (`diarySchema` na WorldSettings), nebo additivně per-postava (`extraBlocks`). Backend ukládá schéma i data jako volný JSON; validace a rendering jsou zodpovědností frontendu.

---

## Datový model

### WorldSettings — nové pole

```typescript
diarySchema: SchemaBlock[]   // world template; výchozí schema pro všechny postavy světa
```

### SchemaBlock (volný JSON, backend neinterpretuje)

```typescript
interface SchemaBlock {
  key:     string    // unikátní identifikátor bloku (frontend keying)
  label:   string    // zobrazovaný název (PJ si napíše sám)
  type:    string    // "text" | "number" | "textarea" | "tagvalue" | "contacts" | cokoliv
  config?: Record<string, unknown>  // volitelná konfigurace (min/max, placeholder...)
  order:   number    // pořadí v deníku
}
```

### Character schema — nová pole

```typescript
diaryData:   Record<string, unknown>  // hodnoty bloků, klíčováno SchemaBlock.key; merge při PATCH
extraBlocks: SchemaBlock[]            // additivní bloky specifické pro tuto postavu
```

### Co zůstává z Kroku 6

`publicBio`, `publicInfoBlocks`, `privateBio`, `privateInfoBlocks` — zachovány jako fallback pro světy bez `diarySchema`. Frontend rozhoduje co zobrazit.

### Plný deník postavy (frontend logika)

```
plný deník = WorldSettings.diarySchema + Character.extraBlocks
plná data   = Character.diaryData (obsahuje klíče z obou)
```

---

## API endpointy

### Nové endpointy

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/api/worlds/:worldId/characters/players` | JWT, min. Player v světě | Seznam hráčských postav (name + slug) |
| `GET` | `/api/worlds/:worldId/characters/directory` | bez JWT | Veřejný seznam postav (id, slug, name, imageUrl, isNpc) |

### Rozšíření stávajících endpointů

| Metoda | Cesta | Změna |
|--------|-------|-------|
| `PATCH` | `/api/worlds/:worldId/characters/:slug` | přijme `diaryData` (merge) + `extraBlocks` |
| `PUT` | `/api/worlds/:worldId/settings` | přijme `diarySchema: SchemaBlock[]` |

Stávající endpointy (GET all, GET :slug, POST, DELETE, convert) zůstávají beze změny.

---

## GetPlayerCharacters logika

1. Načti Pages kde `worldId = :worldId` AND `type = 0` (hráčské stránky) přes `IPagesRepository`
2. Z jejich slugů sestav povolený set: `{slug}`, `{slug}-denik`, `{slug}-denik-pj`
3. Načti Characters daného světa přes `ICharactersRepository`
4. Vrať jen ty, jejichž slug je v povoleném setu → `PlayerCharacter[]` (name + slug)

Cross-collection dotaz čistě přes repository interfaces — žádná přímá MongoDB agregace.

---

## Access control

### Character CRUD (stávající logika zůstává)

| Operace | Kdo může |
|---------|----------|
| GET všechny / directory | kdokoliv (bez JWT) |
| GET :slug | JWT; PJ/owner → plná data včetně `diaryData`; ostatní → publicView |
| POST / DELETE / convert | JWT; PJ+ nebo Admin |
| PATCH :slug | JWT; PJ+ nebo vlastník postavy |

### Nové endpointy

| Endpoint | Kdo může |
|----------|----------|
| GET /players | JWT; min. WorldRole.Player v daném světě |
| GET /directory | bez JWT |

### diaryData merge při PATCH

- Backend merguje `diaryData` do existujícího (partial update, ne replace celého objektu)
- `extraBlocks` se přepíše celé (frontend posílá kompletní pole)
- Hráč: může upravovat `diaryData` a `extraBlocks` pouze vlastní postavy
- PJ+: může upravovat `diaryData` a `extraBlocks` libovolné postavy ve světě

### WorldSettings diarySchema

- Jen PJ+ může nastavit/upravit `diarySchema`
- Stávající oprávnění PUT /settings zachována

---

## Testování

Unit testy na service vrstvě s mockovanými repositories (vzor z Kroku 6).

### CharactersService — nové testy

- `getPlayerCharacters` — mock Pages vrátí slugy `["aragorn", "frodo"]`, ověř že Characters se filtrují správně (povolené: `aragorn`, `aragorn-denik`, `aragorn-denik-pj`, `frodo`, ...)
- `update` s `diaryData` — ověř merge: existující klíče zachovány, nové přidány, odeslané přepsány
- `update` s `extraBlocks` — ověř replace celého pole

### WorldsService — nové testy

- PUT settings s `diarySchema` — ověř uložení SchemaBlock[] bez transformace

### Co netestujeme

- Validaci obsahu `SchemaBlock` a `diaryData` — frontend zodpovědnost
- GetPlayerCharacters na reálné DB — mock stačí

---

## Závislosti

| Závisí na | Proč |
|-----------|------|
| Krok 6 Characters | rozšiřujeme existující modul |
| Krok 6 Pages | GetPlayerCharacters čte Pages type=0 |
| Krok 6 WorldSettings | přidáváme `diarySchema` do existující struktury |
| Krok 7d RPG Presets | preset může auto-vyplnit `diarySchema` při nastavení světa (7d implementuje, 7a připraví field) |
