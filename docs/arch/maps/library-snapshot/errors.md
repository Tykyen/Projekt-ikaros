# Chybové stavy

## `MAP_TEMPLATE_NOT_FOUND`

| Pole | Hodnota |
|---|---|
| HTTP status | 404 |
| Endpoint | `GET/PUT/DELETE /map-templates/:id` |
| Příčina | ID v Mongo neexistuje |
| Handling FE | Toast "Šablona nenalezena", refresh listu |

**Beze změny.**

## `MAP_TEMPLATE_FORBIDDEN`

| Pole | Hodnota |
|---|---|
| HTTP status | 403 |
| Endpoint | `POST /map-templates` |
| Příčina | Role > PJ (Hráč pokouší vytvořit šablonu) |
| Handling FE | Hide UI tlačítek; pokud i tak request projde, toast "Nedostatečná oprávnění" |

**Změna:** dnes vrací `NotFoundException` (= 404). Opravit na `ForbiddenException` (= 403).

## `MAP_TEMPLATE_FORBIDDEN_OWNER` (nová)

| Pole | Hodnota |
|---|---|
| HTTP status | 403 |
| Endpoint | `GET /map-templates/:id`, `PUT /map-templates/:id`, `DELETE /map-templates/:id` |
| Příčina | Šablona patří jinému PJ a volající není Admin/Superadmin |
| Handling FE | Toast "Šablona patří jinému PJ"; refresh listu (možná stale cache) |

**Klíčové:** Tato chyba nikdy nevznikne přes `GET /map-templates` (list) — list už filtruje per ownerId, takže klient neuvidí IDs cizích šablon, na které by mohl jít přes detail. **Info leak prevence ✓.**

## `MAP_TEMPLATE_INVALID` (nová)

| Pole | Hodnota |
|---|---|
| HTTP status | 400 |
| Endpoint | `POST /map-templates`, `PUT /map-templates/:id` |
| Příčina | Validace selhala — chybí `name` nebo `imageUrl`, jméno přes 100 znaků |
| Handling FE | Inline hláška v modalu vedle pole, ne toast |

## Nepatří sem

- **`MAP_NO_ACTIVE_SCENE`** (load do scény, která neexistuje) — pokrývá [`scene-assignment-ux`](../scene-assignment-ux/errors.md).
- **`MAP_OP_FORBIDDEN`** (per-op authorization při load sekvenci) — pokrývá [`operations`](../operations/errors.md). Load aplikuje řadu ops přes existující endpoint, dědí všechny jeho chyby.
- **`MAP_OP_INVALID`** — stejně.
- **Sound not found** — pokud `activeSoundIds` ukazuje na smazaný sound, klient toleruje (přeskočí). Žádná FE chyba.
