# AI poznámky

## Před zahájením

1. Přečíst [`operations/index.md`](../operations/index.md) — kontext per-scene ops; tento spec přidává 5 nových op types.
2. Přečíst [`scene-assignment-ux/index.md`](../scene-assignment-ux/index.md) — paralelní spec, mohou se merge konflikty pokud oba upraví `MapOperation` discriminated union.
3. Ověřit současný stav:
   - `MapTemplate` schema, repository, controller
   - `MapLibraryModal.tsx` FE
   - `MapOperation` typescript union BE + FE
4. Ověřit existenci `ConfirmModal` v shared/ui (pokud chybí, vytvořit nebo použít fallback).

## Závislosti

- **10.2-prep-1 operations API** — nutné rozšířit o 5 nových op types. Změna v:
  - `backend/src/modules/maps/interfaces/map-operation.interface.ts` (BE union)
  - `backend/src/modules/maps/operations/map-operations.service.ts` (handlery)
  - `backend/src/modules/maps/operations/operations-authorizer.service.ts` (PJ-only guards)
  - `Projekt-ikaros-FE/src/features/world/tactical-map/types.ts` (FE union)
- **`MapTemplate` migrace** — musí proběhnout **PŘED** nasazením new schemy (jinak `required: ownerId` zláme load existujících dokumentů).
- **Žádná závislost na `scene-assignment-ux`** — paralelní specy, nesdílí runtime code, jen oba se dotýkají `MapOperation` union (merge konflikty řešitelné běžně).

## Časté chyby (na co si dát pozor)

### Sekvence ops na load — NENÍ ATOMIC celá

Mezi `scene.image` a `scene.tokens.replace-npc` může selhat libovolná op (network glitch, validace). Výsledek: částečný load (pozadí už nové, NPC ještě staré).

**Možnosti:**

1. **Akceptovat částečný stav** — UX: toast "Načtení selhalo na X, zkuste znovu". PJ smaže scénu a zopakuje. Jednoduché.
2. **Transakční bulk op** `scene.load-template` — server přijme celou šablonu, atomic update. Komplikuje BE.
3. **Klient-side rollback** — pamatovat predchozí state, při fail aplikovat reverse ops. Komplikuje FE.

**Rozhodnutí (toto spec):** **Akceptovat částečný stav** + dobré error UX. Pokud se ukáže v praxi jako problém, dořešíme přes (2) v dalším iteration.

### `ownerId` při PUT — strip z body

Defense in depth: i když controller přepíše `ownerId` z existing, vstup může obsahovat dirty data. Použít DTO bez `ownerId` field. Pokud body přichází jako `Record<string, unknown>`, ručně `delete payload.ownerId`.

### Server-side PC token filter — fail-safe

I když FE filtruje, BE musí. Pokud klient pošle malicious payload nebo nahláska JSON manuálně, server zajistí integritu. Test pokrývá toto.

### Confirm dialog v `MapLibraryModal`

Dnešní `MapLibraryModal` neimportuje žádný confirm helper. Najít existující v projektu nebo vytvořit. **Nepoužívat `window.confirm`** — native styl porušuje konzistenci.

### Migrace — atomicity

Migrační skript nemá transakce (Mongo do verze 4.0 nepodporuje na single-replica). Pokud skript selže uprostřed:

- Část dokumentů má `ownerId`, část ne
- `required: true` v schemě by zamítl write neúplných → ale ty `findMany` projdou
- Po restart skript znovu — pokrýt zbytek (idempotent)

**Doporučení:** spustit skript se `--dry-run` nejdřív (vypsat počet), pak ostře.

### Index ownerId

Bez `{ ownerId: 1, updatedAt: -1 }` indexu by `findByOwner` plně skenoval. Při deploymentu na produkční DB **manuálně vytvořit index** nebo nechat Mongoose `createIndexes()` při startupu.

## Doporučený postup

1. **BE — migrace skript** + manuální spuštění v dev DB
2. **BE — schema update** (`ownerId` required, `createdAt/updatedAt`)
3. **BE — repository** (`findByOwner`)
4. **BE — controller** (filter, guards, DTO, PC filter)
5. **BE — 5 nových op types** (handler + authorizer + tests)
6. **BE — integrační test roundtrip save→load**
7. **FE — `types.ts`** rozšíření `MapOperation`
8. **FE — `MapLibraryModal` save mutation**
9. **FE — `ConfirmModal` (pokud chybí)**
10. **FE — `MapLibraryModal` load mutation se sekvencí ops + confirm**
11. **E2E testy**
12. **/code-review** před commit

## Co NEDĚLAT

- **Nepřidávat published/sharing flag** — samostatný spec, ne teď.
- **Nepřidávat versioning** — mimo rozsah.
- **Neukládat PC tokeny** ani omylem (test ten case explicit).
- **Nepřesouvat ownerId logic do hooku/middleware** — controller je správné místo (viditelnost).
- **Neměnit chování `findActiveForUser`** — týká se `scene-assignment-ux`, ne tohoto.
- **Neimplementovat transakční bulk `scene.load-template`** — odložené, akceptujeme částečný stav s dobrým UX.

## Otevřené body (pro implementaci)

1. **`ConfirmModal` v shared/ui — existuje?** Ověřit, případně vytvořit basic verzi.
2. **Cypress vs Playwright** — který E2E framework projekt používá? Memory neuvádí; ověřit.
3. **Admin endpoint pro change ownership** — momentálně mimo rozsah, ale dokumentovat jako "future need" pokud Tyky bude rozdávat šablony jinému PJ často.
