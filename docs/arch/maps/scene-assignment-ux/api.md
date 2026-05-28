# API

## 1. Nová per-scene operace: `scene.deactivate`

Aplikuje se přes existující operations endpoint:

```
POST /maps/:id/operations
Body: { "type": "scene.deactivate" }
```

**Validace (server):**

- Volající musí být PJ+ ve světě této scény (`assertCanManage`).
- Scéna existuje a má aktuálně `isActive === true`. Jinak 400 `MAP_OP_NOOP` (idempotent — vrátí seqNumber bez efektu? **TBD: rozhodnuto = no-op vrátit 200 s `applied: false`, neházet chybu**).

**Side-effects (atomic):**

1. `MapScene.isActive = false`, `lastModified = now`.
2. Pro všechny `WorldMembership` se `currentSceneId === sceneId`:
   - Vytvořit cross-scene op `member.unassign { userId }` ve `worldOperations` logu.
   - Nastavit `membership.currentSceneId = null`.
3. Per-scene log: jedna `scene.deactivate` op s `affectedUserIds: string[]` v body (pro klienta = které hráče info)
4. WS broadcast:
   - `map:operation` na room `sceneId` (deactivate event)
   - `world:operation` na room `world:{worldId}` (každá unassign separátně, pro `MemberAssignmentTable` invalidaci)
   - Private `map:reassigned { newSceneId: null }` každému affected user (pro auto-redirect na empty state)

**Inverse pro undo (10.2m):** `scene.activate-with-members { previousMemberIds: string[] }` — vrátí scénu aktivní + reassigne původní hráče.

## 2. Audit změny v existujících endpointech

### `GET /maps/:id`

**Před:**
```ts
@Get(':id')
findById(@Param('id') id: string) { ... }
```

**Po:**
```ts
@Get(':id')
@UseGuards(JwtAuthGuard)
async findById(
  @Param('id') id: string,
  @CurrentUser() user: RequestUser,
) {
  const scene = await this.mapsRepo.findById(id);
  if (!scene) throw new NotFoundException({ code: 'MAP_SCENE_NOT_FOUND', ... });
  await this.authorizer.assertCanReadScene(user, scene);
  return this.service.findById(id);  // enriched verze
}
```

**Response shape se nemění** — jen přibyly 401/403 možnosti.

### `assertCanReadScene` (nová metoda v `OperationsAuthorizer`)

```ts
async assertCanReadScene(user: RequestUser, scene: MapScene): Promise<void>
```

**Pravidla:**

1. Pokud `user.role <= UserRole.PJ` (PJ/Admin/Superadmin) **a** user je členem světa `scene.worldId` → ✓
2. Jinak najdi `WorldMembership(userId, scene.worldId)`. Pokud `membership.currentSceneId === scene.id` → ✓
3. Jinak throw `ForbiddenException { code: 'MAP_FORBIDDEN_OTHER_SCENE' }`

**Edge case:** Hráč mimo svět vůbec (žádné membership) → 403 stejně (chápat jako "není jeho scéna"). Neukazuje jestli ID existuje nebo ne (info leak prevence — možná zvážit 404 místo 403, ale konzistence s ostatními endpointy je 403).

## 3. FE — žádné nové endpointy, jen použití

| Akce | Endpoint | Note |
|---|---|---|
| Načíst aktivní scénu (hráč) | `GET /maps/active?worldId=X` | existuje, jen napojit empty state na 404 |
| List aktivních scén (PJ) | `GET /maps?worldId=X&isActive=true` | existuje (`useActiveScenes`) |
| PJ switch na scénu | `POST /worlds/:worldId/operations { type: 'member.assignToScene', userId: self.id, sceneId }` | existuje |
| Deactivate scénu | `POST /maps/:sceneId/operations { type: 'scene.deactivate' }` | **nová** |
| Reload after reassign | `GET /maps/active?worldId=X` | reuse |

## 4. FE — empty state komponent

Cesta: `src/features/world/tactical-map/components/MapEmptyState.tsx` **rozšíření** (komponenta existuje, jen redesign).

**Vstup:**
- `worldId: string`
- `userCharacters: Character[]` — postavy hráče v tomto světě (fetchne se přes existující `getCharactersByWorld(worldId, ownerId: self.id)`)

**Výstup:** read-only přehled jeho postav + informační text. Žádné akce na empty state (postavy se editují jinde).

**Behavior:** Auto-refresh: poslouchá WS `map:reassigned`; pokud event obsahuje `newSceneId !== null`, invaliduje `getActiveMapScene` query → automatický přechod na mapu.
