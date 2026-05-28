# AI poznámky

## Před zahájením

1. Přečíst [`operations/index.md`](../operations/index.md) — kontext jak operations API funguje, jak se loguje, jak broadcastuje.
2. Přečíst [`project_takticka_mapa_assignment`](../../../../../.claude/) memory — proč per-membership a ne per-scene audience.
3. Ověřit aktuální stav v repu:
   - `maps.controller.ts:83` — `GET /maps/:id` bez guardu (potvrzeno 2026-05-28, ověřit znovu před úpravou)
   - `operations-authorizer.service.ts` — existuje `assertCanReadSceneLog`, šablona pro novou `assertCanReadScene`
   - `useActiveScenes.ts` + `ActiveScenesList.tsx` na FE — současné napojení
   - `MapEmptyState.tsx` — současný stav komponenty (existuje stub)

## Závislosti

- **10.2-prep-1 operations API** — předpoklad. `scene.deactivate` se přidává jako další op type. Nutné upravit `MapOperation` typescript discriminated union v `interfaces/map-operation.interface.ts` (BE) + `types.ts` (FE).
- **`worldOperations` log** — `scene.deactivate` může logovat per-scene (deactivate sám) **a paralelně** generovat `member.unassign` per affected hráč ve world logu. Sequence numbers: per-scene log získá 1 nový seqNumber, world log získá N nových (N = affected). Klient catch-up funguje sám.
- **`MapsService.findActiveForUser`** — netýkat, beze změny. Vrací 404 když `currentSceneId === null` ✓.

## Časté chyby (na co si dát pozor)

- **Cascade order:** nejdřív update scény `isActive: false`, **pak** smyčka cascade. Pokud bys to dělal opačně, kratičké okno race — scéna ještě aktivní ale hráči už unassigned.
- **Idempotence:** `scene.deactivate` na už neaktivní scéně = 200 `{ applied: false }`. Nehot 400. Důvod v `errors.md`.
- **WS event po cascade, ne před:** broadcast `map:reassigned` **až po** DB potvrdí update membership. Jinak klient invalidate query a načte ještě starou hodnotu.
- **Empty state — fetch postav:** nezapomenout filter `worldId: currentWorldId` (PJ může mít hráče s postavami v 5 světech).
- **`assertCanReadScene` v `findById` service vs controller** — preferovat **v controlleru** (přímo viditelné v API surface) místo schování v service. Pro consistence s `assertCanManage`.
- **Inverse op `scene.activate-with-members`** — pro 10.2m undo. Nevhazovat do tohoto specu jako požadavek, ale `MapOperationsService` musí mít připravený typ aby inverse mohl být uložen.

## Doporučený postup

1. **BE — `assertCanReadScene` jednotkové testy** (TDD) → metoda → red→green
2. **BE — Apply guard na `GET /maps/:id`** → integration testy 401/403/200
3. **BE — `scene.deactivate` op typ + service handler** (atomic + cascade) → testy
4. **BE — WS broadcast** (map:operation, world:operation × N, map:reassigned × N) → mock testy
5. **FE — `ActiveScenesList` klikatelný řádek + deactivate ikona + confirm**
6. **FE — `MapEmptyState` redesign** (postavy hráče + hláška)
7. **E2E happy paths** přes Playwright
8. **/code-review** před commitem

## Co NEDĚLAT

- **Nepřidávat "Připraven" tlačítko** v empty state — uživatel zatím nepotvrdil. Otevřená otázka, samostatný spec.
- **Nepřidávat "published flag"** na šablony — patří do paralelního specu [`library-snapshot`](../library-snapshot/index.md).
- **Nedotýkat se** `MapsService.findActiveForUser` — funguje ✓.
- **Neměnit** `WorldMembership` schemu — `currentSceneId` už existuje.
- **Neměnit chování** existujících per-op handlerů (token, effect, fog, …) — mimo rozsah.
