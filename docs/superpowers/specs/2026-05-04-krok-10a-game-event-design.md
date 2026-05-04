# Krok 10a — GameEvent: Design spec

**Datum:** 2026-05-04  
**Status:** schváleno

---

## Přehled

Herní události světa s RSVP potvrzením, skupinovou viditelností a diskusí (komentáře, vlákna, reakce). Cleanup cron job maže staré eventy automaticky.

---

## Schema

### GameEvent

```ts
{
  worldId:     string          // reference na World
  title:       string
  date:        string          // ISO 8601, primární sort key
  targetGroup: string | null   // skupina, pro kterou je event určen
  groupOnly:   boolean         // default false — omezí viditelnost na skupinu
  imageUrl:    string | null
  description: string
  confirmable: boolean         // zapíná RSVP
  confirmedBy: EventConfirmation[]
  comments:    EventComment[]
}
```

### EventConfirmation (subdokument)

```ts
{
  userId:   string
  userName: string
}
```

### EventComment (subdokument)

```ts
{
  id:         string          // nanoid
  parentId:   string | null   // null = kořenový; jinak reply na jiný komentář
  authorId:   string
  authorName: string
  content:    string          // plain text, může obsahovat URL
  createdAt:  Date
  editedAt:   Date | null
  reactions:  Record<string, string[]>  // emoji → userId[]
  isDeleted:  boolean         // soft delete — content se vyprázdní, authorName zůstane
}
```

### Index

```
{ worldId: 1, date: 1 }
```

---

## Viditelnost

Pravidlo se aplikuje na event i na jeho komentáře:

| targetGroup | groupOnly | Vidí |
|-------------|-----------|------|
| null        | (ignoruje se) | všichni členové světa |
| nastavena   | false     | všichni členové světa |
| nastavena   | true      | jen členové skupiny + PJ/PomocnýPJ |

PJ a PomocnýPJ vidí vždy vše bez ohledu na nastavení.

---

## Oprávnění

| Akce | Role |
|------|------|
| Číst eventy | všichni členové světa (s respektováním viditelnosti) |
| Vytvořit event | PJ, PomocnýPJ |
| Editovat event | PJ, PomocnýPJ |
| Smazat event | PJ, PomocnýPJ |
| RSVP confirm | všichni členové světa |
| Přidat komentář / reply | všichni členové světa (s respektováním viditelnosti) |
| Editovat komentář | jen vlastní (`authorId === currentUser.id`) |
| Smazat komentář | vlastní nebo PJ/PomocnýPJ (vždy soft delete) |
| Reagovat emoji | všichni členové světa (toggle) |

---

## API

### Eventy

```
GET    /api/game-events?worldId=&limit=&fromDate=
POST   /api/game-events
PUT    /api/game-events/:id
DELETE /api/game-events/:id
```

**PUT poznámka:** Pokud klient pošle `confirmedBy: null` nebo pole vynechá, backend zachová stávající hodnotu. Stejně tak `comments`.

### RSVP

```
POST   /api/game-events/:id/confirm    // body: {} — toggle účasti aktuálního usera
```

### Komentáře

```
POST   /api/game-events/:id/comments                         // body: { content, parentId? }
PATCH  /api/game-events/:id/comments/:commentId              // body: { content } — jen vlastní
DELETE /api/game-events/:id/comments/:commentId              // soft delete
POST   /api/game-events/:id/comments/:commentId/react        // body: { emoji } — toggle
```

---

## Cleanup

`GameEventCleanupService` — NestJS `@Cron` každou hodinu.  
Smaže (hard delete) všechny GameEventy kde `date < now - 24h`.

---

## Chybové stavy

- `404` při neexistujícím eventu nebo komentáři
- `403` při editaci cizího komentáře nebo mutaci bez PJ/PomocnýPJ role
- `400` pokud `groupOnly: true` ale `targetGroup` je null (backend ignoruje nebo vrátí chybu — backend vrátí `400`)
- Reakce na smazaný komentář (`isDeleted: true`) se tiše ignorují (vrátí `200` bez efektu)
