# Přítomnost a statistiky

## Presence

### Mechanismus

`PresenceController` deleguje vše na `UserService`. Nemá vlastní model ani kolekci — využívá pole `LastSeenUtc` na modelu `User`.

**Heartbeat:** Každé volání `GET /api/presence/online` automaticky zavolá `_userService.UpdateLastSeen(callerId)` pro přihlášeného uživatele. Klient "zůstává online" pouhým pollingem tohoto endpointu.

`UserService.GetOnlineUserIds()` vrací ID uživatelů, jejichž `LastSeenUtc` je novější než definovaný timeout (implementace v `UserService`).

### API endpointy

| Metoda | Endpoint | Auth | Popis |
|---|---|---|---|
| GET | `/api/presence/online` | Authorize | Aktualizuje `LastSeenUtc` volajícího, vrátí `List<string>` (userId online uživatelů) |

---

## Statistiky

### `StatsController`

Závislosti: `StatsService`, `ISearchCoordinator`, `PagesService`, `ILogger`.

### API endpointy

| Metoda | Endpoint | Auth | Popis |
|---|---|---|---|
| GET | `/api/stats/search` | — | Aktuální statistiky search indexu → `SearchIndexStats` (async, CancellationToken) |
| POST | `/api/stats/search/rebuild` | — | Spustí kompletní rebuild Lucene indexu (`ISearchCoordinator.RebuildIndex()`); vrátí 202 Accepted |
| POST | `/api/stats/search/reindex` | — | Reindexuje jednu stránku; body: `{ Slug?, PageId? }` — hledá nejprve dle slug, pak dle id; vrátí 202 Accepted |

**`SearchIndexStats`** — definováno v `StatsService`; obsahuje statistiky stavu Lucene indexu.

**`ISearchCoordinator.RebuildIndex()`** — plný rebuild indexu (spouští se na pozadí).

**`ISearchCoordinator.UpdatePageInIndex(page)`** — inkrementální reindex jedné stránky.
