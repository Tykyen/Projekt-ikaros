# GameEvents API — Design spec (Fáze 2.1)

**Datum:** 2026-05-05
**Status:** schváleno
**Nahrazuje:** [2026-05-04-krok-10a-game-event-design.md](2026-05-04-krok-10a-game-event-design.md) — tento spec přebírá jeho strukturu a doplňuje rozhodnutí z brainstormu fáze 2.1 (auth, role parita, push, scope WebSocket, image handling, threading hloubka).

---

## Přehled

Herní události světa s RSVP potvrzením, skupinovou viditelností a diskusí (1-úrovňové komentáře, reakce). Cleanup cron job maže staré eventy automaticky. Reminder cron job + push při vytvoření informují členy.

Modul aktuálně obsahuje pouze schéma + 2 cron joby. Tato fáze doplňuje **HTTP+service vrstvu** (controller, service, DTO, role gating, viditelnost, comment ops).

---

## Schema

### GameEvent

```ts
{
  worldId:      string         // POVINNÉ — žádné globální eventy
  title:        string
  date:         string         // ISO 8601 (YYYY-MM-DDTHH:mm), primární sort key
  description:  string
  imageUrl:     string | null  // jen URL (^https?://|^/), žádný base64
  targetGroup:  string | null
  groupOnly:    boolean        // default false
  confirmable:  boolean        // default false — zapíná RSVP
  confirmedBy:  EventConfirmation[]  // default []
  comments:     EventComment[]       // default []
  reminderSent: boolean        // default false — používá GameEventReminderJob
}
```

### EventConfirmation (subdokument)

```ts
{
  userId:   string
  userName: string
}
```

### EventComment (subdokument, 1-level threading)

```ts
{
  id:         string          // crypto.randomUUID()
  parentId:   string | null   // null = root | jinak ID ROOT komentáře (NESMÍ ukazovat na reply)
  authorId:   string
  authorName: string
  content:    string
  createdAt:  Date
  editedAt:   Date | null
  reactions:  Record<string, string[]>  // emoji → userId[]
  isDeleted:  boolean         // soft delete; content vyprázdněn, authorName zůstane
}
```

### Index

```
{ worldId: 1, date: 1 }
```

---

## Viditelnost

Pravidlo se aplikuje na event i jeho komentáře:

| targetGroup | groupOnly | Vidí |
|-------------|-----------|------|
| `null`      | (ignoruje se) | všichni členové světa |
| nastavena   | `false`   | všichni členové světa |
| nastavena   | `true`    | členové `targetGroup` + PJ/PomocnýPJ světa + globální Admin/Superadmin |

**Globální Admin/Superadmin** vidí vždy vše bez ohledu na membership a `groupOnly`.

---

## Oprávnění

| Akce | Role |
|------|------|
| Číst eventy (GET list/detail) | členové světa + globální Admin/Superadmin (s respektováním viditelnosti) |
| Vytvořit event | PJ/PomocnýPJ světa + Admin/Superadmin |
| Editovat event | PJ/PomocnýPJ světa + Admin/Superadmin |
| Smazat event | PJ/PomocnýPJ světa + Admin/Superadmin |
| RSVP confirm (toggle) | členové světa, jen pokud event vidí dle viditelnosti |
| Přidat komentář / reply | členové světa, jen pokud event vidí |
| Editovat komentář | jen vlastní (`authorId === currentUser.id`); bez time limitu |
| Smazat komentář (soft) | vlastní **nebo** PJ/PomocnýPJ světa + Admin/Superadmin |
| Reagovat emoji (toggle) | členové světa, jen pokud event vidí |

**Pravidlo:** Admin/Superadmin = bypass všech per-world checků (číst/psát do libovolného světa). PJ/PomocnýPJ = jen v rámci svého světa.

---

## API

Vše pod prefixem `/api/game-events`. Všechny endpointy vyžadují `JwtAuthGuard`.

### Eventy

```
GET    /api/game-events?worldId=&limit=&fromDate=
GET    /api/game-events/:id
POST   /api/game-events
PUT    /api/game-events/:id
DELETE /api/game-events/:id
```

- **`GET list`** — `worldId` query je **povinné** (jinak 400). `limit` default 100, max 500. `fromDate` ISO string (lexikografické porovnání). Aplikuje viditelnostní filter (členové `targetGroup` + PJ/Admin u groupOnly eventů).
- **`GET detail`** — 404 pokud neexistuje, 403 pokud user nemá přístup dle viditelnosti.
- **`POST`** — body `CreateGameEventDto`. Validace: `groupOnly: true && targetGroup === null` → **400**. Po úspěchu fire-and-forget push notifikace (viz Push integrace).
- **`PUT`** — body `UpdateGameEventDto`. Stejná validace. Pokud klient pošle `confirmedBy` nebo `comments` jako `null`/`undefined`, backend **zachová stávající** hodnotu.
- **`DELETE`** — 204.

### RSVP

```
POST /api/game-events/:id/confirm
```

Body `{}`. Toggle účasti aktuálního usera (`{ userId, userName }`). Vyžaduje `event.confirmable === true` (jinak 400). Vyžaduje, aby user viděl event dle viditelnosti. Vrací `200` s aktualizovaným eventem.

### Komentáře

```
POST   /api/game-events/:id/comments
PATCH  /api/game-events/:id/comments/:commentId
DELETE /api/game-events/:id/comments/:commentId
POST   /api/game-events/:id/comments/:commentId/react
```

- **`POST comments`** — body `{ content, parentId? }`. Validace `parentId`: pokud zadán, musí ukazovat na komentář se `parentId === null` ve **stejném eventu** — jinak **400**. Generuje `id` na backendu (`crypto.randomUUID()`).
- **`PATCH comments/:id`** — body `{ content }`. Jen vlastní (jinak 403). Edit smazaného (`isDeleted: true`) → **400**. Aktualizuje `content`, nastaví `editedAt = now`.
- **`DELETE comments/:id`** — soft delete. Vlastní nebo PJ/PomocnýPJ/Admin/Superadmin. Nastaví `isDeleted: true`, `content: ""`. `authorName` zůstává pro UX ("*Zpráva smazána*" si nakreslí frontend).
- **`POST .../react`** — body `{ emoji }`. Toggle `userId` v `reactions[emoji]`. Reakce na `isDeleted: true` komentář → **200 bez efektu** (tiché ignorování).

### PUT poznámka — zachování `confirmedBy` / `comments`

Klient typicky edituje jen text/datum/obrázek a posílá zpět celý event. Aby nedocházelo ke ztrátě RSVP a komentářů (race podmínka mezi RSVP toggle a PUT), backend zachová stávající hodnotu, pokud klient pošle:

- `confirmedBy: null` nebo pole vynechá
- `comments: null` nebo pole vynechá

Mutace `confirmedBy` jde **výhradně** přes `POST /:id/confirm`. Mutace `comments` jde **výhradně** přes `/comments` endpointy.

---

## Push integrace

### Existující — `GameEventReminderJob` (každou hodinu)

Drobná úprava: filtrovat příjemce dle `groupOnly` + `targetGroup`. Pokud `groupOnly: true`, posílat jen členům `targetGroup` (a PJ/PomocnýPJ pro úplnost). Aktuálně posílá všem členům světa.

### Nový trigger — `GameEventsService.create()`

Po úspěšném `INSERT`:
1. Načti members světa přes `IWorldMembershipRepository.findByWorldId(worldId)`
2. Pokud `groupOnly: true`, filtruj členy s `group === targetGroup` + PJ/PomocnýPJ
3. Pošli push: title `"Nový event ve světě {world.name}"`, body `event.title`
4. **Fire-and-forget** — `try/catch` s `logger.warn(...)`, **selhání push NESMÍ shodit POST request** (201 stále vrátí)

Push se **NEposílá** při PUT, DELETE, komentářích, RSVP, reakcích.

### Existující — `GameEventCleanupJob` (každou hodinu)

Beze změny — hard-delete eventy starší než 24h.

---

## Modul struktura

```
backend/src/modules/game-events/
├── game-events.module.ts          (rozšířit — přidat Service, Controller, PushModule)
├── game-events.controller.ts      (NOVÝ)
├── game-events.service.ts         (NOVÝ)
├── game-events.service.spec.ts    (NOVÝ)
├── dto/
│   ├── create-game-event.dto.ts   (NOVÝ)
│   ├── update-game-event.dto.ts   (NOVÝ)
│   ├── create-comment.dto.ts      (NOVÝ — { content, parentId? })
│   ├── update-comment.dto.ts      (NOVÝ — { content })
│   └── react-comment.dto.ts       (NOVÝ — { emoji })
├── interfaces/
│   ├── game-event.interface.ts    (rozšířit — nové fieldy + subdokumenty)
│   └── game-event-repository.interface.ts (rozšířit — CRUD + comment ops)
├── repositories/
│   └── game-event.repository.ts   (rozšířit — nové metody)
├── schemas/
│   └── game-event.schema.ts       (rozšířit — subdokumenty + compound index)
├── game-event-cleanup.job.ts      (beze změny)
└── game-event-reminder.job.ts     (drobná úprava — groupOnly filter)
```

**Závislosti modulu:**
- `WorldsModule` (už importován) — `IWorldMembershipRepository`
- `PushModule` — `PushService` pro fire-and-forget push při create

**Role gating — sjednoceno s `chat.service.ts`:**

```ts
// Globální bypass — Admin/Superadmin čtou/píší kdekoliv
if (requester.role <= UserRole.Admin) return true;

// Per-world check
const membership = await this.membershipRepo.findByUserAndWorld(requester.id, worldId);
if (!membership || membership.role === WorldRole.Pending) return false;
return membership.role >= WorldRole.PomocnyPJ;  // PJ nebo PomocnýPJ
```

Pro čtení (GET) stejný princip, jen místo `>= PomocnyPJ` stačí `!== Pending` (jakýkoliv aktivní člen). Pro `groupOnly` viditelnost se navíc zkontroluje `membership.group === event.targetGroup` (PJ/PomocnýPJ a Admin/Superadmin výjimka).

---

## Chybové stavy

| Stav | Kdy |
|------|-----|
| `400` | Invalid body (validation), `groupOnly: true && targetGroup === null`, `confirm` na non-confirmable event, `parentId` ukazuje na reply místo root, edit `isDeleted: true` komentáře, `GET list` bez `worldId` query |
| `403` | Edit cizího komentáře, mutace eventu bez PJ/PomocnýPJ/Admin/Superadmin, mazání cizího komentáře bez PJ role, čtení `groupOnly` eventu jako ne-člen skupiny (Admin/Superadmin výjimka) |
| `404` | Event nebo komentář neexistuje |

### Edge cases — explicitně řešené

1. **Reakce na `isDeleted: true` komentář** → `200` bez efektu (tiché ignorování)
2. **PUT s `confirmedBy: null` nebo `comments: null`** → zachová stávající (viz PUT poznámka)
3. **User opustí svět** → `confirmedBy` zůstane stale s starým `userName` (lazy cleanup, cleanup job event smaže za 24h po skončení)
4. **PJ změní `groupOnly` z `false` na `true`** přes PUT → existující komentáře od ne-členů zůstávají v DB, ale filter v GET aplikuje aktuální stav viditelnosti — ne-člen je už neuvidí
5. **Push při create selže** → `logger.warn`, POST vrátí `201`
6. **`fromDate` filter** → MongoDB string compare na ISO date (lexikografické porovnání funguje pro `YYYY-MM-DDTHH:mm`)
7. **`limit` cap** → default `100`, max `500` (validace v service)

---

## Out of scope (fáze 2.1)

Tyto věci jsou vědomé odchylky od staršího systému nebo budoucí možná rozšíření:

- **WebSocket real-time updaty** — GameEvents nebude mít gateway. Klient pollne při otevření view. Frekvence updatů (RSVP, komentáře) je nízká, vlastní gateway by byl 300-500 řádků navíc s testy. Lze přidat později samostatným krokem.
- **Globální eventy (`worldId === null`)** — odchylka od staršího kontraktu. Pro globální oznámení použít WorldNews (fáze 3.1) nebo IkarosMessages.
- **Reakce na samotný event** — RSVP přes `confirmable` pokrývá tuto potřebu, reakce na event by byly redundantní.
- **RSVP cleanup při odchodu ze světa** — lazy, žádný listener na `world.member.left`.
- **Více úrovní threading** — `parentId` musí ukazovat na root, žádné reply-na-reply.
- **Anon read** — odchylka od starého API. Nový design vyžaduje JWT + member kvůli ochraně proti leaku worldId data; frontend ještě neexistuje, takže to nikoho nebolí.
- **Bulk operace** — smazat všechny eventy světa, batch reakce. YAGNI.
- **Pagination cursor** — `limit` + `fromDate` stačí, eventů je málo (cleanup udržuje horizont 24h zpět).

---

## Spec testy (povinné)

Všechno v `game-events.service.spec.ts` (mock repository + mock push + mock membership):

1. **`confirm` toggle** — `confirmable: false` → 400; toggle přidává/odebírá; různí useři nezasahují do sebe
2. **`groupOnly` viditelnost** — člen `targetGroup` vidí, ne-člen 404 na detail / vyfiltrován v list, PJ/PomocnýPJ vidí, globální Admin/Superadmin vidí
3. **Comment moderation** — soft delete vlastní, soft delete cizí jako non-PJ → 403, PJ může mazat cizí, reakce na `isDeleted` ignorovány (200 beze změny)
4. **Reply validace** — `parentId` ukazuje na reply (komentář s ne-null `parentId`) → 400; `parentId` ukazuje na komentář v jiném eventu → 400
5. **PUT zachování** — body s `confirmedBy: null` nesmaže existující `confirmedBy`; dtto pro `comments`
6. **Validace `groupOnly`** — `groupOnly: true && targetGroup === null` → 400 v POST i PUT
7. **Push při create** — mock `PushService.notifyUsers`, ověř filtraci dle `groupOnly` (jen `targetGroup` + PJ pokud groupOnly, jinak všichni members)
8. **Role gating** — non-PJ user nemůže POST/PUT/DELETE event (403); globální Admin/Superadmin může
9. **Push selhání nesnoutí POST** — mock push throw, POST stále 201

---

## Otevřené otázky

Žádné — všechna rozhodnutí jsou v sekci "Out of scope" nebo v textu výše.
