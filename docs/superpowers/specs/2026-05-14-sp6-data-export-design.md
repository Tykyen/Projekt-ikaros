# SP6 — DataExport GDPR (Design)

**Datum:** 2026-05-14
**Stav:** Schváleno
**Roadmap:** [be-fix-forward-decomposition](2026-05-14-be-fix-forward-decomposition.md)

---

## Cíl

GDPR compliance — user může exportovat svoje data v machine-readable formátu (JSON).
SP6 MVP: synchronní endpoint `GET /api/data-export/me` vrací JSON s relevantními sekcemi.

**Žádný spec contract** (greenfield). Žádné testy povinné — minimum viable feature.

---

## 1. Architektura

`DataExportModule` (post-SP5 stub → impl) obsahuje:

- `DataExportService` — orchestrator, načítá data z různých repositories
- `DataExportController` — endpoint `GET /api/data-export/me`
- Interface `DataExportPayload` — shape exportu

Data se sbírá synchronně přes injectované repos (UsersRepo, FriendshipsRepo, FriendBlocksRepo, UsernameChangeRequestsRepo, WorldMembershipRepo, AdminAuditLogRepo).

⚠️ **Anti-scope:** Chat messages, pages content, article content, file attachments — mimo SP6 MVP. Single-user export by mohl být multi-MB. Pro real GDPR sjet asynchronní job + zip download (dluh).

---

## 2. Payload shape

```typescript
export interface DataExportPayload {
  exportedAt: string; // ISO timestamp
  version: '1.0';
  user: {
    id: string;
    email: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    characterPath?: string;
    ikarosSkin?: string;
    role: UserRole;
    themeSettings: Record<string, unknown>;
    chatPreferences: Record<string, unknown>;
    emailVerified?: boolean;
    emailVerifiedAt?: string;
    isOnline: boolean;
    lastSeenAt?: string;
    createdAt: string;
    updatedAt: string;
    // Anti-include: passwordHash, bannedAt/By/Until/Reason (subject's view neukazuje internal admin context)
  };
  worldMemberships: Array<{
    worldId: string;
    role: number;
    joinedAt: string;
    group?: string;
    characterPath?: string;
  }>;
  friendships: Array<{
    id: string;
    counterpartUserId: string;
    direction: 'outgoing' | 'incoming';
    status: 'pending' | 'accepted';
    requestedAt: string;
    acceptedAt?: string;
  }>;
  friendBlocks: Array<{
    blockedUserId: string;
    blockedAt: string;
  }>;
  pendingUsernameRequest: {
    requestedUsername: string;
    status: string;
    requestedAt: string;
  } | null;
  adminAuditLog: Array<{
    action: string;
    actorUsername: string;
    reason: string | null;
    createdAt: string;
  }>; // jen kde já jsem target (akce provedené nade mnou)
}
```

⚠️ **Sensitive omits:** `passwordHash` (interní), `deletionRequestedBy/Reason/Promotions` (admin context), `bannedBy/Reason/Until/At` (admin context). Subject má právo vědět **že** je banned (přes auditLog s actorUsername redacted? nebo plný?), ale konkrétní admin reason je out-of-scope MVP. Pro full GDPR compliance přidáme později.

---

## 3. DataExportService

```typescript
@Injectable()
export class DataExportService {
  constructor(
    @Inject('IUsersRepository') usersRepo,
    @Inject('IFriendshipsRepository') friendsRepo,
    @Inject('IFriendBlocksRepository') blocksRepo,
    @Inject('IUsernameChangeRequestsRepository') usernameRepo,
    @Inject('IWorldMembershipRepository') membershipRepo,
    @Inject('IAdminAuditLogRepository') auditRepo,
  ) {}

  async exportForUser(userId: string): Promise<DataExportPayload> {
    const user = usersRepo.findById; if !user → NotFound;
    const memberships = membershipRepo.findByUserId(userId);
    const acceptedFriendships = friendsRepo.listAcceptedForUser(userId, 1, 1000);
    const outgoingPending = friendsRepo.listOutgoingPendingForUser(userId);
    const incomingPending = friendsRepo.listIncomingPendingForUser(userId);
    const blocks = blocksRepo.listByBlocker(userId);
    const usernameRequest = usernameRepo.findPendingByUserId(userId);
    const audit = auditRepo.listPaginated({ targetId: userId, page: 1, limit: 100 });

    return { exportedAt, version: '1.0', user: sanitize(user), worldMemberships, friendships, friendBlocks, pendingUsernameRequest, adminAuditLog };
  }
}
```

---

## 4. DataExportController

```typescript
@Controller('data-export')
@UseGuards(JwtAuthGuard)
export class DataExportController {
  @Get('me')
  async exportMe(@CurrentUser() user: RequestUser): Promise<DataExportPayload> {
    return this.service.exportForUser(user.id);
  }
}
```

⚠️ Žádný admin endpoint (nice-to-have ale rozšíříme až bude potřeba). Jen self-export.

---

## 5. DataExportModule

```typescript
@Module({
  // Žádné nové schemas — všechny repos jsou @Inject přes string tokens z existing modules.
  controllers: [DataExportController],
  providers: [DataExportService],
})
export class DataExportModule {}
```

---

## 6. Anti-scope

- Chat messages export — could be huge, separate endpoint
- Pages/articles content
- File attachments URLs
- ZIP packaging
- Async job tracking
- Admin endpoint (export jiného usera)
- Email notification po exportu
- Rate limit (default throttler stačí)
- Banned/deletion admin internal context

---

## 7. Validation criteria

- [ ] DataExportService + exportForUser metoda
- [ ] DataExportController + GET /me route
- [ ] DataExportModule plně wired (replace stub)
- [ ] AppModule reg (už registrovaný v SP5)
- [ ] `npm run typecheck` projde
- [ ] `npm run lint:check` projde
- [ ] Manual smoke check: vyžaduje JWT, vrátí JSON s sections

---

## Schvalovací log

- 2026-05-14 — schváleno user response "jedeme dál" po SP5.
