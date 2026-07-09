# Seed komunitního bestiáře (VB příběh → JaD)

Naimportuje bestie z migrovaných dokumentů (VB příběh) do **komunitního
(globálního) bestiáře** jako **schválené JaD bytosti**, včetně portrétů
(Cloudinary WebP).

## Co dělá

- Načte `*.bestie.json` + obrázky z `MIGRACE_DIR`
  (default `C:\Matrix\ProjektIkaros\migrace-bestiae`, struktura
  `<soubor>.bestie.json` + `<soubor>/media/*`).
- Nahraje portrét na Cloudinary (folder `community-bestiae`, formát **WebP**).
- Vloží community bestie (`scope:'community'`, `systemId:'jad'`,
  `status:'approved'`, `statblocks.jad`) přímým `insertMany` (obchází HTTP
  validaci — nejrychlejší pro stovky kusů).
- **Autor** = Superadmin (`tykytanjunior@gmail.com`) z cílové DB.
- **Idempotence:** `clonedFromId = seed:jad:<soubor>:<jméno>` → opakované
  spuštění přeskočí už vložené (bezpečné pouštět víckrát).

## Předpoklady

1. Data ve složce `migrace-bestiae` (na stroji, odkud script pouštíš).
2. `.env` v backendu:
   - `CLOUDINARY_URL` — pro upload obrázků (už nastaveno).
   - `MONGODB_URI` — **cíl**. Pro produkci přepiš na produkční connection string
     (viz níže), jinak seedne do lokální DB!
3. Superadmin účet existuje v cílové DB.

## Spuštění (cwd = `backend`)

```powershell
# produkční connection string (jinak jde do localhostu):
$env:MONGODB_URI = "<PROD_CONNECTION_STRING>"

# 1) kontrola — nic nezapíše:
npx ts-node scripts/seed-community-bestiae/index.ts --dry-run

# 2) test 5 kusů (nahraje 5 obrázků + vloží 5 bestií):
npx ts-node scripts/seed-community-bestiae/index.ts --limit 5

# 3) plný běh:
npx ts-node scripts/seed-community-bestiae/index.ts
```

Data lze přesměrovat: `$env:MIGRACE_DIR = "D:\jina\cesta"`.

## Poznámky

- Chybné hodnoty ze zdroje (např. `OČ 85`, okrajové tvary velikosti jako
  „Gigantičtí") **zůstávají** — počítá se s ruční kontrolou v aplikaci.
- `check-users.ts` = diagnostika: `npx ts-node scripts/seed-community-bestiae/check-users.ts`
  vypíše uživatele + počty `users`/`bestiae` v cílové DB (ověření, že míříš
  na správnou databázi).
- Parser dokumentů žije mimo tento repo (ve scratchpadu migrace); zde je jen
  seed hotových `*.bestie.json`.
