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

### [vyřešeno 2026-05-31] FATE kostka v chatu: plus se zobrazuje jako mínus (10.2j / Task I4)

- **Root cause:** Systematickou rešerší NEnalezena žádná inverze plus↔mínus v kódu FE. Ověřeno: `FATE_TARGETS['+']` = `{0,0,0}` natáčí krychli na čelní (front) tvář, která má plus texturu (`facePlusImg`) — geometrie matematicky ověřena (rotace normál tváří: '+'→front/plus, '-'→back/minus, '0'→top). Naming všech 22 skinů konzistentní (`facePlusImg`→`_plus.webp`, `faceMinusImg`→`_minus.webp`), settled `<img>` cesta v chatu (`pickFaceImg`) i 3D overlay cesta mapují '+' na plus. Zdrojové assety (`fate_*_plus.webp`) vizuálně obsahují plus, Cloudinary upload manifest zachoval názvy 1:1. Jde o věrný port funkčního Matrix kódu.
- **Fix:** Žádná spekulativní záměna NEprovedena (prohození kterékoli ověřeně správné mapy by zavedlo reálnou regresi). Přidán regresní test `lib/fateMapping.spec.ts` zamykající korektní plus/mínus mapování (asset naming + protilehlost target rotací + symbolická↔numerická forma).
- **Pozn.:** Pokud se vizuál v prohlížeči stále jeví obráceně, příčina je MIMO zdrojový kód — buď obsah assetu na CDN (nelze ověřit ze sandboxu), nebo prohlížečové zploštění `preserve-3d` v overlay. Vyžaduje vizuální potvrzení v prohlížeči / na CDN.
- **Zdroj:** Nahlášeno uživatelem (screenshot) během brainstormingu 10.2j.
