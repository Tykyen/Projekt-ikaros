# migrate-message-threads (3.5)

Backfill `conversationId` pro existující zprávy v kolekci `ikarosmessages`.

Krok 3.5 zavedl threading — každá zpráva má `conversationId` (kořen vlákna).
Staré zprávy ho nemají. Tento skript jim ho doplní: `conversationId = _id`
(každá stará zpráva = kořen vlastního vlákna).

## Spuštění

```bash
# dry-run — jen spočítá, nezapisuje
MONGODB_URI=mongodb://... npm run migrate:message-threads -- --dry-run

# ostrá migrace
MONGODB_URI=mongodb://... npm run migrate:message-threads
```

## Vlastnosti

- **Idempotentní** — re-run nenajde žádné zprávy bez `conversationId`.
- **Bezpečné bez migrace** — service při čtení používá fallback
  (`conversationId || _id`), takže i nezmigrovaná data fungují; migrace jen
  zrychlí dotaz na vlákno (index `{ conversationId, sentAtUtc }`).
