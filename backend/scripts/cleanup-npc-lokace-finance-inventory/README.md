# Cleanup orphan finance/inventory subdoců NPC a Lokací (D-NEW-INV-DATA-SYNC)

`onCharacterCreated` dřív zakládal finance + inventory subdoc KAŽDÉ entitě
(8.1-FIR), ale `getFinance`/`getInventory` je pro NPC/Lokaci blokuje 404
`FINANCE_NOT_APPLICABLE` / `INVENTORY_NOT_APPLICABLE` (EC-03) → v DB ležela
nečitelná orphan data.

Kaskáda je od 2026-07-12 opravená (finance/inventory se zakládají JEN pro
PC). Tento skript uklidí historické orphany.

## Co se smaže

Finance/inventory subdocy postav, které jsou **NPC (`isNpc: true`) nebo
Lokace (`kind: 'location'`)** — a JEN pokud jsou **prázdné** (přesně stav
po `create`):

| Subdoc    | Podmínka prázdnosti                                            |
| --------- | -------------------------------------------------------------- |
| finance   | `balance` 0/chybí ∧ `entries` prázdné ∧ `transactions` prázdné ∧ `notes` prázdné |
| inventory | `sections` prázdné ∧ `notes` prázdné                            |

## Co zůstává (záměrně)

- **Neprázdné subdocy NPC/Lokací** — PC→NPC konverze subdoc jen skrývá
  (`isHidden: true`) a zpětná NPC→PC konverze ho odkryje; data musí přežít
  round-trip (A→B→A). Stejně tak data z Matrix migrace.
- Calendar (má ho každá entita, Spec 9.2), diary/notes (persony) — mimo scope.

## Idempotence

Ano — mazání už smazaných dokumentů je no-op; opakované spuštění nic nerozbije.

## Spuštění

```bash
# Nejdřív dry-run (jen souhrn, nic nemaže):
MONGODB_URI=mongodb://... ts-node scripts/cleanup-npc-lokace-finance-inventory/index.ts --dry-run

# Volitelně omezit na jeden svět:
MONGODB_URI=mongodb://... ts-node scripts/cleanup-npc-lokace-finance-inventory/index.ts --dry-run --world=<worldId>

# Ostrý běh:
MONGODB_URI=mongodb://... ts-node scripts/cleanup-npc-lokace-finance-inventory/index.ts
```
