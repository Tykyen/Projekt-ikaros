# Migrace Character → Page (krok 9.1)

Sjednocuje strukturu `Character` a `Page` entity — pro každý existující
Character vytvoří odpovídající Page s typem `Postava hráče` (PC),
`NPC` nebo `Lokace`.

## Co skript dělá

1. Načte všechny `characters` (volitelně filtr na svět: `--world=<id>`)
2. Pro každý:
   - Najde volný slug (kolize s existujícími Pages → suffix `-postava`)
   - Vytvoří `Page` s mapováním:
     | Character pole | Page pole |
     |---|---|
     | `name` | `title` |
     | `slug` | `slug` (resolved) |
     | `worldId` | `worldId` |
     | `userId` | `ownerUserId` (jen PC) |
     | `isNpc` | → `type: 'NPC'` |
     | `isLocation` | → `type: 'Lokace'` |
     | (default) | → `type: 'Postava hráče'` |
     | `imageUrl` | `imageUrl` |
     | `publicBio` | `content` (rich-text HTML) |
     | `publicInfoBlocks` | `table.headers/values` |
     | `privateBio` | `privateContent` (persona only) |
     | `privateInfoBlocks` | `privateInfoBlocks` (persona only) |
     | `accessRequirements` | `accessRequirements` |
     | `customData` | `customData` |
     | `_id` | `characterRef.characterId` |
3. Character entity **NEMODIFIKUJE** — subdokumenty (diary/calendar/finance/
   inventory/notes) si dál spravuje původní entita. F7 cleanup vyčistí
   duplicitní pole až po stabilizaci.

## Idempotence

Pokud Page s `characterRef.characterId == char._id` už existuje, character
se přeskočí. Můžeš skript spustit znovu bez duplicitního zápisu.

## Spuštění

```bash
# Dry run (žádný zápis, jen report)
MONGODB_URI=mongodb://... npx ts-node scripts/migrate-characters-to-pages-9.1/index.ts --dry-run

# Filter na 1 svět
MONGODB_URI=mongodb://... npx ts-node scripts/migrate-characters-to-pages-9.1/index.ts --world=64abcd... --dry-run

# Naostro
MONGODB_URI=mongodb://... npx ts-node scripts/migrate-characters-to-pages-9.1/index.ts
```

## Před spuštěním

**Vždy udělej DB snapshot/export** — migrace je nezvratná (přidává Page
entries, které by se ručně mazaly dlouho).

```bash
mongodump --uri=$MONGODB_URI --db=ikaros --out=./backup-pre-9.1
```

## Po spuštění

1. Ověř FE — `/svet/<w>/postavy` zobrazí stejný seznam (CharactersPage
   stále čte z Character entity v F6; po F7 přejde na Pages directory).
2. Nový PC/NPC přes `+ Nová stránka` wizard → vytvoří **jen Page** (bez
   Character entity), takže 5 subdokumentů zatím nebude dostupných.
   Plná integrace subdokumentů přes `characterRef` přijde v navazujícím
   PR (mimo 9.1 scope).
3. Po ověření spusť cleanup migraci, která:
   - Smaže duplicitní pole z Character (`name`, `slug`, `publicBio`, …)
   - Ponechá jen subdoc-relevantní pole

## Rollback

Smazat Page entries vytvořené migrací:

```bash
mongosh "$MONGODB_URI" --eval 'db.pages.deleteMany({ characterRef: { $exists: true } })'
```

Character entity nedotčená, žádný další rollback nutný.
