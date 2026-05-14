# Migrate WorldNews

Jednorázový import news ze starého .NET produkčního systému.

## Použití

```bash
# Z backend/ adresáře — env var inline (preferováno)
MONGODB_URI=mongodb://localhost:27017/ikaros npx ts-node scripts/migrate-world-news/index.ts --input=./data/news-export.json --dry-run

# Nebo přes Node --env-file (Node 20+, čte backend/.env)
node --env-file=.env -r ts-node/register scripts/migrate-world-news/index.ts --input=./data/news-export.json

# Nebo přes npm script (spoléhá na shell env)
MONGODB_URI=mongodb://... npm run migrate:news -- --input=./data/news-export.json
```

> **Pozn.:** Skript NEčte `.env` automaticky (žádný `dotenv` import — vyhýbáme se závislosti). Pokud `MONGODB_URI` není v env, skript použije fallback `mongodb://localhost:27017/ikaros`.

## Vstupní formát

JSON pole s objekty (formát `mongoexport --jsonArray` ze staré DB):

```json
[
  {
    "_id": { "$oid": "65a1b2c3d4e5f60123456789" },
    "WorldId": "65a1...",
    "Title": "...",
    "Content": "...",
    "Date": "2025-01-15T10:00:00.000Z",
    "Type": "info",
    "Link": "https://..."
  }
]
```

## Chování

- **Idempotentní:** `bulkWrite replaceOne` s `upsert: true` per `_id`. Re-run nevytvoří duplicity.
- **Skip on error:** položky bez `Title`/`Content`/`Date` nebo s neplatným `Type` se logují a skipnou. Migrace nepadne.
- **`MatrixWorldId` / null / "" → null** (globální).
- **`--dry-run`:** validuje a počítá, žádný zápis.
- **Connection:** čte `MONGODB_URI` z shell env (s fallbackem na localhost).
