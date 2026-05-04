# Krok 10g — WorldNews: Design Spec

**Datum:** 2026-05-04  
**Stav:** Schváleno

---

## Přehled

Modul pro správu novinek — globálních (platformových) i per-world. GET endpointy jsou anonymní. Jeden flat endpoint `/api/news` s `worldId` query parametrem rozlišuje globální od per-world novinek.

---

## Datový model

### Kolekce `world_news`

```
NewsItem {
  id: string
  worldId: string | null     // null = globální (platformová novinka)
  title: string
  content: string
  date: Date                 // autor-nastavené datum (řazení, zobrazení; umožňuje zpětné datování)
  type: 'info' | 'alert' | 'system'   // vizuální klasifikace, nemá vliv na přístupová pravidla
  link?: string              // volitelný URL — kliknutím na novinkový box přechod na odkaz
  authorId: string           // plněno server-side z JWT
  authorName: string         // plněno server-side z JWT
  createdAt: Date
  updatedAt: Date
}
```

**Index:** `(worldId, date DESC)`

---

## API endpointy

Prefix: `/api/news`

| Metoda | URL | Popis | Auth |
|--------|-----|-------|------|
| GET | `/` | Seznam novinek | anonymní |
| GET | `/:id` | Detail novinky | anonymní |
| POST | `/` | Vytvoř novinku | podmíněně (viz níže) |
| PUT | `/:id` | Aktualizuj novinku | podmíněně (viz níže) |
| DELETE | `/:id` | Smaž novinku | podmíněně (viz níže) |

### Query parametry pro GET `/`

| Parametr | Typ | Popis |
|----------|-----|-------|
| `worldId` | string (optional) | Filtr per-world novinek; bez parametru = globální (worldId=null) |
| `limit` | number (optional) | Max počet vrácených položek; default 20 |

Výsledky jsou řazeny dle `date DESC`.

---

## Přístupová pravidla

### Čtení

Všechny GET endpointy jsou `AllowAnonymous` — bez JWT.

### Zápis (POST / PUT / DELETE)

| Typ novinky | Minimální role |
|-------------|----------------|
| Globální (`worldId=null`) | Superadmin nebo Admin |
| Per-world (`worldId=X`) | PJ nebo PomocnýPJ daného světa (+ Admin/Superadmin globálně) |

PUT/DELETE: vlastník novinky (`authorId`) nebo Admin/Superadmin smí editovat/mazat.

---

## Validace

- `title`, `content`, `date` jsou povinné → 422 pokud chybí
- `type` musí být `info | alert | system` → 422 jinak
- `link` volitelný; pokud přítomen, musí být validní URL (začíná `http://` nebo `https://`) → 422 jinak
- POST s `worldId` — svět musí existovat → 404 jinak
- `authorId` a `authorName` se plní server-side ze JWT; frontend je neodesílá

---

## Poznámky k implementaci

- `worldId=null` v dotazu MongoDB vyžaduje explicitní `{ worldId: null }` (ne `{ worldId: { $exists: false } }`)
- Index `(worldId, date DESC)` pokryje jak globální dotazy (`worldId: null`), tak per-world (`worldId: 'xxx'`)
- Modul nevyžaduje WebSocket ani background joby
