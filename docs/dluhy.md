# Technické dluhy

> Auto-aktualizuje harness agent (viz `.claude/rules/dluhy-log.md`).
> "Otevřené" = potřebují opravu nebo monitoring teď. "Čeká na trigger" = legitní budoucí práce, ne aktuální dluh. "Vyřešené" = auditní stopa.
> Komunikace s uživatelem před fixem zůstává — tento soubor je log, ne autonomní backlog.

---

## Otevřené

_(žádné — account-cleanup cron vyřešen 2026-06-03, viz Vyřešené níže)_

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

### [vyřešeno 2026-06-03] account-cleanup.cron.spec.ts kontrakt mismatch (= N-3)

- **Soubor:** `backend/src/modules/users/services/account-cleanup.cron.ts` (+ spec)
- **Root cause:** Cron běžel jako `void` stub; excluded spec testoval předčasné D-041/D-043 API (`removeExpiredTombstones`/`hardDeleteOne` + friendship/tombstone cleanup), které nikdy nebylo doimplementováno.
- **Fix (v rámci N-6b self-deletion):** `sweep()` (denně 03:00 Prague) → `findExpiredPendingDeletion(now−30d)` → `anonymizeForHardDelete` (PII `$unset`) + emit `user.deletion.hardDeleted`. GDPR avatar soubory přes `UploadService.@OnEvent` (event-driven, žádný DI cyklus). `User.deletedAt` doplněn. Spec přepsán na reálný scope + zařazen zpět do tsc/jest.
- **Odloženo (nové triggery):** D-041 friendship cleanup (po 3.5), D-043 tombstone retention (samostatný spec), T-24h reminder mail.
- **Ověřeno:** BE 1879 testů, `nest start` DI graf OK.

### [vyřešeno 2026-05-31] FATE kostka: mínus na hozené 3D kostce vypadal jako plus (10.2j)

- **Root cause:** `DiceRollOverlay` renderoval Fate krychli **dekorativním 6-tváří vzorem** (front=+, back=−, right=+, left=−) a `getTargetForDie` ji natáčel na tvář s hozenou hodnotou: `+`→{0,0,0} (přední tvář), `−`→{0,180,0} (zadní tvář). Případ `+` (čelní pohled) fungoval, ale `−` (rotace 180° na zadní tvář) zobrazoval plus. **Assety na CDN ověřeny správné** (uživatel potvrdil `_plus.webp` = plus), readout glyfy v overlay (kreslené kódem) správné — chyba byla výhradně v zobrazení zadní tváře krychle při rotaci 180° (CSS 3D / backface chování, staticky nedohledáno).
- **Fix:** `renderModelFor` předává Fate kostce `faceValue` → **hozená hodnota je na PŘEDNÍ tváři** (ostatní '0'), a `getTargetForDie` pro Fate vrací **vždy {0,0,0}** (čelní usazení). Každá hodnota se tak renderuje jako fungující `+` případ; eliminována závislost na zobrazení zadní/boční tváře. Textury jsou RGB bez alpha + vnitřní coreColor jádro → žádný „průhledný tunel" u '0'. Platí pro chat i mapu (sdílený `DiceRollOverlay`). Regresní test `lib/fateMapping.spec.ts` z dřívější investigace zachován.
- **Zdroj:** Nahlášeno uživatelem (screenshot hozené kostky na mapě) — mínusy se objevovaly jako plusy.
