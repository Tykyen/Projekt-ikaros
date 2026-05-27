# Poznámky pro AI agenta

## Před zahájením práce

1. **Přečti tuto celou složku** (`index.md`, `purpose.md`, `data-models.md`, `api.md`, `errors.md`, `security.md`, `tests.md`) **před napsáním jakéhokoliv kódu**.
2. **Přečti reference dokumenty:**
   - `docs/takticka-mapa-matrix.md` §23.1 (architektura), §22 (kontext v 10.2)
   - `Projekt-ikaros-FE/docs/roadmap-fe.md` — 10.2-prep-1 mention
3. **Spusť `pnpm test` na BE** abys ověřil baseline (žádné failing tests).
4. **Prostuduj stávající `maps` modul** (`backend/src/modules/maps/`) — pochop, jak vypadá stávající `MapsService.moveToken`, `MapsGateway.handleTokenMoved`. Rozumíš deltě, kterou bude tato spec zavádět.

## Důležitá omezení

- **Nesmíš odstraňovat stávající endpointy** (`PUT /maps/:id`, `PATCH /:id/move-token`, `PATCH /:id/remove-token`). Mark je `@deprecated` v swagger, ale ZACHOVEJ funkčnost — FE 10.2 přechodu trvá.
- **Nesmíš měnit veřejné rozhraní `MapsService.findById` / `enrichTokens`** — closely vázané na FE 10.2c–e.
- **Nesmíš měnit existující WS eventy** (`map:token-moved`, `map:effect-added`, atd.) — zachovat paralelní emit pro přechodové období. Nový `map:operation` emit je ADDITIVE.
- **Nesmíš měnit collection name `mapScenes`** ani existující indexy.
- **NIKDY nepoužij `findByIdAndUpdate({overwrite: true})`** — to je root cause regrese z §19.1. Vždy atomic update operators (`$set`, `$push`, `$pull`, `$inc`, `$addToSet`, `$pullAll`, positional `$`).
- **Per `feedback_no_debt`** — nedopouštět částečnou implementaci. Pokud nějaký op typ není dokončený, NEPUSHOVAT.
- **Per `feedback_be_precommit_prettier`** — před commitem `pnpm prettier --write`.
- **Per `feedback_workflow`** — implementaci NEZAČÍNAT bez schváleného impl plánu.

## Závislosti

- `docs/arch/maps/` — sourozenecké specifikace stávajících komponent `maps` modulu (pokud existují)
- `IMapsRepository` — `backend/src/modules/maps/interfaces/maps-repository.interface.ts` (rozšířit o `atomicUpdate(sceneId, mongoUpdate)` metodu)
- `IWorldMembershipRepository` — `backend/src/modules/worlds/interfaces/world-membership-repository.interface.ts` (read jen, beze změny)
- `JwtAuthGuard` — `backend/src/common/guards/jwt-auth.guard.ts` (reuse)
- `class-validator`, `class-transformer` — už v projektu (chat 6.x používá)
- Mongo TTL index — Mongoose schema option `expires: 2592` na `appliedAt` field

## Doporučený postup

### Fáze 1: Foundation (~1 den)

1. Vytvoř novou schemu `mapOperations`:
   - `backend/src/modules/maps/schemas/map-operation.schema.ts`
   - Class `MapOperationSchemaClass` s polema z `data-models.md` § `MapOperation`
   - TTL index na `appliedAt`
   - Index `{ sceneId: 1, seqNumber: 1 }` a `{ sceneId: 1, byUserId: 1, seqNumber: -1 }`
   - Export `MapOperationSchema = SchemaFactory.createForClass(...)`
2. Vytvoř novou schemu `worldOperations`:
   - `backend/src/modules/worlds/schemas/world-operation.schema.ts`
   - Class `WorldOperationSchemaClass` s polema z `data-models.md` § `WorldOperation`
   - TTL index na `appliedAt`
   - Index `{ worldId: 1, seqNumber: 1 }` a `{ worldId: 1, byUserId: 1, seqNumber: -1 }`
3. Rozšiř `MapSceneSchemaClass` o pole `lastSeqNumber: number` (default 0).
4. Rozšiř `WorldSchemaClass` o pole `lastSeqNumber: number` (default 0).
5. Rozšiř `WorldMembershipSchemaClass` o pole `currentSceneId?: string | null` (default null). Přidat index `{ worldId: 1, currentSceneId: 1 }` pro PJ orchestrator query.
6. Vytvoř interfaces:
   - `IMapOperationsRepository`: `allocateSeqNumber(sceneId)`, `appendOperation(record)`, `findSince(sceneId, since, limit)`
   - `IWorldOperationsRepository`: `allocateSeqNumber(worldId)`, `appendOperation(record)`, `findSince(worldId, since, limit)`
7. Implementuj `MongoMapOperationsRepository` a `MongoWorldOperationsRepository`.
8. Registruj nové modely v `MapsModule.imports` resp. `WorldsModule.imports`.

### Fáze 2: Validace + Authorization (~0.5 dne)

6. Vytvoř `dto/operations/` adresář:
   - `dto/operations/base.dto.ts` — discriminator helper
   - `dto/operations/token-move.dto.ts` — `TokenMoveOpDto`
   - `dto/operations/token-add.dto.ts`, atd. — DTO per každý op typ (16 souborů)
   - `dto/operations/index.ts` — export `OPERATION_DTOS: Record<OpType, ClassType>` mapa
7. Vytvoř `OperationPayloadValidator` service — používá discriminator → vyzkouší class-validator na příslušné DTO, pak vrací typed `OperationPayload`.
8. Vytvoř `OperationsAuthorizer` service (nebo metoda v `MapsService.assertCanDo`):
   - Per matice z `security.md`
   - Reuse existující `canManageWorld` (přejmenovat na `isWorldPJ`?)

### Fáze 3: Apply + Inverse (~1 den)

9. Vytvoř `OperationsService` (`backend/src/modules/maps/operations.service.ts`):
   - `apply(sceneId, op, user): Promise<{seqNumber, op, inverse}>`
   - Per typ switch: `applyTokenMove`, `applyTokenAdd`, ..., každá metoda:
     - **Compute inverse** (snapshot existující state před change — vyžaduje `repo.findById` před `atomicUpdate`)
     - **Atomic update** přes `IMapsRepository.atomicUpdate` (nová metoda — viz Fáze 1)
     - **Validate post-state** (např. atomic update vrátil 0 docs → throw `MAP_TOKEN_NOT_FOUND`)
   - Po úspěšné aplikaci: `allocateSeqNumber` + `appendOperation`
10. Pokrýt všechny op typy (token.*, effect.*, fog.*, scene.*, sound.*, combat.*, npcTemplate.*) — viz `data-models.md` katalog.

### Fáze 4: Cross-scene assignment + Controller + Gateway (~1 den)

11. Vytvoř `WorldOperationsService` v `worlds/` modulu:
    - `applyMemberAssign(worldId, op, user): Promise<{seqNumber, op, inverse, cascadeMapOpIds}>`
    - Per typ switch: `applyAssignToScene`, `applyUnassign`, `applyBulkAssign`
    - **Cascade flow** dle `data-models.md` § Member ops:
      a. Resolvni `oldSceneId = membership.currentSceneId`
      b. Pokud `oldSceneId` set a hráč tam má token → zavolej `MapOperationsService.apply` s `token.remove` (cross-module call)
      c. Atomic update `WorldMembership.currentSceneId = newSceneId`
      d. Allocate worldOperations seqNumber, append log s `cascadeMapOpIds` reference
12. Rozšiř `MapsController`:
    - `@Post(':id/operations')` `applyOperation(...)`
    - `@Get(':id/operations')` `getOperationsSince(...)` **+ read access check pro hráče: `currentSceneId === :id`**
13. Vytvoř `WorldOperationsController` (nebo rozšíř `WorldsController`):
    - `@Post(':worldId/operations')` `applyWorldOperation(...)`
    - `@Get(':worldId/operations')` `getWorldOperationsSince(...)` (PJ-only)
14. Rozšiř `MapsGateway` (nebo vytvoř `WorldsGateway` rozšíření):
    - Přidat Socket.io middleware pro JWT auth (handshake validation) — viz `security.md` ⚠️ WS authorizace
    - `map:join` (per-scene), zachovat
    - `map:join-world` (per-world) — nový handler pro PJ orchestrator panel (autoplugin do `world:{worldId}` room)
    - Po `MapOperationsService.apply` úspěšném: `server.to(sceneId).emit('map:operation', payload)`
    - Po `WorldOperationsService.applyMemberAssign`:
       - emit `map:operation` (cascade token.remove) na `room=oldSceneId`
       - emit `map:member-left` na `room=oldSceneId`
       - emit `map:member-joined` na `room=newSceneId`
       - emit private `map:reassigned` na affected user socket (lookup přes socket userId mapping)
       - emit `world:operation` na `room=world:{worldId}`
    - **Zachovat** stávající legacy `map:token-moved` atd. relay (paralelně) pro přechodové období
15. Označit deprecated endpointy `@deprecated` v swagger metadata.
16. **Modifikovat `MapsService.findActive`** na per-user resolution dle `WorldMembership.currentSceneId`.

### Fáze 5: Testy (~1 den)

14. Unit testy per scenario z `tests.md` — `operations.service.spec.ts`, `operations-authorizer.spec.ts`, `operation-payload-validator.spec.ts`
15. Integrační testy s `MongoMemoryServer` — `operations.controller.spec.ts` nebo `e2e/operations.e2e.spec.ts`
16. Spusť `pnpm test` → 100% pass.

### Fáze 6: Dokumentace + Cleanup (~0.5 dne)

17. Aktualizuj swagger annotations všech nových endpointů.
18. Aktualizuj `docs/takticka-mapa-matrix.md` § souborová mapa (přidej nové soubory).
19. Pre-commit: `pnpm prettier --write && pnpm lint`.
20. Verify že žádný stávající `e2e` test nezhasne.

## Časté chyby

### ❌ `findByIdAndUpdate({overwrite: true})`

Stávající `maps.repository.ts:replace` to dělá. **Nikdy to neopakuj.** Důsledek: konkurentní edity se ztrácí. Atomic update operators řeší ten samý problém bez race.

### ❌ Allocate seqNumber AŽ po atomic update

Nesprávné pořadí (apply → allocate) způsobí, že 2 paralelní ops dostanou stejné seqNumber. Správné pořadí: **allocate → apply → log insert**.

Pozn.: I tak může nastat counter increment bez insert (apply selže). Akceptujeme gap v sekvenci (viz `tests.md` Open Q).

### ❌ Inverse computation po atomic update

Nesprávné: nejdřív updatuj, pak ber „starý" state z nového dokumentu (už je nový). Správné: **first `repo.findById` → snapshot relevant fields → atomic update → vytvořit inverse z snapshotu**.

### ❌ Emit `map:operation` před DB commit

Nesprávné: `server.emit(...)` před `appendOperation` insert. Pokud insert selže, klient už dostal event. Správné: **DB persistence first, then broadcast**.

### ❌ Zapomenout na WS auth middleware

Stávající gateway nemá auth — kdokoli se může připojit. Pokud nové `map:operation` emit jde bez auth check, hráči jiných světů vidí ops. **MUSÍŠ doplnit Socket.io middleware** jako součást této spec.

### ❌ Hard-coded TTL value

Soft-code přes `MAP_OPERATIONS_TTL_DAYS` env var (default 30); usnadní pozdější tuning.

### ❌ Nekoalesovat WS broadcast s legacy emit

Pokud `map:operation` zachová emit ALE legacy `map:token-moved` taky emit, klient (starý chat-style klient) může dostat duplicitní event. Řešení: v MVP přechodu **emit obojí**, ale FE 10.2 klient ignoruje legacy eventy (filtruje na klientu). Po release stabilizaci → remove legacy emit.

### ❌ Zapomenout cascade při `npcTemplate.remove`

Smazat template ALE nechat tokeny instancované z ní → broken refs. **Atomic update** musí udělat oboje: `$pull npcTemplates` + `$pull tokens` v jednom updatu? Mongo nepodporuje dva `$pull` na různé field arrays v jediném updateOne — vyžaduje dva operations nebo jeden composite. **Doporučení:** udělat to jako **2 ops** v logu (`npcTemplate.remove` + auto `token.remove` cascade per affected token), nebo jeden composite op `npcTemplate.removeWithCascade { templateId, affectedTokenIds: [...] }` s inverse jako pole.

> Toto je důležitý design decision pro impl plán — preferovaná varianta: **složený op `npcTemplate.removeWithCascade`** s polem inverse ops. Jednotnější model.

### ❌ Zapomenout token cascade při `member.assignToScene`

Hráč přechází ze scény A na scénu B. **Token automaticky odejde ze scény A** (uživatelsky potvrzeno 2026-05-27). Pokud cascade `token.remove` nezavoláš:
- Token Matrixáře zůstává na scéně A duch-mode (PJ ho omylem ovládá jako NPC)
- Na scéně B se token nevytvoří (PJ musí placnout) — to je správné chování
- Inkonzistence: hráč vidí scénu B, ale jeho token na A je viditelný ostatním

Vždy: assignToScene → resolvni old token → cascade `token.remove` op → broadcast.

### ❌ Cross-module circular dependency

`WorldOperationsService` volá `MapOperationsService.apply` (cascade `token.remove`). Pokud `WorldsModule` importuje `MapsModule`, vznikne kruh, pokud i `MapsModule` z nějakého důvodu importuje `WorldsModule`.

**Řešení:** `WorldsModule` importuje `MapsModule` (jednosměrně). Pokud `MapsModule` potřebuje něco z `WorldsModule` (např. `IWorldMembershipRepository`), vystavit přes `WorldMembershipsModule` (granulárnější) nebo `forwardRef()` jen pro konkrétní providery.

### ❌ Zapomenout self-call edge case u `member.unassign`

Hráč klikne „opustit scénu" → `POST /worlds/:id/operations { type: 'member.unassign', userId: <self> }`. Security matrix dovoluje, ale ujisti se, že:
- Cascade `token.remove` proběhne na předchozí scéně (jeho vlastní token!)
- Private emit `map:reassigned { newSceneId: null }` (ne přeskočit) → klient zobrazí empty state „nikde nejsi přiřazený"
- Broadcast `map:member-left` na opuštěnou scénu (PJ vidí, že hráč odešel)
- WS klient leave room old scene; **nejoinuje žádnou novou room**

## Cross-link

- Aktualizuj `index.md` rodičovského modulu (pokud `docs/arch/maps/index.md` existuje) o link na tuto komponentu.
- Add note do `docs/takticka-mapa-matrix.md` §23.1 že spec existuje (link).
