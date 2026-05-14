# SP0 — BE Fix-Forward: Quick Fixes (Design)

**Datum:** 2026-05-14
**Stav:** Schváleno
**Roadmap:** [be-fix-forward-decomposition](2026-05-14-be-fix-forward-decomposition.md)
**Trigger:** 116 typecheck errorů na origin/main, blokuje commity přes pre-commit hook.

---

## Přehled

SP0 je nejnižší vrstva fix-forward roadmap. Cílem je:

1. Vytvořit chybějící primitivní artefakty (typy, enum hodnoty, guard, exporty), aby SP1–SP6 nemusely každý znovu řešit drobnosti.
2. Nastavit transitional state: `tsconfig.json` excluduje neopravené soubory, pre-commit hook tím projde.
3. Zapsat master dluh entry, který trackuje zbytek fix-forward práce.

Žádný nový modul. Žádný nový endpoint. Pouze typy, schema rozšíření, guard a tsconfig.

---

## 1. User entity rozšíření (9 polí)

### Interface `User`

Přidat do `backend/src/modules/users/interfaces/user.interface.ts`:

```typescript
export interface AdminPermissions {
  canManageAdmins: boolean;
  canModerateContent: boolean;
  canEditPlatformPages: boolean;
}

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  canManageAdmins: false,
  canModerateContent: false,
  canEditPlatformPages: false,
};

export interface User {
  // ... existing
  isDeleted?: boolean;
  deletionRequestedAt?: Date;
  deletionReason?: string;
  bannedAt?: Date;
  bannedUntil?: Date;
  banReason?: string;
  adminPermissions?: AdminPermissions;
  defaultAvatarType?: string;
  usernameChangedAt?: Date;
}
```

### Schema `UserSchemaClass`

Přidat `@Prop()` decorátory do `backend/src/modules/users/schemas/user.schema.ts`:

```typescript
@Prop({ default: false }) isDeleted?: boolean;
@Prop({ type: Date }) deletionRequestedAt?: Date;
@Prop() deletionReason?: string;

@Prop({ type: Date }) bannedAt?: Date;
@Prop({ type: Date }) bannedUntil?: Date;
@Prop() banReason?: string;

@Prop({
  type: {
    canManageAdmins: { type: Boolean, default: false },
    canModerateContent: { type: Boolean, default: false },
    canEditPlatformPages: { type: Boolean, default: false },
  },
  _id: false,
})
adminPermissions?: AdminPermissions;

@Prop() defaultAvatarType?: string;
@Prop({ type: Date }) usernameChangedAt?: Date;
```

**Indexy:** žádné nové. SP4 přidá `bannedUntil` TTL index pro auto-unban.

⚠️ **Žádná migration script:** existující záznamy budou mít fields `undefined`, což TypeScript respektuje (vše `?:`). SP4 přidá backfill ban-cache rebuild při startu, který existující bany načte.

---

## 2. WorldRole.Pending alias

`chat.service.ts:92,577,615` referuje `WorldRole.Pending`. Po D-053 byl Pending přejmenován na `Zadatel`. Volby:

- **A:** přepsat 3 řádky v chat.service na `WorldRole.Zadatel`
- **B:** přidat `Pending = 0` jako alias `Zadatel` v enum (back-compat)

**Volba: A.** Žádná back-compat motivace — D-053 explicitně rename, kód v chat.service je nedopatření. Migration už proběhla.

```typescript
// chat.service.ts (3 výskyty)
- WorldRole.Pending
+ WorldRole.Zadatel
```

---

## 3. OptionalJwtAuthGuard

Nový soubor: `backend/src/common/guards/optional-jwt-auth.guard.ts`.

Použití: `worlds.controller.ts` na 3 endpointech (read-only, anon vidí jen public/open).

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser | undefined {
    // Anonymní průchod: pokud token chybí/neplatný, user = undefined, NE throw.
    if (err) {
      // logování ponecháme NestJS default
    }
    return user ?? undefined;
  }
}
```

Test: `optional-jwt-auth.guard.spec.ts` — 3 případy (valid token, missing token, invalid token).

---

## 4. Login response — `status` discriminator

Krok 1.3c spec mluví o discriminated union. Pro SP0 přidáme JEN `'ok'` branch, zbytek (banned/email-not-verified) přijde s SP4/SP2.

### `auth.service.ts`

```typescript
export type LoginResult =
  | {
      status: 'ok';
      accessToken: string;
      refreshToken: string;
      user: Omit<User, 'passwordHash'>;
    };
// SP2/SP4 rozšíří union o:
// | { status: 'email_not_verified'; email: string }
// | { status: 'banned'; bannedUntil?: Date; banReason?: string }

async login(dto: LoginDto): Promise<LoginResult> {
  // ... existující logika
  return {
    status: 'ok',
    accessToken,
    refreshToken,
    user,
  };
}
```

### `auth.controller.ts`

Žádná změna — controller jen předává return value. Klient si přečte `result.status`.

⚠️ **BC break:** klient, který dosud četl `result.accessToken` bez kontroly `status`, dál funguje (status='ok' znamená tokeny jsou tam). Není to runtime breaking change.

---

## 5. tsconfig.json transitional exclude

`backend/tsconfig.json` (přibližná lista, finalize v plan docu):

```jsonc
{
  "compilerOptions": { /* ... existing */ },
  "exclude": [
    // === SP1 (Mailer + SecurityTokens) ===
    "src/modules/auth/auth.service.spec.ts",
    // === SP2 (Auth email flows) ===
    // (žádné — auth.service.ts samotný projde po SP0 fixu Login status)
    // === SP3 (Users extensions) ===
    "src/modules/users/users.service.spec.ts",
    // === SP4 (Admin extensions) ===
    "src/modules/admin/admin.controller.ts",
    "src/modules/admin/admin.service.ts",
    "src/modules/admin/admin.service.spec.ts",
    "src/modules/users/services/account-cleanup.cron.spec.ts",
    // === SP5 (Friendships) ===
    "test/friendships.e2e-spec.ts",
    "test/game-events-upcoming-mine.e2e-spec.ts",
    // === Per-file blokace (chat.service.ts po fixu Pending → Zadatel projde) ===
    "src/modules/chat/chat.service.spec.ts",
    "src/modules/emotes/emotes.service.spec.ts",
    "src/modules/emotes/emotes.service.ts",
    "src/modules/game-events/game-event-reminder.job.ts",
    "src/modules/ikaros-messages/ikaros-messages.service.ts",
    "src/modules/pending-actions/pending-action-provider.interface.ts",
    "src/modules/pending-actions/pending-actions.controller.ts",
    "src/modules/pending-actions/pending-actions.service.ts",
    "src/modules/security-tokens/security-tokens.service.spec.ts"
  ]
}
```

⚠️ **Finalize v plan docu:** plan provede `npm run typecheck` po SP0 a vygeneruje minimální exclude listu (jen soubory, které opravdu padají).

---

## 6. Master dluh entry

Po SP0 přidat do `docs/dluhy.md` sekce "Otevřené":

```markdown
### [otevřeno 2026-05-14] BE fix-forward — SP1–SP6 (decomposition spec)

- **Soubor:** mnoho — viz [be-fix-forward-decomposition](superpowers/specs/2026-05-14-be-fix-forward-decomposition.md)
- **Typ:** build/CI + chybějící feature implementace
- **Riziko:** main na origin neprojde plným typecheck (transitional exclude v tsconfig.json). 6 sub-projektů zbývá k implementaci (Mailer, SecurityTokens, AuthService email flows, UsersService extensions, Admin extensions, Friendships, DataExport). Bez nich nelze deploy.
- **Co vyžaduje:** Postupné dokončení SP1–SP6, každý vlastní spec → plán → impl cyklus. Po každém SP zúžit `tsconfig.json` exclude listu. Vymaže se po SP6.
- **Zdroj:** Audit 2026-05-14 odhalil 116 TS errorů po pushi squash commitu 52ca60a3. SP0 vyřešil 9 User polí + drobné typy.
```

---

## 7. Testing

### Nové testy (SP0)

- `optional-jwt-auth.guard.spec.ts` — 3 případy
- Update `user.schema.spec.ts` (pokud existuje) o ověření nových polí — **nepovinné** (decorators nejsou logika)

### Regression

- `npm run typecheck` po SP0 + exclude listě → 0 errorů
- `npm run lint:check` — 0 errorů (linter nemá importy)
- Existující testy (které nejsou v exclude listě) musí dál passet

---

## 8. Anti-scope

**SP0 NEZAHRNUJE:**
- Mailer/SecurityTokens infrastrukturu (SP1)
- Auth email flows (SP2)
- AdminAuditLog, ban cache, hierarchy helper (SP4)
- Friendship moduly (SP5)
- Žádné migration scripty (nová pole jsou všechna optional)
- Žádné refaktory existujícího kódu (kromě 3 řádků `Pending` → `Zadatel`)

---

## Validation Criteria

Po SP0:
- [ ] `User` interface má 9 nových polí + `AdminPermissions` interface + `DEFAULT_ADMIN_PERMISSIONS` export
- [ ] `user.schema.ts` má 9 `@Prop()` decorátorů (+ adminPermissions subdocument)
- [ ] `chat.service.ts:92,577,615` používá `WorldRole.Zadatel` (3 occurrences)
- [ ] `common/guards/optional-jwt-auth.guard.ts` existuje + test
- [ ] `auth.service.ts` `login` returns `LoginResult` union s `status: 'ok'`
- [ ] `tsconfig.json` má exclude listu pro SP1–SP6 soubory
- [ ] `npm run typecheck` projde s 0 errory
- [ ] `npm run lint:check` projde s 0 errory
- [ ] `docs/dluhy.md` má master entry "BE fix-forward — SP1–SP6"
- [ ] Decomposition spec doc + SP0 design doc committed
- [ ] Main pushed na origin

---

## Schvalovací log

- 2026-05-14 — design napsán pro user review
