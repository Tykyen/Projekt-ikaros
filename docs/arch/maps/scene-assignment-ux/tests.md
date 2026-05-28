# Testy

## Jednotkové (BE)

### `OperationsAuthorizer.assertCanReadScene`

- **PJ ve světě scény** → resolves ✓
- **PJ na CIZÍM světě** → throws 403 (memb. neexistuje)
- **Admin global** → resolves ✓ (bypass přes role)
- **Superadmin global** → resolves ✓
- **Hráč s `currentSceneId === scene.id`** → resolves ✓
- **Hráč s `currentSceneId === jiná-scéna`** → throws 403
- **Hráč s `currentSceneId === null`** → throws 403
- **Hráč mimo svět** (žádný membership) → throws 403

### `scene.deactivate` op (`MapOperationsService`)

- **PJ deactivuje aktivní scénu** → `isActive: false`, cascade `member.unassign` pro N=3 hráčů, 3 worldOps + 1 mapOp v logu
- **PJ deactivuje už neaktivní scénu** → 200 `{ applied: false }`, žádné side-effecty
- **Hráč pokouší deactivate** → 403 `MAP_OP_FORBIDDEN`
- **PJ deactivuje scénu jiného světa** (membership neexistuje) → 403
- **Atomic property**: dva paralelní deactivate → jen jeden side-effect (verify přes mock concurrent invocation)
- **WS payloads**: `map:operation` 1×, `world:operation` N×, `map:reassigned` N× private

### Cascade — concurrent mutation

- Mock: během cascade jiný proces změní `currentSceneId` na jinou scénu → ten konkrétní unassign se přeskočí, ostatní projdou.

## Integrační (BE)

### `GET /maps/:id` audit

- **Bez tokenu** → 401
- **PJ, vlastní svět** → 200 enriched scene
- **Hráč, scéna = jeho currentSceneId** → 200 enriched scene
- **Hráč, scéna ≠ jeho currentSceneId** → 403 `MAP_FORBIDDEN_OTHER_SCENE`
- **Hráč, neexistující sceneId** → 404 (neleak: 403 by leaknul info, ale konzistentní s ostatními endpointy → 404 OK pokud auth projde; **dilema:** vrátit 403 i pro neexistující ID aby se nedalo enumerovat? **Rozhodnuto:** vrátit 404 jen pro Auth-passnuté requesty, 401 jinak. Hráč musí být přihlášený aby zjistil existenci → akceptovatelný leak.)

### `scene.deactivate` E2E

- Setup: scéna S aktivní, hráči U1+U2+U3 přiřazení.
- POST op deactivate.
- Verify:
  - DB: `S.isActive === false`
  - DB: `WorldMembership(U1/U2/U3).currentSceneId === null`
  - WS: `map:operation` přišel hráčům joinnutým na scénu
  - WS: `world:operation` × 3 přišly do world roomu
  - WS: `map:reassigned { newSceneId: null }` přišel privately U1, U2, U3

## FE komponenty

### `MapEmptyState` (redesign)

- Render snapshot s 0 postavami → hláška "Žádné postavy v tomto světě"
- Render snapshot s 3 postavami → 3 karty s portréty a jmény
- WS `map:reassigned { newSceneId: 'X' }` → invalidace `getActiveMapScene` query (mock `useQueryClient`)
- Žádné editování postav (read-only)

### `ActiveScenesList` (redesign)

- 3 aktivní scény, jedna === current → 3 řádky, jeden s `aria-current="true"` + badge "zde jsem"
- Klik na neaktivní řádek → volá `assignToScene` mutation s userId=self
- Klik na ✕ → confirm dialog se objeví ("Tato scéna přestane být aktivní…")
- Confirm → `scene.deactivate` op POST
- Cancel → no-op

## E2E (Playwright/Cypress) — happy paths

1. **Hráč nepřiřazen → PJ ho přiřadí → mapa se objeví bez refreshe**
2. **PJ ve světě se 3 aktivními scénami → klikne na řádek 2 → mapa se přepne**
3. **PJ klikne na ✕ aktivní scény → confirm → scéna mizí ze seznamu, hráči přiřazeni jinde nebo na empty state**

## Co se NETESTUJE

- Race-condition undo/redo `scene.deactivate` ↔ inverse — patří do 10.2m.
- Performance pod 100+ aktivními scénami — nereálné v praxi.
- Postava editing flow — patří do char specs.
