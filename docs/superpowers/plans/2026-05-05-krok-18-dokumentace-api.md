# Krok 18 — Dokumentace API — Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat plnou Swagger/OpenAPI dokumentaci všech 30 REST controllerů + WebSocket event dokumentaci pro 7 gateway.

**Architecture:** NestJS Swagger CLI plugin automaticky generuje DTO schémata z TypeScript typů. Ručně se přidají `@ApiTags`, `@ApiBearerAuth`, `@ApiOperation`, `@ApiResponse` na každý controller/endpoint. WebSocket eventy jsou dokumentovány v `docs/websocket-api.md`.

**Tech Stack:** `@nestjs/swagger`, NestJS CLI plugin, Socket.io (dokumentace only)

---

## Mapování souborů

| Akce | Soubor |
|------|--------|
| Modify | `backend/package.json` |
| Modify | `backend/nest-cli.json` |
| Modify | `backend/src/main.ts` |
| Modify | `backend/src/modules/auth/auth.controller.ts` |
| Modify | `backend/src/modules/users/users.controller.ts` |
| Modify | `backend/src/modules/worlds/worlds.controller.ts` |
| Modify | `backend/src/modules/chat/chat.controller.ts` |
| Modify | `backend/src/modules/global-chat/global-chat.controller.ts` |
| Modify | `backend/src/modules/upload/upload.controller.ts` |
| Modify | `backend/src/modules/presence/presence.controller.ts` |
| Modify | `backend/src/modules/ikaros-messages/ikaros-messages.controller.ts` |
| Modify | `backend/src/modules/pages/pages.controller.ts` |
| Modify | `backend/src/modules/characters/characters.controller.ts` |
| Modify | `backend/src/modules/character-subdocs/character-subdocs.controller.ts` |
| Modify | `backend/src/modules/npc-templates/npc-templates.controller.ts` |
| Modify | `backend/src/modules/universe/universe.controller.ts` |
| Modify | `backend/src/modules/campaign/campaign.controller.ts` |
| Modify | `backend/src/modules/maps/maps.controller.ts` |
| Modify | `backend/src/modules/maps/map-templates.controller.ts` |
| Modify | `backend/src/modules/dungeon-maps/dungeon-maps.controller.ts` |
| Modify | `backend/src/modules/ikaros-news/ikaros-news.controller.ts` |
| Modify | `backend/src/modules/ikaros-articles/ikaros-articles.controller.ts` |
| Modify | `backend/src/modules/ikaros-gallery/ikaros-gallery.controller.ts` |
| Modify | `backend/src/modules/ikaros-discussions/ikaros-discussions.controller.ts` |
| Modify | `backend/src/modules/world-currencies/world-currencies.controller.ts` |
| Modify | `backend/src/modules/emotes/emotes.controller.ts` |
| Modify | `backend/src/modules/images/images.controller.ts` |
| Modify | `backend/src/modules/sounds/sounds.controller.ts` |
| Modify | `backend/src/modules/sounds/world-sounds.controller.ts` |
| Modify | `backend/src/modules/push/push.controller.ts` |
| Modify | `backend/src/modules/search/search.controller.ts` |
| Modify | `backend/src/modules/stats/stats.controller.ts` |
| Modify | `backend/src/modules/admin/admin.controller.ts` |
| Create | `docs/websocket-api.md` |

---

## Task 1: Infrastruktura — závislost, CLI plugin, main.ts

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/nest-cli.json`
- Modify: `backend/src/main.ts`

- [ ] **Krok 1: Nainstalovat @nestjs/swagger**

```bash
cd backend && npm install @nestjs/swagger
```

Očekávaný výstup: `added X packages` bez chyb.

- [ ] **Krok 2: Přidat CLI plugin do nest-cli.json**

Soubor `backend/nest-cli.json` — nahradit celý obsah:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": ["@nestjs/swagger"]
  }
}
```

- [ ] **Krok 3: Nakonfigurovat Swagger v main.ts**

Soubor `backend/src/main.ts` — přidat import a setup před `app.listen`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CustomIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useWebSocketAdapter(new CustomIoAdapter(app));
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Projekt Ikaros API')
    .setDescription(
      'REST API dokumentace pro Projekt Ikaros.\n\n' +
      '**WebSocket eventy:** viz `docs/websocket-api.md` v repozitáři\n\n' +
      'Autorizace: Bearer JWT token — získán z `POST /api/auth/login`',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Krok 4: Ověřit build**

```bash
cd backend && npm run build
```

Očekávaný výstup: build projde bez TS chyb.

- [ ] **Krok 5: Spustit dev server a ověřit Swagger UI**

```bash
cd backend && npm run start:dev
```

Otevřít `http://localhost:3000/api/docs` — má se zobrazit Swagger UI (zatím bez tagů/dokumentace).

- [ ] **Krok 6: Commit**

```bash
cd backend && git add package.json package-lock.json nest-cli.json src/main.ts
git commit -m "feat(docs): swagger infrastruktura — @nestjs/swagger + CLI plugin + main.ts setup"
```

---

## Task 2: Auth + Users controllery

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/users/users.controller.ts`

- [ ] **Krok 1: Anotovat auth.controller.ts**

```typescript
import { Controller, Post, Body, HttpCode, HttpStatus, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrace nového uživatele' })
  @ApiResponse({ status: 201, description: 'Uživatel vytvořen' })
  @ApiResponse({ status: 400, description: 'Validační chyba nebo username již existuje' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Přihlášení — vrátí JWT access token' })
  @ApiResponse({ status: 200, description: 'JWT token' })
  @ApiResponse({ status: 401, description: 'Nesprávné přihlašovací údaje' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obnovení JWT tokenu' })
  @ApiResponse({ status: 200, description: 'Nový JWT token' })
  @ApiResponse({ status: 401, description: 'Neplatný nebo expirovaný refresh token' })
  refresh(@Body() dto: any) {
    return this.authService.refresh(dto);
  }
}
```

> Pozn.: Přidej/odeber metody dle skutečného stavu controlleru — zachovej existující implementaci, přidej jen dekorátory.

- [ ] **Krok 2: Anotovat users.controller.ts**

Přidat na třídu:
```typescript
@ApiTags('Users')
@ApiBearerAuth()
```

Na každý endpoint přidat `@ApiOperation({ summary: '...' })` a `@ApiResponse(...)`. Vzor pro celý controller:

```typescript
// GET /api/users/profile/:id — veřejný endpoint
@Get('profile/:id')
@ApiOperation({ summary: 'Veřejný profil uživatele' })
@ApiResponse({ status: 200, description: 'Veřejný profil' })
@ApiResponse({ status: 404, description: 'Uživatel nenalezen' })

// GET /api/users/exists/:username
@Get('exists/:username')
@ApiOperation({ summary: 'Zkontroluje zda username existuje' })
@ApiResponse({ status: 200, description: '{ exists: boolean }' })

// PATCH /api/users (vlastní profil)
@Patch()
@ApiOperation({ summary: 'Aktualizace vlastního profilu' })
@ApiResponse({ status: 200, description: 'Aktualizovaný uživatel' })
@ApiResponse({ status: 401, description: 'Unauthorized' })

// PUT /api/users/password
@Put('password')
@ApiOperation({ summary: 'Změna vlastního hesla' })
@ApiResponse({ status: 200, description: 'Heslo změněno' })
@ApiResponse({ status: 401, description: 'Nesprávné současné heslo' })

// PUT /api/users/:id/reset-password
@Put(':id/reset-password')
@ApiOperation({ summary: 'Reset hesla uživatele (Superadmin)' })
@ApiResponse({ status: 200, description: 'Heslo resetováno' })
@ApiResponse({ status: 403, description: 'Forbidden — jen Superadmin' })

// PUT /api/users/:id/theme
@Put(':id/theme')
@ApiOperation({ summary: 'Aktualizace themeSettings uživatele' })
@ApiResponse({ status: 200, description: 'Theme settings aktualizovány' })

// DELETE /api/users/:id
@Delete(':id')
@ApiOperation({ summary: 'Smazání účtu' })
@ApiResponse({ status: 204, description: 'Účet smazán' })
@ApiResponse({ status: 403, description: 'Forbidden' })

// GET /api/users/getCalendarMonth/:id
@Get('getCalendarMonth/:id')
@ApiOperation({ summary: 'Načte calendarMonth z themeSettings' })
@ApiResponse({ status: 200, description: 'calendarMonth hodnota' })

// PUT /api/users/updateCalendarMonth/:id
@Put('updateCalendarMonth/:id')
@ApiOperation({ summary: 'Uloží calendarMonth do themeSettings' })
@ApiResponse({ status: 200, description: 'Aktualizováno' })
```

- [ ] **Krok 3: Build check**

```bash
cd backend && npm run build 2>&1 | tail -5
```

Očekávaný výstup: `Successfully compiled` nebo prázdný (bez chyb).

- [ ] **Krok 4: Commit**

```bash
git add backend/src/modules/auth/auth.controller.ts backend/src/modules/users/users.controller.ts
git commit -m "docs(swagger): Auth + Users controller anotace"
```

---

## Task 3: Worlds controller

**Files:**
- Modify: `backend/src/modules/worlds/worlds.controller.ts`

- [ ] **Krok 1: Přidat na třídu**

```typescript
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Worlds')
@ApiBearerAuth()
```

- [ ] **Krok 2: Přidat na endpointy**

```typescript
// GET /api/worlds
@ApiOperation({ summary: 'Seznam všech světů' })
@ApiResponse({ status: 200, description: 'Pole světů' })

// GET /api/worlds/my
@ApiOperation({ summary: 'Světy aktuálního uživatele (člen nebo vlastník)' })
@ApiResponse({ status: 200, description: 'Pole světů' })

// POST /api/worlds
@ApiOperation({ summary: 'Vytvoření nového světa' })
@ApiResponse({ status: 201, description: 'Svět vytvořen' })

// GET /api/worlds/:id
@ApiOperation({ summary: 'Detail světa' })
@ApiResponse({ status: 200, description: 'Svět' })
@ApiResponse({ status: 404, description: 'Svět nenalezen' })

// PATCH /api/worlds/:id
@ApiOperation({ summary: 'Aktualizace metadat světa' })
@ApiResponse({ status: 200, description: 'Aktualizovaný svět' })
@ApiResponse({ status: 403, description: 'Forbidden — jen PJ/Admin' })

// GET /api/worlds/:id/settings
@ApiOperation({ summary: 'Načte nastavení světa' })
@ApiResponse({ status: 200, description: 'WorldSettings' })

// PUT /api/worlds/:id/settings
@ApiOperation({ summary: 'Uloží nastavení světa' })
@ApiResponse({ status: 200, description: 'Aktualizované nastavení' })

// GET /api/worlds/:worldId/calendar-config
@ApiOperation({ summary: 'Konfigurace fantasy kalendáře světa' })
@ApiResponse({ status: 200, description: 'WorldCalendarConfig' })

// PUT /api/worlds/:worldId/calendar-config (nebo calendarconfig)
@ApiOperation({ summary: 'Uloží konfiguraci kalendáře (PJ/Admin)' })
@ApiResponse({ status: 200, description: 'Aktualizovaná konfigurace' })

// GET /api/worlds/:id/members
@ApiOperation({ summary: 'Členové světa s filtry ?role= &group=' })
@ApiResponse({ status: 200, description: 'Pole WorldMembership' })

// POST /api/worlds/:id/join
@ApiOperation({ summary: 'Žádost o vstup do světa nebo přímé připojení' })
@ApiResponse({ status: 200, description: 'Membership vytvořeno' })

// PATCH /api/worlds/:id/members/:membershipId/free
@ApiOperation({ summary: 'Toggle isFree flagu člena (hráč bez postavy)' })
@ApiResponse({ status: 200, description: 'Membership aktualizováno' })
```

- [ ] **Krok 3: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/worlds/worlds.controller.ts
git commit -m "docs(swagger): Worlds controller anotace"
```

---

## Task 4: Chat controller

**Files:**
- Modify: `backend/src/modules/chat/chat.controller.ts`

- [ ] **Krok 1: Přidat na třídu**

```typescript
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Chat')
@ApiBearerAuth()
```

- [ ] **Krok 2: Přidat na endpointy**

```typescript
// GET /api/worlds/:worldId/chat/groups
@ApiOperation({ summary: 'Seznam chat skupin světa' })
@ApiResponse({ status: 200, description: 'Pole ChatGroup' })

// POST /api/worlds/:worldId/chat/groups
@ApiOperation({ summary: 'Vytvoření chat skupiny (PJ/Admin)' })
@ApiResponse({ status: 201, description: 'ChatGroup vytvořena' })

// PUT /api/worlds/:worldId/chat/groups/:id
@ApiOperation({ summary: 'Aktualizace chat skupiny' })
@ApiResponse({ status: 200, description: 'Aktualizovaná skupina' })

// DELETE /api/worlds/:worldId/chat/groups/:id
@ApiOperation({ summary: 'Smazání chat skupiny' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// GET /api/worlds/:worldId/chat/channels
@ApiOperation({ summary: 'Seznam kanálů světa s unread countsy a lastMsg' })
@ApiResponse({ status: 200, description: 'Pole ChatChannel s unread metadaty' })

// POST /api/worlds/:worldId/chat/channels
@ApiOperation({ summary: 'Vytvoření chat kanálu' })
@ApiResponse({ status: 201, description: 'ChatChannel vytvořen' })

// PUT /api/worlds/:worldId/chat/channels/:id
@ApiOperation({ summary: 'Aktualizace chat kanálu' })
@ApiResponse({ status: 200, description: 'Aktualizovaný kanál' })

// DELETE /api/worlds/:worldId/chat/channels/:id
@ApiOperation({ summary: 'Smazání chat kanálu (PJ/Admin)' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// GET /api/worlds/:worldId/chat/channels/:channelId/messages
@ApiOperation({ summary: 'Zprávy kanálu (cursor-based paginace)' })
@ApiResponse({ status: 200, description: 'Pole ChatMessage' })

// POST /api/worlds/:worldId/chat/channels/:channelId/messages
@ApiOperation({ summary: 'Odeslání zprávy do kanálu' })
@ApiResponse({ status: 201, description: 'Odeslaná ChatMessage' })

// PUT /api/worlds/:worldId/chat/channels/:channelId/messages/:id
@ApiOperation({ summary: 'Editace zprávy' })
@ApiResponse({ status: 200, description: 'Editovaná zpráva' })
@ApiResponse({ status: 403, description: 'Forbidden — pouze autor nebo PJ' })

// DELETE /api/worlds/:worldId/chat/channels/:channelId/messages/:id
@ApiOperation({ summary: 'Smazání zprávy (soft delete nebo hard delete pro PJ)' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/worlds/:worldId/chat/channels/:channelId/messages/:id/react
@ApiOperation({ summary: 'Toggle emoji reakce na zprávu' })
@ApiResponse({ status: 200, description: 'Aktualizované reakce' })

// POST /api/worlds/:worldId/chat/read/:channelId
@ApiOperation({ summary: 'Označí kanál jako přečtený (aktualizuje lastReadUtc)' })
@ApiResponse({ status: 200, description: 'Přečteno' })
```

- [ ] **Krok 3: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/chat/chat.controller.ts
git commit -m "docs(swagger): Chat controller anotace"
```

---

## Task 5: Global Chat + Upload + Presence + IkarosMessages

**Files:**
- Modify: `backend/src/modules/global-chat/global-chat.controller.ts`
- Modify: `backend/src/modules/upload/upload.controller.ts`
- Modify: `backend/src/modules/presence/presence.controller.ts`
- Modify: `backend/src/modules/ikaros-messages/ikaros-messages.controller.ts`

- [ ] **Krok 1: global-chat.controller.ts**

Přidat na třídu:
```typescript
@ApiTags('Global Chat')
@ApiBearerAuth()
```

Na endpointy:
```typescript
// GET /api/global-chat/messages
@ApiOperation({ summary: 'Historie zpráv globálního chatu (posledních 60 min)' })
@ApiResponse({ status: 200, description: 'Pole ChatMessage' })

// POST /api/global-chat/messages
@ApiOperation({ summary: 'Odeslání zprávy do globálního chatu' })
@ApiResponse({ status: 201, description: 'Odeslaná zpráva' })

// DELETE /api/global-chat/messages/:id
@ApiOperation({ summary: 'Smazání zprávy (Admin/Superadmin)' })
@ApiResponse({ status: 204, description: 'Smazáno' })
@ApiResponse({ status: 403, description: 'Forbidden' })

// GET /api/global-chat/room-info
@ApiOperation({ summary: 'Info o místnosti — channelId + seznam přítomných uživatelů' })
@ApiResponse({ status: 200, description: '{ channelId: string, users: { userId, username }[] }' })
```

- [ ] **Krok 2: upload.controller.ts**

```typescript
@ApiTags('Upload')
@ApiBearerAuth()

// POST /api/upload
@ApiOperation({ summary: 'Nahrání souboru na Cloudinary (image/video/document, max 50 MB)' })
@ApiConsumes('multipart/form-data')
@ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
@ApiResponse({ status: 201, description: '{ url: string, publicId: string }' })
@ApiResponse({ status: 400, description: 'Nepodporovaný MIME typ nebo příliš velký soubor' })
```

Import přidat: `import { ApiConsumes, ApiBody } from '@nestjs/swagger';`

- [ ] **Krok 3: presence.controller.ts**

```typescript
@ApiTags('Presence')
@ApiBearerAuth()

// GET /api/presence/online
@ApiOperation({ summary: 'Seznam online uživatelů (aktivních za posledních 25h)' })
@ApiResponse({ status: 200, description: 'string[] — pole userIds' })
```

- [ ] **Krok 4: ikaros-messages.controller.ts**

```typescript
@ApiTags('Ikaros Messages')
@ApiBearerAuth()

// GET /api/ikaros-messages/inbox
@ApiOperation({ summary: 'Doručená pošta aktuálního uživatele' })
@ApiResponse({ status: 200, description: 'Pole IkarosMessage' })

// GET /api/ikaros-messages/sent
@ApiOperation({ summary: 'Odeslaná pošta aktuálního uživatele' })
@ApiResponse({ status: 200, description: 'Pole IkarosMessage' })

// GET /api/ikaros-messages/unread-count
@ApiOperation({ summary: 'Počet nepřečtených zpráv a čekajících žádostí' })
@ApiResponse({ status: 200, description: '{ messages: number, pendingRequests: number }' })

// GET /api/ikaros-messages/:id
@ApiOperation({ summary: 'Detail zprávy (označí jako přečtenou)' })
@ApiResponse({ status: 200, description: 'IkarosMessage' })
@ApiResponse({ status: 404, description: 'Zpráva nenalezena' })

// POST /api/ikaros-messages
@ApiOperation({ summary: 'Odeslání nové zprávy' })
@ApiResponse({ status: 201, description: 'Odeslaná zpráva' })

// DELETE /api/ikaros-messages/:id
@ApiOperation({ summary: 'Smazání zprávy (soft delete pro aktuálního uživatele)' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/ikaros-messages/:id/resolve
@ApiOperation({ summary: 'Přijetí/odmítnutí žádosti o vstup do světa' })
@ApiResponse({ status: 200, description: 'Žádost vyřešena' })
@ApiResponse({ status: 403, description: 'Forbidden — jen PJ světa' })
```

- [ ] **Krok 5: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/global-chat/global-chat.controller.ts \
  backend/src/modules/upload/upload.controller.ts \
  backend/src/modules/presence/presence.controller.ts \
  backend/src/modules/ikaros-messages/ikaros-messages.controller.ts
git commit -m "docs(swagger): GlobalChat, Upload, Presence, IkarosMessages anotace"
```

---

## Task 6: Pages + Characters + Character Subdocs

**Files:**
- Modify: `backend/src/modules/pages/pages.controller.ts`
- Modify: `backend/src/modules/characters/characters.controller.ts`
- Modify: `backend/src/modules/character-subdocs/character-subdocs.controller.ts`

- [ ] **Krok 1: pages.controller.ts**

Přidat na třídu:
```typescript
@ApiTags('Pages')
@ApiBearerAuth()
```

Na endpointy:
```typescript
// GET /api/worlds/:worldId/pages
@ApiOperation({ summary: 'Seznam stránek světa (s access filtrem)' })
@ApiResponse({ status: 200, description: 'Pole Page' })

// GET /api/worlds/:worldId/pages/directory
@ApiOperation({ summary: 'Adresářový přehled stránek (slug + title)' })
@ApiResponse({ status: 200, description: 'Pole { slug, title }' })

// GET /api/worlds/:worldId/pages/data
@ApiOperation({ summary: 'Stránky dle počtu ?number=N' })
@ApiResponse({ status: 200, description: 'Pole Page' })

// GET /api/worlds/:worldId/pages/dataSlugs
@ApiOperation({ summary: 'Všechny slugy stránek světa' })
@ApiResponse({ status: 200, description: 'string[]' })

// GET /api/worlds/:worldId/pages/meta/:slug
@ApiOperation({ summary: 'Metadata stránky dle slugu' })
@ApiResponse({ status: 200, description: 'Page metadata' })
@ApiResponse({ status: 404, description: 'Stránka nenalezena' })

// GET /api/worlds/:worldId/pages/:slug
@ApiOperation({ summary: 'Plný obsah stránky dle slugu' })
@ApiResponse({ status: 200, description: 'Page' })
@ApiResponse({ status: 404, description: 'Stránka nenalezena nebo nemáš přístup' })

// POST /api/worlds/:worldId/pages
@ApiOperation({ summary: 'Vytvoření stránky (PJ/Korektor)' })
@ApiResponse({ status: 201, description: 'Vytvořená stránka' })

// PUT /api/worlds/:worldId/pages/:slug
@ApiOperation({ summary: 'Aktualizace stránky' })
@ApiResponse({ status: 200, description: 'Aktualizovaná stránka' })

// DELETE /api/worlds/:worldId/pages/:slug
@ApiOperation({ summary: 'Smazání stránky (PJ/Admin)' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// GET /api/worlds/:worldId/favorites
@ApiOperation({ summary: 'Oblíbené stránky světa' })
@ApiResponse({ status: 200, description: 'string[] — pole slugů' })

// POST /api/worlds/:worldId/pages/:slug/favorite
@ApiOperation({ summary: 'Přidat stránku do oblíbených' })
@ApiResponse({ status: 200, description: 'Aktualizovaný seznam oblíbených' })

// DELETE /api/worlds/:worldId/pages/:slug/favorite
@ApiOperation({ summary: 'Odebrat stránku z oblíbených' })
@ApiResponse({ status: 200, description: 'Aktualizovaný seznam oblíbených' })
```

- [ ] **Krok 2: characters.controller.ts**

```typescript
@ApiTags('Characters')
@ApiBearerAuth()

// GET /api/worlds/:worldId/characters
@ApiOperation({ summary: 'Seznam postav světa' })
@ApiResponse({ status: 200, description: 'Pole Character' })

// GET /api/worlds/:worldId/characters/players
@ApiOperation({ summary: 'Hráčské postavy světa (isNpc=false + userId set)' })
@ApiResponse({ status: 200, description: 'Pole Character' })

// GET /api/worlds/:worldId/characters/directory
@ApiOperation({ summary: 'Veřejný adresář postav' })
@ApiResponse({ status: 200, description: 'Pole Character (veřejná pole)' })

// GET /api/worlds/:worldId/characters/:slug
@ApiOperation({ summary: 'Detail postavy dle slugu' })
@ApiResponse({ status: 200, description: 'Character' })
@ApiResponse({ status: 404, description: 'Postava nenalezena' })

// POST /api/worlds/:worldId/characters
@ApiOperation({ summary: 'Vytvoření postavy' })
@ApiResponse({ status: 201, description: 'Vytvořená postava' })

// PATCH /api/worlds/:worldId/characters/:slug
@ApiOperation({ summary: 'Aktualizace postavy (diaryData deep-merge, extraBlocks replace)' })
@ApiResponse({ status: 200, description: 'Aktualizovaná postava' })

// DELETE /api/worlds/:worldId/characters/:slug
@ApiOperation({ summary: 'Smazání postavy' })
@ApiResponse({ status: 204, description: 'Smazáno' })
```

- [ ] **Krok 3: character-subdocs.controller.ts**

```typescript
@ApiTags('Character Subdocs')
@ApiBearerAuth()
```

Přidat `@ApiOperation` + `@ApiResponse` na každý endpoint dle skutečného obsahu controlleru (GET/POST/PUT/DELETE subdokumentů postavy).

- [ ] **Krok 4: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/pages/pages.controller.ts \
  backend/src/modules/characters/characters.controller.ts \
  backend/src/modules/character-subdocs/character-subdocs.controller.ts
git commit -m "docs(swagger): Pages, Characters, CharacterSubdocs anotace"
```

---

## Task 7: NPC Templates + Universe + Campaign

**Files:**
- Modify: `backend/src/modules/npc-templates/npc-templates.controller.ts`
- Modify: `backend/src/modules/universe/universe.controller.ts`
- Modify: `backend/src/modules/campaign/campaign.controller.ts`

- [ ] **Krok 1: npc-templates.controller.ts**

```typescript
@ApiTags('NPC Templates')
@ApiBearerAuth()

// GET /api/worlds/:worldId/npc-templates
@ApiOperation({ summary: 'Šablony NPC pro svět' })
@ApiResponse({ status: 200, description: 'Pole NpcTemplate' })

// GET /api/npc-templates/global
@ApiOperation({ summary: 'Globální NPC bestiář (worldId=null)' })
@ApiResponse({ status: 200, description: 'Pole NpcTemplate' })

// GET /api/worlds/:worldId/npc-templates/:id
@ApiOperation({ summary: 'Detail NPC šablony' })
@ApiResponse({ status: 200, description: 'NpcTemplate' })
@ApiResponse({ status: 404, description: 'Nenalezeno' })

// POST /api/worlds/:worldId/npc-templates
@ApiOperation({ summary: 'Vytvoření NPC šablony (PJ/Admin)' })
@ApiResponse({ status: 201, description: 'Vytvořená šablona' })

// PUT /api/worlds/:worldId/npc-templates/:id
@ApiOperation({ summary: 'Aktualizace NPC šablony' })
@ApiResponse({ status: 200, description: 'Aktualizovaná šablona' })

// DELETE /api/worlds/:worldId/npc-templates/:id
@ApiOperation({ summary: 'Smazání NPC šablony' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/worlds/:worldId/npc-templates/:id/import
@ApiOperation({ summary: 'Import globálního NPC do světa' })
@ApiResponse({ status: 201, description: 'Importovaná šablona' })
```

- [ ] **Krok 2: universe.controller.ts**

```typescript
@ApiTags('Universe Map')
@ApiBearerAuth()

// GET /api/universe?worldId=:id
@ApiOperation({ summary: 'Vesmírná mapa světa (uzly + spoje s visibility filtrem)' })
@ApiResponse({ status: 200, description: 'UniverseMap' })

// PUT /api/universe?worldId=:id
@ApiOperation({ summary: 'Úplné přepsání mapy (PJ/Admin)' })
@ApiResponse({ status: 200, description: 'Aktualizovaná mapa' })

// PATCH /api/universe/:worldId/nodes/:nodeId/visibility
@ApiOperation({ summary: 'Nastavení viditelnosti uzlu pro hráče' })
@ApiResponse({ status: 200, description: 'Aktualizovaný uzel' })
```

- [ ] **Krok 3: campaign.controller.ts**

```typescript
@ApiTags('Campaign')
@ApiBearerAuth()
```

Přidat na všechny endpointy (33 celkem) `@ApiOperation` + `@ApiResponse`. Vzor:

```typescript
// GET /api/campaign/subjects
@ApiOperation({ summary: 'Subjekty pavučiny vztahů (filtrováno dle role)' })
@ApiResponse({ status: 200, description: 'Pole CampaignSubject' })

// POST /api/campaign/subjects
@ApiOperation({ summary: 'Vytvoření subjektu' })
@ApiResponse({ status: 201, description: 'Vytvořený subjekt' })

// GET /api/campaign/relationships
@ApiOperation({ summary: 'Vztahy mezi subjekty' })
@ApiResponse({ status: 200, description: 'Pole CampaignRelationship' })

// GET /api/campaign/storylines
@ApiOperation({ summary: 'Příběhové linky' })
@ApiResponse({ status: 200, description: 'Pole CampaignStoryline' })

// GET /api/campaign/scenarios
@ApiOperation({ summary: 'Scénáře' })
@ApiResponse({ status: 200, description: 'Pole CampaignScenario' })

// GET /api/campaign/quick-notes
@ApiOperation({ summary: 'Rychlé poznámky' })
@ApiResponse({ status: 200, description: 'Pole CampaignQuickNote' })

// GET /api/campaign/shop-items
@ApiOperation({ summary: 'Položky obchodu' })
@ApiResponse({ status: 200, description: 'Pole CampaignShopItem' })

// GET /api/campaign/dashboard
@ApiOperation({ summary: 'Dashboard — krizové vztahy, aktivní linky, připnuté poznámky, změny' })
@ApiResponse({ status: 200, description: 'Dashboard agregace' })

// GET /api/campaign/changelog
@ApiOperation({ summary: 'Auditní log změn (TTL 90 dní, max 200 záznamů)' })
@ApiResponse({ status: 200, description: 'Pole CampaignChangeLog' })

// GET /api/campaign/players
@ApiOperation({ summary: 'Hráčský pohled na kampaňová data' })
@ApiResponse({ status: 200, description: 'Sdílená data' })
```

Zbývající /:id GET, PUT, DELETE endpointy přidat analogicky.

- [ ] **Krok 4: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/npc-templates/npc-templates.controller.ts \
  backend/src/modules/universe/universe.controller.ts \
  backend/src/modules/campaign/campaign.controller.ts
git commit -m "docs(swagger): NpcTemplates, Universe, Campaign anotace"
```

---

## Task 8: Maps + Map Templates + Dungeon Maps

**Files:**
- Modify: `backend/src/modules/maps/maps.controller.ts`
- Modify: `backend/src/modules/maps/map-templates.controller.ts`
- Modify: `backend/src/modules/dungeon-maps/dungeon-maps.controller.ts`

- [ ] **Krok 1: maps.controller.ts**

```typescript
@ApiTags('Maps')
@ApiBearerAuth()

// GET /api/maps?worldId=:id
@ApiOperation({ summary: 'Scény světa' })
@ApiResponse({ status: 200, description: 'Pole MapScene' })

// GET /api/maps/active?worldId=:id
@ApiOperation({ summary: 'Aktivní scéna světa' })
@ApiResponse({ status: 200, description: 'MapScene nebo null' })

// GET /api/maps/:id
@ApiOperation({ summary: 'Detail scény s characterData enrichmentem' })
@ApiResponse({ status: 200, description: 'MapScene' })
@ApiResponse({ status: 404, description: 'Nenalezeno' })

// POST /api/maps
@ApiOperation({ summary: 'Vytvoření scény (PJ/Admin)' })
@ApiResponse({ status: 201, description: 'Vytvořená scéna' })

// PUT /api/maps/:id
@ApiOperation({ summary: 'Aktualizace scény' })
@ApiResponse({ status: 200, description: 'Aktualizovaná scéna' })

// POST /api/maps/:id/active
@ApiOperation({ summary: 'Aktivace scény (deaktivuje ostatní v světě)' })
@ApiResponse({ status: 200, description: 'Aktivovaná scéna' })

// PATCH /api/maps/move-token
@ApiOperation({ summary: 'Přesun tokenu na scéně (hráč jen svůj, PJ cokoliv)' })
@ApiResponse({ status: 200, description: 'Aktualizovaný token' })

// PATCH /api/maps/remove-token
@ApiOperation({ summary: 'Odebrání tokenu ze scény' })
@ApiResponse({ status: 200, description: 'Token odebrán' })

// DELETE /api/maps/:id
@ApiOperation({ summary: 'Smazání scény (PJ/Admin)' })
@ApiResponse({ status: 204, description: 'Smazáno' })
```

- [ ] **Krok 2: map-templates.controller.ts**

```typescript
@ApiTags('Map Templates')
@ApiBearerAuth()

// GET /api/map-templates
@ApiOperation({ summary: 'Znovupoužitelné šablony scén' })
@ApiResponse({ status: 200, description: 'Pole MapTemplate' })

// GET /api/map-templates/:id
@ApiOperation({ summary: 'Detail šablony' })
@ApiResponse({ status: 200, description: 'MapTemplate' })

// POST /api/map-templates
@ApiOperation({ summary: 'Vytvoření šablony (PJ/Admin)' })
@ApiResponse({ status: 201, description: 'Vytvořená šablona' })

// PUT /api/map-templates/:id
@ApiOperation({ summary: 'Aktualizace šablony' })
@ApiResponse({ status: 200, description: 'Aktualizovaná šablona' })

// DELETE /api/map-templates/:id
@ApiOperation({ summary: 'Smazání šablony' })
@ApiResponse({ status: 204, description: 'Smazáno' })
```

- [ ] **Krok 3: dungeon-maps.controller.ts**

```typescript
@ApiTags('Dungeon Maps')
@ApiBearerAuth()

// GET /api/dungeon-maps?worldId=:id
@ApiOperation({ summary: 'Tile-based dungeony světa (PJ+)' })
@ApiResponse({ status: 200, description: 'Pole DungeonMap' })

// GET /api/dungeon-maps/:id
@ApiOperation({ summary: 'Detail dungeonu' })
@ApiResponse({ status: 200, description: 'DungeonMap' })

// POST /api/dungeon-maps
@ApiOperation({ summary: 'Vytvoření dungeonu' })
@ApiResponse({ status: 201, description: 'Vytvořený dungeon' })

// PUT /api/dungeon-maps/:id
@ApiOperation({ summary: 'Aktualizace dungeonu' })
@ApiResponse({ status: 200, description: 'Aktualizovaný dungeon' })

// DELETE /api/dungeon-maps/:id
@ApiOperation({ summary: 'Smazání dungeonu' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/dungeon-maps/:id/export-template
@ApiOperation({ summary: 'Export dungeonu jako MapTemplate' })
@ApiResponse({ status: 201, description: 'MapTemplate vytvořena' })

// POST /api/dungeon-maps/:id/export-scene
@ApiOperation({ summary: 'Export dungeonu jako MapScene' })
@ApiResponse({ status: 201, description: 'MapScene vytvořena' })
```

- [ ] **Krok 4: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/maps/maps.controller.ts \
  backend/src/modules/maps/map-templates.controller.ts \
  backend/src/modules/dungeon-maps/dungeon-maps.controller.ts
git commit -m "docs(swagger): Maps, MapTemplates, DungeonMaps anotace"
```

---

## Task 9: Ikaros moduly (News, Articles, Gallery, Discussions)

**Files:**
- Modify: `backend/src/modules/ikaros-news/ikaros-news.controller.ts`
- Modify: `backend/src/modules/ikaros-articles/ikaros-articles.controller.ts`
- Modify: `backend/src/modules/ikaros-gallery/ikaros-gallery.controller.ts`
- Modify: `backend/src/modules/ikaros-discussions/ikaros-discussions.controller.ts`

- [ ] **Krok 1: ikaros-news.controller.ts**

```typescript
@ApiTags('Ikaros News')
// Pozn.: GET je AllowAnonymous, žádný @ApiBearerAuth na celou třídu

// GET /IkarosNews
@ApiOperation({ summary: 'Platformové novinky (veřejné, bez JWT)' })
@ApiResponse({ status: 200, description: 'Pole IkarosNews' })

// POST /IkarosNews
@ApiBearerAuth()
@ApiOperation({ summary: 'Vytvoření novinky (Admin/PJ/Superadmin)' })
@ApiResponse({ status: 201, description: 'Vytvořená novinka' })
@ApiResponse({ status: 403, description: 'Forbidden' })

// DELETE /IkarosNews/:id
@ApiBearerAuth()
@ApiOperation({ summary: 'Smazání novinky (Admin/PJ/Superadmin)' })
@ApiResponse({ status: 204, description: 'Smazáno' })
```

- [ ] **Krok 2: ikaros-articles.controller.ts**

```typescript
@ApiTags('Ikaros Articles')
@ApiBearerAuth()

// GET /api/ikaros-articles
@ApiOperation({ summary: 'Publikované články + pending pro admina' })
@ApiResponse({ status: 200, description: 'Pole IkarosArticle' })

// GET /api/ikaros-articles/my
@ApiOperation({ summary: 'Vlastní články aktuálního uživatele' })
@ApiResponse({ status: 200, description: 'Pole IkarosArticle' })

// GET /api/ikaros-articles/pending
@ApiOperation({ summary: 'Články čekající na schválení (Admin)' })
@ApiResponse({ status: 200, description: 'Pole IkarosArticle' })

// GET /api/ikaros-articles/:id
@ApiOperation({ summary: 'Detail článku' })
@ApiResponse({ status: 200, description: 'IkarosArticle' })

// POST /api/ikaros-articles
@ApiOperation({ summary: 'Vytvoření článku (Draft)' })
@ApiResponse({ status: 201, description: 'Vytvořený článek' })

// PUT /api/ikaros-articles/:id
@ApiOperation({ summary: 'Editace článku (jen Draft nebo Rejected)' })
@ApiResponse({ status: 200, description: 'Aktualizovaný článek' })

// DELETE /api/ikaros-articles/:id
@ApiOperation({ summary: 'Smazání článku' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/ikaros-articles/:id/submit
@ApiOperation({ summary: 'Odeslání článku ke schválení (Draft → Pending)' })
@ApiResponse({ status: 200, description: 'Článek odeslán' })

// POST /api/ikaros-articles/:id/approve
@ApiOperation({ summary: 'Schválení článku (Admin)' })
@ApiResponse({ status: 200, description: 'Článek publikován' })

// POST /api/ikaros-articles/:id/reject
@ApiOperation({ summary: 'Zamítnutí článku s důvodem (Admin)' })
@ApiResponse({ status: 200, description: 'Článek zamítnut' })

// POST /api/ikaros-articles/:id/rate
@ApiOperation({ summary: 'Hodnocení článku 1–5 hvězdiček' })
@ApiResponse({ status: 200, description: 'Průměrné hodnocení aktualizováno' })
```

- [ ] **Krok 3: ikaros-gallery.controller.ts**

```typescript
@ApiTags('Ikaros Gallery')
@ApiBearerAuth()

// GET, GET /my, GET /pending, DELETE — stejný vzor jako Articles
// POST — multipart upload
@ApiOperation({ summary: 'Nahrání obrázku do galerie (multipart/form-data)' })
@ApiConsumes('multipart/form-data')
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      file: { type: 'string', format: 'binary' },
      title: { type: 'string' },
      description: { type: 'string' },
      submit: { type: 'boolean' },
    },
  },
})
@ApiResponse({ status: 201, description: 'Nahraný obrázek' })
```

Import: `import { ApiConsumes, ApiBody } from '@nestjs/swagger';`

- [ ] **Krok 4: ikaros-discussions.controller.ts**

```typescript
@ApiTags('Ikaros Discussions')
@ApiBearerAuth()

// GET /api/ikaros-discussions
@ApiOperation({ summary: 'Schválené diskuze (+ pending pro admina)' })
@ApiResponse({ status: 200, description: 'Pole IkarosDiscussion' })

// GET /api/ikaros-discussions/pending
@ApiOperation({ summary: 'Diskuze čekající na schválení' })
@ApiResponse({ status: 200, description: 'Pole IkarosDiscussion' })

// GET /api/ikaros-discussions/my-favorites
@ApiOperation({ summary: 'Oblíbené diskuze aktuálního uživatele' })
@ApiResponse({ status: 200, description: 'Pole IkarosDiscussion' })

// POST /api/ikaros-discussions
@ApiOperation({ summary: 'Vytvoření diskuze' })
@ApiResponse({ status: 201, description: 'Vytvořená diskuze' })

// PUT /api/ikaros-discussions/:id
@ApiOperation({ summary: 'Editace diskuze (creator/manažer)' })
@ApiResponse({ status: 200, description: 'Aktualizovaná diskuze' })

// DELETE /api/ikaros-discussions/:id
@ApiOperation({ summary: 'Smazání diskuze' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/ikaros-discussions/:id/approve
@ApiOperation({ summary: 'Schválení diskuze (Admin)' })
@ApiResponse({ status: 200, description: 'Schváleno' })

// POST /api/ikaros-discussions/:id/reject
@ApiOperation({ summary: 'Zamítnutí diskuze s důvodem' })
@ApiResponse({ status: 200, description: 'Zamítnuto' })

// POST /api/ikaros-discussions/:id/invite
@ApiOperation({ summary: 'Pozvání uživatele do diskuze (manager/admin)' })
@ApiResponse({ status: 200, description: 'Uživatel pozván' })

// POST /api/ikaros-discussions/:id/toggle-favorite
@ApiOperation({ summary: 'Toggle oblíbené diskuze' })
@ApiResponse({ status: 200, description: 'Oblíbené aktualizováno' })

// GET /api/ikaros-discussions/:id/posts
@ApiOperation({ summary: 'Příspěvky diskuze (stránkované)' })
@ApiResponse({ status: 200, description: 'Pole IkarosDiscussionPost' })

// POST /api/ikaros-discussions/:id/posts
@ApiOperation({ summary: 'Přidání příspěvku' })
@ApiResponse({ status: 201, description: 'Přidaný příspěvek' })

// DELETE /api/ikaros-discussions/:id/posts/:postId
@ApiOperation({ summary: 'Smazání příspěvku' })
@ApiResponse({ status: 204, description: 'Smazáno' })
```

- [ ] **Krok 5: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/ikaros-news/ikaros-news.controller.ts \
  backend/src/modules/ikaros-articles/ikaros-articles.controller.ts \
  backend/src/modules/ikaros-gallery/ikaros-gallery.controller.ts \
  backend/src/modules/ikaros-discussions/ikaros-discussions.controller.ts
git commit -m "docs(swagger): IkarosNews, Articles, Gallery, Discussions anotace"
```

---

## Task 10: World tools (Currencies + Emotes + Images + Sounds + WorldSounds)

**Files:**
- Modify: `backend/src/modules/world-currencies/world-currencies.controller.ts`
- Modify: `backend/src/modules/emotes/emotes.controller.ts`
- Modify: `backend/src/modules/images/images.controller.ts`
- Modify: `backend/src/modules/sounds/sounds.controller.ts`
- Modify: `backend/src/modules/sounds/world-sounds.controller.ts`

- [ ] **Krok 1: world-currencies.controller.ts**

```typescript
@ApiTags('World Currencies')
@ApiBearerAuth()

// GET /api/worlds/:id/currencies
@ApiOperation({ summary: 'Měny světa' })
@ApiResponse({ status: 200, description: 'Pole WorldCurrencyItem' })

// PUT /api/worlds/:id/currencies
@ApiOperation({ summary: 'Úplné přepsání měn světa (PJ/Admin)' })
@ApiResponse({ status: 200, description: 'Aktualizované měny' })
```

- [ ] **Krok 2: emotes.controller.ts**

```typescript
@ApiTags('Emotes')
@ApiBearerAuth()

// GET /api/emotes/:worldId
@ApiOperation({ summary: 'Custom emoty světa (JWT, člen světa)' })
@ApiResponse({ status: 200, description: 'Pole CustomEmote' })

// GET /api/emotes/global
@ApiOperation({ summary: 'Globální emoty (worldId=null)' })
@ApiResponse({ status: 200, description: 'Pole CustomEmote' })

// POST /api/emotes/:worldId
@ApiOperation({ summary: 'Vytvoření emote (PJ/PomocnýPJ+)' })
@ApiResponse({ status: 201, description: 'Vytvořený emote' })

// DELETE /api/emotes/:worldId/:id
@ApiOperation({ summary: 'Smazání emote' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/emotes/:worldId/:id/copy
@ApiOperation({ summary: 'Kopírování emote do jiného světa (PJ v obou světech)' })
@ApiResponse({ status: 201, description: 'Zkopírovaný emote' })

// POST /api/emotes/global
@ApiOperation({ summary: 'Vytvoření globálního emote (Admin+)' })
@ApiResponse({ status: 201, description: 'Vytvořený globální emote' })

// DELETE /api/emotes/global/:id
@ApiOperation({ summary: 'Smazání globálního emote (Admin+)' })
@ApiResponse({ status: 204, description: 'Smazáno' })
```

- [ ] **Krok 3: images.controller.ts**

```typescript
@ApiTags('Images')

// GET /api/images/*
@ApiOperation({ summary: 'Image proxy — HTTP 302 redirect na Cloudinary URL (zpětná kompatibilita)' })
@ApiResponse({ status: 302, description: 'Redirect na Cloudinary' })
```

Endpoint je veřejný — bez `@ApiBearerAuth()`.

- [ ] **Krok 4: sounds.controller.ts**

```typescript
@ApiTags('Sounds')
@ApiBearerAuth()

// GET /api/sounds
@ApiOperation({ summary: 'Globálně schválené zvuky' })
@ApiResponse({ status: 200, description: 'Pole Sound' })

// GET /api/sounds/pending
@ApiOperation({ summary: 'Zvuky čekající na schválení (Admin+)' })
@ApiResponse({ status: 200, description: 'Pole Sound' })

// GET /api/sounds/:id
@ApiOperation({ summary: 'Detail zvuku' })
@ApiResponse({ status: 200, description: 'Sound' })

// POST /api/sounds
@ApiOperation({ summary: 'Přidání zvuku do globální databáze (Admin+)' })
@ApiResponse({ status: 201, description: 'Přidaný zvuk' })

// PUT /api/sounds/:id
@ApiOperation({ summary: 'Aktualizace zvuku' })
@ApiResponse({ status: 200, description: 'Aktualizovaný zvuk' })

// DELETE /api/sounds/:id
@ApiOperation({ summary: 'Smazání zvuku' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/sounds/:id/approve
@ApiOperation({ summary: 'Schválení zvuku (Admin+)' })
@ApiResponse({ status: 200, description: 'Zvuk schválen' })

// POST /api/sounds/:id/reject
@ApiOperation({ summary: 'Zamítnutí zvuku' })
@ApiResponse({ status: 200, description: 'Zvuk zamítnut' })
```

- [ ] **Krok 5: world-sounds.controller.ts**

```typescript
@ApiTags('World Sounds')
@ApiBearerAuth()

// GET /api/worlds/:worldId/sounds
@ApiOperation({ summary: 'Zvuky světa' })
@ApiResponse({ status: 200, description: 'Pole Sound' })

// POST /api/worlds/:worldId/sounds
@ApiOperation({ summary: 'Přidání zvuku do světa' })
@ApiResponse({ status: 201, description: 'Přidaný zvuk' })

// PUT /api/worlds/:worldId/sounds/:id
@ApiOperation({ summary: 'Aktualizace world zvuku' })
@ApiResponse({ status: 200, description: 'Aktualizovaný zvuk' })

// DELETE /api/worlds/:worldId/sounds/:id
@ApiOperation({ summary: 'Smazání world zvuku' })
@ApiResponse({ status: 204, description: 'Smazáno' })

// POST /api/worlds/:worldId/sounds/:id/nominate
@ApiOperation({ summary: 'Nominace world zvuku pro globální databázi' })
@ApiResponse({ status: 200, description: 'Nominace odeslána' })

// POST /api/worlds/:worldId/sounds/import/:globalId
@ApiOperation({ summary: 'Import globálního zvuku do světa' })
@ApiResponse({ status: 201, description: 'Importovaný zvuk' })
```

- [ ] **Krok 6: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/world-currencies/world-currencies.controller.ts \
  backend/src/modules/emotes/emotes.controller.ts \
  backend/src/modules/images/images.controller.ts \
  backend/src/modules/sounds/sounds.controller.ts \
  backend/src/modules/sounds/world-sounds.controller.ts
git commit -m "docs(swagger): WorldCurrencies, Emotes, Images, Sounds anotace"
```

---

## Task 11: Push + Search + Stats + Admin

**Files:**
- Modify: `backend/src/modules/push/push.controller.ts`
- Modify: `backend/src/modules/search/search.controller.ts`
- Modify: `backend/src/modules/stats/stats.controller.ts`
- Modify: `backend/src/modules/admin/admin.controller.ts`

- [ ] **Krok 1: push.controller.ts**

```typescript
@ApiTags('Push Notifications')

// GET /api/push/vapid-public-key
@ApiOperation({ summary: 'VAPID public key pro web push subscriptions (veřejné)' })
@ApiResponse({ status: 200, description: '{ publicKey: string }' })

// POST /api/push/subscribe
@ApiBearerAuth()
@ApiOperation({ summary: 'Registrace push subscription (upsert dle endpoint)' })
@ApiResponse({ status: 201, description: 'Subscription registrována' })

// POST /api/push/unsubscribe
@ApiBearerAuth()
@ApiOperation({ summary: 'Odhlášení push subscription' })
@ApiResponse({ status: 200, description: 'Subscription odstraněna' })
```

- [ ] **Krok 2: search.controller.ts**

```typescript
@ApiTags('Search')
@ApiBearerAuth()

// GET /api/search?q=&count=5&provider=&worldId=
@ApiOperation({ summary: 'Full-text + embedding vyhledávání stránek' })
@ApiResponse({ status: 200, description: 'Pole výsledků vyhledávání' })

// GET /api/search/providers
@ApiOperation({ summary: 'Dostupní search provideři (MeiliSearch, ONNX)' })
@ApiResponse({ status: 200, description: 'Pole providerů a jejich stav' })

// POST /api/search/created
@ApiOperation({ summary: 'Přidání stránky do indexu' })
@ApiResponse({ status: 200, description: 'Indexováno' })

// POST /api/search/updated
@ApiOperation({ summary: 'Aktualizace stránky v indexu' })
@ApiResponse({ status: 200, description: 'Index aktualizován' })

// POST /api/search/deleted
@ApiOperation({ summary: 'Odebrání stránky z indexu' })
@ApiResponse({ status: 200, description: 'Odebráno z indexu' })

// POST /api/search/reindex
@ApiOperation({ summary: 'Reindex stránek (incrementální)' })
@ApiResponse({ status: 200, description: 'Reindex spuštěn' })

// POST /api/search/rebuild
@ApiOperation({ summary: 'Úplné přebudování indexu' })
@ApiResponse({ status: 200, description: 'Rebuild spuštěn' })
```

- [ ] **Krok 3: stats.controller.ts**

```typescript
@ApiTags('Stats')
@ApiBearerAuth()

// GET /api/stats/search
@ApiOperation({ summary: 'Statistiky search indexu (Admin+)' })
@ApiResponse({ status: 200, description: 'SearchIndexStats' })

// POST /api/stats/search/rebuild
@ApiOperation({ summary: 'Spustí rebuild search indexu (Admin+)' })
@ApiResponse({ status: 200, description: 'Rebuild spuštěn' })

// POST /api/stats/search/reindex
@ApiOperation({ summary: 'Spustí reindex search indexu (Admin+)' })
@ApiResponse({ status: 200, description: 'Reindex spuštěn' })
```

- [ ] **Krok 4: admin.controller.ts**

```typescript
@ApiTags('Admin')
@ApiBearerAuth()

// GET /api/admin/users
@ApiOperation({ summary: 'Seznam uživatelů s filtrací (username/role) a stránkováním' })
@ApiResponse({ status: 200, description: 'Pole User' })
@ApiResponse({ status: 403, description: 'Forbidden — jen Admin+' })

// POST /api/admin/users
@ApiOperation({ summary: 'Vytvoření uživatele adminem' })
@ApiResponse({ status: 201, description: 'Vytvořený uživatel' })

// PATCH /api/admin/users/:id/role
@ApiOperation({ summary: 'Změna role uživatele' })
@ApiResponse({ status: 200, description: 'Aktualizovaný uživatel' })
@ApiResponse({ status: 403, description: 'Forbidden' })

// PATCH /api/admin/users/:id/akj
@ApiOperation({ summary: 'Toggle AKJ flagu uživatele' })
@ApiResponse({ status: 200, description: 'Aktualizovaný uživatel' })

// GET /api/admin/recent-pages
@ApiOperation({ summary: 'Nedávno upravené stránky (Superadmin vidí vše, PJ jen své světy)' })
@ApiResponse({ status: 200, description: 'Pole Page' })
```

- [ ] **Krok 5: Build check + commit**

```bash
cd backend && npm run build 2>&1 | tail -5
git add backend/src/modules/push/push.controller.ts \
  backend/src/modules/search/search.controller.ts \
  backend/src/modules/stats/stats.controller.ts \
  backend/src/modules/admin/admin.controller.ts
git commit -m "docs(swagger): Push, Search, Stats, Admin anotace"
```

---

## Task 12: WebSocket dokumentace (docs/websocket-api.md)

**Files:**
- Create: `docs/websocket-api.md`

- [ ] **Krok 1: Vytvořit docs/websocket-api.md**

```markdown
# WebSocket API — Projekt Ikaros

Všechny gateway sdílejí jednu Socket.io instanci (výchozí namespace `/`).  
Připojení: `io('http://localhost:3000')` s `auth: { token: '<JWT>' }` nebo cookie.

---

## 1. ChatGateway

Obsluhuje real-time eventy pro chat kanály světa.

### Příchozí eventy (klient → server)

| Event | Payload | Auth | Popis |
|-------|---------|------|-------|
| `typing:start` | `{ channelId: string, username: string }` | JWT | Oznámí začátek psaní |
| `typing:stop` | `{ channelId: string, username: string }` | JWT | Oznámí konec psaní |

> Pozn.: Připojení do channel room se provádí přes `socket.join('chat:{channelId}')` — frontend to dělá při otevření kanálu. ChatGateway nevystavuje explicitní `join/leave` event.

### Odchozí eventy (server → klient)

| Event | Payload | Room | Popis |
|-------|---------|------|-------|
| `chat:typing` | `{ username: string, typing: boolean }` | `chat:{channelId}` | Indikátor psaní |
| `chat:message` | `ChatMessage` | `chat:{channelId}` nebo `user:{userId}` | Nová zpráva (whisper jde do user room) |
| `chat:message:updated` | `ChatMessage` | `chat:{channelId}` | Editovaná zpráva |
| `chat:message:deleted` | `{ messageId: string, channelId: string }` | `chat:{channelId}` | Smazaná zpráva |
| `chat:channel:created` | `ChatChannel` | `world:{worldId}` | Nový kanál ve světě |
| `chat:channel:updated` | `ChatChannel` | `world:{worldId}` | Aktualizovaný kanál |
| `chat:channel:deleted` | `{ channelId: string, groupId: string }` | `world:{worldId}` | Smazaný kanál |
| `chat:group:created` | `ChatGroup` | `world:{worldId}` | Nová chat skupina |
| `chat:group:updated` | `ChatGroup` | `world:{worldId}` | Aktualizovaná skupina |
| `chat:group:deleted` | `string` (groupId) | `world:{worldId}` | Smazaná skupina |
| `chat:unread` | `{ channelId: string, count: number }` | `user:{userId}` | Aktualizace unread počtu |

---

## 2. MapsGateway

Obsluhuje real-time synchronizaci taktické mapy.

### Příchozí eventy (klient → server)

| Event | Payload | Popis |
|-------|---------|-------|
| `map:join` | `{ sceneId: string }` | Připojí socket do scény |
| `map:leave` | `{ sceneId: string }` | Odpojí socket ze scény |
| `map:token-moved` | `{ sceneId: string, token: MapToken }` | Přesun tokenu |
| `map:config-updated` | `{ sceneId: string, config: HexConfig }` | Změna konfigurace mapy |
| `map:token-removed` | `{ sceneId: string, tokenId: string }` | Odebrání tokenu |
| `map:reload-scene` | `{ sceneId: string, scene: MapScene }` | Reload celé scény |
| `map:scene-cleared` | `string` (sceneId) | Vyčistění scény |
| `map:ping` | `{ sceneId: string, x: number, y: number, userName: string }` | Ping na mapě |
| `map:effect-added` | `{ sceneId: string, effect: MapEffect }` | Přidání efektu |
| `map:effect-removed` | `{ sceneId: string, effectId: string }` | Odebrání efektu |
| `map:fog-updated` | `{ sceneId: string, fogEnabled: boolean, revealedHexes: string[] }` | Aktualizace fog of war |
| `map:dice-rolled` | `{ sceneId: string, ...diceData }` | Hod kostkou |
| `map:scene-state-changed` | `{ sceneId: string, isHidden: boolean, isLocked: boolean }` | Změna stavu scény |
| `map:sound-changed` | `{ sceneId: string, soundIds: string[] }` | Změna aktivních zvuků |

### Odchozí eventy (server → klient)

| Event | Payload | Popis |
|-------|---------|-------|
| `map:token-moved` | `MapToken` | Broadcast přesunu tokenu ostatním |
| `map:config-updated` | `HexConfig` | Broadcast konfigurace |
| `map:token-removed` | `string` (tokenId) | Broadcast odebrání tokenu |
| `map:scene-reloaded` | `MapScene` | Broadcast reload scény |
| `map:scene-cleared` | — | Broadcast vyčistění |
| `map:pinged` | `(x, y, userName)` | Broadcast pingu |
| `map:effect-added` | `MapEffect` | Broadcast efektu |
| `map:effect-removed` | `string` (effectId) | Broadcast odebrání efektu |
| `map:fog-updated` | `(fogEnabled, revealedHexes)` | Broadcast fog změny |
| `map:dice-rolled` | `diceData` | Broadcast kostky (včetně odesílatele) |
| `map:scene-state-changed` | `(isHidden, isLocked)` | Broadcast stavu scény |
| `map:sound-changed` | `string[]` (soundIds) | Broadcast zvuků |

---

## 3. GlobalChatGateway

Obsluhuje interdimenzionální "hospodu" (GlobalChat) a whisper systém.

### Příchozí eventy (klient → server)

| Event | Payload | Popis |
|-------|---------|-------|
| `chat:hospoda:join` | `{ username: string, userId: string }` | Připojení do hospody, registrace presence |
| `chat:hospoda:leave` | `{ username: string }` | Odchod z hospody |
| `ikaros:whisper` | `{ toUserId: string, content: string }` | Privátní zpráva konkrétnímu uživateli |

### Odchozí eventy (server → klient)

| Event | Payload | Room | Popis |
|-------|---------|------|-------|
| `chat:presence` | `{ username: string, action: 'join' \| 'leave' }` | `chat:{channelId}` | Presence event |
| `chat:message` | `ChatMessage` | `chat:{channelId}` nebo `user:{userId}` | Nová zpráva nebo whisper |
| `chat:message:deleted` | `{ messageId: string, channelId: string }` | `chat:{channelId}` | Smazaná zpráva |

---

## 4. WorldsGateway

Server-side only gateway — broadcastuje změny světa a membership eventů.

### Odchozí eventy (server → klient)

| Event | Payload | Room | Popis |
|-------|---------|------|-------|
| `world:updated` | `World` | `world:{worldId}` | Svět byl aktualizován |
| `world:deleted` | `{ worldId: string }` | `world:{worldId}` | Svět byl smazán |
| `world:membership:changed` | `WorldMembership` | `world:{worldId}` | Membership aktualizováno |
| `world:membership:removed` | `string` (membershipId) | `world:{worldId}` | Membership odebráno |

---

## 5. UniverseGateway

Server-side only gateway — broadcastuje změny vesmírné mapy.

### Odchozí eventy (server → klient)

| Event | Payload | Room | Popis |
|-------|---------|------|-------|
| `universe:updated` | `UniverseMap` | `world:{worldId}` | Mapa aktualizována |

---

## 6. EmotesGateway

Server-side only gateway — broadcastuje nové emoty.

### Odchozí eventy (server → klient)

| Event | Payload | Room | Popis |
|-------|---------|------|-------|
| `emote:created` | `CustomEmote` | `world:{worldId}` | Nový emote přidán |

---

## 7. IkarosMessagesGateway

Server-side only gateway — real-time doručení zpráv.

### Odchozí eventy (server → klient)

| Event | Payload | Room | Popis |
|-------|---------|------|-------|
| `ikaros:new-message` | `{ messageId: string, subject: string, senderName: string }` | `user:{recipientId}` | Notifikace o nové zprávě |
```

- [ ] **Krok 2: Commit**

```bash
git add docs/websocket-api.md
git commit -m "docs: websocket-api.md — dokumentace všech 7 gateway eventů"
```

---

## Task 13: Finální ověření

- [ ] **Krok 1: Spustit dev server**

```bash
cd backend && npm run start:dev
```

- [ ] **Krok 2: Ověřit Swagger UI**

Otevřít `http://localhost:3000/api/docs` a zkontrolovat:
- [ ] Zobrazí se všechny tagy (Auth, Users, Worlds, Chat, ...)
- [ ] Každý endpoint má summary
- [ ] Bearer auth funguje (tlačítko Authorize v pravém horním rohu)
- [ ] DTO schémata jsou viditelná v sekci Schemas
- [ ] `/api/docs-json` vrací validní JSON

- [ ] **Krok 3: Ověřit TypeScript build**

```bash
cd backend && npm run build 2>&1 | tail -10
```

Očekávaný výstup: build bez chyb.

- [ ] **Krok 4: Aktualizovat roadmap**

V `docs/roadmap.md` změnit `## Krok 18 — Dokumentace API ⬜` na `✅` a odškrtnout oba checkboxy:
```markdown
## Krok 18 — Dokumentace API ✅
- [x] Swagger/OpenAPI pro všechny REST endpointy
- [x] WebSocket event dokumentace (Gateway events in/out)
```

V tabulce stavu změnit `⬜` na `✅` pro řádek krok 18.

- [ ] **Krok 5: Finální commit**

```bash
git add docs/roadmap.md
git commit -m "docs(roadmap): krok 18 Dokumentace API ✅"
```
