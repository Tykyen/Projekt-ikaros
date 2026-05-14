# Krok 18 — Dokumentace API

**Datum:** 2026-05-05  
**Status:** Schváleno

---

## Cíl

Plná Swagger/OpenAPI dokumentace všech REST endpointů + WebSocket event dokumentace pro všechny 7 gateway.

---

## Přístup

**NestJS Swagger CLI plugin + ruční doplnění.**

CLI plugin (`@nestjs/swagger/plugin`) automaticky čte TypeScript typy z DTO tříd a generuje `@ApiProperty` metadata bez ručního psaní. Ručně se přidají pouze `@ApiTags`, `@ApiBearerAuth`, `@ApiOperation`, `@ApiResponse` a `@ApiProperty` pro typy které plugin neumí (union typy, `Record<string, unknown>`, volné JSON bloby).

---

## Sekce 1 — Infrastruktura Swagger

### Závislost

```
@nestjs/swagger
```

Přidat do `dependencies` v `backend/package.json`.

### CLI plugin

`backend/nest-cli.json` — přidat do `compilerOptions.plugins`:

```json
{
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}
```

Plugin automaticky zpracuje všechny DTO soubory a generuje schémata z TypeScript typů + `class-validator` dekorátorů.

### main.ts konfigurace

```typescript
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('Projekt Ikaros API')
  .setDescription(
    'REST API dokumentace pro Projekt Ikaros.\n\n' +
    '**WebSocket eventy:** viz [docs/websocket-api.md](../docs/websocket-api.md)\n\n' +
    'Autorizace: Bearer JWT token (získán z POST /api/auth/login)'
  )
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('docs', app, document);
```

Swagger UI dostupné na: `http://localhost:3000/api/docs`

---

## Sekce 2 — Anotace controllerů

### Controller-level dekorátory

Každý controller dostane:

| Dekorátor | Účel |
|-----------|------|
| `@ApiTags('název')` | Seskupení endpointů v Swagger UI |
| `@ApiBearerAuth()` | Označení JWT auth požadavku |

Controllery s `@Public()` endpointy — jen ty konkrétní metody dostanou `@ApiSecurity([])` aby Swagger UI nezobrazoval zámek tam kde není potřeba.

### Endpoint-level dekorátory

Každý endpoint dostane:

| Dekorátor | Příklad |
|-----------|---------|
| `@ApiOperation({ summary })` | `'Vrátí seznam kanálů světa'` |
| `@ApiResponse({ status: 200 })` | Úspěšná odpověď s typem |
| `@ApiResponse({ status: 201 })` | Created |
| `@ApiResponse({ status: 204 })` | No Content |
| `@ApiResponse({ status: 401 })` | Unauthorized |
| `@ApiResponse({ status: 403 })` | Forbidden |
| `@ApiResponse({ status: 404 })` | Not Found |

### DTO schémata

CLI plugin automaticky generuje schémata pro:
- Všechny `CreateXxxDto` a `UpdateXxxDto` třídy
- Properties s `class-validator` dekorátory (`@IsString`, `@IsEnum`, `@IsOptional` atd.)

Ručně přidat `@ApiProperty({ example: ... })` pro:
- `Record<string, unknown>` pole (themeSettings, chatPreferences, diaryData)
- Union typy (`string | null`)
- Vnořené objekty bez DTO třídy

### ApiTags přiřazení (30 controllerů)

| Modul | Tag |
|-------|-----|
| auth | `Auth` |
| users | `Users` |
| worlds | `Worlds` |
| chat | `Chat` |
| global-chat | `Global Chat` |
| upload | `Upload` |
| presence | `Presence` |
| ikaros-messages | `Ikaros Messages` |
| pages | `Pages` |
| characters | `Characters` |
| character-subdocs | `Character Subdocs` |
| npc-templates | `NPC Templates` |
| universe | `Universe Map` |
| campaign | `Campaign` |
| maps | `Maps` |
| map-templates | `Map Templates` |
| dungeon-maps | `Dungeon Maps` |
| game-events | `Game Events` |
| ikaros-news | `Ikaros News` |
| ikaros-articles | `Ikaros Articles` |
| ikaros-gallery | `Ikaros Gallery` |
| ikaros-discussions | `Ikaros Discussions` |
| world-currencies | `World Currencies` |
| emotes | `Emotes` |
| images | `Images` |
| sounds | `Sounds` |
| world-sounds | `World Sounds` |
| push | `Push Notifications` |
| search | `Search` |
| stats | `Stats` |
| admin | `Admin` |

---

## Sekce 3 — WebSocket dokumentace

### `docs/websocket-api.md`

Source of truth pro všechny WebSocket eventy. Struktura per gateway:

```markdown
## ChatGateway (/api/chat — namespace výchozí)

### Příchozí eventy (klient → server)
| Event | Payload | Auth | Popis |
|-------|---------|------|-------|
| chat:join | `{ channelId: string }` | JWT | Připojí socket do channel room |
| ...

### Odchozí eventy (server → klient)
| Event | Payload | Popis |
|-------|---------|-------|
| chat:message | `ChatMessage` | Nová zpráva v kanálu |
| ...
```

Pokryje všech 7 gateway:
1. **ChatGateway** — channel join/leave, zprávy, typing, reakce
2. **MapsGateway** — tokeny, fog, dice, ping, sound, efekty, scene state (13 eventů)
3. **GlobalChatGateway** — hospoda rooms, presence, whisper, room-style
4. **WorldsGateway** — world-level notifikace
5. **UniverseGateway** — universe:updated
6. **EmotesGateway** — emote:created
7. **IkarosMessagesGateway** — real-time doručení zpráv

### Swagger integrace

Do `DocumentBuilder.setDescription()` přidat odkaz na `docs/websocket-api.md`.

Každý gateway modul (kde má odpovídající controller nebo tag) dostane v `@ApiTags` description zmínku o WS eventech s odkazem na příslušnou sekci v Markdown.

---

## Výstup

- `GET /api/docs` — Swagger UI s plnou dokumentací všech REST endpointů
- `GET /api/docs-json` — OpenAPI JSON schema (automaticky generováno NestJS)
- `docs/websocket-api.md` — kompletní přehled všech WS eventů pro 7 gateway
