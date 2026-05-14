# SP3 — UsersService Extensions (Design)

**Datum:** 2026-05-14
**Stav:** Schváleno
**Roadmap:** [be-fix-forward-decomposition](2026-05-14-be-fix-forward-decomposition.md)
**Vychází z:** SP1 (Mailer + SecurityTokens), SP2 (User entity emailVerified). Předchází SP4 (Admin extensions).

---

## Cíl

Implementovat 3 chybějící metody na `UsersService` podle existujícího `users.service.spec.ts` kontraktu:

1. **`listPublic(query, requesterRole)`** — paginated public user list (spec 1.4)
2. **`publicProfileV14(userId, requesterRole)`** — bohatší public profile endpoint (spec 1.4)
3. **`requestEmailChange(userId, dto)`** — start email change flow (spec 1.7)

Plus podpůrné infrastruktura:
- User entity rozšíření o `hiddenPresence` (D-052)
- IUsersRepository nová metoda `findPublicPaginated`
- `IUsernameChangeRequestsRepository` stub (kvůli DI v users.service.spec.ts — vlastní impl je SP4)
- UsersService DI extension
- 2 controller routes + 1 DTO

---

## 1. User entity rozšíření — hiddenPresence (D-052)

### 1.1 Interface

V `user.interface.ts` přidat do `User`:

```typescript
  // SP3 / D-052 (2026-05-14):
  hiddenPresence?: boolean;
```

### 1.2 Schema

V `user.schema.ts` přidat do `UserSchemaClass`:

```typescript
  @Prop({ default: false }) hiddenPresence?: boolean;
```

---

## 2. IUsersRepository.findPublicPaginated

### 2.1 Interface

V `users-repository.interface.ts`:

```typescript
export interface FindPublicPaginatedOpts {
  q?: string; // text search v username/displayName
  sort?: 'new' | 'recent' | 'username'; // SP3 default 'new', ostatní stub
  page: number; // 1-indexed
  limit: number;
  includeDeleted: boolean; // jen Admin/Superadmin smí true; service to enforcuje
}

// Přidat do IUsersRepository:
findPublicPaginated(opts: FindPublicPaginatedOpts): Promise<{
  items: User[];
  total: number;
}>;
```

### 2.2 Mongo impl

```typescript
async findPublicPaginated(opts: FindPublicPaginatedOpts): Promise<{
  items: User[];
  total: number;
}> {
  const filter: Record<string, unknown> = {};
  if (!opts.includeDeleted) {
    filter.isDeleted = { $ne: true };
    filter.deletionRequestedAt = { $exists: false };
  }
  if (opts.q) {
    filter.$or = [
      { username: { $regex: opts.q, $options: 'i' } },
      { displayName: { $regex: opts.q, $options: 'i' } },
    ];
  }

  const sort: Record<string, 1 | -1> = (() => {
    switch (opts.sort) {
      case 'recent':
        return { lastSeenAt: -1 };
      case 'username':
        return { usernameLower: 1 };
      case 'new':
      default:
        return { createdAt: -1 };
    }
  })();

  const skip = (opts.page - 1) * opts.limit;
  const [docs, total] = await Promise.all([
    this.model.find(filter).sort(sort).skip(skip).limit(opts.limit).lean().exec(),
    this.model.countDocuments(filter).exec(),
  ]);

  return {
    items: docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>)),
    total,
  };
}
```

⚠️ **Performance:** Pro velký `q` regex je nutný text index na `username`/`displayName`. Pro SP3 stačí seq scan (low traffic). SP6/později přidá text index pokud bude potřeba.

---

## 3. UsernameChangeRequest stub

### 3.1 Účel a scope

UsersService DI v `users.service.spec.ts:133` injectuje `'IUsernameChangeRequestsRepository'`. Bez něj služba neufne. SP3 dodává **stub interface + Mongo impl s 6 stub metodama**. Skutečný flow (admin schvaluje username change requesty) je SP4 — tady jen vytvoříme typ a registrujeme v module.

### 3.2 Interface

`backend/src/modules/users/interfaces/username-change-request.interface.ts`:

```typescript
export type UsernameChangeStatus = 'pending' | 'approved' | 'rejected';

export interface UsernameChangeRequest {
  id: string;
  userId: string;
  currentUsername: string;
  requestedUsername: string;
  status: UsernameChangeStatus;
  decidedByUserId?: string;
  decidedAt?: Date;
  decisionNote?: string;
  createdAt: Date;
}
```

`backend/src/modules/users/interfaces/username-change-requests-repository.interface.ts`:

```typescript
import type {
  UsernameChangeRequest,
  UsernameChangeStatus,
} from './username-change-request.interface';

export interface IUsernameChangeRequestsRepository {
  create(input: {
    userId: string;
    currentUsername: string;
    requestedUsername: string;
  }): Promise<UsernameChangeRequest>;

  findById(id: string): Promise<UsernameChangeRequest | null>;

  findPendingByUserId(userId: string): Promise<UsernameChangeRequest | null>;

  listPaginated(opts: {
    status?: UsernameChangeStatus;
    page: number;
    limit: number;
  }): Promise<{ items: UsernameChangeRequest[]; total: number }>;

  update(
    id: string,
    data: Partial<UsernameChangeRequest>,
  ): Promise<UsernameChangeRequest | null>;

  deletePending(userId: string): Promise<void>;
}
```

### 3.3 Schema

`backend/src/modules/users/schemas/username-change-request.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { UsernameChangeStatus } from '../interfaces/username-change-request.interface';

export type UsernameChangeRequestDocument =
  HydratedDocument<UsernameChangeRequestSchemaClass>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'username_change_requests',
})
export class UsernameChangeRequestSchemaClass {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) currentUsername: string;
  @Prop({ required: true }) requestedUsername: string;
  @Prop({ required: true, type: String, default: 'pending' })
  status: UsernameChangeStatus;
  @Prop() decidedByUserId?: string;
  @Prop({ type: Date }) decidedAt?: Date;
  @Prop() decisionNote?: string;
}

export const UsernameChangeRequestSchema = SchemaFactory.createForClass(
  UsernameChangeRequestSchemaClass,
);
UsernameChangeRequestSchema.index(
  { userId: 1, status: 1 },
  { partialFilterExpression: { status: 'pending' } },
);
```

### 3.4 Repository impl

`backend/src/modules/users/repositories/username-change-requests.repository.ts`:

Plná Mongo impl (ne stub — žádná metoda není intenzivní, jen CRUD).

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsernameChangeRequestSchemaClass } from '../schemas/username-change-request.schema';
import type {
  UsernameChangeRequest,
  UsernameChangeStatus,
} from '../interfaces/username-change-request.interface';
import type { IUsernameChangeRequestsRepository } from '../interfaces/username-change-requests-repository.interface';

@Injectable()
export class MongoUsernameChangeRequestsRepository
  implements IUsernameChangeRequestsRepository
{
  constructor(
    @InjectModel(UsernameChangeRequestSchemaClass.name)
    private readonly model: Model<UsernameChangeRequestSchemaClass>,
  ) {}

  async create(input: {
    userId: string;
    currentUsername: string;
    requestedUsername: string;
  }): Promise<UsernameChangeRequest> {
    const doc = await this.model.create({ ...input, status: 'pending' });
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findById(id: string): Promise<UsernameChangeRequest | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findPendingByUserId(
    userId: string,
  ): Promise<UsernameChangeRequest | null> {
    const doc = await this.model
      .findOne({ userId, status: 'pending' })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async listPaginated(opts: {
    status?: UsernameChangeStatus;
    page: number;
    limit: number;
  }): Promise<{ items: UsernameChangeRequest[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (opts.status) filter.status = opts.status;
    const skip = (opts.page - 1) * opts.limit;
    const [docs, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(opts.limit)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  async update(
    id: string,
    data: Partial<UsernameChangeRequest>,
  ): Promise<UsernameChangeRequest | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deletePending(userId: string): Promise<void> {
    await this.model.deleteMany({ userId, status: 'pending' }).exec();
  }

  private toEntity(doc: Record<string, unknown>): UsernameChangeRequest {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      currentUsername: doc.currentUsername as string,
      requestedUsername: doc.requestedUsername as string,
      status: doc.status as UsernameChangeStatus,
      decidedByUserId: doc.decidedByUserId as string | undefined,
      decidedAt: doc.decidedAt as Date | undefined,
      decisionNote: doc.decisionNote as string | undefined,
      createdAt: doc.createdAt as Date,
    };
  }
}
```

⚠️ **Bez tests v SP3** — repo se nevolá z `listPublic`/`publicProfileV14`/`requestEmailChange`. SP4 přidá AdminService volání + spec tests.

### 3.5 UsersModule wire

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserSchemaClass.name, schema: UserSchema },
      // SP3:
      {
        name: UsernameChangeRequestSchemaClass.name,
        schema: UsernameChangeRequestSchema,
      },
    ]),
  ],
  providers: [
    UsersService,
    UserBanCacheService,
    { provide: 'IUsersRepository', useClass: MongoUsersRepository },
    {
      provide: 'IUsernameChangeRequestsRepository',
      useClass: MongoUsernameChangeRequestsRepository,
    },
  ],
  exports: [
    'IUsersRepository',
    'IUsernameChangeRequestsRepository',
    UsersService,
    UserBanCacheService,
  ],
})
```

---

## 4. UsersService rozšíření

### 4.1 DI

Konstruktor rozšířit (zachovat existující) o:

```typescript
constructor(
  @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
  // ... existing
  @Inject('IUsernameChangeRequestsRepository')
  private readonly usernameRequestsRepo: IUsernameChangeRequestsRepository,
  // SP3 — již injectované z existujícího kódu kvůli jiným metodám:
  // - private readonly events: EventEmitter2,
  // - private readonly config: ConfigService,
  // - private readonly uploadService: UploadService,
  // - private readonly banCache: UserBanCacheService,
  // - @Inject('IRefreshTokenRepository') private readonly refreshRepo: IRefreshTokenRepository,
  // - @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  // - @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
  // SP3 — nové z SP1:
  private readonly mailer: MailerService,
  private readonly securityTokens: SecurityTokensService,
) {}
```

⚠️ Některé z těchto deps už mohou být injectovány v existujícím UsersService (existují metody jako `changePassword` které potřebují refresh repo). Při implementaci **inspektovat aktuální stav** a přidat jen chybějící.

### 4.2 Static constants

```typescript
export class UsersService {
  static readonly EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // 1 hodina
  // ...
}
```

### 4.3 PublicUserListItem + PublicUserProfile types

V `interfaces/user.interface.ts` přidat:

```typescript
export interface PublicUserListItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
  defaultAvatarType?: string;
  worldsCount: number;
  deleted?: boolean; // jen pro Admin/Superadmin v includeDeleted=true
  pendingDeletion?: boolean; // jen pro Admin/Superadmin
}

export interface PublicUserProfile extends PublicUserListItem {
  lastSeenAt: string | null; // ISO string, null pro hiddenPresence / tombstone
}
```

### 4.4 listPublic

```typescript
async listPublic(
  query: {
    q?: string;
    sort?: 'new' | 'recent' | 'username';
    page?: number;
    limit?: number;
    includeDeleted?: boolean;
  },
  requesterRole: UserRole,
): Promise<{
  items: PublicUserListItem[];
  total: number;
  page: number;
  limit: number;
}> {
  const isAdmin =
    requesterRole === UserRole.Admin || requesterRole === UserRole.Superadmin;
  const includeDeleted = isAdmin && !!query.includeDeleted;
  const page = query.page ?? 1;
  const limit = query.limit ?? 24;
  const sort = query.sort ?? 'new';

  const { items, total } = await this.usersRepo.findPublicPaginated({
    q: query.q,
    sort,
    page,
    limit,
    includeDeleted,
  });

  const userIds = items.map((u) => u.id);
  const counts = await this.membershipRepo.countsByUserIds(userIds);

  return {
    items: items.map((u) => this.toPublicListItem(u, counts.get(u.id) ?? 0, isAdmin)),
    total,
    page,
    limit,
  };
}

private toPublicListItem(
  user: User,
  worldsCount: number,
  isAdmin: boolean,
): PublicUserListItem {
  const item: PublicUserListItem = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    characterPath: user.characterPath,
    role: user.role,
    createdAt: user.createdAt,
    defaultAvatarType: user.defaultAvatarType,
    worldsCount,
  };
  if (isAdmin) {
    if (user.isDeleted) item.deleted = true;
    if (user.deletionRequestedAt) item.pendingDeletion = true;
  }
  return item;
}
```

### 4.5 publicProfileV14

```typescript
async publicProfileV14(
  userId: string,
  requesterRole: UserRole,
): Promise<PublicUserProfile> {
  const user = await this.usersRepo.findById(userId);
  if (!user) throw new NotFoundException('User nenalezen');

  const isAdmin =
    requesterRole === UserRole.Admin || requesterRole === UserRole.Superadmin;
  const isTombstone = !!user.isDeleted;
  const isPending = !!user.deletionRequestedAt;

  if ((isTombstone || isPending) && !isAdmin) {
    throw new NotFoundException('User nenalezen');
  }

  const worldsCount = await this.membershipRepo.countByUserId(userId);

  // lastSeenAt: null pro hiddenPresence (D-052) NEBO tombstone (admin výjimka).
  let lastSeenAt: string | null;
  if (isTombstone || user.hiddenPresence) {
    lastSeenAt = null;
  } else {
    lastSeenAt = user.lastSeenAt ? user.lastSeenAt.toISOString() : null;
  }

  const profile: PublicUserProfile = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    characterPath: user.characterPath,
    role: user.role,
    createdAt: user.createdAt,
    defaultAvatarType: user.defaultAvatarType,
    worldsCount,
    lastSeenAt,
  };

  if (isAdmin) {
    if (isTombstone) profile.deleted = true;
    if (isPending) profile.pendingDeletion = true;
  }

  return profile;
}
```

### 4.6 requestEmailChange

```typescript
async requestEmailChange(
  userId: string,
  dto: { newEmail: string; currentPassword: string },
): Promise<{ ok: true; sentTo: string }> {
  const user = await this.usersRepo.findById(userId);
  if (!user) {
    throw new NotFoundException({
      statusCode: 404,
      message: 'User nenalezen',
      code: 'USER_NOT_FOUND',
    });
  }

  const passwordValid = await bcrypt.compare(
    dto.currentPassword,
    user.passwordHash,
  );
  if (!passwordValid) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Špatné aktuální heslo',
      code: 'INVALID_PASSWORD',
    });
  }

  const newEmailNormalized = dto.newEmail.toLowerCase().trim();
  if (newEmailNormalized === user.email.toLowerCase()) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Nový email je stejný jako aktuální',
      code: 'SAME_EMAIL',
    });
  }

  const existing = await this.usersRepo.findByEmail(newEmailNormalized);
  if (existing && existing.id !== userId) {
    throw new ConflictException({
      statusCode: 409,
      message: 'Email už používá jiný uživatel',
      code: 'EMAIL_TAKEN',
    });
  }

  const token = await this.securityTokens.issue(
    userId,
    'email_change',
    UsersService.EMAIL_CHANGE_TTL_MS,
    { newEmail: newEmailNormalized },
  );

  // Fire-and-forget oba maily (confirm na new, notice na old). Mailer interní
  // dispatcher swallows errors, ale i kdyby unwrapped reject prošel, swalow zde.
  try {
    await this.mailer.sendEmailChangeConfirm({
      to: newEmailNormalized,
      username: user.username,
      token,
    });
  } catch (err) {
    this.logger.warn(
      `requestEmailChange confirm mailer fail for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    await this.mailer.sendEmailChangeNotice({
      to: user.email,
      username: user.username,
      oldEmail: user.email,
      newEmail: newEmailNormalized,
    });
  } catch (err) {
    this.logger.warn(
      `requestEmailChange notice mailer fail for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { ok: true, sentTo: this.maskEmail(newEmailNormalized) };
}

private maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : '***';
  return `${maskedLocal}@${domain}`;
}
```

💡 *maskEmail je pro UI feedback ("token poslán na alice@example.com" → "a***e@example.com"). Anti-shoulder-surf.*

---

## 5. UsersController nové routes

| Route | DTO | Auth | Throttle |
|---|---|---|---|
| `GET /users` (listPublic) | query params | JWT | 60/min |
| `GET /users/profile/v14/:id` (publicProfileV14) | path | JWT | 60/min |
| `POST /users/me/request-email-change` | `RequestEmailChangeDto` | JWT | 5/min |

⚠️ **Existing `GET /users/profile/:id`** zachovává starý `publicProfile` (jednodušší shape). Nová cesta `/v14/:id` je explicitně označená — FE si vybere podle potřeby.

```typescript
@Get()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@ApiOperation({ summary: 'Paginated public user list (spec 1.4)' })
listPublic(
  @CurrentUser() requester: Requester,
  @Query('q') q?: string,
  @Query('sort') sort?: 'new' | 'recent' | 'username',
  @Query('page') page?: number,
  @Query('limit') limit?: number,
  @Query('includeDeleted') includeDeleted?: boolean,
) {
  return this.usersService.listPublic(
    {
      q,
      sort,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      includeDeleted: includeDeleted === true || (includeDeleted as unknown as string) === 'true',
    },
    requester.role,
  );
}

@Get('profile/v14/:id')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@ApiOperation({ summary: 'PublicUserProfile (spec 1.4 v14 shape)' })
publicProfileV14(
  @Param('id') id: string,
  @CurrentUser() requester: Requester,
) {
  return this.usersService.publicProfileV14(id, requester.role);
}

@Post('me/request-email-change')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Žádost o změnu emailu — vystaví token + 2 maily' })
requestEmailChange(
  @CurrentUser() requester: Requester,
  @Body() dto: RequestEmailChangeDto,
) {
  return this.usersService.requestEmailChange(requester.id, dto);
}
```

### 5.1 DTO

```typescript
// dto/request-email-change.dto.ts
export class RequestEmailChangeDto {
  @ApiProperty({ description: 'Nový e-mail uživatele' })
  @IsEmail()
  @MaxLength(255)
  newEmail: string;

  @ApiProperty({ description: 'Aktuální heslo pro ověření' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;
}
```

---

## 6. Testing scope

Hlavní pokrytí dodá existující `users.service.spec.ts` (~50 testů z toho 12 nových pro SP3 metody). Po SP3 musí všech projít.

**Nové testy SP3 nepřidává** — listPublic/publicProfileV14/requestEmailChange jsou kompletně pokryté existujícím specem. Repo `findPublicPaginated` má unit test, který přidáme do `users.repository.spec.ts` (~5 cases pro filter/sort kombinace).

### 6.1 Repository test cases (přidat do `users.repository.spec.ts`)

| Case | Expected |
|---|---|
| includeDeleted=false → filter isDeleted+deletionRequestedAt | OK |
| includeDeleted=true → žádný delete filter | OK |
| q='alice' → $or regex obě pole | OK |
| sort 'new' → createdAt -1 | OK |
| sort 'username' → usernameLower 1 | OK |

---

## 7. Anti-scope

**SP3 NEZAHRNUJE:**
- AdminService volání `usernameRequestsRepo` metod — SP4
- `decideUsernameChange(id, status, note)` endpoint — SP4
- Skutečnou implementaci `requestUsernameChange` (user-facing) — SP4 (zatím má jen DI stub pro spec)
- Email change confirmation flow — to už dělá AuthService.confirmEmailChange (SP2)
- Username history audit log — SP4
- Test endpoint pro listPublic/publicProfileV14 (e2e) — mimo SP3 scope, jen unit tests

---

## 8. Validation criteria

Po SP3:
- [ ] `User` interface má `hiddenPresence?: boolean`, schema decorator
- [ ] `PublicUserListItem`, `PublicUserProfile` interfaces v `user.interface.ts`
- [ ] `IUsersRepository.findPublicPaginated` + Mongo impl
- [ ] `UsernameChangeRequest` interface + schema + Mongo repo + provider v UsersModule
- [ ] `UsersService` 3 nové metody + `EMAIL_CHANGE_TTL_MS` static + DI extension
- [ ] `UsersController` 3 nové routes + 1 DTO
- [ ] `tsconfig.json` + `eslint.config.mjs` + `jest.config.ts` exclude — odebrána `users.service.spec.ts`
- [ ] `npm run typecheck` + `lint:check` exit 0
- [ ] `npx jest users.service` projde — ~50 testů zelených (vč. 12 SP3 1.4/1.7 testů)
- [ ] `docs/dluhy.md`: SP3 ✅, zbývá SP4–SP6

---

## Schvalovací log

- 2026-05-14 — schváleno user response "jedeme dál" po SP2 hotov.
