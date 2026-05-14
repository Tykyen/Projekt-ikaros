# AKJ cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Odstranit mrtvé pole `User.akj: boolean` a admin endpoint `PATCH /admin/users/:id/akj`. AKJ je v novém systému per-world (`WorldMembership.akj: number`), globální flag a JWT claim ze starého systému ztratily smysl.

**Architecture:** Cleanup-only. Žádná nová funkčnost. Cíl je odstranit kód, který nic nedělá, a aktualizovat dokumentaci tak, aby přestala lhát. JWT payload se nemění.

**Tech Stack:** NestJS, TypeScript, Mongoose, Jest. Odkaz na spec: [docs/superpowers/specs/2026-05-05-akj-cleanup-design.md](../specs/2026-05-05-akj-cleanup-design.md).

---

## File Structure

**Soubory ke změně:**
- `backend/src/modules/users/interfaces/user.interface.ts` — odstranit `akj: boolean` z `User`
- `backend/src/modules/users/users.repository.ts` — odstranit mapování `akj` v `toEntity`
- `backend/src/modules/users/users.service.spec.ts` — odstranit reference na `akj` v mocku a assertech
- `backend/src/modules/admin/admin.controller.ts` — odstranit `UpdateAkjDto` a `@Patch('users/:id/akj')` handler
- `backend/src/modules/admin/admin.service.ts` — odstranit metodu `updateUserAkj`
- `backend/src/modules/admin/admin.service.spec.ts` — odstranit blok `describe('updateUserAkj')`
- `docs/roadmap.md` — Krok 1, 4, 15 — odstranit zmínky o `User.akj`/JWT akj claim
- `docs/roadmap2.md` — Fáze 1.1 přejmenovat na „AKJ cleanup", aktualizovat checklist

**Co se NEMĚNÍ (záměrně):**
- `backend/src/modules/users/schemas/user.schema.ts` — schema **nemá `@Prop akj`**, takže změna není potřeba (overené na řádcích 7-33)
- `backend/src/modules/worlds/**` — `WorldMembership.akj: number` zůstává, je to per-world model
- `backend/src/modules/auth/**` — JWT payload se nemění
- `backend/src/modules/pages/**` — pages access logika čte z membership, beze změny

---

## Task 1: Odstranění User.akj z interface

**Files:**
- Modify: `backend/src/modules/users/interfaces/user.interface.ts:27`

- [ ] **Step 1: Odstranit `akj: boolean` z User interface**

V `user.interface.ts` najít řádek 27 a smazat ho:

```ts
// PŘED (řádky 16-35):
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
  akj: boolean;                                       // <-- ODSTRANIT TENTO ŘÁDEK
  themeSettings: Record<string, unknown>;
  chatPreferences: Record<string, unknown>;
  favoriteDiscussionIds: string[];
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Ověřit, že TypeScript build hlásí chybové konzumenty**

Run: `cd backend && npx tsc --noEmit`
Expected: chyby v souborech, které čtou/píšou `user.akj` — `users.repository.ts`, `admin.service.ts`, `admin.controller.ts`, spec souborech. Tyto chyby řeší Task 2 a 3. **Nečinit commit dokud neprojde build.**

---

## Task 2: Odstranění mapování `akj` v MongoUsersRepository

**Files:**
- Modify: `backend/src/modules/users/users.repository.ts:81`

- [ ] **Step 1: Odstranit řádek `akj: ...` v toEntity**

V `users.repository.ts` najít metodu `toEntity` (řádky 70-90) a smazat řádek 81:

```ts
// PŘED:
  protected toEntity(doc: Record<string, unknown>): User {
    return {
      id: String(doc._id),
      email: doc.email as string,
      username: doc.username as string,
      passwordHash: doc.passwordHash as string,
      role: doc.role as UserRole,
      displayName: doc.displayName as string | undefined,
      avatarUrl: doc.avatarUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      ikarosSkin: doc.ikarosSkin as string | undefined,
      akj: (doc.akj as boolean) ?? false,           // <-- ODSTRANIT
      themeSettings: (doc.themeSettings as Record<string, unknown>) ?? {},
      ...
```

- [ ] **Step 2: Ověřit kompilaci tohoto souboru**

Run: `cd backend && npx tsc --noEmit`
Expected: chyba na `users.repository.ts:81` zmizí. Můžou zůstat chyby v admin/spec souborech (Task 3-4).

---

## Task 3: Odstranění admin `updateUserAkj` (service)

**Files:**
- Modify: `backend/src/modules/admin/admin.service.ts:35-38`

- [ ] **Step 1: Odstranit metodu `updateUserAkj`**

V `admin.service.ts` smazat řádky 35-38 (metodu) **včetně prázdného řádku před ní** (řádek 34):

```ts
// PŘED:
  async updateUserRole(userId: string, role: UserRole) {
    const user = await this.usersRepo.update(userId, { role });
    return user ? stripPassword(user) : null;
  }

  async updateUserAkj(userId: string, akj: boolean) {     // <-- ODSTRANIT CELOU METODU
    const user = await this.usersRepo.update(userId, { akj });
    return user ? stripPassword(user) : null;
  }

  async getRecentPages(requester: AdminUser, limit: number) {
```

```ts
// PO:
  async updateUserRole(userId: string, role: UserRole) {
    const user = await this.usersRepo.update(userId, { role });
    return user ? stripPassword(user) : null;
  }

  async getRecentPages(requester: AdminUser, limit: number) {
```

---

## Task 4: Odstranění admin AKJ endpointu a DTO (controller)

**Files:**
- Modify: `backend/src/modules/admin/admin.controller.ts:17-19, 56-63`

- [ ] **Step 1: Odstranit `UpdateAkjDto` třídu a nepoužitý import**

V `admin.controller.ts` smazat řádky 17-19 (DTO) a upravit import z class-validator:

```ts
// PŘED (řádky 12-19):
import { IsEnum, IsBoolean } from 'class-validator';

class UpdateRoleDto {
  @IsEnum(UserRole) role: UserRole;
}
class UpdateAkjDto {
  @IsBoolean() akj: boolean;
}
```

```ts
// PO:
import { IsEnum } from 'class-validator';

class UpdateRoleDto {
  @IsEnum(UserRole) role: UserRole;
}
```

- [ ] **Step 2: Odstranit `@Patch('users/:id/akj')` handler**

Smazat celý handler `updateUserAkj` (řádky 56-63):

```ts
// PŘED:
  @Patch('users/:id/role')
  ...
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminService.updateUserRole(id, dto.role);
  }

  @Patch('users/:id/akj')                              // <-- ODSTRANIT CELÝ BLOK
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Toggle AKJ flagu uživatele' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  updateUserAkj(@Param('id') id: string, @Body() dto: UpdateAkjDto) {
    return this.adminService.updateUserAkj(id, dto.akj);
  }

  @Get('recent-pages')
```

- [ ] **Step 3: Ověřit kompilaci**

Run: `cd backend && npx tsc --noEmit`
Expected: chyby v admin souborech zmizí. Mohou zůstat chyby ve spec souborech (Task 5-6).

---

## Task 5: Odstranění `updateUserAkj` testu (admin.service.spec)

**Files:**
- Modify: `backend/src/modules/admin/admin.service.spec.ts:52-59`

- [ ] **Step 1: Odstranit blok `describe('updateUserAkj')`**

Smazat řádky 52-59 v `admin.service.spec.ts`:

```ts
// PŘED:
  describe('updateUserRole', () => {
    it('aktualizuje roli uživatele', async () => {
      ...
    });
  });

  describe('updateUserAkj', () => {                      // <-- ODSTRANIT CELÝ BLOK
    it('aktualizuje AKJ flag', async () => {
      mockUsersRepo.update.mockResolvedValue({ id: 'u1', akj: true });
      const result = await service.updateUserAkj('u1', true);
      expect(mockUsersRepo.update).toHaveBeenCalledWith('u1', { akj: true });
      expect(result?.akj).toBe(true);
    });
  });

  describe('getRecentPages', () => {
```

- [ ] **Step 2: Spustit admin testy**

Run: `cd backend && npx jest src/modules/admin/admin.service.spec.ts`
Expected: PASS — všechny zbývající testy projdou (`getUsers`, `updateUserRole`, `getRecentPages`).

---

## Task 6: Odstranění reference na `akj` v users.service.spec

**Files:**
- Modify: `backend/src/modules/users/users.service.spec.ts:19, 54, 74`

- [ ] **Step 1: Odstranit `akj: false` z mock User**

V `users.service.spec.ts` najít řádek 19 (mock User definice) a odstranit `akj: false,`:

```ts
// PŘED (zhruba řádek 19):
  akj: false, themeSettings: { theme: 'light', fontSize: 14 }, chatPreferences: {},

// PO:
  themeSettings: { theme: 'light', fontSize: 14 }, chatPreferences: {},
```

- [ ] **Step 2: Odstranit asserce `akj` na řádku 54**

Najít řádek 54 a smazat ho celý:

```ts
// PŘED:
expect(result).toHaveProperty('akj', false);    // <-- ODSTRANIT TENTO ŘÁDEK
```

- [ ] **Step 3: Odstranit asserci `not.toHaveProperty('akj')` na řádku 74**

Najít řádek 74 a smazat ho celý (PublicUser už `akj` neobsahuje záměrně, není co testovat):

```ts
// PŘED:
expect(result).not.toHaveProperty('akj');       // <-- ODSTRANIT TENTO ŘÁDEK
```

- [ ] **Step 4: Spustit users service testy**

Run: `cd backend && npx jest src/modules/users/users.service.spec.ts`
Expected: PASS — všechny zbývající testy projdou.

---

## Task 7: Verification — full build + test suite

- [ ] **Step 1: TypeScript build**

Run: `cd backend && npx tsc --noEmit`
Expected: žádné chyby.

- [ ] **Step 2: Full test suite**

Run: `cd backend && npm test`
Expected: PASS — všechny testy procházejí. Pokud něco padá, je to neidentifikovaný consumer `User.akj` — řešit dle stack trace.

- [ ] **Step 3: Grep ověření, že akj v user-scope už nikde není**

Run: `cd backend && git grep -n "akj" src/modules/users src/modules/admin src/modules/auth`

Expected output: pouze případné nesouvisející výskyty (např. komentáře). Žádný výskyt `akj: boolean`, `user.akj`, `updateUserAkj`, `UpdateAkjDto`.

Pokud něco zůstalo, vrátit se na Task 1-6 a doplnit.

- [ ] **Step 4: Commit code changes**

```bash
git add backend/src/modules/users/interfaces/user.interface.ts \
        backend/src/modules/users/users.repository.ts \
        backend/src/modules/users/users.service.spec.ts \
        backend/src/modules/admin/admin.controller.ts \
        backend/src/modules/admin/admin.service.ts \
        backend/src/modules/admin/admin.service.spec.ts

git commit -m "$(cat <<'EOF'
refactor(users,admin): odstranění mrtvého User.akj pole

AKJ je per-world (WorldMembership.akj: number), nikoli per-user.
User.akj: boolean a admin toggle endpoint nikdy nic nedělaly —
pages access čte z membership, ne z user. Cleanup dle spec
docs/superpowers/specs/2026-05-05-akj-cleanup-design.md.

- User interface: odstraněno akj
- MongoUsersRepository.toEntity: odstraněn mapping
- AdminService.updateUserAkj: odstraněna metoda
- AdminController PATCH /admin/users/:id/akj: odstraněn endpoint
- UpdateAkjDto + IsBoolean import: odstraněny
- spec testy: odstraněny reference

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Aktualizace roadmap.md

**Files:**
- Modify: `docs/roadmap.md` — Krok 1, 4, 15

- [ ] **Step 1: Krok 1 — odstranit `akj` z JWT claims a aktualizovat audit poznámku**

Najít blok Krok 1 a upravit. Aktuální stav (po fázi 0+4):

```markdown
## Krok 1 — Základ & Auth 🚧

> AUDIT: chybí `akj` claim v JWT (grep v `auth/` = 0 matches) a endpoint `POST /api/auth/refresh` (řešeno ve fázi 1.1+1.3 v roadmap2).

- [x] Auth modul: POST /api/auth/login (bcrypt verify → JWT)
- [ ] **POST /api/auth/refresh** — chybí
- [ ] JWT claims: sub (userId), unique_name (username), role, characterPath, ikarosSkin, **akj** _(akj chybí)_
```

Změnit na:

```markdown
## Krok 1 — Základ & Auth 🚧

> AUDIT (po fázi 1.1): `akj` claim ze starého systému se nepřidává — AKJ je v novém systému per-world (rozhodnutí 2026-05-05, viz spec AKJ cleanup). Zbývá pouze `POST /api/auth/refresh` (řešeno ve fázi 1.3 v roadmap2).

- [x] Auth modul: POST /api/auth/login (bcrypt verify → JWT)
- [ ] **POST /api/auth/refresh** — chybí
- [x] JWT claims: sub (userId), email, username, role, characterPath, ikarosSkin _(akj záměrně NE — AKJ je per-world)_
```

- [ ] **Step 2: Krok 4 — odstranit AKJ flag řádek**

Najít blok Krok 4 a v seznamu úkolů odstranit řádek o AKJ flagu:

```markdown
- [x] **AKJ flag**: boolean na user schema; zahrnuto v JWT claims (`akj`)
```

A místo něj vložit:

```markdown
- [x] ~~**AKJ flag**~~ _(zrušeno 2026-05-05 — AKJ je per-world přes `WorldMembership.akj`, ne globální per-user)_
```

Také odstranit zmínku `akj` z řádku popisujícího User schema (pokud tam je `akj` v seznamu polí — najít řádek `passwordHash, profileImageUrl, groups, themeSettings, chatPreferences, akj, characterPath` a vyhodit z něj `akj`):

```markdown
- [x] User schema: passwordHash, profileImageUrl, groups, themeSettings, chatPreferences, characterPath
```

- [ ] **Step 3: Krok 15 — odstranit `PATCH /admin/users/:id/akj`**

Najít řádek v Kroku 15:

```markdown
- [x] PATCH /api/admin/users/:id/akj (toggle AKJ flagu)
```

Změnit na:

```markdown
- [x] ~~PATCH /api/admin/users/:id/akj~~ _(zrušeno 2026-05-05 — AKJ je per-world, viz cleanup spec)_
```

---

## Task 9: Aktualizace roadmap2.md

**Files:**
- Modify: `docs/roadmap2.md` — Fáze 1.1

- [ ] **Step 1: Přejmenovat Fázi 1.1 a přepsat checklist**

Najít blok začínající `### 1.1 JWT \`akj\` claim ⬜` a nahradit celý blok:

```markdown
### 1.1 JWT `akj` claim ⬜
- [ ] `auth.service.ts` — přidat `akj` do payloadu při generování tokenu
- [ ] `jwt.strategy.ts` — vrátit `akj` z `validate()`
- [ ] `CurrentUser` interface — přidat pole `akj: boolean`
- [ ] Spec: token obsahuje `akj` po loginu

**Riziko bez opravy:** porušení kontraktu se starým FE, AKJ flagu se nedá v requestech důvěřovat.
```

za:

```markdown
### 1.1 AKJ cleanup ✅
**Rozhodnuto 2026-05-05:** AKJ je v novém systému per-world (`WorldMembership.akj: number`), ne per-user. Globální `User.akj: boolean` byl mrtvé pole, admin toggle byl no-op. JWT `akj` claim ze starého systému se NEPŘIDÁVÁ (vědomá odchylka od JWT kontraktu starého systému).

- [x] `User.akj: boolean` odstraněn z interface a repository
- [x] `PATCH /admin/users/:id/akj` endpoint a `updateUserAkj` metoda odstraněny
- [x] Spec testy aktualizovány
- [x] roadmap.md krok 1, 4, 15 aktualizovány

Spec: [2026-05-05-akj-cleanup-design.md](../specs/2026-05-05-akj-cleanup-design.md)
Plán: [2026-05-05-akj-cleanup.md](2026-05-05-akj-cleanup.md)
```

- [ ] **Step 2: Aktualizovat tabulku „Pořadí prací"**

Najít řádek:

```markdown
| 1 | Fáze 1.1 — akj v JWT | kontrakt | 1 h |
```

a změnit na:

```markdown
| ✅ | Fáze 1.1 — AKJ cleanup | hotovo (2026-05-05) | — |
```

- [ ] **Step 3: Commit dokumentace**

```bash
git add docs/roadmap.md docs/roadmap2.md

git commit -m "$(cat <<'EOF'
docs(roadmap): AKJ cleanup — synchronizace s kódem

- roadmap.md krok 1: odstraněn akj z JWT claims, audit poznámka
- roadmap.md krok 4: zrušen AKJ flag řádek
- roadmap.md krok 15: zrušen PATCH /admin/users/:id/akj
- roadmap2.md fáze 1.1: přejmenována na "AKJ cleanup", označena ✅

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final verification

- [ ] **Step 1: Final grep — User.akj nikde neexistuje**

Run: `cd backend && git grep -n "user\.akj\b\|akj: boolean\|UpdateAkjDto\|updateUserAkj"`
Expected: 0 matches.

- [ ] **Step 2: Final grep — WorldMembership.akj zůstává netknutý**

Run: `cd backend && git grep -n "membership\.akj\|akj: number"`
Expected: výskyty v `worlds/*`, `pages/*`, `ikaros-messages/*` zůstávají (per-world model).

- [ ] **Step 3: Final test run**

Run: `cd backend && npm test`
Expected: PASS, žádný regrese.

- [ ] **Step 4: Sanity check git log**

Run: `git log --oneline -5`
Expected: dva nové commity — `refactor(users,admin): ...` a `docs(roadmap): ...`.

---

## Hotovo když

- [ ] `git grep "user\.akj\|akj: boolean"` v `backend/src` = 0 matches
- [ ] `git grep "akj: number"` v `backend/src/modules/worlds`, `pages`, `ikaros-messages` = nenulové (membership zůstává)
- [ ] `npm test` zelený
- [ ] `npx tsc --noEmit` čistý
- [ ] roadmap.md krok 1, 4, 15 aktualizovány
- [ ] roadmap2.md fáze 1.1 přejmenovaná na „AKJ cleanup ✅"
- [ ] 2 commity: `refactor(users,admin)` + `docs(roadmap)`
