# Bezpečnost

## Permission matrix per endpoint

| Endpoint | Role gate | Per-user check |
|---|---|---|
| `GET /maps/active?worldId=X` | `JwtAuthGuard` | per-user resolve (vlastní `currentSceneId`) ✓ |
| `GET /maps?worldId=X` (list scén) | `JwtAuthGuard` | **AUDIT: dnes bez extra checku** — je to OK? Hráč vidí jen jména/IDs, ale ne data. Mírná info leak (= jaké scény existují). **Rozhodnutí:** PJ+ vrátit full, hráči **odfiltrovat** na jen `scene.id === jeho currentSceneId` (tj. max 1 nebo 0 prvků). |
| `GET /maps?worldId=X&isActive=true` (PJ orchestrator) | `JwtAuthGuard` + role PJ+ | PJ-only — vyhodit 403 hráči |
| `GET /maps/:id` | **PŘIDAT `JwtAuthGuard`** | **PŘIDAT `assertCanReadScene`** |
| `POST /maps` | `JwtAuthGuard` + `assertCanManage` PJ+ ✓ | nezměnit |
| `POST /maps/:id/active` | PJ+ ✓ | nezměnit |
| `PUT /maps/:id` | PJ+ ✓ | nezměnit |
| `DELETE /maps/:id` | PJ+ ✓ | nezměnit |
| `POST /maps/:id/operations` | `JwtAuthGuard` + per-op `OperationsAuthorizer` ✓ | nezměnit |
| `GET /maps/:id/operations` | `JwtAuthGuard` + `assertCanReadSceneLog` ✓ | nezměnit |
| `POST /worlds/:worldId/operations` (`member.*`) | PJ+ ✓ | nezměnit |

## `assertCanReadScene` — kontrakt

**Vstup:** `user: { id, role }`, `scene: { id, worldId }`.

**Algoritmus:**

```
if user.role <= UserRole.PJ:
    membership = WorldMembership.findOne({ userId: user.id, worldId: scene.worldId })
    if membership exists: return  // PJ+ ve světě → ✓
    throw 403 MAP_FORBIDDEN_OTHER_SCENE  // PJ mimo svět → ne
else:
    membership = WorldMembership.findOne({ userId: user.id, worldId: scene.worldId })
    if membership && membership.currentSceneId === scene.id: return  // ✓
    throw 403 MAP_FORBIDDEN_OTHER_SCENE
```

**Důvod separace PJ ve světě vs mimo:** PJ na cizím světě nemá co dělat ve scéně cizího světa (podle striktního worldů-isolation modelu). Pokud máme global Admin/Superadmin, ti to BYPASSnou — to už dělá `assertCanManage` v existujícím kódu pro mutace. Pro **čtení** zachováváme stejnou striktnost.

> ⚠️ **Pozor — Admin/Superadmin** mají v jiných místech kódu bypass všeho. Konzistence: pokud `user.role <= UserRole.SUPERADMIN`, vrátit ✓ bez membership lookupu. Detaily: ověřit chování `assertCanManage` (membership-required nebo role-only). **Otevřená otázka pro implementaci** — vyřešit při psaní impl. plánu.

## `scene.deactivate` cascade — race podmínka

Pokud dva PJ současně kliknou na deactivate téže scény:

1. Op #1 dorazí: server zamkne scénu (mongo `findOneAndUpdate` s `isActive: true → false` filter), atomic set false. Cascade unassign.
2. Op #2 dorazí: `findOneAndUpdate` najde `isActive: false` → match miss → no-op vrátí `{ applied: false, seqNumber: <unchanged> }`.

**Žádný lock potřeba** — atomic CAS na bool flag stačí.

## Cascade unassign — concurrent write

Cascade probíhá ve smyčce: `for each membership.currentSceneId === sceneId`. Mezi loadem a updatem může jiný proces změnit `currentSceneId` (např. PJ ručně reassigne). Řešení: per-membership atomic update `{ userId, currentSceneId: sceneId } → { currentSceneId: null }`. Pokud match miss, prostě skip — žádná chyba.

## WS — cizí svět nemůže šmírovat

`map:operation` broadcast jde na room `sceneId` (ne na `world:{id}`). Klient se připojí k roomu jen pokud projde gate při `joinScene` event. Pro `world:operation` (cross-scene log) klient se připojuje na room `world:{worldId}` přes `map:join-world` — gate: musí být member daného světa. **Verifikovat** v `maps.gateway.ts` že tento gate existuje. Pokud ne, doplnit.

## Co se NEAUDITUJE v tomto specu

- **Token broadcast spoofing** (klient pošle `TokenMoved` jako cizí token) — řeší per-op authorizer v `10.2-prep-1`, mimo rozsah.
- **Auth na empty state postavy fetchu** — `GET /characters?worldId=X&ownerId=self` musí mít own-only gate. **Předpoklad: už má** (existující endpoint, mimo rozsah). Verifikovat při impl.
