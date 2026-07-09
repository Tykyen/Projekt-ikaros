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

```bash
# dry-run — jen spočítá, nezapisuje
MONGODB_URI=mongodb://... npm run migrate:discussion-reports -- --dry-run

# ostrá migrace
MONGODB_URI=mongodb://... npm run migrate:discussion-reports
```

## Vlastnosti

- **Idempotentní** — už zmigrované reporty se přeskočí (dedupe dle dvojice
  `targetId` + `createdAtUtc`); re-run nevytvoří duplikáty.
- **Legacy kolekci NEMAŽE** — `ikaros_discussion_reports` zůstává jako audit
  stopa. Migrace jen kopíruje.
