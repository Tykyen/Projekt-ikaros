# Technické dluhy

> Auto-aktualizuje harness agent (viz `.claude/rules/dluhy-log.md`).
> "Otevřené" = potřebují opravu nebo monitoring teď. "Čeká na trigger" = legitní budoucí práce, ne aktuální dluh. "Vyřešené" = auditní stopa.
> Komunikace s uživatelem před fixem zůstává — tento soubor je log, ne autonomní backlog.

---

## Otevřené

### [otevřeno 2026-05-14] account-cleanup.cron.spec.ts kontrakt mismatch

- **Soubor:** `backend/src/modules/users/services/account-cleanup.cron.spec.ts`
- **Typ:** test code quality + chybějící feature implementace
- **Riziko:** Test očekává úplně jiný API než my-impl SP4 stub: `removeExpiredTombstones`, `removeTombstoneOne`, `hardDeleteOne` metody + `User.deletedAt`, `User.chatColor` pole. Test je v `tsconfig.json` exclude, takže typecheck neproletí — proto disabled. Cron běží jako stub (1h tick, žádné akce).
- **Co vyžaduje:** SP4b plnohodnotná impl `AccountCleanupCron`:
  - 3 metody: `removeExpiredTombstones` (sweep), `removeTombstoneOne` (per-record), `hardDeleteOne` (PII nulling)
  - User entity: `deletedAt: Date` (oddělené od `deletionRequestedAt`), `chatColor: string`
  - Mail 24h předem (sendAccountDeletionScheduled)
  - Atomic batch retries
- **Zdroj:** Discovered po SP4 unblock tsconfig — pre-existing spec, který nikdy nevolal real cron. Cron impl byl `void` ve squash 52ca60a3.

---

## Čeká na trigger

Záznamy zde jsou legitní budoucí práce, ne aktuální technický dluh. Mají uvedený explicitní trigger — událost, která je převede do "Otevřené".

### Rate limit: Redis-backed throttler — TRIGGER: multi-instance deploy
- **Soubor:** `backend/src/app.module.ts` (ThrottlerModule.forRoot)
- **Trigger:** Migrace na 2+ replik backendu (Render/Railway scale-up, K8s deploy, nebo paralelní instance pro blue-green release).
- **Co dělá aktuální stav:** `@nestjs/throttler` používá in-memory storage. Pro single-instance deploy je to **správné rozhodnutí** — žádný Redis runtime overhead.
- **Co bude potřeba při triggeru:** Nainstalovat `@nestjs/throttler-storage-redis`, provisionovat sdílený Redis, override storage v ThrottlerModule. Bez sdíleného storage každá replika počítá vlastní bucket → reálné limity jsou N× vyšší než nakonfigurováno.
- **Zdroj:** Otevřený follow-up z `60a90c64` (rate limiting commit). Překlasifikováno 2026-05-06 z "Otevřené" — bez Redis runtime nelze opravit, single-instance deploy ho nepotřebuje.

---

## Vyřešené

_(prázdné — vyřešené záznamy vyčištěny 2026-05-14 na uživatelovu žádost. Auditní stopa zůstává v git historii: `git log -- docs/dluhy.md`.)_
