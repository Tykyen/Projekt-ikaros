# migrate-map-templates-ownerid-10.2c-edit-2

Backfill `ownerId` na existující `mapTemplates` před nasazením schemy s `required: true`.

## Proč

10.2c-edit-2 přidává per-PJ vlastnictví šablon (každá šablona patří jednomu uživateli). Existující šablony v DB jsou bez `ownerId` — nový `required: true` constraint by je zlomil. Tento skript je doplní default ownerem (Tyky/Superadmin) **před** migrací schemy.

Tyky pak může cizí šablony rozdat ostatním PJ ručně (Admin+Superadmin má bypass na `ownerId` checks).

## Spuštění

### Dry-run (bez `--apply`)

```bash
MONGODB_URI=mongodb://localhost:27017/ikaros npx tsx scripts/migrate-map-templates-ownerid-10.2c-edit-2/index.ts
```

Vypíše:
- jaký user bude default owner (lookup přes `tykytanjunior@gmail.com`)
- počet dotčených šablon
- sample (max 5) jmen a IDs

### Skutečná migrace (`--apply`)

```bash
MONGODB_URI=mongodb://prod:****/ikaros npx tsx scripts/migrate-map-templates-ownerid-10.2c-edit-2/index.ts --apply
```

Doplní `ownerId`, `createdAt`, `updatedAt` na všechny šablony bez `ownerId`. Skript je idempotentní — re-run na již migrovaných dokumentech nic neudělá.

### Alternativní owner email

```bash
... --apply --owner-email=jiny@example.cz
```

## Po migraci

1. Verify v Mongo: `db.mapTemplates.countDocuments({ ownerId: { $exists: false } })` musí být 0.
2. Nasadit BE s novou schemou (`ownerId: required: true`).
3. Nasadit FE.

## Rollback

Žádný automatický rollback (forward-only). V případě potřeby manuálně:

```js
db.mapTemplates.updateMany({}, { $unset: { ownerId: '', createdAt: '', updatedAt: '' } })
```

⚠️ Pozor — `unset createdAt/updatedAt` zláme `timestamps: true` Mongoose pole. V praxi se nedoporučuje rollbacknout migraci, raději opravit chybnou logiku forward.
