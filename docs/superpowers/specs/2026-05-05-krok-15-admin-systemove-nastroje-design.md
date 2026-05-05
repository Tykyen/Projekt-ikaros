# Krok 15 — Admin & Systémové nástroje: Design

**Datum:** 2026-05-05  
**Stav:** Schváleno

---

## Přehled

Krok 15 přidává dedikovaný admin modul pro správu uživatelů a stránek, rozšiřuje world membership workflow (přijetí hráče s přiřazením role/skupiny/postavy), implementuje background joby pro údržbu a drobné performance/infra konfigurace.

---

## 1. Struktura a nové soubory

### Nový AdminModule

`src/modules/admin/`
- `admin.controller.ts` — `/api/admin/*` endpointy, guard: Superadmin, Admin nebo PJ (PJ má přístup jen k `recent-pages`)
- `admin.service.ts` — logika; volá `IUsersRepository` a `IPagesRepository` (oba `@Global()`)
- `admin.module.ts`

### Background joby (nové `.job.ts` soubory ve stávajících modulech)

| Soubor | Modul | Interval |
|--------|-------|----------|
| `game-event-cleanup.job.ts` | `game-events` | každou hodinu |
| `cleanup-inactive-users.job.ts` | `global-chat` | každých 45 minut |
| `clean-messages.job.ts` | `global-chat` | každé 2 hodiny |

Vzor identický s existujícím `GameEventReminderJob` (`@Cron` dekorátor, `@Injectable()`).

### Schema změna

`WorldMembership` — přidat pole:
```typescript
isFree: { type: Boolean, default: false }
```
Pokud `isFree: true`, `characterPath` se ignoruje — hráč bez postavy (Svobodný).

---

## 2. API endpointy

### Admin User Management

User/role/akj endpointy vyžadují Superadmin nebo Admin. `recent-pages` je přístupný i PJ.

```
GET    /api/admin/users
       query: username?: string, role?: UserRole, page?: number, limit?: number
       → PaginatedResult<UserPublic>

PATCH  /api/admin/users/:id/role
       body: { role: UserRole }
       → UpdatedUser

PATCH  /api/admin/users/:id/akj
       body: { akj: boolean }
       → UpdatedUser

GET    /api/admin/recent-pages
       query: limit?: number (výchozí 20)
       → Page[] scope-aware:
         - Superadmin: stránky ze všech světů, řazené updatedAt DESC
         - PJ/Admin: jen stránky ze světů kde je daný user PJ, řazené updatedAt DESC
```

### World Members (rozšíření WorldsController)

```
GET    /api/worlds/:id/members
       query: role?: WorldRole, group?: string   ← nové filtry
       → WorldMembership[]

PATCH  /api/worlds/:id/members/:membershipId/free
       body: { isFree: boolean }
       → UpdatedMembership
```

Existující endpointy zůstávají beze změny:
- `PATCH /api/worlds/:id/members/:membershipId/role`
- `PATCH /api/worlds/:id/members/:membershipId/group`
- `PATCH /api/worlds/:id/members/:membershipId/character`

### Resolve rozšíření (IkarosMessagesController)

```
POST /api/ikaros-messages/:id/resolve
body:
{
  accept: boolean,
  role?: WorldRole,          // přiřadit při přijetí
  group?: string,            // přiřadit při přijetí
  characterPath?: string,    // přiřadit při přijetí
  isFree?: boolean           // přiřadit při přijetí (hráč bez postavy)
}
```

Chování:
- `accept: false` — stejné jako dřív (zamítnutí, zpráva hráči)
- `accept: true` — membership Pending → Hráč + aplikuje `role`/`group`/`characterPath`/`isFree` pokud jsou přítomny → zpráva hráči

---

## 3. Background Jobs

### GameEventCleanupJob (`game-event-cleanup.job.ts`)

- Cron: `EVERY_HOUR`
- Smaže GameEvents kde `date < now - 24h`
- Hard delete
- Logger warning pokud selhání

### CleanupInactiveUsersJob (`cleanup-inactive-users.job.ts`)

- Cron: každých 45 minut (`'0 */45 * * * *'` nebo `CronExpression`)
- Z in-memory presence mapy IkarosChatGateway odstraní uživatele bez heartbeatu déle než 45 min
- Broadcastuje aktualizovaný seznam přítomných do všech pokojů

### CleanMessagesJob (`clean-messages.job.ts`)

- Cron: každé 2 hodiny (`EVERY_2_HOURS`)
- Pro každý z 5 IkarosChat pokojů:
  - Smaže zprávy starší 2h
  - Zachová vždy posledních 100 zpráv per pokoj
- In-memory operace (IkarosChat nemá DB perzistenci)

### EmbeddingQueueProcessor

Již implementován v `EmbeddingSearchService.onModuleInit()` — `queue.start()` spustí continuous process loop. Žádná změna v Kroku 15.

---

## 4. Schema změny & Performance konfigurace

### WorldMembership schema

```typescript
isFree: { type: Boolean, default: false }
```

### main.ts — CORS

```typescript
app.enableCors({
  origin: [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'http://localhost:5174',
  ],
  credentials: true,
});
```

### main.ts — Socket.io max message size

Custom IoAdapter s `maxHttpBufferSize: 5 * 1024 * 1024` (5 MB).

### Komprese

Přeskočena — řeší reverse proxy (nginx/caddy).

### Matrix WorldId konstanta

Při prvním seedu se Matrix World ID uloží do DB. Interní moduly čtou ID přes `ConfigService` z env proměnné `MATRIX_WORLD_ID`, která se nastaví při seedu.

---

## 5. Bezpečnost a oprávnění

| Endpoint | Minimální role |
|----------|---------------|
| `/api/admin/users*` | Admin nebo Superadmin |
| `/api/admin/recent-pages` | Admin, Superadmin nebo PJ |
| `PATCH members/role` | PJ daného světa |
| `PATCH members/group` | PJ daného světa |
| `PATCH members/free` | PJ daného světa |
| `POST ikaros-messages/:id/resolve` | Recipient zprávy (PJ) |

---

## 6. Co se nemění

- EmbeddingQueueProcessor — hotový z Kroku 14
- WorldMembership CRUD endpointy pro role/group/character — zůstávají
- IkarosMessages základní CRUD — zůstává
- Komprese — nginx zodpovědnost
