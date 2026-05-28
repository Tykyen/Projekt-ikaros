# Účel

Doladit `WorldMembership.currentSceneId`-based per-player scene assignment na tři místa, kde dnes selhává nebo chybí:

## 1. Empty state nepřiřazeného hráče

**Stav.** `GET /maps/active` vrací 404 `MAP_NO_ACTIVE_SCENE`, FE pravděpodobně renderuje generický error nebo bílou stránku. Hráč nevidí ani **své postavy ve světě** (které ano má — `Character` entity s `worldId === currentWorldId` a `ownerId === userId`).

**Po.** Dedikovaný empty state komponent zobrazí:

- Hlavička: "PJ ti ještě nepřiřadil scénu" (klidný tón, ne error)
- **Seznam jeho postav ve světě** — portrét, jméno, system-specific snippet (HP/úroveň). Read-only přehled.
- Informační text: "Až tě PJ přiřadí, scéna se objeví automaticky."
- (Optional, do 10.2c-edit-1 zařadit) tlačítko "Připraven" → posílá `member.ready` cross-scene op → PJ vidí badge na hráči ve `MemberAssignmentTable`. **Rozhodnuto: vynechat z tohoto specu, jen pokud uživatel řekne ano** — zatím není odsouhlasené, otevřená otázka.

**Mimo rozsah.** Tvorba/úprava postav z empty state. To je vlastní stránka (`MyCharacterPage`).

## 2. PJ self-switch mezi aktivními scénami

**Stav.** `ActiveScenesList` ukazuje aktivní scény jako informaci, ale klik nepřesouvá PJ samotného. PJ musí nejspíš obejít přes URL nebo přiřadit sám sebe ručně.

**Po.**

- Klik na řádek scény v `ActiveScenesList` → POST `member.assignToScene { userId: self, sceneId }`. PJ rovnou vidí mapu.
- Aktuální scéna **zvýrazněná** (`aria-current="true"`, vizuálně badge "zde jsem").
- Vedle každé scény ✕ ikona = "deaktivovat" → `scene.deactivate` op:
  - Set `scene.isActive = false`
  - **Cascade**: všem hráčům s `currentSceneId === sceneId` nastavit `currentSceneId = null` (přes batch `member.unassign`)
  - WS broadcast: `world:operation` (každá unassign) + private `map:reassigned { newSceneId: null }` pro každého affected
  - **Confirm dialog** na FE: "Tato scéna přestane být aktivní a všichni přiřazení hráči ji ztratí. Pokračovat?"
- Po deactivate scéna **zmizí z `ActiveScenesList`**, ale **zůstává v plném seznamu scén** (mimo tento spec — patří do "list všech scén ve světě" UI).

## 3. Cross-scene privacy gate

**Stav.**

- `GET /maps/:id` — **bez `JwtAuthGuard`, bez permission checku**. Kdokoli může GETnout libovolnou scénu pokud zná ID. (`maps.controller.ts:83`)
- `GET /maps/active` — má guard, vrací jen vlastní scénu ✓
- `POST /maps/:id/operations` — `operations-authorizer.service` validuje per-op (PJ vs hráč) ✓
- `GET /maps/:id/operations` — `assertCanReadSceneLog` ✓

**Po.**

- `GET /maps/:id` přidá `@UseGuards(JwtAuthGuard)` + nový `assertCanReadScene(user, scene)` v authorizeru.
- Pravidla `assertCanReadScene`:
  - PJ+ (PJ, Admin, Superadmin) ve světě této scény → ✓
  - Hráč ve světě, `membership.currentSceneId === scene.id` → ✓
  - Jinak 403 `MAP_FORBIDDEN_OTHER_SCENE`
- Stejné pravidlo se aplikuje na **všechny per-scene endpointy** kde to dnes chybí (`PUT /maps/:id` má `assertCanManage` = PJ-only, OK; `DELETE /maps/:id` taky PJ-only ✓; `POST /maps/:id/active` PJ-only ✓).

## Odpovědnost komponenty

- FE: empty state komponent, redesign `ActiveScenesList` (klikatelné řádky + deactivate), confirm dialog.
- BE: nová `scene.deactivate` op (per-scene log), cascade unassign, gate na `GET /maps/:id`.
- Žádné nové schemy, žádná migrace dat. Pouze chování + auth.

## Kontext

Tato komponenta uzavírá [`project_takticka_mapa_assignment`](../../../.claude/) memory dohodu o per-player assignment. Bez ní zůstávají gaps, které blokují adopci 10.2c-edit-1.
