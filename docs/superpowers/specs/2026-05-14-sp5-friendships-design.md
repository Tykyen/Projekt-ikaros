# SP5 — Friendships (Design)

**Datum:** 2026-05-14
**Stav:** Schváleno
**Roadmap:** [be-fix-forward-decomposition](2026-05-14-be-fix-forward-decomposition.md)

---

## Cíl

Implementovat spec 1.8 — Friendships + Blocks. Plus DataExportModule stub (e2e tests importují ale neusagují). Po SP5 projdou `test/friendships.e2e-spec.ts` (~25 tests) a `test/game-events-upcoming-mine.e2e-spec.ts` typecheck.

---

## 1. Friendship schema (`friendships/schemas/friendship.schema.ts`)

```typescript
@Schema({ timestamps: { createdAt: 'requestedAt', updatedAt: false }, collection: 'friendships' })
export class FriendshipSchemaClass {
  @Prop({ required: true, index: true }) requesterId: string;
  @Prop({ required: true, index: true }) recipientId: string;
  @Prop({ required: true, type: String, default: 'pending' })
  status: 'pending' | 'accepted' | 'rejected';
  @Prop({ type: Date }) acceptedAt?: Date;
  @Prop({ type: Date, index: true }) rejectedAt?: Date;
}

// Compound unique index na sorted pair (zabrání duplicitě v obou směrech)
FriendshipSchema.index({ requesterId: 1, recipientId: 1 });
FriendshipSchema.index({ recipientId: 1, status: 1 });
```

⚠️ **Žádný strict unique index** — cool-down dovoluje, aby existovala rejected + nová pending. Service hlídá duplicitu.

---

## 2. FriendBlock schema (`friendships/schemas/friend-block.schema.ts`)

```typescript
@Schema({ timestamps: { createdAt: 'blockedAt', updatedAt: false }, collection: 'friend_blocks' })
export class FriendBlockSchemaClass {
  @Prop({ required: true, index: true }) blockerId: string;
  @Prop({ required: true, index: true }) blockedId: string;
}

FriendBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
```

---

## 3. Friendship interfaces

```typescript
// interfaces/friendship.interface.ts
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface Friendship {
  id: string;
  requesterId: string;
  recipientId: string;
  status: FriendshipStatus;
  requestedAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
}

export interface FriendBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  blockedAt: Date;
}

export type FriendStatusKind =
  | 'self'
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'accepted'
  | 'blocked_by_me';
```

---

## 4. Repositories

`IFriendshipsRepository`:
- `create(requesterId, recipientId)` → Friendship
- `findById(id)` → Friendship | null
- `findActiveBetween(a, b)` → Friendship | null (pending or accepted)
- `findLatestRejected(requesterId, recipientId)` → Friendship | null
- `accept(id, acceptedAt)` → Friendship | null
- `markRejected(id, rejectedAt)` → Friendship | null
- `remove(id)` → boolean
- `listAcceptedForUser(userId, page, limit)` → { items, total }
- `listOutgoingPendingForUser(userId)` → Friendship[]
- `listIncomingPendingForUser(userId)` → Friendship[]
- `countIncomingPendingForUser(userId)` → number
- `removeAllBetween(a, b)` → void (used on block)

`IFriendBlocksRepository`:
- `create(blockerId, blockedId)` → FriendBlock
- `findActive(blockerId, blockedId)` → FriendBlock | null
- `remove(blockerId, blockedId)` → boolean
- `listByBlocker(blockerId)` → FriendBlock[]
- `existsBlock(a, b)` → boolean (either direction)

---

## 5. FriendshipsService

### Methods

```typescript
class FriendshipsService {
  static readonly COOLDOWN_DAYS = 7;

  async sendRequest(requesterId, recipientUserId): Promise<{ friendship: Friendship }>
    // 400 SELF_FRIEND, 404 USER_NOT_FOUND, 409 ALREADY_BLOCKED, 403 BLOCKED_BY_PEER,
    // 429 REJECTED_RECENTLY, 409 REQUEST_EXISTS

  async accept(actorId, friendshipId): Promise<{ friendship: Friendship }>
    // 404, 403 NOT_RECIPIENT, 409 (status not pending)

  async removeOrDecline(actorId, friendshipId): Promise<void>
    // 403 (non-participant)
    // Recipient on pending → markRejected (cool-down)
    // Sender on pending → delete (no cool-down)
    // Either on accepted → delete (unfriend)

  async removeByUser(actorId, partnerUserId): Promise<void>
    // Alias — najde friendship between (actorId, partnerUserId) a remove

  async listForUser(userId, page, limit): Promise<{ items: PublicFriendItem[]; total: number }>
    // Filtruje blocked pairs

  async getStatus(actorId, otherUserId): Promise<{ kind: FriendStatusKind }>

  async listOutgoing(userId): Promise<{ items: Friendship[] }>

  async block(blockerId, blockedId): Promise<void>
    // 400 SELF_BLOCK, 409 ALREADY_BLOCKED
    // Side effect: smaže všechny friendship records mezi (anti-stalk)

  async unblock(blockerId, blockedId): Promise<void>

  async listBlocks(blockerId): Promise<FriendBlock[]>
}
```

### Logika sendRequest

```typescript
1. if (requesterId === recipientUserId) → 400 SELF_FRIEND
2. recipient = usersRepo.findById(recipientUserId)
3. if (!recipient || recipient.isDeleted) → 404 USER_NOT_FOUND
4. blockedByPeer = blocksRepo.findActive(recipientUserId, requesterId)
   if (blockedByPeer) → 403 BLOCKED_BY_PEER (info-leak akceptován)
5. blockedByMe = blocksRepo.findActive(requesterId, recipientUserId)
   if (blockedByMe) → 409 ALREADY_BLOCKED
6. existing = friendsRepo.findActiveBetween(requesterId, recipientUserId)
   if (existing) → 409 REQUEST_EXISTS
7. recentReject = friendsRepo.findLatestRejected(requesterId, recipientUserId)
   if (recentReject && now - recentReject.rejectedAt < COOLDOWN_DAYS * 24h) → 429 REJECTED_RECENTLY
8. friendship = friendsRepo.create(requesterId, recipientUserId)
9. Emit event 'friendship.requested' (pro PendingActions count refresh)
10. Return { friendship }
```

⚠️ **Anti-stalk rule:** `404 USER_NOT_FOUND` při block, ne 403 — leak existence usera by umožnil enumeration. Test line 405 explicitně ověřuje 404.

### Logika getStatus

```typescript
1. if (actorId === otherUserId) → { kind: 'self' }
2. if (blocksRepo.findActive(actorId, otherUserId)) → { kind: 'blocked_by_me' }
3. if (blocksRepo.findActive(otherUserId, actorId)) → { kind: 'none' } // anti-stalk
4. friendship = friendsRepo.findActiveBetween(actorId, otherUserId)
5. if (!friendship) → { kind: 'none' }
6. if (status === 'accepted') → { kind: 'accepted' }
7. if (status === 'pending'):
     if (actorId === friendship.requesterId) → 'pending_outgoing'
     else → 'pending_incoming'
```

---

## 6. PendingActions integration

`FriendshipsPendingActionProvider implements IPendingActionProvider`:
- `getType()`: 'friend_request'
- `count(userId)`: friendsRepo.countIncomingPendingForUser(userId)
- `list(userId)`: friendsRepo.listIncomingPendingForUser(userId) → map na PendingActionItem shape s `{ type: 'friend_request', friendshipId, requesterId, requesterUsername, requestedAt }`

Registrace v FriendshipsModule jako MULTI provider pod token `'IPendingActionProvider'`.

---

## 7. FriendshipsController routes

| Route | Auth | Body/Param |
|---|---|---|
| `POST /api/friends/request` | JWT | `{ userId }` |
| `POST /api/friends/:id/accept` | JWT | path |
| `DELETE /api/friends/:id` | JWT | path |
| `DELETE /api/friends/by-user/:userId` | JWT | path |
| `GET /api/friends` | JWT | ?page&limit |
| `GET /api/friends/status/:userId` | JWT | path |
| `GET /api/friends/requests/outgoing` | JWT | — |
| `POST /api/friends/block/:userId` | JWT | path |
| `DELETE /api/friends/block/:userId` | JWT | path |
| `GET /api/friends/blocks` | JWT | — |

⚠️ Controller mountován jako `@Controller('friends')` ale Swagger naroutuje s `/api/friends` (existující pattern v projektu — `setGlobalPrefix('api')`).

---

## 8. DataExportModule stub

Empty `@Module({})` — jen aby existoval pro e2e import. Plný GDPR export = SP6.

```typescript
// modules/data-export/data-export.module.ts
import { Module } from '@nestjs/common';

@Module({})
export class DataExportModule {}
```

---

## 9. AppModule registrace

Přidat `FriendshipsModule` + `DataExportModule` do imports[].

---

## 10. Anti-scope

**SP5 NEZAHRNUJE:**
- Friend search by name/username (SP5b future)
- Friend recommendations (SP5b)
- Notifications on accept (FE může číst přes pending-actions)
- DataExport real impl — SP6

---

## 11. Validation criteria

- [ ] Friendship + FriendBlock schemas + repos + interfaces
- [ ] FriendshipsService + 10 metod
- [ ] FriendshipsPendingActionProvider
- [ ] FriendshipsController 10 routes
- [ ] DataExportModule stub
- [ ] AppModule register both
- [ ] tsconfig: odebrat test/friendships.e2e-spec.ts + test/game-events-upcoming-mine.e2e-spec.ts z exclude
- [ ] `npx jest test/friendships` projde (~25 e2e tests)

---

## Schvalovací log

- 2026-05-14 — schváleno user response "jedeme dál".
