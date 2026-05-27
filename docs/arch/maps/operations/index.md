# Operations (maps + worlds)

Append-only event log + atomic mutation API pro `MapScene` a cross-scene assignment hráčů ve světě. Dvě paralelní cesty:

- **Per-scene** (`mapOperations` log): mutace konkrétní scény. `POST /maps/:id/operations`, broadcast `map:operation` na room `sceneId`. Pokrývá token/effect/fog/scene/sound/combat/npcTemplate.
- **Cross-scene** (`worldOperations` log): assignment hráčů na scény přes `WorldMembership.currentSceneId`. `POST /worlds/:worldId/operations`, broadcast `world:operation` na room `world:{worldId}` + private `map:reassigned` affected user. Pokrývá `member.assignToScene`, `member.unassign`, `member.bulkAssignToScene`.

Klient drží `lastSeqNumber` per scope (per-scene i per-world); po reconnect catch-up volá `GET /maps/:id/operations?since=N` resp. `GET /worlds/:id/operations?since=M`.

Komponenta je **`10.2-prep-1` z roadmapy** — fundament pro celý zbytek 10.2. Nahrazuje stávající přístup (PATCH `/move-token` + `/remove-token` + PUT `/maps/:id` pro vše ostatní) jednotnou cestou. Současně řeší dva BE problémy (atomicita, server-side role gate v gateway), umožňuje **per-player scene assignment** (víc paralelně aktivních scén ve světě, PJ orchestruje rozmístění hráčů) a otevírá cestu k undo/redo + history/replay.

Reference: [`docs/takticka-mapa-matrix.md` §23.1](../../../takticka-mapa-matrix.md), [`Projekt-ikaros-FE/docs/roadmap-fe.md` 10.2-prep-1](../../../../../Projekt-ikaros-FE/docs/roadmap-fe.md), [`project_takticka_mapa_assignment` memory](../../../../../../.claude/) (per-player assignment design).

## Soubory

- `purpose.md` — účel, odpovědnosti, kontext
- `data-models.md` — `MapOperation` schema, typy operací, sequence counter
- `api.md` — `POST /maps/:id/operations`, `GET /maps/:id/operations`, WS event
- `errors.md` — katalog chybových stavů
- `security.md` — `assertCanDo`, role/ownership matrix, rate limiting
- `tests.md` — jednotkové + integrační scénáře
- `ai-notes.md` — pokyny pro AI agenta při impl.
