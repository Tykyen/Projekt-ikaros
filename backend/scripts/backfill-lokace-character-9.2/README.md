# Backfill Lokace → Character (spec 9.2)

Vytvoří `Character` entity (`kind: 'location'`) + prázdný `characterCalendar`
subdoc pro každou existující `Page` typu `Lokace`, která ještě nemá `characterRef`.

## Proč

Spec 10b explicitně počítala, že Lokace = entity s pouze kalendářem. Krok 9.1
unifikace Character → Page tento koncept rozbil — Lokace se migrovala na
`PageType.Lokace`, ale ztratila `characterRef` link na subdoc kontejner.
Spec 9.2 koncept obnovuje pomocí `Character.kind` enumu; tento backfill ho
aplikuje na existující data.

## Bezpečnost

- **Idempotentní**: filtr `characterRef: null` zajistí, že re-spuštění už migrované
  Lokace přeskočí.
- **Re-link**: pokud Character s daným `(worldId, slug)` už existuje (např. po
  manuálním zásahu), skript ho jen napojí přes `characterRef` místo duplikace.
- **Dry-run default**: bez `--apply` jen loguje plánované změny.

## Spuštění

```bash
# Dry-run — co by se stalo (default):
MONGODB_URI=mongodb://localhost:27017/ikaros \
  npx tsx scripts/backfill-lokace-character-9.2/index.ts

# Skutečná migrace:
MONGODB_URI=mongodb://localhost:27017/ikaros \
  npx tsx scripts/backfill-lokace-character-9.2/index.ts --apply

# Per-svět (test na 1 světě):
MONGODB_URI=... npx tsx scripts/backfill-lokace-character-9.2/index.ts --world=<worldId> --apply
```

## Co se mění v DB

Pro každou Lokaci bez `characterRef`:

1. `characters` collection: insert `{ slug, name, worldId, kind: 'location', isNpc: false, ... }`
2. `charactercalendars` collection: insert `{ characterId, worldId, color: '#3B82F6', events: [], displaySettings: {}, ... }`
3. `pages` collection: `$set: { characterRef: { characterId } }`

## Verifikace po `--apply`

```js
// Mongo shell:
db.pages.countDocuments({ type: 'Lokace', 'characterRef.characterId': { $exists: false } })
// → 0

db.characters.countDocuments({ kind: 'location' })
// → odpovídá počtu Lokace pages

db.charactercalendars.countDocuments({ characterId: { $in: <character ids> } })
// → odpovídá počtu Lokace pages
```
