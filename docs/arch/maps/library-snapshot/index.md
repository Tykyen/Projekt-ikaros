# Map Library — full snapshot + per-PJ ownership (10.2c-edit-2)

Knihovna map (`mapTemplates` kolekce) má být **kompletní snapshot scény** + **per-PJ vlastnictví**. Dnes je oboje rozbité:

- **Save je ochuzený** — ukládá jen `imageUrl` + `config`; tokens/npcTemplates/effects/revealedHexes/activeSoundIds prázdné ([`MapLibraryModal.tsx:77-86`](../../../../Projekt-ikaros-FE/src/features/world/tactical-map/components/pj-panel/MapLibraryModal.tsx)).
- **Load je ochuzený** — aplikuje jen `scene.image` + `scene.config` ops; ostatní složky se ignorují (i kdyby byly v šabloně).
- **Kolekce je globální bez vlastnictví** — `MapTemplate` schema nemá `ownerId`; každý PJ vidí šablony všech PJ. **Security bug.**

Komponenta to opraví na čistém modelu:

1. **Full snapshot** — save uloží všechno (kromě PC tokenů, viz `purpose.md`); load aplikuje vše přes sekvenci `scene.*.replace` ops.
2. **`ownerId`** přidáno do schemy; `findAll` filtruje per-user (Admin+ vidí vše); `replace`/`delete` ownership check.
3. **Confirm dialog na load** — "Tohle přepíše aktuální scénu, vše současné se ztratí."
4. **Migrace existujících šablon** — přiřadit Tykymu (Superadmin) všechny bez `ownerId`.

Cross-world přenos zůstává implicitně — `MapTemplate` nemá `worldId`, kolekce globální.

Komponenta = **`10.2c-edit-2` v roadmapě**. Paralelní s [`scene-assignment-ux`](../scene-assignment-ux/index.md), nesdílí soubory.

## Soubory

- `purpose.md` — účel, odpovědnosti, hranice
- `data-models.md` — rozšířená `MapTemplate` schema, ownerId, migrace
- `api.md` — save/load behavior, filter logic, confirm dialog spec
- `errors.md` — `MAP_TEMPLATE_FORBIDDEN_OWNER`, refinement existujících
- `security.md` — per-PJ ownership matrix, admin bypass, migrace audit
- `tests.md` — save/load roundtrip, ownership filter, migrace dat
- `ai-notes.md` — postup, migrace skripty, časté chyby
