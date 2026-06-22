# Implementační plán — 15.9 Notifikační preference + rozšíření push triggerů

**Spec:** [spec-15.9](../../../../Projekt-ikaros-FE/docs/arch/phase-15/spec-15.9-notifikace-preferences.md) · **Stav:** čeká potvrzení plánu → pak kód
**Princip:** jeden zátah (feedback_no_debt), logicky členěno. BE blok → FE blok (nemíchat dávky). Po BE změnách nutný restart.

---

## Architektura (rozhodnuto)

- **Filtr v push vrstvě.** `PushService` injektuje `'IUsersRepository'` (@Global token, jednosměrná závislost push→users, bez cyklu). `notifyUsers`/`notifyAll` dostanou parametr `category`; před odesláním profiltrují příjemce podle `notificationPreferences`.
- **Defaulty = jediný resolver** (`resolvePref(prefs, key)` + tabulka). BE má kanonický; FE drží **kopii** (oddělená repa, jako theme IDs dual-source — [project_theme_ids_dual_source]). `undefined` pole → default.
- **Kategorie:** `worldChat`, `worldEvent`, `ownDiscussion`, `ownContent`, `worldNews`, `ikarosNews`, `hospoda` (+ master `pushEnabled`).

---

## BE blok

### BE-1 — Datový model + endpoint
- `users/interfaces/user.interface.ts` — `notificationPreferences?: {…}` (8 polí).
- `users/schemas/user.schema.ts` — `@Prop` mixed/nested.
- `users/dto/update-notification-preferences.dto.ts` — všechna pole optional boolean (`@IsOptional @IsBoolean`).
- `users/users.service.ts` — `updateNotificationPreferences(userId, partial)` **delta merge** (ne replace — [feedback_persist_across_variants]).
- `users/users.controller.ts` — `PATCH /users/me/notification-preferences` (JWT).
- `users/users.repository.ts` `toEntity` — mapovat `notificationPreferences` (field-checklist — [project_be_field_checklist]).
- sanitizovaný výřez `/users/me` (i auth `/me` pokud zrcadlí) — zahrnout preferences.
- `common/notifications/notification-preferences.defaults.ts` — tabulka defaultů + `resolvePref`.

### BE-2 — Push filtr (jádro)
- `push/push.service.ts` — injektovat `'IUsersRepository'`; `filterByCategory(userIds, category)`; `notifyUsers(userIds, payload, category?)` + `notifyAll(payload, category?)` filtrují. Bez kategorie = dnešní chování (zpětná kompatibilita).
- `users.repository` (volitelně) `findPreferencesByIds(ids)` batch (výkon `notifyAll`).
- `push.service.spec.ts` — mock `IUsersRepository`, testy filtru (propustí/zahodí/default).

### BE-3 — Zapojit kategorie do volajících
- `chat/chat.service.ts` → `worldChat` (existující notifyUsers).
- `global-chat/global-chat.service.ts` → Hospoda `hospoda` (rozcestí beze změny).
- `ikaros-news/ikaros-news.service.ts` → `ikarosNews`.
- `game-events/game-events.service.ts` `notifyOnCreate` → `worldEvent`.
- `world-news/world-news.service.ts` `create` → **nový push** `worldNews` (členové světa, vzor dle game-events recipients; Zadatel vyloučit dle konvence world).
- `ikaros-discussions/ikaros-discussions.service.ts` → **nový push** `ownDiscussion` autorovi (`creatorId`) při novém příspěvku ne-autora.
- `ikaros-articles/ikaros-articles.service.ts` → **nový push** `ownContent` autorovi (approve/reject/rating).
- `ikaros-gallery/ikaros-gallery.service.ts` → **nový push** `ownContent` autorovi (approve/reject/rating).

### BE-4 — 1h připomínka hry
- `game-events/interfaces/game-event.interface.ts` + `schemas/game-event.schema.ts` — `reminder24hSentAt?: Date`, `reminder1hSentAt?: Date` (nahradit `reminderSent`; migrace: starý `true` → `reminder24hSentAt`).
- repo — `markReminder24hSent` / `markReminder1hSent`; `findUpcoming(from,to)` reuse pro obě okna (+ gate na příslušný flag, nebo dva findery).
- `game-events/game-event-reminder.job.ts` — cron `EVERY_15_MINUTES`; dvě okna: 24h (23–25h, gate 24h flag) + 1h (0.75–1.25h, gate 1h flag); těla zpráv; obě přes `worldEvent`.
- `common/constants/time.constants.ts` — konstanty pro 1h okno (`MIN_45_MS`, `MIN_75_MS`).

**Ověření BE:** `npx jest --maxWorkers=2` (memory: plný paralelní flaky) — zasažené suites + nové. Lint:check + typecheck. **Restart BE** po nasazení.

---

## FE blok

### FE-1 — Typy + API + defaulty
- `src/types/...` — typ `NotificationPreferences`.
- `src/features/notifications/lib/notificationDefaults.ts` — FE kopie defaultů + `resolvePref`.
- `src/features/profile/api/useNotificationPreferences.ts` — GET (z `/users/me`), `PATCH` mutace + invalidace ([project_cache_invalidation_audit]).

### FE-2 — UI
- `src/features/profile/components/NotificationPreferencesSection.tsx` — master „Push notifikace" + 7 přepínačů ve 4 skupinách (Můj svět / Můj obsah / Novinky / Komunita); amatérsky srozumitelné popisky; reuse `PushToggle` (stav zařízení) + vysvětlení dvou vrstev.
- `src/features/profile/pages/ProfilePage.tsx` — zařadit sekci.

### FE-3 — Ověření
- skill `mobil-desktop` (responsive).
- `npm run build` (tsc -b — [project_fe_build_preexisting_errors]); vitest na sekci/hook (bez globals, fireEvent — [project_fe_test_precommit]).

---

## Dokumentace (po impl, před commit)
- skill `funkce` — notifikace, nové push triggery, profilová sekce, 1h připomínka.
- skill `napoveda` — hráčský výtah: kde a co si nastavím.

---

## Pořadí dodávky
BE-1 → BE-2 → BE-3 → BE-4 → (BE ověření) → FE-1 → FE-2 → FE-3 → (FE ověření) → docs. Git na uživateli ([feedback_git_manual]).
