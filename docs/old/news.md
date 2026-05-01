# News

## Model `NewsItem`

Kolekce: název dle `MongoDBSettings.NewsCollectionName`.

| Pole | Typ | Popis |
|---|---|---|
| `Id` | ObjectId (string) | `_id` |
| `WorldId` | string? | `null`/MatrixWorldId = globální; jinak ID světa; `[BsonIgnoreIfNull]` |
| `Title` | string | Nadpis |
| `Content` | string | Text zprávy |
| `Date` | string | ISO 8601 string (např. `2025-01-15T10:00:00.000Z`) |
| `Type` | string | `"info"` \| `"alert"` \| `"system"` (výchozí `"info"`) |
| `Link` | string? | Volitelný odkaz |

**`NewsItemCreateDto`:** `Title`, `Content`, `Date?` (výchozí `DateTime.UtcNow.ToString("o")`), `Type?` (výchozí `"info"`), `Link?`.

---

## Compound index

Při startu `NewsService` se vytvoří složený index:

```
{ WorldId: ASC, Date: DESC }  — background: true
```

Pokrývá filtrované dotazy (`GetByWorld`) i seřazené (`GetLatest`, `GetAll`).

---

## API endpointy

Základní cesta: `api/news`

| Metoda | Endpoint | Auth | Popis |
|---|---|---|---|
| GET | `/api/news` | AnonymousAllowed | Všechny položky; `?limit=N` pro N nejnovějších; `?worldId=` pro filtr světa |
| GET | `/api/news/{id}` | AnonymousAllowed | Konkrétní položka dle MongoDB ObjectId |
| POST | `/api/news` | PJ/Admin/Superadmin | Vytvoří zprávu; `?worldId=` přiřadí ke světu |
| PUT | `/api/news/{id}` | PJ/Admin/Superadmin | Nahradí celou položku (ReplaceOne) |
| DELETE | `/api/news/{id}` | PJ/Admin/Superadmin | Smaže položku |

`?limit` se aplikuje i na výsledky filtrované přes `?worldId`.
