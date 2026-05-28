# Chybové stavy

## `MAP_NO_ACTIVE_SCENE`

| Pole | Hodnota |
|---|---|
| HTTP status | 404 |
| Endpoint | `GET /maps/active` |
| Příčina | `WorldMembership.currentSceneId === null` nebo membership neexistuje |
| Handling FE | Renderovat `MapEmptyState` (postavy + hláška), **netreatovat jako error toast** |

Existující stav, **beze změny**. Tento spec jen doplňuje FE zachycení.

## `MAP_FORBIDDEN_OTHER_SCENE`

| Pole | Hodnota |
|---|---|
| HTTP status | 403 |
| Endpoint | `GET /maps/:id` (po auditu), `POST /maps/:id/operations` (už dnes přes authorizer) |
| Příčina | Hráč žádá o scénu, která není jeho `currentSceneId`, a není PJ+ ve světě |
| Handling FE | Toast "Tuto scénu nemáš přiřazenou" + redirect na empty state (`/svet/:id/takticka-mapa` znovu spustí resolve) |

**Info leak prevence:** Server nesmí v 403 odpovědi vrátit, jestli scéna existuje. Hláška generická.

## `MAP_OP_NOOP` (rozhodnutí: vrátit 200, ne 400)

Když volající aplikuje `scene.deactivate` na scénu, která už **není** aktivní, server vrátí 200 s `{ applied: false, seqNumber: <current> }`. Žádná chyba. Důvod: race-condition (dva PJ kliknou současně) nemá vyhodit chybu, jen se idempotentně přeskočí.

## `MAP_SCENE_NOT_FOUND`

Existující kód. Beze změny.

## Nepatří sem

- `WORLD_OP_FORBIDDEN` — řeší `worldOperations` katalog, ne tento.
- Generic `401 UNAUTHENTICATED` — pokrývá `JwtAuthGuard` napříč aplikací.
