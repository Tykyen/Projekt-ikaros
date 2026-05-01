# Návrh: Přepis backendu — Projekt Ikaros

## Přehled

Kompletní přepis původního Matrix backendu (ASP.NET Core 8 + MongoDB) do moderního, profesionálního stacku. Nový backend je navržen pro real-time synchronizaci dat, DB-agnostickou architekturu a postupnou implementaci po modulech.

---

## Tech stack

| Vrstva | Technologie |
|--------|-------------|
| Runtime | Node.js 20+ |
| Framework | NestJS (TypeScript) |
| Databáze | MongoDB (Mongoose) — s výhledem na migraci |
| Real-time | WebSocket Gateways (Socket.IO přes NestJS) |
| Autentifikace | JWT + Passport.js |
| Validace | class-validator + class-transformer |
| Konfigurace | @nestjs/config + .env |

---

## Architektura

### Struktura projektu

```
src/
  modules/
    auth/
    users/
    worlds/
    chat/
    maps/
    characters/
    campaigns/
    game-events/
    calendar/
    timeline/
    universe/
    ikaros/
    search/
    media/
    pages/
    news/
    push/
    presence/
    emotes/
  common/
    repositories/        ← DB abstrakce (interfaces)
    guards/              ← JWT, Role guards
    decorators/          ← CurrentUser, Roles
    filters/             ← Global error handler
    interceptors/        ← Response formát
    events/              ← Domain event typy
  database/
    mongo/               ← MongoDB implementace repositories
```

### Struktura modulu

Každý modul má identickou strukturu:

```
modules/worlds/
  worlds.module.ts
  worlds.controller.ts       ← REST API
  worlds.service.ts          ← Business logika
  worlds.gateway.ts          ← WebSocket broadcast
  worlds.repository.ts       ← IWorldRepository implementace (MongoDB)
  dto/
    create-world.dto.ts
    update-world.dto.ts
  interfaces/
    world.interface.ts
    world-repository.interface.ts
```

---

## DB abstrakce (Repository pattern)

Business logika nikdy nevolá MongoDB přímo — vždy přes interface:

```typescript
// Interface — service ho zná, nezná MongoDB
interface IWorldRepository {
  findById(id: string): Promise<World | null>
  findByMemberId(userId: string): Promise<World[]>
  save(world: World): Promise<World>
  delete(id: string): Promise<void>
}

// MongoDB implementace — jediné místo kde je Mongoose
class MongoWorldRepository implements IWorldRepository {
  constructor(private readonly model: Model<WorldDocument>) {}
  // ...implementace
}
```

Při migraci DB (PostgreSQL, MySQL...) vytvoříš novou implementaci interface. Service se nedotkneš.

---

## Real-time architektura

### Princip

Každá změna dat se okamžitě propaguje všem připojeným klientům přes WebSocket. Klient nikdy nepoluje — jen reaguje na příchozí eventy.

### Flow

```
Klient A (POST /api/worlds/123)
  → WorldsController.update()
  → WorldsService.update()
    → WorldRepository.save()        ← zápis do DB
    → EventEmitter.emit('world.updated', world)  ← event
  → WorldsGateway (poslouchá event)
    → socket.to('world:123').emit('world:updated', world)  ← broadcast
Klient B, C, D (v room 'world:123') obdrží update okamžitě
```

### Rooms

Klient se připojí do rooms relevantních pro jeho aktuální pohled:

| Room | Kdy se klient připojí | Eventy |
|------|----------------------|--------|
| `world:{worldId}` | Při vstupu do světa | world.updated, character.updated, map.updated, event.created, ... |
| `channel:{channelId}` | Při otevření kanálu | message.created, message.updated, user.typing |
| `campaign:{campaignId}` | Při otevření kampaně | subject.created, relationship.updated, ... |
| `ikaros:global` | Při vstupu do Ikaros | article.created, discussion.updated, ... |

### Chat specifika

- **Typing indicator:** Klient posílá `typing.start` / `typing.stop` → gateway broadcastuje ostatním v kanálu
- **Nová zpráva:** Nedojde k přerušení psaní — UI přidá zprávu do listu bez změny input pole
- **Optimistické UI:** Zpráva se zobrazí odesílateli ihned, ostatní ji dostanou přes WebSocket

### Event emitter

```typescript
// WorldsService
async update(id: string, dto: UpdateWorldDto): Promise<World> {
  const world = await this.repository.save({ ...existing, ...dto })
  this.eventEmitter.emit('world.updated', world)
  return world
}

// WorldsGateway
@OnEvent('world.updated')
handleWorldUpdated(world: World) {
  this.server.to(`world:${world.id}`).emit('world:updated', world)
}
```

---

## API konvence

### REST

- Prefix: `/api/v1/`
- Autentifikace: `Authorization: Bearer <token>`
- Odpověď vždy ve formátu:
  ```json
  { "data": {...}, "meta": {...} }
  ```
- Chyby:
  ```json
  { "error": { "code": "WORLD_NOT_FOUND", "message": "..." } }
  ```

### WebSocket

- Klient se připojí s JWT tokenem
- Eventy mají namespace: `world:updated`, `message:created`, `character:deleted`...
- Klient posílá: `room:join`, `room:leave`, `typing:start`, `typing:stop`

---

## Roadmapa implementace

Každý krok je nezávislá jednotka: spec → plán → implementace. Krok N nesmí začít bez dokončení kroku N-1 kde existuje závislost.

### Krok 1 — Základ (závislost pro vše)
- NestJS projekt setup, TypeScript konfigurace
- MongoDB připojení, base repository class
- JWT autentifikace, Passport.js
- User modul (model, repository, CRUD, JWT claims)
- Global error filter, response interceptor
- WebSocket infrastruktura (base gateway, room management, event emitter setup)

### Krok 2 — Světy (závisí na: 1)
- World modul + WorldSettings + WorldMembership
- Join logika, role v světě
- Matrix World seed
- Real-time: world.updated, membership.changed

### Krok 3 — Chat (závisí na: 1, 2)
- ChatGroup + ChatChannel + ChatMessage moduly
- Přístupová logika kanálů (CanUserAccessChannel)
- Read status (unread počítání)
- Real-time: message.created, message.updated, typing, reactions
- Push notifikace pro offline uživatele

### Krok 4 — Mapy a postavy (závisí na: 2)
- MapScene + MapTemplate moduly
- Character + NPC šablony
- Universe modul (viditelnost per user)
- Real-time: token.moved, map.updated, character.updated

### Krok 5 — Kampaně a herní systémy (závisí na: 2, 4)
- Campaign modul (6 pod-modelů)
- GameEvents + RSVP + cleanup service
- Calendar + Timeline moduly
- Real-time: campaign.updated, event.created

### Krok 6 — Ikaros modul (závisí na: 1, 2)
- Articles (schvalovací tok)
- Discussions + DiscussionPosts
- Gallery (Google Drive integrace)
- IkarosNews
- IkarosChat + IkarosChatHub
- Real-time: article.published, discussion.updated, message.created

### Krok 7 — Vyhledávání a média (závisí na: 1)
- Lucene fulltextové vyhledávání
- AI Embedding vyhledávání (ONNX)
- Google Drive integrace (upload, streaming)
- Sounds modul
- Push notifikace infrastruktura (VAPID)

### Krok 8 — Obsah a ostatní (závisí na: 2)
- Pages modul (accessRequirements, TipTap extrakce)
- News modul
- Presence (heartbeat)
- Stats + rebuild indexu
- Emotes (per-world, Google Drive)

---

## Co se záměrně neřeší v tomto návrhu

- Konkrétní DB schémata (řeší spec každého kroku)
- Frontend implementace
- CI/CD pipeline
- Deployment konfigurace
- Rate limiting a pokročilá bezpečnost (přidáme v pozdější fázi)
