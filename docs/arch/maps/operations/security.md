# Bezpečnost

## Autentizace

Všechny endpointy `/maps/:id/operations*` chráněny `@UseGuards(JwtAuthGuard)`. JWT v `Authorization: Bearer <token>` header.

WS klient se autentizuje při connection handshake (Socket.io middleware s `JwtAuthGuard` ekvivalent — stávající `MapsGateway` toto **nemá**, je třeba doplnit jako součást této spec, viz `ai-notes.md`).

---

## Autorizace — `assertCanDo(user, scene, op)`

**Centrální funkce** v `MapsService` (nebo nová `OperationsAuthorizer` třída). Vrací `true | throw ForbiddenException(MAP_OP_FORBIDDEN)`.

### Matice oprávnění per op typ

**Per-scene ops (`mapOperations` log):**

| Op | Sa / Admin | PJ světa | Hráč ve světě | Cizí |
|---|---|---|---|---|
| `token.add` | ✅ | ✅ | ❌ | ❌ |
| `token.move` (vlastní token) | ✅ | ✅ | ✅ pokud `token.characterId === userId` | ❌ |
| `token.move` (cizí token) | ✅ | ✅ | ❌ | ❌ |
| `token.move` (PC token když `scene.isLocked`) | ✅ | ✅ | ❌ | ❌ |
| `token.remove` (vlastní) | ✅ | ✅ | ✅ | ❌ |
| `token.remove` (cizí) | ✅ | ✅ | ❌ | ❌ |
| `token.update` (vlastní `currentHp`, `injury`) | ✅ | ✅ | ✅ | ❌ |
| `token.update` (cokoli jiného / cizí token) | ✅ | ✅ | ❌ | ❌ |
| `effect.*` | ✅ | ✅ | ❌ | ❌ |
| `fog.*` | ✅ | ✅ | ❌ | ❌ |
| `scene.state` | ✅ | ✅ | ❌ | ❌ |
| `scene.config` / `.image` / `.name` / `.folder` | ✅ | ✅ | ❌ | ❌ |
| `sound.playlist` | ✅ | ✅ | ❌ | ❌ |
| `combat.*` | ✅ | ✅ | ❌ | ❌ |
| `npcTemplate.*` | ✅ | ✅ | ❌ | ❌ |

**Per-scene ops — read access (`GET /maps/:id/operations`):**

| Role | Read access |
|---|---|
| Sa / Admin | ✅ jakákoli scéna |
| PJ světa | ✅ scény jeho světa |
| Hráč ve světě | ✅ **jen ke scéně, na které je** (`WorldMembership.currentSceneId === :id`); jinak 403 |
| Cizí | ❌ |

**Cross-scene ops (`worldOperations` log):**

| Op | Sa / Admin | PJ světa | Hráč ve světě | Cizí |
|---|---|---|---|---|
| `member.assignToScene` (cizí user) | ✅ | ✅ | ❌ | ❌ |
| `member.assignToScene` (self) | ✅ | ✅ | ❌ — hráč nemůže self-assign na jinou scénu | ❌ |
| `member.unassign` (cizí user) | ✅ | ✅ | ❌ | ❌ |
| `member.unassign` (self) | ✅ | ✅ | ✅ — hráč může opustit svou scénu (graceful leave) | ❌ |
| `member.bulkAssignToScene` | ✅ | ✅ | ❌ | ❌ |

**Cross-scene read access (`GET /worlds/:id/operations`):**

| Role | Read access |
|---|---|
| Sa / Admin | ✅ |
| PJ světa | ✅ |
| Hráč ve světě | ❌ — privacy (hráč se o vlastním přesunu dozví přes private `map:reassigned` event, nepotřebuje overview) |
| Cizí | ❌ |

### Implementace

```ts
async assertCanDo(user: RequestUser, scene: MapScene, op: OperationPayload): Promise<void> {
  // 1. Global Sa/Admin bypass
  if (user.role <= UserRole.Admin) return;

  // 2. Membership check
  const membership = await this.membershipRepo.findByUserAndWorld(user.id, scene.worldId);
  if (!membership) throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', message: 'Nejsi member tohoto světa' });

  const isWorldPJ = membership.role >= WorldRole.PJ;

  // 3. PJ může vše
  if (isWorldPJ) return;

  // 4. Hráč — per op typ
  switch (op.type) {
    case 'token.move':
    case 'token.remove': {
      const token = scene.tokens.find((t) => t.id === op.tokenId);
      if (!token) throw new NotFoundException({ code: 'MAP_TOKEN_NOT_FOUND', ... });
      if (token.characterId !== user.id) throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', ... });
      if (op.type === 'token.move' && scene.isLocked) throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', message: 'Mapa zamčená' });
      return;
    }
    case 'token.update': {
      const token = scene.tokens.find((t) => t.id === op.tokenId);
      if (!token) throw new NotFoundException(...);
      if (token.characterId !== user.id) throw new ForbiddenException(...);
      // Hráč může editovat jen vlastní HP/injury, nic dalšího
      const allowedPlayerFields = new Set(['currentHp', 'injury']);
      const patchKeys = Object.keys(op.patch);
      if (!patchKeys.every((k) => allowedPlayerFields.has(k))) {
        throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', message: 'Hráč může editovat jen vlastní HP / zranění' });
      }
      return;
    }
    default:
      throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', message: 'Tato operace je PJ-only' });
  }
}

// Cross-scene assertion (samostatná pro `worldOperations`):
async assertCanDoWorldOp(user: RequestUser, worldId: string, op: WorldOperationPayload): Promise<void> {
  // 1. Sa/Admin bypass
  if (user.role <= UserRole.Admin) return;

  // 2. Membership check
  const membership = await this.membershipRepo.findByUserAndWorld(user.id, worldId);
  if (!membership) throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', message: 'Nejsi member tohoto světa' });

  const isWorldPJ = membership.role >= WorldRole.PJ;

  // 3. PJ může vše (cross-scene)
  if (isWorldPJ) return;

  // 4. Hráč — jen self-unassign
  switch (op.type) {
    case 'member.unassign':
      if (op.userId === user.id) return; // self-leave
      throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', message: 'Hráč může opustit jen vlastní scénu' });
    default:
      throw new ForbiddenException({ code: 'MAP_OP_FORBIDDEN', message: 'Tato operace je PJ-only' });
  }
}
```

---

## Validace vstupů

### Per op DTO

Každý typ má vlastní validační class s `class-validator` decorators. Discriminator field `type` rozhoduje, který DTO se použije.

```ts
@ValidatorConstraint({ async: false })
class IsValidHexCoord implements ValidatorConstraintInterface {
  validate(value: any) {
    return value && typeof value.q === 'number' && typeof value.r === 'number'
      && Number.isInteger(value.q) && Number.isInteger(value.r);
  }
}

class TokenMoveOp {
  @Equals('token.move') type: 'token.move';
  @IsString() @IsNotEmpty() tokenId: string;
  @IsInt() q: number;
  @IsInt() r: number;
}
// ... další DTOs per typ

// Discriminator resolver:
@Injectable()
class OperationPayloadValidator {
  validate(input: unknown): OperationPayload {
    if (!input || typeof input !== 'object' || !('type' in input)) {
      throw new BadRequestException({ code: 'MAP_OP_INVALID', message: 'Chybí op.type' });
    }
    const dto = DTOS[(input as { type: string }).type];
    if (!dto) throw new BadRequestException({ code: 'MAP_OP_INVALID', message: `Neznámý typ ${input.type}` });
    return plainToInstance(dto, input, { ...class-validator };
  }
}
```

### Rozsahy

- `q`, `r`: signed integer, no hard limit (mapa může být velká); soft limit `±10000` (sanity check).
- `hexes` array v `fog.brush`: hard limit 1000 hex per request (klient batchne) — `MAP_OP_INVALID` při překročení.
- `effect.hexes`: hard limit 5000 (velká explosion).
- `op.patch` (token/effect/npcTemplate): max 50 fields per request.

---

## Rate limiting

**Per-user, per-scéna:**

| Op kategorie | Limit |
|---|---|
| `token.move` | 30 req/min (drag throttle = 0.5 Hz minimum) |
| `fog.brush` | 60 req/min (PJ rapid paint) |
| Ostatní | 60 req/min |
| Catch-up `GET` | 10 req/min |

Implementace přes existující rate-limit middleware (`@nestjs/throttler` nebo Redis-based). Klíč: `${userId}:${sceneId}:${opCategory}`.

429 response s `Retry-After` header. Klient: queue ops a respektuje delay.

---

## Citlivá data

- **`byUserId`** v logu = veřejný (pro účely ne-PJ klienta není anonymní). Akceptovatelné — na mapě je každý akt veřejný (token pohyb).
- **`inverse` op** v 201 response obsahuje předchozí state (např. `token.move` inverse má staré `q, r`). Akceptovatelné — uživatel je iniciátor.
- **Žádné secrets** v op payload (žádné passwords, tokens, ...).
- **Audit log**: ve výjimkách `MAP_OP_FORBIDDEN` logovat `{userId, sceneId, op.type, attempted_at}` na samostatný log channel (potenciální útok detection).

---

## Poznámky

### WS authorizace

Stávající `MapsGateway` **nemá auth middleware** (gateway přijímá WS connection od kohokoli). To je **bug nad rámec této spec**, ale komponenta `operations` ho musí napravit, protože dosavadní gateway by jinak relayoval `map:operation` neauth klientovi.

**Plán:**
1. Přidat Socket.io middleware (`server.use(...)`) v gateway, který ověří JWT z handshake `auth.token`.
2. Uložit `socket.data.user = decodedJwt` pro pozdější ověření v `assertCanDo`.
3. `map:join` zkontroluje, že user je member daného světa.

### Rozšiřitelnost

Přidání nového op typu = nová DTO class + nový case v `assertCanDo` + nový case v `applyOperation` service (Mongo update + inverse computation). Žádný dopad na klienta beyond UI handler pro nový op.

### Nedělá ne

- **Nedělá** end-to-end encryption mezi klienty.
- **Nedělá** signature ops (signed by user) — JWT auth stačí.
- **Nedělá** anonymizaci `byUserId` (v MVP).
