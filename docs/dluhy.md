# Technické dluhy

> Auto-aktualizuje harness agent (viz `.claude/rules/dluhy-log.md`).
> "Otevřené" = potřebují opravu nebo monitoring teď. "Čeká na trigger" = legitní budoucí práce, ne aktuální dluh. "Vyřešené" = auditní stopa.
> Komunikace s uživatelem před fixem zůstává — tento soubor je log, ne autonomní backlog.

---

## Otevřené

### D-029 — Drd16 bestie panel (mapa+chat) ignoruje skin deníku (hardcoded barvy)
**Soubor:** `src/features/world/tactical-map/components/token-panel/system-panels/Drd16BestiePanel.module.css` + `chat/.../Drd16ChatBestiePanel.module.css` — bestie panel na taktické mapě a v chatu (DrD 1.6).
**Problém:** Oba moduly mají barvy/fonty natvrdo (žádné `--dd-*` tokeny). Skiny deníku drd16 (16.2c: horror, steampunk, scifi a další) reskinují přes override `--dd-*` na wrapperu `[data-diary-system='drd16'][data-diary-skin='X']`; hashované modulové třídy nelze cílit globálně, takže bestie panel zůstane VŽDY fantasy pergamen bez ohledu na zvolený skin. `Drd16CombatPanel.module.css` je naproti tomu tokenizovaný a reskinuje se správně → vizuální nekonzistence (bojový panel postavy nese skin, bestie panel ne). CONTRACT.md (`c:/tmp/drd16-skins/CONTRACT.md`) oba soubory explicitně označuje „TOKENIZOVAT z hardcoded".
**Dopad:** Střední — kosmetická nekonzistence, panel funguje; čím víc skinů přibude, tím viditelnější.
**Řešení:** Tokenizovat oba moduly na `var(--dd-*, <fallback>)` podle vzoru `Drd16CombatPanel.module.css` (~30 hardcoded barev, jeden zátah). Společný dluh pro všechny drd16 skiny.
**Kdy:** Při dokončování sady drd16 skinů (16.2c-drd16), nejpozději než se přidá další drd16 skin.

---

## Čeká na trigger

Záznamy zde jsou legitní budoucí práce, ne aktuální technický dluh. Mají uvedený explicitní trigger — událost, která je převede do "Otevřené".

_(žádné — D-028 Redis throttler vyřešen 2026-06-19 jako opt-in přepínač, viz Vyřešené níže)_

---

## Vyřešené

### [vyřešeno 2026-06-19] D-028 Rate limit: opt-in Redis-backed throttler (krok 14.6)
- **Soubory:** `backend/src/common/throttler/throttler.config.ts` (nový), `backend/src/app.module.ts` (`ThrottlerModule.forRootAsync`), `backend/.env.example` (`THROTTLER_REDIS`).
- **Řešení:** Storage je teď přepínatelný. Default (`THROTTLER_REDIS` != '1') = in-memory (single-instance, nulový overhead — beze změny). `THROTTLER_REDIS=1` + dostupný `REDIS_URL` → sdílený counter přes `@nest-lab/throttler-storage-redis` (v1.2.0, kompatibilní s `@nestjs/throttler` v6 + NestJS 11). Vzor = `SOCKET_IO_REDIS=1`.
- **Fallback:** Boot-time probe ověří Redis; když přepínač zapnutý ale Redis nedostupný / `REDIS_URL` chybí → varování + in-memory (throttling neshodí start).
- **Aktivace = ops:** kód existuje, env přepínač zapnout až při 2+ replikách BE. Limity (100/min + per-endpoint `@Throttle`) beze změny — mění se jen úložiště.
- **Ověřeno:** unit test `throttler.config.spec.ts` (4 větve), celý BE suite 2163/2163.

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
