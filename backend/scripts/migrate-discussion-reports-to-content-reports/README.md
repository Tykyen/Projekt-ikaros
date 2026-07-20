# migrate-discussion-reports-to-content-reports (B4d)

Zkopíruje legacy nahlášené příspěvky z kolekce `ikaros_discussion_reports` do
generické kolekce `content_reports` (modul `moderation`).

Fáze B4d sjednotila diskuzní nahlašování pod generický modul `moderation`.
Starý dual-systém (`discussion_report`) byl odstraněn z kódu; existující data
je potřeba jednorázově přenést, aby nevyřízené legacy reporty zůstaly ve frontě
„Zpracovat" (nově jako `content_report`).

## Mapování

| content_reports     | zdroj (ikaros_discussion_reports)      |
| ------------------- | -------------------------------------- |
| `targetType`        | `'discussion_post'`                    |
| `targetId`          | `postId`                               |
| `targetUrl`         | `/ikaros/diskuze/{discussionId}`       |
| `targetSnapshot`    | `postContentSnapshot`                  |
| `targetAuthorName`  | `postAuthorName`                       |
| `category`          | `'other'` (legacy nemá kategorii)      |
| `reason`            | `reason`                               |
| `reporterId/Name`   | `reporterId` / `reporterName`          |
| `goodFaith`         | `true`                                 |
| `notifyMe`          | `false`                                |
| `anonymous`         | `false`                                |
| `status`            | `resolved ? 'resolved' : 'pending'`    |
| `createdAtUtc`      | `createdAtUtc`                         |

## Spuštění

### ⚠️ V PRODUKCI tímhle skriptem NE (24.2 / D-074)

`npm run migrate:discussion-reports` **v produkčním kontejneru nefunguje** a nikdy
nefungoval: BE image nese jen `dist/` + prod `node_modules`, složka `scripts/` se
do něj nekopíruje vůbec a `ts-node` je devDependency, kterou smaže
`npm prune --omit=dev`. Padne tedy na obojím.

**Produkční cesta = workflow `Migrace nahlášených příspěvků`** (FE repo,
`.github/workflows/migrate-discussion-reports.yml`) → `docker cp` čistého JS
skriptu do kontejneru + `docker exec node`. Default dry-run, zápis zaškrtnutím
`apply`. Runtime skript: `scripts/seed-migrace/migrate-discussion-reports.js` (FE repo).

### Lokálně / dev (kde `ts-node` existuje)

```bash
# dry-run — jen spočítá, nezapisuje
MONGODB_URI=mongodb://... npm run migrate:discussion-reports -- --dry-run

# ostrá migrace
MONGODB_URI=mongodb://... npm run migrate:discussion-reports
```

> Pozor na obrácený default: tahle TS varianta zapisuje, pokud `--dry-run`
> NEuvedeš. Produkční JS skript je naopak bezpečný — bez `APPLY=1` jen počítá.

`mapper.ts` (+ `mapper.spec.ts`) zůstává testovanou referencí mapovací logiky;
JS skript nese její kopii, protože v kontejneru není TS. Migrace je jednorázová,
takže se nemají jak rozejít.

## Vlastnosti

- **Idempotentní** — už zmigrované reporty se přeskočí (dedupe dle dvojice
  `targetId` + `createdAtUtc`); re-run nevytvoří duplikáty.
- **Legacy kolekci NEMAŽE** — `ikaros_discussion_reports` zůstává jako audit
  stopa. Migrace jen kopíruje.
