# Implementační spec — N-6b self-deletion + reaktivace (dotažení BE 1.3c)

> **Stav:** ✅ IMPLEMENTOVÁNO (2026-06-03). Vychází z `Projekt-ikaros-FE/docs/arch/phase-1/spec-1.3c.md`
> (kompletní design) + auditu reálného BE main. FE volání už existovala, BE self-část doplněna.
>
> **Odchylky od původního plánu (zdůvodněné):**
> - **Krok 6** — gate v `JwtAuthGuard.canActivate` (per-request, už injectoval `usersRepo` + dělal `updateLastSeen`), NE v `JwtStrategy` (stateless dekodér). Access token žije **7 dní** → login-only reject nestačí, gate musí být per-request. Přidán `@AllowPendingDeletion` decorator pro status/cancel routy (jinak by byl `DELETE me/deletion-request` nedosažitelný v pending stavu).
> - **Krok 7** — avatar soubory řeší `UploadService.@OnEvent('user.deletion.hardDeleted')` (event-driven), NE přímé volání v cronu → vyhne se DI cyklu cron→upload→chat. Spec 1.3c §4.4 ř.42/430 (avatarUrl=null + smazat soubor) má přednost před ř.31 (zachovat avatarUrl) — GDPR.
> - **D-041** (friendship cleanup) a **D-043** (tombstone retention) — explicitně OUT OF SCOPE dle spec 1.3c ř.901/903. Excluded spec test je testoval předčasně → přepsán na reálný scope.
> - **Q1-Q3** potvrzeno: anonymize dle spec, reaktivace přes endpoint, PJ handover revert = dluh (D-034b).

## 1. Cíl

Dotáhnout **self-delete + reaktivaci** v BE tak, aby FE volání (`useDeleteAccount`, `LoginModal`
reaktivace) reálně fungovala. Admin-delete + tombstone machinery **už v BE existuje** — využijeme
jako vzor, neimplementujeme znovu.

## 2. Audit BE main — co existuje vs. chybí

| Komponenta 1.3c | Stav | Pozn. |
|---|---|---|
| `User` pole `isDeleted/deletionRequestedAt/deletionReason/deletionRequestedBy` | ✅ existuje | 4 z 5 |
| `User.deletedAt` (hard-delete timestamp) | ❌ chybí | nutno doplnit |
| Admin delete (`requestUserDeletion`/`cancelUserDeletion` + PJ handover + token revoke) | ✅ existuje | **vzor pro self** |
| `users.service` self-delete (`requestSelfDeletion`/`getStatus`/`cancel`) | ❌ chybí | jádro práce |
| `users.controller` `POST/GET/DELETE me/deletion-request` | ❌ chybí | FE je volá (404) |
| `auth.service.login` → `deletion_pending` return path | ❌ chybí | login jen blokuje `isDeleted` |
| `auth.service.reactivateDeletion` + `POST auth/reactivate-deletion` | ❌ chybí | FE `LoginModal` čeká |
| `JwtStrategy` gate na `deletionRequestedAt` | ❓ ověřit | grep prázdný — možná chybí |
| `AccountCleanupCron` reálný hard-cleanup | ❌ stub (= **N-3**) | hard delete nefunguje |

## 3. Implementační kroky (pořadí dle závislostí)

1. **`User.deletedAt?: Date`** — interface + `user.schema.ts` `@Prop` + `users.repository.ts` toEntity mapper (field-drift checklist).
2. **`users.service` self-delete metody** (analogie `admin.service.requestUserDeletion`):
   - `requestSelfDeletion(userId, confirmUsername)` — ověř `confirmUsername === user.username`; PJ handover (`pj-handover.helper`, `SOLE_PJ_BLOCK` 400 pokud jediný PJ bez Pomocného); set `deletionRequestedAt/By/Reason`; revoke refresh tokens; emit `account.deletion.scheduled` (mail).
   - `getSelfDeletionStatus(userId)` → `{ deletionRequestedAt, scheduledHardDeleteAt } | null`.
   - `cancelSelfDeletion(userId)` — clear `deletionRequestedAt/By/Reason` (jen pokud pending && !isDeleted).
3. **`users.controller`** — `POST/GET/DELETE me/deletion-request` (JwtAuthGuard). POST body `{ confirmUsername }`, podpora `?dryRun=true` (PJ handover preview — FE ho volá).
4. **`auth.service.login`** — nový return path: pokud `deletionRequestedAt != null && !isDeleted` → `{ status: 'deletion_pending', deletionRequestedAt, scheduledHardDeleteAt }` (místo normálního loginu).
5. **`auth.service.reactivateDeletion(identifier, password)`** + `POST auth/reactivate-deletion` — ověř credentials; pokud pending && !isDeleted → clear flagy + normální login response + revert PJ handover (D-034b — viz §5).
6. **`JwtStrategy.validate`** — sjednocený gate: `isDeleted` → 401 DELETED, `deletionRequestedAt` → 401 DELETION_PENDING (pokud ještě není). Rozšířit `UserBanCacheService` o `isDeletionPending` (volitelné, perf).
7. **`AccountCleanupCron` (= N-3)** — reálný hard-cleanup: `findExpiredPendingDeletion` (deletionRequestedAt < now-30d, !isDeleted) → anonymize (passwordHash/email/bio/lastLoginAt = null, email→`deleted-<id>@deleted.local`), set `isDeleted:true` + `deletedAt:now`, zachovat username/displayName/avatarUrl/chatColor; emit event; **zapnout spec v tsconfig**.
8. **Testy** — service (požadavek/cancel/cooldown/SOLE_PJ_BLOCK), login deletion_pending path, reactivate, cron hard-cleanup; ověřit reálný `nest start` (cron DI).

## 4. Klíčová rozhodnutí (k potvrzení)

- **Q1 — cron hard-delete:** mazat opravdu (anonymize dle spec §4.4), nebo zatím jen log + flag bez anonymizace (bezpečnější první krok)? Spec říká anonymize. **Návrh: anonymize dle spec, ale s důkladnými testy.**
- **Q2 — reactivate přes login:** spec má reaktivaci přes `reactivate-deletion` endpoint (FE `LoginModal`), NE automaticky při loginu. **Návrh: dle spec — login vrátí `deletion_pending`, FE nabídne tlačítko → `reactivate-deletion`.**
- **Q3 — PJ handover revert při reaktivaci (D-034b):** spec to označuje jako dluh. **Návrh: v této iteraci NEřešit revert (dluh), jen clear deletion flagy; PJ handover zůstane (uživatel byl 30 dní „pryč").**

## 5. Rizika

- 🔴 **Ztráta dat** — cron hard-delete anonymizuje nevratně. Mitigace: 30denní hold, důkladné testy, cron jen `deletionRequestedAt < now-30d`.
- 🟠 **DI cyklus** — cron potřebuje refresh/friendships repo + UploadService (viz N-3). Ověřit `nest start`.
- 🟠 **Login flow** — chybný `deletion_pending` path by mohl zablokovat legitimní login. Testy.

## 6. Mimo rozsah (dle spec 1.3c §3.2)

Reset hesla během hold, tombstone integrace do chat/článků (fáze 3.x/6.x), tombstone retention policy, D-034b revert PJ handover.
