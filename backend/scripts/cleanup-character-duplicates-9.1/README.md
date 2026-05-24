# Cleanup duplicitních polí Character (krok 9.1 finální fáze)

Po sjednocení Character → Page (`migrate-characters-to-pages-9.1`) jsou
data postavy uložena duplicitně:

- Bio v Page.content + Character.publicBio
- Atributy v Page.table + Character.publicInfoBlocks
- Soukromé v Page.privateContent + Character.privateBio
- atd.

Tento skript smaže duplikované polí z Character entity. Character zůstane
jen jako kontejner pro 5 subdokumentů (diary/calendar/finance/inventory/notes).

## Pre-condition

**Před tímto skriptem MUSÍ proběhnout `migrate-characters-to-pages-9.1`.**

Skript sám si ověří, že každý Character má Page mirror (`characterRef`).
Pokud ne, ZASTAVÍ se a vypíše počet chybějících. Cleanup bez kompletní
migrace by trvale ztratil bio data postav bez Page entity.

## Co se smaže

| Pole z Character     | Kanonicky v Page            |
| -------------------- | --------------------------- |
| `publicBio`          | `Page.content`              |
| `publicInfoBlocks`   | `Page.table.headers/values` |
| `privateBio`         | `Page.privateContent`       |
| `privateInfoBlocks`  | `Page.privateInfoBlocks`    |
| `accessRequirements` | `Page.accessRequirements`   |
| `isLocation`         | `Page.type === 'Lokace'`    |
| `imageUrl`           | `Page.imageUrl`             |

## Co zůstává

- `id, slug, name, worldId, userId, isNpc` — subdoc API permission lookup
- `diaryData, extraBlocks, customData, campaignSubjectId` — subdoc data
- `createdAt, updatedAt` — timestamps

## Idempotence

`$unset` na neexistující pole je no-op. Můžeš skript spustit znovu
bez konsekvencí.

## Spouštění

```bash
# Dry-run (žádný zápis, sample 5 dokumentů + safety counts)
MONGODB_URI=... npx ts-node scripts/cleanup-character-duplicates-9.1/index.ts --dry-run

# Filter na 1 svět
MONGODB_URI=... npx ts-node scripts/cleanup-character-duplicates-9.1/index.ts --world=<id> --dry-run

# Naostro
MONGODB_URI=... npx ts-node scripts/cleanup-character-duplicates-9.1/index.ts
```

## Pre-flight checklist

1. ✅ Migrace `migrate-characters-to-pages-9.1` proběhla na všech světech
2. ✅ DB snapshot vyhotoven (`mongodump`)
3. ✅ Aplikace v produkci běží 1+ měsíc na 9.1 kódu bez issues
4. ✅ Tento skript spuštěn s `--dry-run` — output odpovídá očekávání
5. ✅ Nasazená verze BE/FE nepoužívá smazaná pole (musí být deploy nového
   kódu **současně** se spuštěním cleanup migrace)

## Rollback

Pole jsou ireverzibilně smazaná. Recovery jen z DB snapshotu:

```bash
mongorestore --uri=$MONGODB_URI --db=ikaros --drop ./backup-pre-cleanup
```
