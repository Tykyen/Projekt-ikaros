# Migrace 8.6 — Finance single → multi-account

Migruje existující `character_finances` dokumenty do nového multi-account modelu:

- Vytvoří 1 účet v `character_accounts` per existující `CharacterFinance` (label „Hlavní účet").
- `entries[]` rozdělí podle znaménka na `incomeEntries[]` (≥ 0) a `expenseEntries[]` (< 0, abs).
- Stará pole (`accountType`, `accessLocation`, `currency`, `balance`, `entries`, `transactions`, `notes`) z `character_finances` dokumentu odstraní; `isHidden` ponechá.

## Idempotence

Skip pokud už existuje `character_accounts` dokument s `primaryOwnerId == characterId`. Lze spustit opakovaně bez duplicit.

## Spuštění

```bash
# Záloha (povinné!)
mongodump --db ikaros --collection character_finances --out backup-pre-8.6

# Dry-run (žádný zápis)
MONGODB_URI=mongodb://localhost:27017/ikaros npx ts-node scripts/migrate-finance-multi-account-8.6/index.ts --dry-run

# Reálná migrace
MONGODB_URI=mongodb://localhost:27017/ikaros npx ts-node scripts/migrate-finance-multi-account-8.6/index.ts
```

## Rollback

Pokud něco selže:

```bash
mongorestore --db ikaros --collection character_finances backup-pre-8.6/ikaros/character_finances.bson --drop
mongo ikaros --eval 'db.character_accounts.drop()'
```

## Co skript NEpřevede automaticky

- **`accessLocation`** byl free text — nová podoba je reference na character (`{ type: 'character', characterId }`). Migrace nastaví `null`; PJ ručně vyplní přes UI „Nastavení účtu".
- **`currency`** kód — pokud staré finance měly `currency: ''`, dosadí se default `'MNC'` (univerzální Mince). PJ může změnit v UI.
