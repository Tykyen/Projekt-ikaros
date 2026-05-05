# Krok 16b — Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat skutečné mezery zjištěné analýzou parity — chybějící endpointy i funkční mezery odhalené hloubkovou analýzou C# vs NestJS kódu.

**Architecture:** Každá funkce sleduje zavedený NestJS pattern: controller → service → repository → schema. Nové endpointy se přidávají do existujících modulů. Kde modul chybí (Events), vytváří se nový kompletní modul. WebSocket opravy jdou do příslušných gateway souborů.

**Tech Stack:** NestJS, Mongoose, TypeScript, `class-validator`, `@nestjs/jwt`, `@nestjs/websockets`, Jest

> **Mimo rozsah tohoto plánu** (vyžadují vlastní design spec):
> - CRUD `/api/calenders` (světový kalendář)
> - CRUD `/api/timeline`
> - CRUD `/api/news`
> - `GET/PUT /api/users/getCalendarMonth/:id`
> - `GET /api/ikaros-chat/room-info`
> - Migrace dat oblíbených stránek (user → world level)

---

## Struktura souborů

```
backend/src/modules/
  auth/
    auth.controller.ts                    ← přidat POST /auth/refresh
    auth.service.ts                       ← přidat refreshToken()
  users/
    users.controller.ts                   ← přidat GET exists/:username, PUT :id/theme
    users.service.ts                      ← přidat existsByUsername(), updateTheme()
    dto/
      update-theme.dto.ts                 ← nový soubor
  admin/
    admin.controller.ts                   ← přidat POST /admin/users
    admin.service.ts                      ← přidat createUser()
    dto/
      create-user.dto.ts                  ← nový soubor
  game-events/
    game-events.controller.ts             ← nový soubor (CRUD + confirm)
    game-events.service.ts                ← nový soubor
    dto/
      create-game-event.dto.ts            ← nový soubor
      update-game-event.dto.ts            ← nový soubor
    repositories/
      game-event.repository.ts            ← přidat CRUD metody
    interfaces/
      game-event-repository.interface.ts  ← přidat CRUD metody
    game-events.module.ts                 ← přidat controller + service
  worlds/
    worlds.controller.ts                  ← přidat PUT :worldId/calendarconfig
    worlds.service.ts                     ← přidat updateCalendarConfig()
    schemas/
      world-settings.schema.ts            ← přidat calendarConfig pole
    dto/
      update-calendar-config.dto.ts       ← nový soubor
  chat/
    schemas/
      chat-channel.schema.ts              ← přidat type pole
      chat-message.schema.ts              ← přidat customFont pole, opravit soft-delete
    dto/
      create-channel.dto.ts               ← přidat type pole
      create-message.dto.ts               ← přidat customFont pole
      update-message.dto.ts               ← přidat attachments pole
    chat.service.ts                       ← opravit soft-delete text, přidat dice protection
  global-chat/
    global-chat.gateway.ts                ← přidat LoadHistory, UpdateUserList, RoomStyle, whisper, color
    schemas/
      global-chat-message.schema.ts       ← přidat color pole
    dto/
      create-global-message.dto.ts        ← přidat color pole
```

---

## Task 1: Users — `GET /api/users/exists/:username`

**Files:**
- Modify: `backend/src/modules/users/users.controller.ts`
- Modify: `backend/src/modules/users/users.service.ts`
- Test: `backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Přidej test do users.service.spec.ts**

```typescript
// Přidej do existujícího describe bloku v users.service.spec.ts
describe('existsByUsername', () => {
  it('vrátí true pokud username existuje', async () => {
    const mockRepo = { findByUsername: jest.fn().mockResolvedValue({ id: '1', username: 'testuser' }) };
    // inject mock repo do service (stejný pattern jako ostatní testy v souboru)
    const result = await service.existsByUsername('testuser');
    expect(result).toBe(true);
  });

  it('vrátí false pokud username neexistuje', async () => {
    const mockRepo = { findByUsername: jest.fn().mockResolvedValue(null) };
    const result = await service.existsByUsername('neexistuje');
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Spusť test — ověř že selže**

```bash
cd backend && npx jest users.service --no-coverage
```
Očekáváno: FAIL — `existsByUsername is not a function`

- [ ] **Step 3: Přidej metodu do users.service.ts**

Najdi existující `findById` metodu a za ní přidej:

```typescript
async existsByUsername(username: string): Promise<boolean> {
  const user = await this.repo.findByUsername(username);
  return !!user;
}
```

- [ ] **Step 4: Přidej endpoint do users.controller.ts**

Najdi existující `@Get('me')` endpoint. Přidej PŘED `@Get(':id')` (jinak Express zachytí `:id` dřív):

```typescript
@Get('exists/:username')
async exists(@Param('username') username: string): Promise<{ exists: boolean }> {
  const exists = await this.usersService.existsByUsername(username);
  return { exists };
}
```

> Poznámka: `exists/:username` musí být PŘED `profile/:id` a `:id` v pořadí dekorátorů.

- [ ] **Step 5: Spusť testy — ověř že prochází**

```bash
cd backend && npx jest users --no-coverage
```
Očekáváno: všechny testy PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/users/users.controller.ts backend/src/modules/users/users.service.ts backend/src/modules/users/users.service.spec.ts
git commit -m "feat(users): přidat GET /users/exists/:username"
```

---

## Task 2: Users — `PUT /api/users/:id/theme`

**Files:**
- Create: `backend/src/modules/users/dto/update-theme.dto.ts`
- Modify: `backend/src/modules/users/users.controller.ts`
- Modify: `backend/src/modules/users/users.service.ts`
- Test: `backend/src/modules/users/users.service.spec.ts`

- [ ] **Step 1: Vytvoř update-theme.dto.ts**

```typescript
// backend/src/modules/users/dto/update-theme.dto.ts
import { IsObject } from 'class-validator';

export class UpdateThemeDto {
  @IsObject()
  themeSettings: Record<string, unknown>;
}
```

- [ ] **Step 2: Přidej test**

```typescript
// přidej do users.service.spec.ts
describe('updateTheme', () => {
  it('zavolá update service s themeSettings', async () => {
    const updateSpy = jest.spyOn(service, 'update').mockResolvedValue(undefined as any);
    const requester = { id: 'user1', role: 'Hrac' } as any;
    await service.updateTheme('user1', { themeSettings: { color: 'dark' } }, requester);
    expect(updateSpy).toHaveBeenCalledWith('user1', { themeSettings: { color: 'dark' } }, requester);
  });
});
```

- [ ] **Step 3: Spusť test — ověř že selže**

```bash
cd backend && npx jest users.service --no-coverage
```
Očekáváno: FAIL — `updateTheme is not a function`

- [ ] **Step 4: Přidej metodu do users.service.ts**

```typescript
async updateTheme(id: string, dto: UpdateThemeDto, requester: RequestUser): Promise<void> {
  await this.update(id, { themeSettings: dto.themeSettings }, requester);
}
```

Přidej import `UpdateThemeDto` z `./dto/update-theme.dto`.

- [ ] **Step 5: Přidej endpoint do users.controller.ts**

Přidej import `UpdateThemeDto`. Přidej endpoint za `@Patch(':id')`:

```typescript
@Put(':id/theme')
@UseGuards(JwtAuthGuard)
@HttpCode(HttpStatus.NO_CONTENT)
async updateTheme(
  @Param('id') id: string,
  @Body() dto: UpdateThemeDto,
  @CurrentUser() requester: RequestUser,
): Promise<void> {
  await this.usersService.updateTheme(id, dto, requester);
}
```

Přidej `Put` do importů z `@nestjs/common` pokud chybí.

- [ ] **Step 6: Spusť testy**

```bash
cd backend && npx jest users --no-coverage
```
Očekáváno: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/users/dto/update-theme.dto.ts backend/src/modules/users/users.controller.ts backend/src/modules/users/users.service.ts backend/src/modules/users/users.service.spec.ts
git commit -m "feat(users): přidat PUT /users/:id/theme"
```

---

## Task 3: Admin — `POST /api/admin/users` (vytvoření uživatele)

**Files:**
- Create: `backend/src/modules/admin/dto/create-user.dto.ts`
- Modify: `backend/src/modules/admin/admin.controller.ts`
- Modify: `backend/src/modules/admin/admin.service.ts`
- Test: `backend/src/modules/admin/admin.service.spec.ts` (pokud existuje, jinak vytvoř)

- [ ] **Step 1: Vytvoř create-user.dto.ts**

```typescript
// backend/src/modules/admin/dto/create-user.dto.ts
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/enums/user-role.enum';

export class AdminCreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}
```

> Poznámka: Zkontroluj cestu k `UserRole` enum — může být v `users/enums/` nebo `common/enums/`. Uprav import dle skutečné cesty.

- [ ] **Step 2: Přidej metodu do admin.service.ts**

Přidej inject `AuthService` (nebo `UsersRepository`) do konstruktoru admin service. Pak přidej metodu:

```typescript
async createUser(dto: AdminCreateUserDto): Promise<User> {
  // použij stejný pattern jako auth.service.ts register()
  // zkopíruj logiku: hash hesla bcryptem, vytvoř uživatele přes repo
  const existing = await this.usersRepo.findByEmail(dto.email);
  if (existing) throw new ConflictException('Email již existuje');

  const passwordHash = await bcrypt.hash(dto.password, 10);
  return this.usersRepo.create({
    email: dto.email,
    username: dto.username,
    passwordHash,
    role: dto.role,
  });
}
```

> Zkontroluj jak admin.service.ts injectuje závislosti — přidej inject `IUsersRepository` nebo `AuthService` dle stávajícího patternu v souboru.

- [ ] **Step 3: Přidej endpoint do admin.controller.ts**

```typescript
@Post('users')
@UseGuards(JwtAuthGuard, AdminGuard)
async createUser(@Body() dto: AdminCreateUserDto): Promise<User> {
  return this.adminService.createUser(dto);
}
```

Přidej import `AdminCreateUserDto`.

- [ ] **Step 4: Spusť celé testy**

```bash
cd backend && npx jest admin --no-coverage
```
Očekáváno: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/admin/dto/create-user.dto.ts backend/src/modules/admin/admin.controller.ts backend/src/modules/admin/admin.service.ts
git commit -m "feat(admin): přidat POST /admin/users — vytvoření uživatele"
```

---

## Task 4: Auth — `POST /api/auth/refresh`

**Files:**
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Test: `backend/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: Přidej test**

```typescript
// backend/src/modules/auth/auth.service.spec.ts
describe('refreshToken', () => {
  it('vrátí nový accessToken pro existujícího uživatele', async () => {
    const mockUser = {
      id: 'user1',
      email: 'test@test.com',
      username: 'testuser',
      role: 'Hrac',
      characterPath: '',
      ikarosSkin: 'default',
    };
    jest.spyOn(usersService, 'findById').mockResolvedValue(mockUser as any);
    jest.spyOn(jwtService, 'sign').mockReturnValue('new.jwt.token');

    const result = await service.refreshToken('user1');
    expect(result).toBe('new.jwt.token');
  });
});
```

- [ ] **Step 2: Spusť test — ověř že selže**

```bash
cd backend && npx jest auth.service --no-coverage
```
Očekáváno: FAIL

- [ ] **Step 3: Přidej metodu do auth.service.ts**

Přidej `UsersService` inject pokud chybí (zkontroluj stávající konstruktor). Pak přidej:

```typescript
async refreshToken(userId: string): Promise<string> {
  const user = await this.usersService.findById(userId);
  if (!user) throw new UnauthorizedException();
  return this.generateToken(user);
}
```

> `generateToken` — použij existující privátní metodu v auth.service.ts která generuje JWT (sleduj existující `login()` metodu — obsahuje volání `this.jwtService.sign({...})`). Refaktoruj do `private generateToken(user)` pokud ještě neexistuje.

- [ ] **Step 4: Přidej endpoint do auth.controller.ts**

```typescript
@Post('refresh')
@UseGuards(JwtAuthGuard)
async refresh(@CurrentUser() user: RequestUser): Promise<{ accessToken: string }> {
  const accessToken = await this.authService.refreshToken(user.id);
  return { accessToken };
}
```

- [ ] **Step 5: Spusť testy**

```bash
cd backend && npx jest auth --no-coverage
```
Očekáváno: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.service.ts backend/src/modules/auth/auth.service.spec.ts
git commit -m "feat(auth): přidat POST /auth/refresh — obnova JWT tokenu"
```

---

## Task 5: Game Events — REST CRUD (`GET/POST/PUT/DELETE /api/events`)

**Files:**
- Create: `backend/src/modules/game-events/dto/create-game-event.dto.ts`
- Create: `backend/src/modules/game-events/dto/update-game-event.dto.ts`
- Create: `backend/src/modules/game-events/game-events.service.ts`
- Create: `backend/src/modules/game-events/game-events.controller.ts`
- Create: `backend/src/modules/game-events/game-events.service.spec.ts`
- Modify: `backend/src/modules/game-events/repositories/game-event.repository.ts`
- Modify: `backend/src/modules/game-events/interfaces/game-event-repository.interface.ts`
- Modify: `backend/src/modules/game-events/game-events.module.ts`

- [ ] **Step 1: Vytvoř DTO soubory**

```typescript
// backend/src/modules/game-events/dto/create-game-event.dto.ts
import { IsString, IsOptional, Matches } from 'class-validator';

export class CreateGameEventDto {
  @IsString()
  worldId: string;

  @IsString()
  title: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/, {
    message: 'date musí být ve formátu ISO 8601',
  })
  date: string;

  @IsString()
  @IsOptional()
  description?: string;
}
```

```typescript
// backend/src/modules/game-events/dto/update-game-event.dto.ts
import { IsString, IsOptional, Matches, IsBoolean } from 'class-validator';

export class UpdateGameEventDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/, {
    message: 'date musí být ve formátu ISO 8601',
  })
  date?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  reminderSent?: boolean;
}
```

- [ ] **Step 2: Rozšiř repository interface**

Přidej do `interfaces/game-event-repository.interface.ts` (nebo pokud interface neexistuje, přidej přímo do `game-event.repository.ts` jako interface na začátku):

```typescript
// Přidej do existujícího IGameEventRepository interface:
findByWorld(worldId: string): Promise<GameEvent[]>;
findOne(id: string): Promise<GameEvent | null>;
create(data: Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameEvent>;
update(id: string, data: Partial<GameEvent>): Promise<GameEvent | null>;
delete(id: string): Promise<void>;
confirm(id: string): Promise<GameEvent | null>;
```

- [ ] **Step 3: Implementuj nové repository metody v game-event.repository.ts**

Přidej za existující metody:

```typescript
async findByWorld(worldId: string): Promise<GameEvent[]> {
  const docs = await this.model.find({ worldId }).sort({ date: 1 }).exec();
  return docs.map(d => this.toEntity(d));
}

async findOne(id: string): Promise<GameEvent | null> {
  const doc = await this.model.findById(id).exec();
  return doc ? this.toEntity(doc) : null;
}

async create(data: Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameEvent> {
  const doc = await this.model.create(data);
  return this.toEntity(doc);
}

async update(id: string, data: Partial<GameEvent>): Promise<GameEvent | null> {
  const doc = await this.model.findByIdAndUpdate(id, data, { new: true }).exec();
  return doc ? this.toEntity(doc) : null;
}

async delete(id: string): Promise<void> {
  await this.model.findByIdAndDelete(id).exec();
}

async confirm(id: string): Promise<GameEvent | null> {
  const doc = await this.model.findByIdAndUpdate(
    id,
    { reminderSent: true },
    { new: true },
  ).exec();
  return doc ? this.toEntity(doc) : null;
}
```

> Zkontroluj jak ostatní repository metody přistupují k `this.model` — přizpůsob dle existujícího patternu (může být `this.model` nebo `this.eventModel`).

- [ ] **Step 4: Vytvoř game-events.service.spec.ts**

```typescript
// backend/src/modules/game-events/game-events.service.spec.ts
import { Test } from '@nestjs/testing';
import { GameEventsService } from './game-events.service';
import { NotFoundException } from '@nestjs/common';

describe('GameEventsService', () => {
  let service: GameEventsService;
  const mockRepo = {
    findByWorld: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    confirm: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GameEventsService,
        { provide: 'IGameEventRepository', useValue: mockRepo },
      ],
    }).compile();
    service = module.get(GameEventsService);
    jest.clearAllMocks();
  });

  it('findByWorld vrátí eventy pro daný svět', async () => {
    mockRepo.findByWorld.mockResolvedValue([{ id: '1', worldId: 'w1', title: 'Test' }]);
    const result = await service.findByWorld('w1');
    expect(result).toHaveLength(1);
    expect(mockRepo.findByWorld).toHaveBeenCalledWith('w1');
  });

  it('findOne vyhodí NotFoundException pokud event neexistuje', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('create vytvoří nový event', async () => {
    const dto = { worldId: 'w1', title: 'Bitva', date: '2026-06-01', description: '' };
    mockRepo.create.mockResolvedValue({ id: 'e1', ...dto, reminderSent: false });
    const result = await service.create(dto);
    expect(result.title).toBe('Bitva');
  });

  it('confirm nastaví reminderSent na true', async () => {
    mockRepo.confirm.mockResolvedValue({ id: 'e1', reminderSent: true });
    const result = await service.confirm('e1');
    expect(result.reminderSent).toBe(true);
  });
});
```

- [ ] **Step 5: Spusť test — ověř že selže**

```bash
cd backend && npx jest game-events.service --no-coverage
```
Očekáváno: FAIL — `GameEventsService` neexistuje

- [ ] **Step 6: Vytvoř game-events.service.ts**

```typescript
// backend/src/modules/game-events/game-events.service.ts
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { GameEvent } from './interfaces/game-event.interface';
import { CreateGameEventDto } from './dto/create-game-event.dto';
import { UpdateGameEventDto } from './dto/update-game-event.dto';

@Injectable()
export class GameEventsService {
  constructor(
    @Inject('IGameEventRepository') private readonly repo: any,
  ) {}

  async findByWorld(worldId: string): Promise<GameEvent[]> {
    return this.repo.findByWorld(worldId);
  }

  async findOne(id: string): Promise<GameEvent> {
    const event = await this.repo.findOne(id);
    if (!event) throw new NotFoundException(`Event ${id} nenalezen`);
    return event;
  }

  async create(dto: CreateGameEventDto): Promise<GameEvent> {
    return this.repo.create({ ...dto, reminderSent: false });
  }

  async update(id: string, dto: UpdateGameEventDto): Promise<GameEvent> {
    await this.findOne(id);
    const updated = await this.repo.update(id, dto);
    if (!updated) throw new NotFoundException(`Event ${id} nenalezen`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }

  async confirm(id: string): Promise<GameEvent> {
    await this.findOne(id);
    const updated = await this.repo.confirm(id);
    if (!updated) throw new NotFoundException(`Event ${id} nenalezen`);
    return updated;
  }
}
```

> Nahraď `any` za správný interface `IGameEventRepository` pokud je definovaný.

- [ ] **Step 7: Spusť test — ověř že prochází**

```bash
cd backend && npx jest game-events.service --no-coverage
```
Očekáváno: PASS

- [ ] **Step 8: Vytvoř game-events.controller.ts**

```typescript
// backend/src/modules/game-events/game-events.controller.ts
import {
  Controller, Get, Post, Put, Delete, Param, Body,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GameEventsService } from './game-events.service';
import { CreateGameEventDto } from './dto/create-game-event.dto';
import { UpdateGameEventDto } from './dto/update-game-event.dto';
import { GameEvent } from './interfaces/game-event.interface';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class GameEventsController {
  constructor(private readonly service: GameEventsService) {}

  @Get('world/:worldId')
  findByWorld(@Param('worldId') worldId: string): Promise<GameEvent[]> {
    return this.service.findByWorld(worldId);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<GameEvent> {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateGameEventDto): Promise<GameEvent> {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGameEventDto,
  ): Promise<GameEvent> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.service.delete(id);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string): Promise<GameEvent> {
    return this.service.confirm(id);
  }
}
```

> Zkontroluj cestu k `JwtAuthGuard` — může být `../../common/guards/jwt-auth.guard` nebo jiná. Podívej se na importy v existujícím souboru stejného modulu.

- [ ] **Step 9: Přidej controller + service do game-events.module.ts**

```typescript
// Uprav game-events.module.ts — přidej do providers a controllers:
import { GameEventsController } from './game-events.controller';
import { GameEventsService } from './game-events.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GameEventSchemaClass.name, schema: GameEventSchema }]),
    WorldsModule,  // pokud je potřeba pro autorizaci
  ],
  controllers: [GameEventsController],  // PŘIDAT
  providers: [
    GameEventReminderJob,
    GameEventCleanupJob,
    { provide: 'IGameEventRepository', useClass: MongoGameEventRepository },
    GameEventsService,  // PŘIDAT
  ],
})
export class GameEventsModule {}
```

- [ ] **Step 10: Spusť všechny testy backendu**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny testy PASS

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/game-events/
git commit -m "feat(game-events): přidat REST CRUD endpointy GET/POST/PUT/DELETE /api/events"
```

---

## Task 6: Worlds — `PUT /api/worlds/:worldId/calendarconfig`

**Files:**
- Create: `backend/src/modules/worlds/dto/update-calendar-config.dto.ts`
- Modify: `backend/src/modules/worlds/schemas/world-settings.schema.ts`
- Modify: `backend/src/modules/worlds/worlds.controller.ts`
- Modify: `backend/src/modules/worlds/worlds.service.ts`
- Test: `backend/src/modules/worlds/worlds.service.spec.ts`

- [ ] **Step 1: Vytvoř update-calendar-config.dto.ts**

```typescript
// backend/src/modules/worlds/dto/update-calendar-config.dto.ts
import { IsObject } from 'class-validator';

export class UpdateCalendarConfigDto {
  @IsObject()
  calendarConfig: Record<string, unknown>;
}
```

- [ ] **Step 2: Přidej calendarConfig pole do world-settings.schema.ts**

Najdi `WorldSettingsSchemaClass` a přidej pole za ostatní `@Prop` dekorátory:

```typescript
@Prop({ type: Object, default: {} })
calendarConfig: Record<string, unknown>;
```

- [ ] **Step 3: Přidej test do worlds.service.spec.ts**

```typescript
// přidej do worlds.service.spec.ts
describe('updateCalendarConfig', () => {
  it('aktualizuje calendarConfig pro daný svět', async () => {
    const mockSettings = { worldId: 'w1', calendarConfig: {} };
    // Mock world settings repository update
    const settingsRepo = { updateSettings: jest.fn().mockResolvedValue({ ...mockSettings, calendarConfig: { year: 360 } }) };
    // inject do service stejným způsobem jako v ostatních testech
    const result = await service.updateCalendarConfig('w1', { calendarConfig: { year: 360 } }, requester);
    expect(result.calendarConfig).toEqual({ year: 360 });
  });
});
```

> Přizpůsob mock setup patternu ostatních testů v souboru.

- [ ] **Step 4: Spusť test — ověř že selže**

```bash
cd backend && npx jest worlds.service --no-coverage
```

- [ ] **Step 5: Přidej metodu do worlds.service.ts**

Zkontroluj existující `updateSettings` metodu v worlds.service.ts a follow stejný pattern:

```typescript
async updateCalendarConfig(
  worldId: string,
  dto: UpdateCalendarConfigDto,
  requester: RequestUser,
): Promise<WorldSettings> {
  // Ověř že uživatel má právo editovat svět (PJ/Admin)
  // Zkopíruj authorization check z existující updateSettings() metody
  const settings = await this.settingsRepo.findByWorldId(worldId);
  if (!settings) throw new NotFoundException(`Nastavení světa ${worldId} nenalezena`);

  return this.settingsRepo.update(worldId, { calendarConfig: dto.calendarConfig });
}
```

> Najdi jak `worlds.service.ts` injectuje settings repository a jak provádí autorizaci. Použij stejný pattern (může být `this.worldSettingsRepo` nebo `this.settingsRepo`).

- [ ] **Step 6: Přidej endpoint do worlds.controller.ts**

```typescript
@Put(':worldId/calendarconfig')
@UseGuards(JwtAuthGuard)
async updateCalendarConfig(
  @Param('worldId') worldId: string,
  @Body() dto: UpdateCalendarConfigDto,
  @CurrentUser() requester: RequestUser,
): Promise<WorldSettings> {
  return this.worldsService.updateCalendarConfig(worldId, dto, requester);
}
```

Přidej import `UpdateCalendarConfigDto`.

- [ ] **Step 7: Spusť testy**

```bash
cd backend && npx jest worlds --no-coverage
```
Očekáváno: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/worlds/dto/update-calendar-config.dto.ts backend/src/modules/worlds/schemas/world-settings.schema.ts backend/src/modules/worlds/worlds.controller.ts backend/src/modules/worlds/worlds.service.ts backend/src/modules/worlds/worlds.service.spec.ts
git commit -m "feat(worlds): přidat PUT /worlds/:worldId/calendarconfig"
```

---

---

## Task 7: Chat — chybějící pole (`type`, `customFont`) a opravy soft-delete

**Files:**
- Modify: `backend/src/modules/chat/schemas/chat-channel.schema.ts`
- Modify: `backend/src/modules/chat/schemas/chat-message.schema.ts`
- Modify: `backend/src/modules/chat/dto/create-channel.dto.ts`
- Modify: `backend/src/modules/chat/dto/create-message.dto.ts`
- Modify: `backend/src/modules/chat/dto/update-message.dto.ts`
- Modify: `backend/src/modules/chat/chat.service.ts`

> Před začátkem si přečti aktuální obsah těchto souborů — cesty a pole se mohou lišit.

- [ ] **Step 1: Přidej `type` pole do chat-channel.schema.ts**

Najdi `ChatChannelSchemaClass` a přidej za existující `@Prop` pole:

```typescript
@Prop({
  enum: ['team_ic', 'team_ooc', 'team_pj', 'dm', 'inter', 'general'],
  default: 'general',
})
type: string;
```

- [ ] **Step 2: Přidej `type` do create-channel.dto.ts**

```typescript
import { IsString, IsOptional, IsIn } from 'class-validator';

// přidej do existující CreateChannelDto třídy:
@IsString()
@IsOptional()
@IsIn(['team_ic', 'team_ooc', 'team_pj', 'dm', 'inter', 'general'])
type?: string;
```

- [ ] **Step 3: Přidej `customFont` pole do chat-message.schema.ts**

Najdi `ChatMessageSchemaClass` a přidej za existující `@Prop` pole:

```typescript
@Prop({ type: String, default: null })
customFont: string | null;
```

- [ ] **Step 4: Přidej `customFont` do create-message.dto.ts**

```typescript
import { IsString, IsOptional } from 'class-validator';

// přidej do existující CreateMessageDto třídy:
@IsString()
@IsOptional()
customFont?: string;
```

- [ ] **Step 5: Přidej `attachments` editaci do update-message.dto.ts**

Najdi existující `UpdateMessageDto` a přidej pole pro attachments. Zkontroluj jak `ChatAttachmentDto` nebo ekvivalentní typ je definován v modulu, pak přidej:

```typescript
@IsArray()
@IsOptional()
attachments?: ChatAttachmentDto[];
```

Přidej import `ChatAttachmentDto` ze správného místa v modulu.

- [ ] **Step 6: Oprav soft-delete text v chat.service.ts**

Najdi metodu pro smazání zprávy (hledej `isDeleted = true` nebo `delete`). Změň nastavení `content`:

```typescript
// PŘED (špatně):
content: null,

// PO (správně):
content: '*Zpráva byla smazána autorem*',
```

- [ ] **Step 7: Přidej ochranu dice rolls v chat.service.ts**

Ve stejné delete metodě přidej check před soft-delete:

```typescript
// Přidej na začátek delete logiky (zkontroluj jak jsou dice rolls označeny v C# — hledej 'isDiceRoll' nebo 'type === dice' nebo podobné pole):
if (message.isDiceRoll) {
  throw new ForbiddenException('Kostky nelze smazat');
}
```

> Zkontroluj schéma `ChatMessageSchemaClass` zda má `isDiceRoll` nebo jiné pole označující kostky. Pokud ne, přidej `@Prop({ default: false }) isDiceRoll: boolean;` do schématu a odpovídající pole do `CreateMessageDto`.

- [ ] **Step 8: Spusť testy chatu**

```bash
cd backend && npx jest chat --no-coverage
```
Očekáváno: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/chat/
git commit -m "feat(chat): přidat type, customFont, opravit soft-delete a ochrana kostek"
```

---

## Task 8: GlobalChat Gateway — chybějící WS funkce (LoadHistory, UserList, RoomStyle, whisper, color)

**Files:**
- Modify: `backend/src/modules/global-chat/global-chat.gateway.ts`
- Modify: `backend/src/modules/global-chat/schemas/` (přidat color pole na zprávy)
- Modify: `backend/src/modules/global-chat/dto/` (přidat color do CreateMessageDto)

> Před začátkem si přečti celý `global-chat.gateway.ts` a `global-chat.service.ts` — identifikuj existující eventy a metody.

- [ ] **Step 1: Přidej `color` pole do global chat message schématu**

Najdi schéma pro globální chat zprávy (může být `GlobalChatMessageSchemaClass` nebo podobné). Přidej:

```typescript
@Prop({ type: String, default: null })
color: string | null;
```

Přidej `color?: string` do příslušného `CreateMessageDto`.

- [ ] **Step 2: Přidej `LoadHistory` při joinu místnosti**

V `global-chat.gateway.ts` najdi handler pro `chat:hospoda:join`. Rozšiř ho o odeslání historie:

```typescript
@SubscribeMessage('chat:hospoda:join')
async handleJoin(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { username: string },
) {
  const roomId = 'hospoda';
  client.join(roomId);

  // Načti poslední zprávy a pošli volajícímu
  const history = await this.globalChatService.getRecentMessages(roomId, 50);
  client.emit('ikaros:load-history', history);

  // Přidej uživatele do přítomných a rozešli seznam
  await this.globalChatService.addToPresence(roomId, payload.username, client.id);
  const userList = await this.globalChatService.getPresence(roomId);
  this.server.to(roomId).emit('ikaros:user-list', userList);

  // Oznám ostatním
  client.to(roomId).emit('ikaros:user-joined', { username: payload.username });
}
```

> `getRecentMessages`, `addToPresence`, `getPresence` — přidej tyto metody do `GlobalChatService` pokud neexistují. Pro presence použij in-memory `Map<string, Set<string>>` nebo existující mechanismus.

- [ ] **Step 3: Přidej `UpdateUserList` při opuštění místnosti**

Najdi handler pro `chat:hospoda:leave` a rozšiř ho:

```typescript
@SubscribeMessage('chat:hospoda:leave')
async handleLeave(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { username: string },
) {
  const roomId = 'hospoda';
  await this.globalChatService.removeFromPresence(roomId, client.id);
  const userList = await this.globalChatService.getPresence(roomId);
  this.server.to(roomId).emit('ikaros:user-list', userList);
  client.to(roomId).emit('ikaros:user-left', { username: payload.username });
  client.leave(roomId);
}
```

- [ ] **Step 4: Přidej `RoomStyleChanged` event**

```typescript
@SubscribeMessage('ikaros:set-room-style')
@UseGuards(WsJwtGuard)  // nebo ekvivalentní guard
async handleSetRoomStyle(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { roomId: string; style: string },
) {
  // Jen PJ/Admin může měnit styl — zkontroluj autorizaci dle existujícího patternu
  this.server.to(payload.roomId).emit('ikaros:room-style-changed', { style: payload.style });
}
```

- [ ] **Step 5: Přidej whisper podporu do `handleDisconnect`**

Najdi `handleDisconnect` v gateway (pokud existuje) a přidej cleanup presence:

```typescript
async handleDisconnect(client: Socket) {
  // Existující logika...
  // Přidej: cleanup presence pro všechny místnosti
  await this.globalChatService.removeFromPresenceBySocketId(client.id);
}
```

- [ ] **Step 6: Spusť testy**

```bash
cd backend && npx jest global-chat --no-coverage
```
Očekáváno: PASS (nebo PASS s novými testy které přidáš pro nové metody service)

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/global-chat/
git commit -m "feat(global-chat): přidat LoadHistory, UserList, RoomStyle WS eventy"
```

---

## Task 9: Aktualizace checklist-be.md po implementaci

**Files:**
- Modify: `docs/checklist-be.md`

- [ ] **Step 1: Po dokončení všech tasků spusť celou test suite**

```bash
cd backend && npx jest --no-coverage
```
Očekáváno: všechny testy PASS (≥ 452)

- [ ] **Step 2: Aktualizuj tabulku "Skutečné mezery" v checklist-be.md**

Označ implementované položky jako ✅:
- Auth refresh → ✅
- Users exists → ✅
- Users theme → ✅
- Admin create user → ✅
- Game Events REST → ✅
- World calendarconfig → ✅
- Chat type + customFont + soft-delete + kostky → ✅
- GlobalChat LoadHistory + UserList + RoomStyle → ✅

- [ ] **Step 3: Commit**

```bash
git add docs/checklist-be.md
git commit -m "docs(checklist): aktualizace po implementaci krok 16b"
```

---

## Poznámky pro implementaci

**Cesty k importům:** Vždy zkontroluj reálné cesty v existujících souborech daného modulu — neodhaduj.

**UserRole enum:** Může být v `users/enums/user-role.enum.ts` nebo `common/enums/`. Zkontroluj.

**JwtAuthGuard:** Cesta je typicky `../../common/guards/jwt-auth.guard` nebo `../auth/guards/jwt-auth.guard`.

**RequestUser:** Typ přijímaný v `@CurrentUser()` — zkontroluj existující použití v stejném modulu.

**Repository pattern:** Každý modul injectuje repo přes string token (`@Inject('IGameEventRepository')`). Následuj pattern z existujících modulů.
