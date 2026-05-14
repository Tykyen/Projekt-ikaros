# BE Fix-Forward — Decomposition Roadmap (SP0–SP6)

**Datum:** 2026-05-14
**Stav:** Schváleno k SP0
**Trigger:** Squash commit `52ca60a3` pushnul WIP code do origin/main, který `tsc --noEmit` failuje s **116 errory** ve 17 produkčních souborech.

---

## Cíl

Vrátit origin/main do stavu, kdy plný `npm run typecheck` projde čistě, bez ztráty WIP scope (kterou by způsobil `git revert`). Práce je rozdělena do 7 sub-projektů, každý s vlastním spec → plán → impl cyklem.

---

## Co konkrétně chybí (audit 2026-05-14)

### Chybějící soubory/moduly (21)

- `common/guards/optional-jwt-auth.guard` (1× použito ve worlds.controller)
- `modules/mailer/mailer.service` (auth.spec, admin.service.spec)
- `modules/security-tokens/security-tokens.service` + 2 interfaces
- `modules/users/helpers/pj-handover.helper`
- `modules/users/interfaces/username-change-request.interface`
- `modules/users/services/user-ban-cache.service`
- `modules/users/services/account-cleanup.cron`
- 7× `modules/admin/dto/*` (admin-delete-user, ban-user, bulk-ban, bulk-role-change, bulk-unban, reject-request, set-admin-permissions)
- `modules/admin/helpers/hierarchy`
- `modules/admin/interfaces/admin-audit-log.interface`

### Chybějící AuthService metody/konstanty (7)

- `forgotPassword`, `resetPasswordByToken`, `verifyEmail`, `resendEmailVerification`, `confirmEmailChange`
- `PASSWORD_RESET_TTL_MS`, `EMAIL_VERIFY_TTL_MS` statics

### Chybějící UsersService metody (3)

- `listPublic`, `publicProfileV14`, `requestEmailChange`

### Chybějící User entity pole (9)

- `isDeleted`, `bannedAt`, `bannedUntil`, `deletionRequestedAt`, `deletionReason`
- `adminPermissions: { canManageAdmins, canModerateContent, canEditPlatformPages }`
- `banReason`, `defaultAvatarType`, `usernameChangedAt`

### Drobné

- `WorldRole.Pending` referencováno z `chat.service.ts:92,577,615` (D-053 přejmenoval na `Zadatel`)
- `DEFAULT_ADMIN_PERMISSIONS` export z `user.interface`
- Login response chybí discriminator field `status: 'ok' | ...` (1.3c union response)
- 2 e2e testy v `test/` referují non-existent moduly (`friendships.e2e-spec.ts`, `game-events-upcoming-mine.e2e-spec.ts`)
- admin.controller volá service s nesprávným počtem argumentů (2× TS2554)

---

## Dekompozice

| SP  | Scope | Odhad | Závisí na | Spec |
|-----|-------|-------|-----------|------|
| **SP0** | Quick fixes (User entity rozšíření, enum aliases, OptionalJwtAuthGuard, login status, hook+tsconfig transitional config) | 1–2h | — | [sp0-quick-fixes](2026-05-14-sp0-quick-fixes-design.md) |
| **SP1** | Mailer + SecurityTokens infrastruktura | 1d | SP0 | TBD |
| **SP2** | AuthService email flows (forgot/reset/verify/resend/confirm-change) | 1–2d | SP1 | TBD |
| **SP3** | UsersService extensions (listPublic, publicProfileV14, requestEmailChange) | 0.5d | SP1 | TBD |
| **SP4** | Admin extensions (7 DTOs, audit log, ban cache, hierarchy helper, cleanup cron, PJ handover) | 2d | SP0 | TBD |
| **SP5** | Friendships (Spec 1.8) | 1–2d | SP3, SP0 | TBD |
| **SP6** | DataExport (GDPR) | 0.5–1d | SP0 | TBD |

**Total:** 7–10 dnů soustředěné práce.

---

## Strategie přechodného stavu

Mezi SP0 a SP6 origin/main **nebude full typecheck-clean**. Aby šel commitovat:

1. **`backend/tsconfig.json` exclude** broken souborů. Při dokončení každého SP se exclude lista zužuje.
2. **Pre-commit hook** zůstává původní (`npm run typecheck && npm run lint:check`) — díky exclude listě typecheck projde.
3. **`docs/dluhy.md`** drží jednu master entry "BE fix-forward — viz spec decomposition", která zmizí až po SP6.

### tsconfig.json exclude lista (post-SP0)

```jsonc
"exclude": [
  // SP1 — Mailer + SecurityTokens
  "src/modules/auth/auth.service.spec.ts",
  // SP4 — Admin extensions
  "src/modules/admin/admin.controller.ts",
  "src/modules/admin/admin.service.ts",
  "src/modules/admin/admin.service.spec.ts",
  // ... atd
  // SP5 — Friendships
  "test/friendships.e2e-spec.ts",
  // Atomic SP-specific (excludováno do dokončení daného SP)
  "test/game-events-upcoming-mine.e2e-spec.ts"
]
```

Konkrétní lista finalizována v SP0 implementačním plánu.

---

## Pravidla pro každé SP

1. **Spec doc** v `docs/superpowers/specs/YYYY-MM-DD-sp<N>-<topic>-design.md` (přes brainstorming skill).
2. **Plan doc** v `docs/superpowers/plans/YYYY-MM-DD-sp<N>-<topic>.md` (přes writing-plans skill).
3. **Implementace** přes test-driven-development skill (nové moduly mají testy).
4. **Verifikace** — po každém SP `npm run typecheck` musí mít **méně** errorů než předtím; SP6 finální = 0.
5. **tsconfig exclude lista** se zužuje s každým SP. Master entry v `docs/dluhy.md` se aktualizuje.

---

## Odpovědi na předvídatelné otázky

**Proč ne `git revert`?**
Force-push na origin/main destruuje 1 commit, který by museli ostatní rebase-out. Squash commit `52ca60a3` má 520 souborů reálné práce (Phase 1.3–2.4 cumulative). Revert by tu práci nezahodil ze stejné branch, ale zatěžkal by historii. Fix-forward zachovává obě výhody — práce zůstává, build se opraví postupně.

**Proč ne stub-only (NotImplementedException)?**
Stuby by skryly skutečný stav — testy by si myslely, že modul existuje, ale by failovaly za runtime. Honest fix-forward = každý SP přinese skutečnou implementaci, ne placeholder.

**Co když ne všechna SP1–SP6 stihneme?**
Master dluh entry v `docs/dluhy.md` (po SP0 zapsaná) trackuje rozpracovaný stav. Každý SP, který se nedokončí během kalendářního měsíce, eskaluje do "Otevřené" sekce s konkrétním důvodem blokace.

---

## Vztah k existujícím dokumentům

- [roadmap2.md](../../roadmap2.md) — auditovaná roadmapa BE (Fáze 0–6)
- [checklist-be.md](../../checklist-be.md) — checklist po krocích
- Specs phase 1 (krok-1.1, 1.2, 1.3) v `docs/superpowers/specs/` — předpoklady pro SP0–SP2

---

## Schvalovací log

- 2026-05-14 — Schváleno k provedení SP0 + zápisu dekompozice (user response k AskUserQuestion "SP0 teď + roadmap")
