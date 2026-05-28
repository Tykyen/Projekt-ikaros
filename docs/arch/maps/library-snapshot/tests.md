# Testy

## Jednotkové (BE)

### `MapTemplatesRepository`

- `findByOwner(userId)` — vrací jen šablony s `ownerId === userId`, sort `updatedAt desc`
- `findAll()` — vrací vše (pro Admin+)
- `create(payload)` — vrací s `id`, `createdAt`, `updatedAt`
- `replace(id, payload)` — `updatedAt` se mění, `createdAt` se NE-mění, `ownerId` se NE-mění (i kdyby byl v payloadu)

### `MapTemplatesController`

| Test | Setup | Akce | Expect |
|---|---|---|---|
| List jako Admin | 5 šablon, 3 vlastníků | `GET /map-templates` | 200, 5 položek |
| List jako PJ | 5 šablon, ownerId=self → 2, ostatní 3 | `GET /map-templates` | 200, 2 položky |
| Detail vlastní šablony | ownerId=self | `GET /map-templates/:id` | 200, full data |
| Detail cizí šablony jako PJ | ownerId=other | `GET /map-templates/:id` | 403 `MAP_TEMPLATE_FORBIDDEN_OWNER` |
| Detail cizí jako Admin | ownerId=other | `GET /map-templates/:id` | 200 |
| Create — PJ | role=PJ, dto OK | `POST /map-templates` | 201, `ownerId === user.id` |
| Create — Hráč | role=Hráč | `POST /map-templates` | 403 `MAP_TEMPLATE_FORBIDDEN` |
| Create bez `name` | dto bez `name` | `POST` | 400 `MAP_TEMPLATE_INVALID` |
| Create s PC tokenem | dto.tokens obsahuje `{isNpc: false}` | `POST` | 201, ale uložený dokument má `tokens.filter(isNpc) === [pouze NPC]` |
| Update vlastní | ownerId=self | `PUT /map-templates/:id` | 204 |
| Update cizí jako PJ | ownerId=other | `PUT /map-templates/:id` | 403 |
| Update — pokus změnit `ownerId` | dto.ownerId='cizí' | `PUT /map-templates/:id` | 204, ale DB záznam má původní `ownerId` |
| Delete vlastní | ownerId=self | `DELETE /map-templates/:id` | 204 |
| Delete cizí jako PJ | ownerId=other | `DELETE /map-templates/:id` | 403 |

### Migrační skript

- 3 šablony bez `ownerId` + 2 s `ownerId` → spusť skript → updatemany affected 3, 2 nezměněné
- Tyky user neexistuje → skript hodí error, žádná změna v DB
- Tyky existuje → 3 dokumenty mají `ownerId: tykyId`, `createdAt`, `updatedAt`
- Idempotence: druhé spuštění → 0 affected

## Integrační (BE)

### Roundtrip save → load

1. PJ vytvoří scénu s: pozadí, 3 NPC tokeny, 2 efekty, fog s 5 revealed hexes, 1 sound
2. `POST /map-templates` → 201, template ID
3. PJ vytvoří novou prázdnou scénu B
4. Pro každou op v load sekvenci (image, config, fog.replace, effects.replace, npc-templates.replace, tokens.replace-npc, sounds.set) → `POST /maps/:b/operations`
5. `GET /maps/:b` → scéna B má identický state se scénou A (až na PC tokeny, které jsou prázdné)

### Cross-world přenos

1. PJ ve světě X uloží šablonu
2. PJ ve světě Y (jiný world) loadne šablonu
3. Scéna ve světě Y má identický state — kromě PC tokenů, ovšem žádné PC tokeny nebyly v šabloně, takže OK

### Save ignoruje PC tokeny i pokud klient pošle

- Klient (test setup) pošle `tokens: [{isNpc: true, ...}, {isNpc: false, characterId: 'leak'}]`
- Server uloží jen 1 token (`isNpc: true`)

## FE komponenty

### `MapLibraryModal` (rozšířené save)

- Klik "+ Uložit" s neprázdnou scénou (NPC + efekty + fog) → POST body obsahuje všechna pole, ne prázdné
- Klik "+ Uložit" se scénou bez `imageUrl` → button disabled (existující behavior)
- Save success → query invalidated, list refreshed

### `MapLibraryModal` (load s confirm)

- Klik "Načíst" → confirm dialog se zobrazí
- Cancel → žádné API volání
- Confirm → 7 sekvenčních `postMapOperation` volání, `mapSceneQueryKey` invalidated, modal zavřen
- Pokud n-tá op selže (mock chybu) → toast zobrazí, předchozí ops zůstanou aplikované (částečný load, viz `ai-notes.md`)

### Confirm dialog

- Použít `ConfirmModal` ze shared/ui (pokud existuje), ne `window.confirm`
- Text "Tohle přepíše aktuální scénu, vše současné se ztratí."

## E2E

1. **Roundtrip mid-session pauza:**
   - PJ má rozjetou scénu s 5 NPC, fog, 3 efekty
   - Uloží šablonu "PauseA"
   - Editem scény smaže všechny NPC + efekty (simulace "vyčistím to pro klid")
   - Otevře knihovnu → klik "Načíst" na "PauseA" → confirm
   - Scéna se obnoví na původní state s 5 NPC, fog, efekty
2. **Cross-world přenos:**
   - PJ ve světě X uloží šablonu "DungeonA"
   - PJ přejde do světa Y, vytvoří novou prázdnou scénu
   - Otevře knihovnu → "DungeonA" v listu (visibility cross-world ✓)
   - Načte → scéna ve světě Y má identický obsah
3. **Per-PJ filter:**
   - PJ_A vidí 2 svoje šablony, PJ_B vidí 3 svoje šablony, navzájem se nevidí
4. **Admin override:**
   - Admin přihlášený do knihovny vidí všechny šablony (5)

## Co se NETESTUJE

- Performance s 1000+ šablonami v knihovně — nereálné.
- Atomicita full load sekvence — viz `ai-notes.md`, akceptujeme částečný stav při fail.
- Versioning šablon — mimo rozsah.
