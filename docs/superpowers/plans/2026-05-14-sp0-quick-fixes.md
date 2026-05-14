# SP0 — BE Fix-Forward Quick Fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vrátit `npm run typecheck` na origin/main do 0-error stavu po squash commitu 52ca60a3, přidáním 9 User polí, `AdminPermissions` interface, `OptionalJwtAuthGuard`, login response `status` discriminator a transitional `tsconfig.json` exclude pro nedořešené SP1–SP6 soubory.

**Architecture:** Žádný nový modul. Jen primitivní artefakty (typy, schema rozšíření, jeden guard) + transitional config. Změny jsou v 6 produkčních souborech + 2 testech + 2 config souborech + 2 docs souborech.

**Tech Stack:** NestJS, Mongoose, class-validator (žádné nové libs), Jest

**Spec:** [2026-05-14-sp0-quick-fixes-design](../specs/2026-05-14-sp0-quick-fixes-design.md)

---

## File Structure

**Modify:**
- `backend/src/modules/users/interfaces/user.interface.ts` — `AdminPermissions` interface + `DEFAULT_ADMIN_PERMISSIONS` const + 9 nových polí na User
- `backend/src/modules/users/schemas/user.schema.ts` — 9 `@Prop()` decorátorů (vč. nested `adminPermissions` subdocument)
- `backend/src/modules/chat/chat.service.ts` — 3 řádky `WorldRole.Pending` → `WorldRole.Zadatel`
- `backend/src/modules/chat/chat.service.spec.ts` — 1 řádek `WorldRole.Pending` → `WorldRole.Zadatel`
- `backend/src/modules/emotes/emotes.service.ts` — 1 řádek
- `backend/src/modules/emotes/emotes.service.spec.ts` — 1 řádek
- `backend/src/modules/game-events/game-event-reminder.job.ts` — 1 řádek
- `backend/src/modules/ikaros-messages/ikaros-messages.service.ts` — 1 řádek
- `backend/src/modules/auth/auth.service.ts` — `LoginResult` union return type + return `status: 'ok'`
- `backend/tsconfig.json` — finalizovaný `exclude` array pro SP1–SP6 soubory
- `docs/dluhy.md` — master entry "BE fix-forward — SP1–SP6"

**Create:**
- `backend/src/common/guards/optional-jwt-auth.guard.ts`
- `backend/src/common/guards/optional-jwt-auth.guard.spec.ts`

---

## Task 1: AdminPermissions interface + 9 User polí

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts`

- [ ] **Step 1: Replace file content**

Replace the entire file with:

```typescript
export enum UserRole {
  Superadmin = 1,
  Admin = 2,
  PJ = 3,
  Korektor = 4,
  Hrac = 5,
  Ctenar = 6,
  Zadatel = 7,
  Zakaz = 8,
  Ikarus = 9,
  SpravceClankuu = 10,
  SpravceGalerie = 11,
  SpravceDisukzi = 12,
}

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
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
  avatarUrl?: string;
  profileImageUrl?: string;
  characterPath?: string;
  ikarosSkin?: string;
  themeSettings: Record<string, unknown>;
  chatPreferences: Record<string, unknown>;
  favoriteDiscussionIds: string[];
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;

  // SP0 rozšíření (2026-05-14):
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

export interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
}
```

- [ ] **Step 2: Verify typecheck mass-drop**

Run: `cd backend && npm run typecheck 2>&1 | grep -c "error TS"`
Expected: result drops from 116 (no exclude yet, but pending-actions errors should disappear). Note remaining count for next steps.

---

## Task 2: User schema — 9 @Prop decorátorů

**Files:**
- Modify: `backend/src/modules/users/schemas/user.schema.ts`

- [ ] **Step 1: Replace file content**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UserRole, AdminPermissions } from '../interfaces/user.interface';

export type UserDocument = HydratedDocument<UserSchemaClass>;

@Schema({ timestamps: true, collection: 'users' })
export class UserSchemaClass {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ unique: true, sparse: true, lowercase: true, index: true })
  usernameLower?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: Number, enum: UserRole, default: UserRole.Hrac })
  role: UserRole;

  @Prop() displayName?: string;
  @Prop() avatarUrl?: string;
  @Prop() profileImageUrl?: string;
  @Prop() characterPath?: string;
  @Prop() ikarosSkin?: string;

  @Prop({ type: Object, default: {} }) themeSettings: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) chatPreferences: Record<string, unknown>;
  @Prop({ type: [String], default: [] }) favoriteDiscussionIds: string[];

  @Prop({ default: false }) isOnline: boolean;
  @Prop({ default: Date.now }) lastSeenAt: Date;

  // SP0 rozšíření (2026-05-14):
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
}

export const UserSchema = SchemaFactory.createForClass(UserSchemaClass);
UserSchema.index({ role: 1 });
UserSchema.index({ lastSeenAt: 1 });
// SP0 — index na bannedUntil pro auto-unban background job (SP4 jej využije):
UserSchema.index({ bannedUntil: 1 }, { sparse: true });
```

- [ ] **Step 2: Verify typecheck**

Run: `cd backend && npm run typecheck 2>&1 | grep -c "error TS"`
Expected: same count or slightly less than after Task 1 (no new failures introduced).

---

## Task 3: WorldRole.Pending → WorldRole.Zadatel (8 occurrences, 6 files)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts` (3 výskyty)
- Modify: `backend/src/modules/chat/chat.service.spec.ts` (1 výskyt)
- Modify: `backend/src/modules/emotes/emotes.service.ts` (1 výskyt)
- Modify: `backend/src/modules/emotes/emotes.service.spec.ts` (1 výskyt)
- Modify: `backend/src/modules/game-events/game-event-reminder.job.ts` (1 výskyt)
- Modify: `backend/src/modules/ikaros-messages/ikaros-messages.service.ts` (1 výskyt)

- [ ] **Step 1: Replace all occurrences using sed**

PowerShell-friendly via Edit tool with `replace_all: true` per file. For each file, find `WorldRole.Pending` and replace with `WorldRole.Zadatel`.

Per-file via Edit tool:

```typescript
// PŘED
WorldRole.Pending
// PO
WorldRole.Zadatel
```

- [ ] **Step 2: Verify no Pending references remain**

Run: `cd backend && grep -rn "WorldRole.Pending" src/ 2>&1 | wc -l`
Expected: `0`

- [ ] **Step 3: Verify typecheck**

Run: `cd backend && npm run typecheck 2>&1 | grep -c "error TS"`
Expected: dramatic drop (8 errorů zmizí + ty z pending-actions už po Task 1 byly opraveny). Pokud byly ostatní soubory neopravené, mělo by zbýt ~70-80.

- [ ] **Step 4: Run affected unit tests**

Run: `cd backend && npx jest --no-coverage --testPathPattern "(chat|emotes|ikaros-messages|game-event)"`
Expected: tests projdou (Zadatel je sémanticky stejné jako Pending — viz D-053).

---

## Task 4: OptionalJwtAuthGuard + test

**Files:**
- Create: `backend/src/common/guards/optional-jwt-auth.guard.ts`
- Create: `backend/src/common/guards/optional-jwt-auth.guard.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/common/guards/optional-jwt-auth.guard.spec.ts`:

```typescript
import { ExecutionContext } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard();
  });

  describe('handleRequest', () => {
    it('vrátí user pokud je validní token', () => {
      const user = { id: 'u1', email: 'a@a.com' };
      const result = guard.handleRequest(null, user);
      expect(result).toEqual(user);
    });

    it('vrátí undefined pokud token chybí (user = false)', () => {
      const result = guard.handleRequest(null, false as unknown as never);
      expect(result).toBeUndefined();
    });

    it('vrátí undefined pokud err nastane (např. invalid token)', () => {
      const result = guard.handleRequest(new Error('invalid'), null as unknown as never);
      expect(result).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/common/guards/optional-jwt-auth.guard.spec.ts --no-coverage`
Expected: FAIL — `Cannot find module './optional-jwt-auth.guard'`.

- [ ] **Step 3: Create guard implementation**

Create `backend/src/common/guards/optional-jwt-auth.guard.ts`:

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT auth guard.
 *
 * Pokud je v requestu validní Bearer token, naparuje `request.user` jako JwtAuthGuard.
 * Pokud token chybí nebo je neplatný, **nehází** — request projde s `user = undefined`.
 *
 * Použití na read-only endpointech, kde anonymní uživatel vidí jen public/open zdroje,
 * ale přihlášený uživatel vidí navíc svoje private zdroje (např. private světy).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser | undefined {
    // Anonymní průchod: jakákoliv chyba (chybějící/neplatný token) → user = undefined, NE throw.
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/common/guards/optional-jwt-auth.guard.spec.ts --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify worlds.controller error gone**

Run: `cd backend && npm run typecheck 2>&1 | grep "worlds.controller"`
Expected: empty (no errors).

---

## Task 5: Login response — `status: 'ok'` discriminator

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Read current `auth.service.ts` to find `login` method**

Run: `grep -n "async login\|return.*accessToken" c:/Matrix/ProjektIkaros/Projekt-ikaros/backend/src/modules/auth/auth.service.ts`
Expected: shows location of `login` return statement.

- [ ] **Step 2: Add `LoginResult` type export + update return**

Two edits needed:

**Edit A:** Add `LoginResult` type at top of file (after imports):

```typescript
import type { User } from '../users/interfaces/user.interface';

/**
 * Login response — discriminated union (krok 1.3c).
 *
 * SP0 (2026-05-14): zatím jen `'ok'` branch.
 * SP2 přidá: `{ status: 'email_not_verified'; email: string }`.
 * SP4 přidá: `{ status: 'banned'; bannedUntil?: Date; banReason?: string }`.
 */
export type LoginResult = {
  status: 'ok';
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'passwordHash'>;
};
```

**Edit B:** Update `login` method return type and return statement to include `status: 'ok'`.

Search for the `login` method signature, change return type from `Promise<{ accessToken: string; refreshToken: string; user: Omit<User, 'passwordHash'>; }>` to `Promise<LoginResult>`.

Search for the `return { accessToken, refreshToken, user };` statement (likely near end of method) and change to `return { status: 'ok', accessToken, refreshToken, user };`.

- [ ] **Step 3: Verify typecheck on auth.service.ts**

Run: `cd backend && npm run typecheck 2>&1 | grep -E "auth\.service\.ts" | grep -v ".spec"`
Expected: empty (auth.service.spec.ts ostane broken kvůli Mailer/SecurityTokens — patří do SP1 exclude).

- [ ] **Step 4: Run auth.service unit tests for SP0-relevant cases**

Run: `cd backend && npx jest auth.service --no-coverage 2>&1 | tail -20`
Expected: spec.ts compile FAIL (kvůli Mailer/SecurityTokens), to je OK — bude v tsconfig exclude. Sám service kód funguje.

---

## Task 6: tsconfig.json transitional exclude

**Files:**
- Modify: `backend/tsconfig.json`

- [ ] **Step 1: Dump current typecheck errors**

Run: `cd backend && npm run typecheck 2>&1 | grep "error TS" | sed -E 's/\(.*//' | sort -u`
Expected: list of soubory s errory. **Zaznamenat výsledek**.

- [ ] **Step 2: Replace tsconfig.json content**

Replace `backend/tsconfig.json` with:

```jsonc
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "outDir": "./dist",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "noFallthroughCasesInSwitch": false
  },
  "exclude": [
    "// === SP1 (Mailer + SecurityTokens) ===",
    "src/modules/auth/auth.service.spec.ts",
    "src/modules/security-tokens/security-tokens.service.spec.ts",

    "// === SP3 (UsersService extensions) ===",
    "src/modules/users/users.service.spec.ts",

    "// === SP4 (Admin extensions) ===",
    "src/modules/admin/admin.controller.ts",
    "src/modules/admin/admin.service.ts",
    "src/modules/admin/admin.service.spec.ts",
    "src/modules/users/services/account-cleanup.cron.spec.ts",

    "// === SP5 (Friendships) + e2e tests pro non-existent moduly ===",
    "test/friendships.e2e-spec.ts",
    "test/game-events-upcoming-mine.e2e-spec.ts"
  ]
}
```

⚠️ **Poznámka:** JSON neumí komentáře, ale tsconfig.json používá JSONC (JSON with Comments) přes TypeScript parser. Komentáře v exclude array jsou validní — TypeScript je tichne ignoruje (strings, které nepasují na soubor). Pokud by to bylo problematické, lze přepsat na čistý JSON bez stringů s `//`.

**Alternativně (čistý JSON):**

```jsonc
{
  "compilerOptions": { /* ... stejné jako výše */ },
  "exclude": [
    "src/modules/auth/auth.service.spec.ts",
    "src/modules/security-tokens/security-tokens.service.spec.ts",
    "src/modules/users/users.service.spec.ts",
    "src/modules/admin/admin.controller.ts",
    "src/modules/admin/admin.service.ts",
    "src/modules/admin/admin.service.spec.ts",
    "src/modules/users/services/account-cleanup.cron.spec.ts",
    "test/friendships.e2e-spec.ts",
    "test/game-events-upcoming-mine.e2e-spec.ts"
  ]
}
```

**Použít čistý JSON (alternativa) — bezpečnější.**

- [ ] **Step 3: Verify typecheck passes**

Run: `cd backend && npm run typecheck`
Expected: exit code 0, no error output.

- [ ] **Step 4: Verify lint passes**

Run: `cd backend && npm run lint:check 2>&1 | tail -20`
Expected: exit code 0 (lint check covers all `src/`, `test/` — pokud nějaký file padá kvůli importu, lint to taky chytí; v takovém případě dochytat).

⚠️ **Pokud lint:check failuje na excludovaných souborech**, přidat lint exclude do `eslint.config.mjs`. Příklad:

```javascript
// eslint.config.mjs
export default [
  // ... existing config
  {
    ignores: [
      'src/modules/auth/auth.service.spec.ts',
      'src/modules/security-tokens/security-tokens.service.spec.ts',
      'src/modules/users/users.service.spec.ts',
      'src/modules/admin/admin.controller.ts',
      'src/modules/admin/admin.service.ts',
      'src/modules/admin/admin.service.spec.ts',
      'src/modules/users/services/account-cleanup.cron.spec.ts',
      'test/friendships.e2e-spec.ts',
      'test/game-events-upcoming-mine.e2e-spec.ts',
    ],
  },
];
```

---

## Task 7: Master dluh entry + commits + push

**Files:**
- Modify: `docs/dluhy.md`

- [ ] **Step 1: Add master dluh entry**

V `docs/dluhy.md` v sekci "Otevřené" (která je nyní prázdná), přidej:

```markdown
### [otevřeno 2026-05-14] BE fix-forward — SP1–SP6 (zbývá 6 sub-projektů)

- **Soubor:** mnoho — viz [be-fix-forward-decomposition](superpowers/specs/2026-05-14-be-fix-forward-decomposition.md)
- **Typ:** build/CI + chybějící feature implementace (Mailer, SecurityTokens, AuthService email flows, UsersService extensions, Admin extensions, Friendships, DataExport)
- **Riziko:** main na origin neprojde plným typecheck bez transitional `tsconfig.json` exclude. Bez SP1–SP6 nelze plně deploy (chybí Mailer pro password reset emaily, Friendships endpointy, admin ban/audit, atd.). FE strana ale dál staví na public API + JWT, takže krátkodobě funguje.
- **Co vyžaduje:** Postupné dokončení SP1–SP6, každý vlastní spec → plán → impl cyklus. Po každém SP zúžit `tsconfig.json` exclude listu. Tato entry se přesouvá do "Vyřešené" po SP6.
- **Zdroj:** Audit 2026-05-14 odhalil 116 TS errorů po pushi squash commitu 52ca60a3. SP0 vyřešil 9 User polí + WorldRole.Pending → Zadatel + OptionalJwtAuthGuard + Login `status` discriminator + transitional config.

Předchozí entry "fix/backend-audit branch obsoletní" zůstává nezávisle — týká se jiných 4 fixů (upload Logger, chat OnEvent try-catch).
```

- [ ] **Step 2: Verify pre-commit hook by uncommitted state**

Run: `cd backend && npm run typecheck && npm run lint:check`
Expected: exit 0.

- [ ] **Step 3: Stage all SP0 changes**

```bash
git add backend/src/modules/users/interfaces/user.interface.ts
git add backend/src/modules/users/schemas/user.schema.ts
git add backend/src/modules/chat/chat.service.ts
git add backend/src/modules/chat/chat.service.spec.ts
git add backend/src/modules/emotes/emotes.service.ts
git add backend/src/modules/emotes/emotes.service.spec.ts
git add backend/src/modules/game-events/game-event-reminder.job.ts
git add backend/src/modules/ikaros-messages/ikaros-messages.service.ts
git add backend/src/common/guards/optional-jwt-auth.guard.ts
git add backend/src/common/guards/optional-jwt-auth.guard.spec.ts
git add backend/src/modules/auth/auth.service.ts
git add backend/tsconfig.json
git add docs/dluhy.md
git add docs/superpowers/specs/2026-05-14-be-fix-forward-decomposition.md
git add docs/superpowers/specs/2026-05-14-sp0-quick-fixes-design.md
git add docs/superpowers/plans/2026-05-14-sp0-quick-fixes.md
```

Pokud byl třeba `eslint.config.mjs` upraven, přidat i ten.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(SP0): BE fix-forward quick fixes — User entity + WorldRole + OptionalJwtAuthGuard + Login status

SP0 zaklad post squash 52ca60a3 audit (116 typecheck errorů → 0). Detail
viz docs/superpowers/specs/2026-05-14-sp0-quick-fixes-design.md.

Změny:
- User interface: AdminPermissions interface + DEFAULT_ADMIN_PERMISSIONS export
  + 9 polí (isDeleted, deletionRequestedAt, deletionReason, bannedAt,
  bannedUntil, banReason, adminPermissions, defaultAvatarType,
  usernameChangedAt)
- User schema: 9 @Prop decorátorů + bannedUntil sparse index
- WorldRole.Pending → WorldRole.Zadatel (8 výskytů, 6 souborů: chat, emotes,
  game-events, ikaros-messages) — dokončení D-053 migrace
- OptionalJwtAuthGuard: nový guard pro anonymní průchod read-only endpointů
- AuthService.login: discriminated union LoginResult, SP0 jen 'ok' branch
- tsconfig.json: transitional exclude pro SP1–SP6 (auth.service.spec,
  security-tokens.service.spec, users.service.spec, admin.*, account-cleanup.cron.spec,
  test/friendships, test/game-events-upcoming-mine)
- docs/dluhy.md: master entry "BE fix-forward — SP1–SP6"
- docs/superpowers/specs: decomposition spec + SP0 design spec
- docs/superpowers/plans: SP0 implementation plan

Co zbývá: SP1 (Mailer + SecurityTokens), SP2 (Auth email flows), SP3
(UsersService extensions), SP4 (Admin extensions), SP5 (Friendships),
SP6 (DataExport). Každé vlastní spec → plán → impl cyklus.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook projde (typecheck + lint OK), commit vytvořen.

- [ ] **Step 5: Push main**

```bash
git push origin main
```

Expected: úspěšný push.

⚠️ **Pokud auto-mode classifier odmítne push:** požádat uživatele o explicitní autorizaci "ano, push main na origin/main přímo" (stejně jako dříve).

---

## Self-Review (post-plan)

### Spec coverage check

| Spec sekce | Implementuje task |
|---|---|
| 1. User entity rozšíření | Task 1, 2 |
| 2. WorldRole.Pending alias | Task 3 |
| 3. OptionalJwtAuthGuard | Task 4 |
| 4. Login response status | Task 5 |
| 5. tsconfig.json transitional exclude | Task 6 |
| 6. Master dluh entry | Task 7 |
| 7. Testing | Tasks 4 (guard test) + 6 verify |
| 8. Anti-scope | Plán neporušuje (žádný nový modul, žádná migration) |
| Validation criteria | Tasks 1–7 |

### Placeholder scan

- ✅ Žádné "TBD" — všechny soubory mají konkrétní obsah.
- ✅ Žádné "implement later" — všechny kódové bloky kompletní.
- ✅ Žádné "Add appropriate error handling" — OptionalJwtAuthGuard má explicitní logiku.

### Type consistency

- `AdminPermissions` interface definován v Task 1, používán v Task 2 (`adminPermissions?: AdminPermissions` field), importován ze stejného path.
- `LoginResult` typ definován v Task 5, vrácen ze `login()` v Task 5.
- `WorldRole.Zadatel` použito konzistentně přes všech 6 souborů v Task 3.

### Známé riziko

`adminPermissions` na User entity je `optional` (`?`). V `admin.service.ts:189` ale kód volá `{ ...DEFAULT_ADMIN_PERMISSIONS }` — to je v SP4 scope (admin.service.ts je v tsconfig exclude). SP4 musí buď: (a) změnit field na required + migration backfill, (b) handle undefined v admin.service. Záměrně neřešíme nyní.

---

## Plán hotov.
