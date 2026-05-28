# Scene Assignment — UX + Security audit (10.2c-edit-1)

UX dopilování + security audit per-player scene assignment systému (`WorldMembership.currentSceneId`). Komponenta **nepřidává nové datové struktury** — pracuje s existujícím modelem z `10.2-prep-1` ([operations](../operations/index.md)). Doladění tří mezer:

1. **Empty state pro nepřiřazeného hráče** — dnes prázdná stránka. Po: hráč vidí své postavy ve světě, jasnou hlášku, optional "připraven" signál pro PJ.
2. **PJ self-switch mezi aktivními scénami** — PJ vidí pod sebou rotaci scén, kterými prochází; klik = `member.assignToScene(self, sceneId)`; "deactivate" tlačítko = stáhne scénu z rotace + vykopne přiřazené hráče (s confirmem).
3. **Cross-scene privacy gate** — `GET /maps/:id` aktuálně **chybí auth** (čerpá libovolný uživatel přes ID). Doplnit `JwtAuthGuard` + `assertCanReadScene` (PJ+ libovolnou, hráč jen pokud `scene.id === membership.currentSceneId`). Stejně `findById` v `MapsService` chrání další volaná místa.

Komponenta = **`10.2c-edit-1` v roadmapě**. Návazná na 10.2c (PJ panel), předpoklad pro 10.2d (combat tracker — vyžaduje že hráč fakt vidí jen svou scénu).

## Soubory

- `purpose.md` — účel, odpovědnosti, kontext
- `api.md` — nová `scene.deactivate` op, audit změna na `GET /maps/:id`
- `errors.md` — `MAP_SCENE_NO_ACTIVE` (existující), `MAP_FORBIDDEN_OTHER_SCENE` (nová)
- `security.md` — gate matrix per endpoint, deactivate cascade, audit findings
- `tests.md` — empty state UI, PJ self-switch, deactivate cascade, security gate
- `ai-notes.md` — pokyny pro implementaci, vazba na 10.2-prep-1 ops
