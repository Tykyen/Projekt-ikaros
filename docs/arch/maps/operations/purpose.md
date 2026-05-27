# Účel

Sjednotit všechny mutace `MapScene` **i cross-scene assignment hráčů** do jedné cesty operations API. Dva paralelní logy:

- **`mapOperations`** — per-scene mutace (token/effect/fog/scene/sound/combat/npcTemplate). Broadcast přes WS room `sceneId`.
- **`worldOperations`** — cross-scene mutace (přiřazení hráčů ke scénám). Broadcast přes WS room `world:{worldId}` + private emit affected user.

Per-player „kde právě je hráč" žije na `WorldMembership.currentSceneId` (1 scéna per player, dynamic, persistentní napříč session). PJ orchestruje rozmístění hráčů přes `member.*` ops.

## Odpovědnosti

- **Validace operace** — typ, args podle schématu per typ; `assertCanDo(user, scope, op)` (role + ownership).
- **Atomic aplikace na DB** — per typ použít Mongo positional / `$push` / `$pull` / `$addToSet` / `$pullAll` / `$set` updaty, NIKDY full document replace.
- **Persistence do logu** — insert do `mapOperations` (per-scene) nebo `worldOperations` (cross-scene) s monotonic `seqNumber`, vč. `inverse` op (pro undo).
- **Sequence allocation** — atomic increment per kontext (`MapScene.lastSeqNumber` pro scene ops, `World.lastSeqNumber` pro world ops).
- **Broadcast** — `map:operation` všem v room `sceneId`; `world:operation` všem v room `world:{worldId}` + private emit affected user pro `member.*` ops.
- **Cross-scene cascade** — `member.assignToScene` automaticky emituje per-scene `token.remove` op na staré scéně (postava odejde — viz [project_takticka_mapa_assignment](../../../../../../.claude/...)).
- **Catch-up endpointy** — `GET /maps/:id/operations?since=N` pro scene log; `GET /worlds/:id/operations?since=M` pro world log.
- **TTL retention** — Mongo TTL index na `appliedAt`, default 30 dní (konfigurovatelné).
- **Per-user scene resolution** — `GET /maps/active?worldId=` server lookne `WorldMembership.currentSceneId` a vrátí konkrétní scénu pro current user. PJ má separátní `GET /maps?worldId=&isActive=true` pro orchestrator panel.

## Mimo rozsah

- **Snapshot + compact strategie** pro long-term retention — defer post-MVP.
- **History/replay UI** ve frontendu — samostatná feature po MVP 4.
- **Undo/Redo stack management** na klientu — patří do 10.2m (sekce 23.7); spec sem patří jen `inverse` field v MapOperation/WorldOperation.
- **Combat tracker logic** (start/turn/end tick) — patří do spec `combat` komponenty (10.2f); zde jsou jen typy `combat.*` operací jako payload schémata.
- **Sprite atlas regenerace** — patří do `sprite-atlas` komponenty (10.2d/23.6); operations log slouží jako trigger (event subscriber).
- **PJ orchestrator panel UI** (kdo-kde dropdown, bulk přesun skupiny) — patří do 10.2c. Tato spec definuje jen BE API a flow.
- **Klient autoload při `map:reassigned`** — patří do 10.2c. Spec definuje jen WS event.
- **Multi-group membership** (`WorldMembership.groups[]`) — Ikaros zachovává single `group?: string` (potvrzeno uživatelem).

## Kontext

Komponenta žije v BE modulu `maps` (`backend/src/modules/maps/`). Rozšiřuje stávající `MapsService`, `MapsController`, `MapsGateway`:

- **Stávající endpointy** (`PUT /:id`, `PATCH /:id/move-token`, `PATCH /:id/remove-token`, `POST /:id/active`, `DELETE /:id`) ZŮSTÁVAJÍ pro backwards compatibility, **ale klient FE 10.2 je už nepoužije**. Po stabilizaci 10.2 lze deprecate.
- **`MapsGateway`** ztratí specifické relay handlery (`map:token-moved`, `map:effect-added`, atd.) — bude jen `map:join` / `map:leave` + emit `map:operation`. Stará legacy emit handler relay pro Matrix-style klienty zachovat krátce pro přechod (deprecated path).
- Závisí na: `IWorldMembershipRepository` (role check), `IMapsRepository` (atomic Mongo ops).
- Žádný dopad na ostatní BE moduly (`characters`, `pages`, `sounds`, ...) — `enrichTokens` v `MapsService.findById` zůstává beze změny.
