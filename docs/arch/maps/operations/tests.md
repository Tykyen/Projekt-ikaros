# Testovací scénáře

## Jednotkové testy

### `OperationPayloadValidator`

- [ ] **Valid `token.move`** — `{type:'token.move', tokenId:'t1', q:0, r:0}` → return as-is
- [ ] **Missing `type`** — `{}` → `MAP_OP_INVALID`
- [ ] **Unknown `type`** — `{type:'token.xyz'}` → `MAP_OP_INVALID`
- [ ] **Missing required arg** — `{type:'token.move', tokenId:'t1'}` (no q,r) → `MAP_OP_INVALID`
- [ ] **Wrong type** — `{type:'token.move', tokenId:'t1', q:'5', r:0}` → `MAP_OP_INVALID`
- [ ] **Out-of-range hex** — `{type:'token.move', tokenId:'t1', q:99999, r:0}` → `MAP_OP_INVALID` (sanity guard)
- [ ] **`fog.brush` invalid mode** — `mode:'xxx'` → `MAP_OP_INVALID`
- [ ] **`fog.brush` empty hexes** — `hexes:[]` → `MAP_OP_INVALID`
- [ ] **`fog.brush` over-limit hexes** — `hexes` length 1001 → `MAP_OP_INVALID`
- [ ] **`effect.add` invalid type** — `effect.type:'wrong'` → `MAP_OP_INVALID`
- [ ] **`combat.start` empty order** — `orderTokenIds:[]` → `MAP_OP_INVALID`

### `MapsService.assertCanDo`

- [ ] **Sa user, any op** → no throw
- [ ] **Admin user, any op** → no throw
- [ ] **PJ membership, `token.add`** → no throw
- [ ] **PJ membership, `effect.add`** → no throw
- [ ] **Player membership, `token.move` na vlastní token** → no throw
- [ ] **Player membership, `token.move` na cizí token** → `MAP_OP_FORBIDDEN`
- [ ] **Player membership, `token.move` vlastní token když `scene.isLocked`** → `MAP_OP_FORBIDDEN`
- [ ] **Player membership, `token.remove` vlastní** → no throw
- [ ] **Player membership, `token.remove` cizí** → `MAP_OP_FORBIDDEN`
- [ ] **Player membership, `token.update` patch s `currentHp` na vlastní** → no throw
- [ ] **Player membership, `token.update` patch s `currentHp` na cizí** → `MAP_OP_FORBIDDEN`
- [ ] **Player membership, `token.update` patch s `armor` na vlastní** → `MAP_OP_FORBIDDEN` (jen `currentHp`/`injury`)
- [ ] **Player membership, `effect.add`** → `MAP_OP_FORBIDDEN`
- [ ] **Player membership, `fog.brush`** → `MAP_OP_FORBIDDEN`
- [ ] **Player membership, `scene.state`** → `MAP_OP_FORBIDDEN`
- [ ] **Player membership, `combat.start`** → `MAP_OP_FORBIDDEN`
- [ ] **No membership ve světě, jakákoli op** → `MAP_OP_FORBIDDEN`

### `MapsService.applyOperation` — atomic update per typ

Mockovaný `repo.atomicUpdate` ověřuje, že se zavolá se správným Mongo update objectem:

- [ ] **`token.move`** → `repo.atomicUpdate({sceneId, query:{tokens.id: tokenId}, update:{$set: {tokens.$.q: q, tokens.$.r: r, lastModified: <now>}}})`
- [ ] **`token.add`** → `$push: {tokens: token}`
- [ ] **`token.remove`** → `$pull: {tokens: {id: tokenId}}`
- [ ] **`token.update` s patch `{currentHp: 3}`** → `$set: {tokens.$.currentHp: 3}`
- [ ] **`effect.add`** → `$push: {effects: effect}`
- [ ] **`effect.remove`** → `$pull: {effects: {id: effectId}}`
- [ ] **`fog.brush` mode=reveal** → `$addToSet: {revealedHexes: {$each: hexes}}`
- [ ] **`fog.brush` mode=fog** → `$pullAll: {revealedHexes: hexes}`
- [ ] **`fog.set`** → `$set: {fogEnabled: ..., revealedHexes: ...}`
- [ ] **`scene.state`** → `$set: {isHidden: ..., isLocked: ...}`
- [ ] **`scene.config`** → `$set: {config: ...}`
- [ ] **`sound.playlist`** → `$set: {activeSoundIds: ...}`
- [ ] **`combat.start`** → `$set: {combat: {...}}`
- [ ] **`combat.end`** → `$unset: {combat: 1}`
- [ ] **`npcTemplate.remove`** → `$pull npcTemplates + $pull tokens (cascade)`

### `MapsService.computeInverse`

- [ ] **`token.move {tokenId, q:5, r:-2}`** se scene v které token má q=3 r=-1 → inverse `{type:'token.move', tokenId, q:3, r:-1}`
- [ ] **`token.remove {tokenId}`** se scene obsahující token → inverse `{type:'token.add', token: <full snapshot>}`
- [ ] **`token.update {tokenId, patch:{currentHp: 3}}`** s old currentHp=8 → inverse `{type:'token.update', tokenId, patch:{currentHp: 8}}`
- [ ] **`fog.brush {mode:'reveal', hexes:[A,B]}`** → inverse `{mode:'fog', hexes:[A,B]}`
- [ ] **`fog.brush {mode:'reveal', hexes:[A]}`** s A už revealed → inverse `{mode:'fog', hexes:[]}` (no-op, hex byl odhalen už předtím) — **edge case**
- [ ] **`combat.start`** s aktivním boji → throws `MAP_OP_PRECONDITION_FAILED` (assertCanDo / pre-check)
- [ ] **`combat.effect.tick`** → inverse `null` (nelze undo manuálně)

### Sequence allocator

- [ ] **First op on scene** → seqNumber = 1, scene.lastSeqNumber = 1
- [ ] **N-th op** → seqNumber = N, monotonic
- [ ] **Two parallel ops on same scene** → unique seqNumber (1 a 2, ne dva stejné) — vyžaduje skutečnou DB integration test
- [ ] **Op aplikovaná na scene scénu která je smazaná během op** → `MAP_SCENE_NOT_FOUND`

---

## Integrační testy

### Apply + broadcast cyklus

- [ ] **PJ user posílá `POST /maps/:id/operations` s `token.add`** → 201 with `seqNumber=1, inverse={token.remove,...}` + WS event `map:operation` arrival na druhém klientu se stejným payloadem (bez `inverse`)
- [ ] **Hráč pohybuje svým tokenem `token.move`** → 201 + WS event broadcast PJ klientovi
- [ ] **PJ kreslí fog brush `fog.brush mode=reveal`** → 201 + WS event s `seqNumber` zvýšeným
- [ ] **Sekvence: 5 ops za sebou** → seqNumber 1..5, log obsahuje všech 5 v pořadí

### Catch-up

- [ ] **Klient `GET /maps/:id/operations?since=0`** vrací všechny ops scény (ascending)
- [ ] **Klient `GET ?since=5`** vrací ops 6..N
- [ ] **Klient `GET ?since=999` (vyšší než lastSeqNumber)** vrací prázdné pole + `lastSeqNumber` v response
- [ ] **Klient `GET ?limit=2`** vrací max 2 ops (s `hasMore` indikátorem v response)
- [ ] **Klient `GET ?since=0` na scéně s 1000+ ops** vrací max 500 (default limit)

### Race resistance

- [ ] **2 paralelní `token.move` na různé tokeny** v 1 scéně → oba úspěšné, finální state má oba na nových pozicích
- [ ] **2 paralelní `token.move` na **stejný token**** → atomic Mongo update — poslední vyhrává; oba dostanou 201 ale lastSeqNumber stoupne o 2
- [ ] **Paralelně `token.move` + `token.remove`** na stejný token → `token.move` dostane `MAP_TOKEN_NOT_FOUND`, pokud remove byl dřív; jinak oba ok

### Authorization

- [ ] **Player POST `effect.add`** → 403 `MAP_OP_FORBIDDEN`, žádný insert do log, `lastSeqNumber` se nezvýší
- [ ] **Player POST `token.move` cizího tokenu** → 403, žádný insert
- [ ] **Non-member POST jakákoli op** → 403
- [ ] **Player POST `token.update` patch s povolenými fields (currentHp)** → 201
- [ ] **Player POST `token.update` patch s nepovolenými fields (armor)** → 403
- [ ] **Hráč `GET /maps/:id/operations`** scény na které JE přiřazený → 200 (vidí všechny ops té scény)
- [ ] **Hráč `GET /maps/:id/operations`** scény, na které NENÍ přiřazený, ale je member světa → 403 (inter-scene privacy)
- [ ] **Hráč `GET /maps/:id/operations`** scény ve světě, kde NENÍ member → 403
- [ ] **PJ `GET /maps/:id/operations`** jakékoli scény jeho světa → 200
- [ ] **PJ `POST /worlds/:id/operations` member.assignToScene** → 201
- [ ] **Hráč `POST /worlds/:id/operations` member.assignToScene** (cizí user) → 403
- [ ] **Hráč `POST /worlds/:id/operations` member.unassign** (self) → 201 (graceful leave)
- [ ] **Hráč `POST /worlds/:id/operations` member.unassign** (cizí user) → 403
- [ ] **Hráč `GET /worlds/:id/operations`** → 403 (cross-scene privacy)

### Cross-scene assignment (member.*)

- [ ] **PJ posílá `member.assignToScene { userId: matrixar, sceneId: mapa2 }`** se starým `currentSceneId = mapa1` a token Matrixáře je na mapa1 →
  - 201 `WorldOperation` (worldId, seqNumber, op, inverse `{ ... sceneId: mapa1 }`, `cascadeMapOpIds: [token-remove-id]`)
  - Mongo: `WorldMembership.currentSceneId = mapa2`
  - Mongo: `mapScenes[mapa1].tokens` neobsahuje Matrixářův token
  - Mongo: `mapOperations` obsahuje `token.remove` se `sceneId = mapa1, byUserId = pjId`
  - WS: room `scene-mapa1` přijala `map:operation` (token.remove) + `map:member-left`
  - WS: room `scene-mapa2` přijala `map:member-joined`
  - WS: Matrixářova socket přijala private `map:reassigned { newSceneId: mapa2 }`
  - WS: room `world:{worldId}` přijala `world:operation`
- [ ] **PJ posílá `member.assignToScene` na hráče bez tokenu na staré scéně** → 201, `cascadeMapOpIds: []` (žádný token.remove nepotřeba), `WorldMembership` updated
- [ ] **PJ posílá `member.assignToScene` na neznámého userId** → 404 `MAP_MEMBER_NOT_FOUND`
- [ ] **PJ posílá `member.assignToScene` na sceneId jiného světa** → 409 `MAP_MEMBER_NOT_IN_WORLD`
- [ ] **PJ posílá `member.assignToScene` se stejným `sceneId` jako stávající `currentSceneId`** → 201 no-op (nic se nemění), nezvýší se seqNumber? — **TBD open**
- [ ] **PJ posílá `member.bulkAssignToScene` pro 5 hráčů z různých starých scén na jednu novou** → 201 s `cascadeMapOpIds` (per affected old scene 1 token.remove), všech 5 memberships updated atomic, broadcast events na 5+ rooms
- [ ] **PJ self-call `member.assignToScene` s pj.userId, novou sceneId** → 201 (PJ může změnit svůj „focus pohled")
- [ ] **Hráč self-call `member.unassign` (graceful leave)** → 201, `WorldMembership.currentSceneId = null`, token zmizí
- [ ] **Hráč self-call `member.assignToScene` na cizí scénu** → 403 `MAP_OP_FORBIDDEN`

### GET /maps/active per-user resolution

- [ ] **Hráč s `currentSceneId = mapa2` zavolá `GET /maps/active?worldId=`** → vrací mapa2 (s `enrichTokens`)
- [ ] **Hráč s `currentSceneId = null`** → 404 `MAP_NO_ACTIVE_SCENE`
- [ ] **Hráč s `currentSceneId` ukazujícím na smazanou scénu** → 404 `MAP_NO_ACTIVE_SCENE` (klient: empty state)
- [ ] **PJ s `currentSceneId = mapa1`** → vrací mapa1 (PJ má taky member current scene jako focus)
- [ ] **Non-member volá `GET /maps/active`** → 403

### WS auth (nová middleware)

- [ ] **Socket.io connection bez JWT** → disconnect / error event
- [ ] **Socket.io connection s expired JWT** → disconnect
- [ ] **Socket.io connection s valid JWT** → connection success, `socket.data.user` set
- [ ] **`map:join` na scénu, kde user není member** → emit error event, no join
- [ ] **`map:join` na neznámou scénu** → emit error event

### Deprecated path compatibility

- [ ] **Klient používá `PATCH /maps/:id/move-token`** (legacy) → 200; **paralelně se vytvoří `MapOperation` záznam s `token.move` typem** (legacy → ops auto-bridging)
- [ ] **Klient používá `PATCH /maps/:id/remove-token`** (legacy) → 200 + `MapOperation` insert
- [ ] **Klient používá `PUT /maps/:id`** (legacy) → 200; **diff od staré scene se rozloží do sekvence ops a každá insert do log** — **MVP open: stačí log jeden `scene.legacyReplace` op?** Doporučení: ano, jeden záznam typu `scene.legacyReplace { fullScene }` s inverse `{type:'scene.legacyReplace', fullScene: <old>}`.

### Performance

- [ ] **1000 sequential `token.move` ops** → p99 latency < 100ms per op (single client)
- [ ] **50 parallel clients posílají `token.move`** → no error rate, seqNumber gap-less
- [ ] **Catch-up s 500 ops** → < 500ms response time

---

## Hraniční případy

- [ ] **Scene smazaná během op apply** — atomic increment proběhne, ale `repo.atomicUpdate` najde 0 docs → vrať `MAP_SCENE_NOT_FOUND`, nezapisuj do log (rollback counter? — viz Open Q níže)
- [ ] **Op s extrémně velkým payloadem** (např. `fog.brush hexes` array 999) → ok; 1001 → `MAP_OP_INVALID`
- [ ] **Op s extra fields** mimo schema (např. `{type:'token.move', tokenId, q, r, extraField: 'x'}`) — strict validation drops nebo rejects? **Doporučení: drop silently (allow forward compat).**
- [ ] **TTL trigger** — op starší než 30 dní se z `mapOperations` smaže. Catch-up klient s `since=N` kde N spadá do smazaného range → ?? **MVP: vrátí prázdný array; klient si všimne velkého gap a udělá full refetch scény.**
- [ ] **Mongo unreachable během inc** → 500 `MAP_OP_SEQ_CONFLICT`; klient retry s backoff
- [ ] **`combat.start` na scéně bez tokenů** → `MAP_OP_INVALID` (orderTokenIds nemůže být empty + ověření že IDs existují)
- [ ] **Player se odpojí během op POST** → server stále aplikuje (HTTP request je atomic); broadcast jde ostatním, klient sám už nedostane response

---

## Co se netestuje

- **Skutečný visual broadcast latency** — to je FE level test (klient PixiJS render)
- **Catch-up po long disconnect (3+ dny)** — TTL by tehdy smazal staré ops; je to known limitation, dokumentováno
- **Cross-scene ops** — žádné neexistují (každá op je per-scene)
- **Cross-world ops** — žádné neexistují
- **Snapshot+compact retention** — defer, není v MVP
- **History/replay UI** — FE level, defer post-MVP

---

## Open questions pro impl plán

- **Counter rollback při op fail po inc:** Pokud `findOneAndUpdate($inc lastSeqNumber)` proběhne, ale `applyOperation` selže (např. atomic update vrátí 0 docs / `MAP_TOKEN_NOT_FOUND`) → counter zůstane navýšený, ale `mapOperations` insert neproběhne. Důsledek: gap v sekvenci. **Akceptovatelné v MVP?** Klient catch-up to ustojí; replay nevidí žádný `op` pro chybějící seq, ale `lastSeqNumber` indikuje, že už není víc dat. Doporučení: akceptovat (jednodušší než transactional decrement).
- **Legacy `PUT /maps/:id` bridging:** dvě možnosti — (A) `scene.legacyReplace` jeden op typ, (B) diff a vícero atomic ops. Doporučení: A pro MVP, B post-MVP pokud audit log potřebuje granularitu.
