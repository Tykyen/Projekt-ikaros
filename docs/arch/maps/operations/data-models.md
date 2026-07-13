# Datové modely

## `MapOperation`

Append-only záznam jedné mutace scény. Žije v kolekci `mapOperations`.

### Pole

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| `_id` | ObjectId | ano | Mongo ID |
| `sceneId` | string | ano | ID scény (FK na `mapScenes._id`) |
| `worldId` | string | ano | ID světa (denormalizováno pro per-world TTL / audit; konzistentní s `scene.worldId`) |
| `seqNumber` | number | ano | Monotonic per scéna, 1-based. Allocated atomic přes `MapScene.lastSeqNumber += 1`. |
| `op` | `OperationPayload` | ano | Discriminated union — `{ type, ...args }` per typ (viz níže) |
| `inverse` | `OperationPayload \| null` | ne | Inverzní operace pro undo. Pokud `null`, op nelze undo (např. dice rolls). Computed serverem při aplikaci. |
| `byUserId` | string | ano | User ID iniciátora |
| `byUserRole` | `WorldRole` | ano | Snapshot role v okamžiku aplikace (`Player`, `PJ`, `Admin`, `Sa`) |
| `appliedAt` | Date | ano | UTC timestamp aplikace |

### Indexy

```
{ sceneId: 1, seqNumber: 1 }           — primární; catch-up query
{ sceneId: 1, byUserId: 1, seqNumber: -1 } — undo lookup ("moje poslední ops")
{ appliedAt: 1 } TTL=2592000s          — auto-delete > 30 dní
```

### Invarianty

- `seqNumber` per `sceneId` je striktně monotonic, bez mezer (allocated přes `$inc` na `MapScene.lastSeqNumber`).
- `op.type` musí být one-of dovolených typů (viz katalog níže).
- `inverse` typ je vždy z té samé množiny `op.type`.
- `appliedAt` ≥ `MapScene.lastModified` v okamžiku insertu (event followuje DB state).

---

## `MapScene` — doplnění polí

Stávající schema `MapSceneSchemaClass` se rozšíří o:

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| `lastSeqNumber` | number | ano | Default 0. Atomic `$inc` při každé operaci nad touto scénou. |

### Poznámky

- Migrace: existující scény dostanou `lastSeqNumber = 0`.
- `lastSeqNumber` se NIKDY nedekrementuje. Undo nevyrobí nový `seqNumber`, nepřepisuje historii.
- Race-safety: `findOneAndUpdate({_id}, {$inc: {lastSeqNumber: 1}}, {new: true})` v jednom atomic kroku, hodnota se použije jako `seqNumber` nové op.

### `isActive` — uvolněná semantika

**Stávající model:** max jedna `isActive: true` per `worldId`, `setActive` deaktivuje sourozence.

**Nový model:** víc scén může být `isActive: true` paralelně. `setActive` jen flipne flag bez deactivate sourozenců. Důvod: hráči jsou rozprostřeni napříč scénami přes `WorldMembership.currentSceneId` (viz níže), víc běžících scén je vlastnost, ne edge case.

PJ orchestrator pohled: `GET /maps?worldId=&isActive=true` vrací list všech aktuálně aktivních scén, ne jednu.

---

## `WorldMembership` — doplnění pole `currentSceneId`

Stávající `WorldMembershipSchemaClass` se rozšíří o:

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| `currentSceneId` | string \| null | ne | ID scény, na které hráč aktuálně je. `null`/absent = hráč není přiřazený nikam. |

### Poznámky

- Persistentní napříč session — hráč se vrací na stejnou scénu při příštím přihlášení.
- Nastavuje se výhradně přes `member.*` ops (viz katalog níže) — PJ-only.
- Migrace: existující membership dokumenty bez `currentSceneId` = treated as `null`.
- Single scene per player (jeden field). Multi-scene paralelně pro 1 hráče není v MVP.
- Indexy: stávající `{userId: 1, worldId: 1}` (unique) postačuje; dodatečně přidat `{worldId: 1, currentSceneId: 1}` pro PJ orchestrator query "kdo je na scéně X".

---

## `World` (resp. `WorldSchemaClass`) — doplnění `lastSeqNumber`

Pro cross-scene operations log:

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| `lastSeqNumber` | number | ano | Default 0. Atomic `$inc` při každé `WorldOperation` nad tímto světem. |

### Poznámky

- Per-world counter pro `worldOperations` log (oddělený od `MapScene.lastSeqNumber` pro per-scene log).
- Identická race-safety logika jako u scény.

---

## `WorldOperation` — nová kolekce `worldOperations`

Append-only záznam jedné cross-scene mutace ve světě (assignment, …). Paralelní k `MapOperation`, ale per-world ne per-scene.

### Pole

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| `_id` | ObjectId | ano | Mongo ID |
| `worldId` | string | ano | ID světa (FK na `worlds._id`) |
| `seqNumber` | number | ano | Monotonic per world (z `World.lastSeqNumber`) |
| `op` | `WorldOperationPayload` | ano | Discriminated union — `{type, ...args}` |
| `inverse` | `WorldOperationPayload \| null` | ne | Inverzní operace pro undo |
| `byUserId` | string | ano | User ID iniciátora (PJ) |
| `byUserRole` | `WorldRole` | ano | Snapshot role |
| `appliedAt` | Date | ano | UTC timestamp |
| `cascadeMapOpIds` | ObjectId[] | ne | IDs `MapOperation` dokumentů vytvořených jako side-effect (např. `token.remove` cascade při `member.assignToScene`) — pro audit a cross-log undo |

### Indexy

```
{ worldId: 1, seqNumber: 1 }              — primární; catch-up query
{ worldId: 1, byUserId: 1, seqNumber: -1 } — undo lookup
{ appliedAt: 1 } TTL=2592000s             — auto-delete > 30 dní
```

### Invarianty

- Stejné jako `MapOperation`, jen scope per-world místo per-scene.
- `cascadeMapOpIds` (pokud non-empty) reference jen `MapOperation` se `worldId === this.worldId`.

---

## `OperationPayload` — discriminated union per `type`

Každá operace je objekt `{ type: '...', ...args }`. Server validuje args per `type` (class-validator nebo runtime guard).

### Token operace

| Typ | Args | Mongo update | Inverse |
|---|---|---|---|
| `token.add` | `{ token: MapToken }` | `$push tokens` | `token.remove { tokenId }` |
| `token.move` | `{ tokenId, q, r }` | `tokens.$.q = q, tokens.$.r = r` (positional) | `token.move { tokenId, oldQ, oldR }` (oldQ/oldR computed serverem) |
| `token.remove` | `{ tokenId }` | `$pull tokens` | `token.add { token: <snapshot> }` (kompletní snapshot stavu před removem) |
| `token.update` | `{ tokenId, patch: Partial<MapToken> }` | per field `tokens.$.<field> = value` | `token.update { tokenId, patch: <oldPatch> }` |
| `token.update` (delta) | `{ tokenId, patch: {}, hpDelta?: int, injuryDelta?: int }` | aggregation pipeline: `currentHp = clamp(currentHp + hpDelta, 0, maxHp > 0 ? maxHp : ∞)`, `injury = max(0, injury + injuryDelta)` — atomicky proti aktuální DB hodnotě | `token.update { tokenId, patch: { currentHp: <old> / injury: <old> } }` |

**Delta varianta `token.update` (D-LAUNCH-GAP, fix lost update):** absolutní `patch.currentHp` počítá klient ze stale cache → dva souběžné zásahy čtou stejnou bázi a druhý `$set` první přepíše. `hpDelta`/`injuryDelta` řeší damage/heal server-side: pipeline update počítá novou hodnotu z aktuálního stavu dokumentu (Mongo zápisy na dokument serializuje → všechny souběžné delty se projeví). Pravidla: **jen bestie tokeny** (`templateId` / `characterId` prefix `bestie:`) — HP PC/NPC žije v deníku postavy; `patch` musí být prázdný (delta + absolutní set → 400). Po zápisu server op **normalizuje**: do `patch` doplní výslednou absolutní hodnotu z post-update dokumentu, takže log/broadcast/201 response nesou absolutní stav a klienti bez znalosti delty (FE `applyOperationToScene`) fungují beze změny. Testy: `map-operations.service.spec.ts` (describe D-LAUNCH-GAP) + `test/race/maps-token-hp.race.e2e-spec.ts`.

### Effect operace

| Typ | Args | Mongo update | Inverse |
|---|---|---|---|
| `effect.add` | `{ effect: MapEffect }` | `$push effects` | `effect.remove { effectId }` |
| `effect.remove` | `{ effectId }` | `$pull effects` | `effect.add { effect: <snapshot> }` |
| `effect.update` | `{ effectId, patch: Partial<MapEffect> }` | per field positional | `effect.update { effectId, patch: <oldPatch> }` |

### Fog operace

| Typ | Args | Mongo update | Inverse |
|---|---|---|---|
| `fog.set` | `{ enabled: boolean, revealedHexes: HexCoord[] }` | `$set fogEnabled, $set revealedHexes` | `fog.set { enabled: <old>, revealedHexes: <old> }` |
| `fog.brush` | `{ mode: 'reveal' \| 'fog', hexes: HexCoord[] }` | `mode==reveal`: `$addToSet revealedHexes`; `mode==fog`: `$pullAll revealedHexes` | `fog.brush { mode: <inverse>, hexes: <same> }` |

### Scene state operace

| Typ | Args | Mongo update | Inverse |
|---|---|---|---|
| `scene.state` | `{ isHidden?: boolean, isLocked?: boolean }` | `$set` na zadaná pole | `scene.state { ...<oldValues> }` |
| `scene.config` | `{ config: HexConfig }` | `$set config` | `scene.config { config: <old> }` |
| `scene.image` | `{ imageUrl: string }` | `$set imageUrl` | `scene.image { imageUrl: <old> }` |
| `scene.name` | `{ name: string }` | `$set name` | `scene.name { name: <old> }` |
| `scene.folder` | `{ folder: string \| null }` | `$set folder` | `scene.folder { folder: <old> }` |

### Sound operace

| Typ | Args | Mongo update | Inverse |
|---|---|---|---|
| `sound.playlist` | `{ soundIds: string[] }` | `$set activeSoundIds` | `sound.playlist { soundIds: <old> }` |

### Combat operace

Detailní semantika viz spec `combat` komponenty (10.2f). Zde jen schémata args.

| Typ | Args | Mongo update | Inverse |
|---|---|---|---|
| `combat.start` | `{ orderTokenIds: string[] }` | `$set combat = { isActive: true, round: 1, currentTokenId: orderTokenIds[0], order, endOfTurnEffects: [], startedAt, startedByUserId }` | `combat.end {}` |
| `combat.turn` | `{}` (next) NEBO `{ tokenId }` (jump) | `$set combat.currentTokenId, $inc combat.round` (pokud cyklus) | `combat.turn { tokenId: <prev> }` |
| `combat.end` | `{}` | `$unset combat` | `combat.start { orderTokenIds: <old.order> }` (jen pokud aktivní byl) |
| `combat.effect.add` | `{ tokenId, effect: EndOfTurnEffect }` | `$push combat.endOfTurnEffects` | `combat.effect.remove { effectId }` |
| `combat.effect.remove` | `{ effectId }` | `$pull combat.endOfTurnEffects` | `combat.effect.add { effect: <snapshot> }` |
| `combat.effect.tick` | `{ effectId }` (interní, server-only) | `combat.endOfTurnEffects.$.roundsRemaining -= 1` (auto cleanup při 0) | `null` (interní nelze undo manuálně) |

### NPC template operace

| Typ | Args | Mongo update | Inverse |
|---|---|---|---|
| `npcTemplate.add` | `{ template: MapSceneNpc }` | `$push npcTemplates` | `npcTemplate.remove { templateId }` |
| `npcTemplate.remove` | `{ templateId }` | `$pull npcTemplates` + cascade `$pull tokens { templateId }` | `npcTemplate.add { template: <snapshot> }` + multi `token.add` per smazaný token (server vyrobí jako kompozit — viz Poznámky) |
| `npcTemplate.update` | `{ templateId, patch: Partial<MapSceneNpc> }` | per field positional | `npcTemplate.update { templateId, patch: <old> }` |

---

## `WorldOperationPayload` — discriminated union (cross-scene)

Operace logované do `worldOperations` (ne `mapOperations`). Všechny ovlivňují `WorldMembership` nebo cross-scene state.

### Member assignment operace (PJ-only)

| Typ | Args | Mongo update | Inverse | Cascade |
|---|---|---|---|---|
| `member.assignToScene` | `{ userId, sceneId }` | `$set worldmemberships.currentSceneId = sceneId` (filter `{userId, worldId}`) | `member.assignToScene { userId, sceneId: <old> }` nebo `member.unassign { userId }` pokud old byl null | **Auto `token.remove`** na staré scéně, pokud hráč tam měl token (`tokens.find(t => t.characterId === userId && !t.isNpc)`). Token na nové scéně se NEcreate-uje automaticky — PJ ho placne přes `token.add`. |
| `member.unassign` | `{ userId }` | `$unset worldmemberships.currentSceneId` | `member.assignToScene { userId, sceneId: <old> }` | Auto `token.remove` na předchozí scéně (jako výše) |
| `member.bulkAssignToScene` | `{ userIds: string[], sceneId }` | bulkWrite `$set` for each membership | array per-member inverse ops | Per userId stejný cascade jako single assign |

### Poznámky k `member.*` ops

**Token cascade flow:**
1. Server resolvne `oldSceneId = membership.currentSceneId`.
2. Server **vytvoří `MapOperation`** typu `token.remove` v `mapOperations` se `sceneId = oldSceneId` (pokud `oldSceneId` byla set a hráč tam měl token). Tato cascade op má vlastní `seqNumber` v rámci staré scény, vlastní inverse `token.add { token: <snapshot> }`, vlastní broadcast `map:operation` do room `oldSceneId`.
3. Server **vytvoří `WorldOperation`** typu `member.assignToScene` v `worldOperations` se `worldId`. Pole `cascadeMapOpIds` referencuje ID cascade `MapOperation` (krok 2).
4. Server emituje `map:member-left { sceneId: oldSceneId, userId }` na room `oldSceneId`.
5. Server emituje `map:member-joined { sceneId: newSceneId, userId, characterName }` na room `newSceneId`.
6. Server emituje **private** `map:reassigned { newSceneId }` na affected hráčovu socket connection (jeho client autoload).
7. Server emituje `world:operation { worldId, seqNumber, op, byUserId, appliedAt, cascadeMapOpIds }` na room `world:{worldId}` — pro PJ orchestrator panel.

**Pořadí side-effects je důležité:** DB writes first (atomic kde to jde), pak broadcasts. Pokud DB selže po prvním kroku, rollback... viz `tests.md` open questions.

**`member.bulkAssignToScene` jako 1 op vs N ops:**
- Doporučení MVP: **1 op s pole userIds**, atomic bulkWrite, cascade vyrobí N `token.remove` ops do `mapOperations` (jeden per affected scene).
- Důvod: PJ akce "přesun celé skupiny" = 1 logical event v audit logu, atomic v Mongo.

**Undo `member.bulkAssignToScene`:**
- Inverse je `member.bulkAssignToScene` s reverse mapou per-user předchozího sceneId (může to být mix — někteří byli unassigned, jiní na různých scénách).
- Implementačně: inverse držet jako pole jednotlivých `member.assignToScene` ops + special flag „kompozitní undo" — TBD v impl plánu.

### Poznámky

- **`null` inverse** = operaci nelze undo (např. interní `combat.effect.tick`). Klient v UI nezobrazí undo tlačítko pro tyto ops.
- **Kompozitní operace** (např. `npcTemplate.remove` cascade na tokeny): pro undo se serverem zaznamená 1 záznam s `inverse` jako pole jednotlivých ops? **Open question** — řeší se v impl plánu.
- **Sequence allocation atomicity:** `findOneAndUpdate({_id: sceneId}, {$inc: {lastSeqNumber: 1}}, {new: true})` vrací nový dokument; `lastSeqNumber` v něm je hodnota nové op. Insert `mapOperations` doc poté se stejnou hodnotou. Mongo nepodporuje cross-collection atomic, ale pořadí (counter inc → log insert) zajišťuje, že `seqNumber` v logu je vždy ≤ `lastSeqNumber` ve scéně, a žádné dva inserts nepoužijí stejnou hodnotu.
- **Když log insert selže po counter inc:** v `mapOperations` vznikne mezera v `seqNumber`. Catch-up klient ji detekuje (gap v sequence) — v MVP ignoruje (vrátí ops co dorazily). Recovery strategy = manual ops; defer.
