# Spec — PWA: obnova posledního místa při startu

> Side-task (tester-feedback 2026-06-24). PWA z plochy startuje vždy na úvodním
> dashboardu; přihlášený uživatel chce naskočit tam, kde naposledy skončil.

## Problém

`manifest.webmanifest` má `start_url: "/"` → otevření PWA z ikony **vždy** startuje
na `/` (úvodní Ikaros dashboard), i pro přihlášeného. PWA si — na rozdíl od
záložky v prohlížeči — poslední URL nepamatuje. Existující `loginIntent` je v
`sessionStorage` (zaniká s reopen appky), pro tohle se nehodí.

## Rozhodnutí (odsouhlaseno)

1. **Rozsah = PWA** (cold open z plochy). Řešeno přes `start_url`, takže běžný
   prohlížeč/přímé URL to neovlivní.
2. **Obnovuje se poslední ROUTE** (jakákoliv — svět, chat světa, stránka), ne jen
   poslední svět.

## Mechanismus

### a) Pamatování poslední route
- `localStorage` klíč `ikaros.lastRoute` (přežije reopen PWA; sessionStorage ne).
- Aktualizuje `router.subscribe(...)` při každé navigaci — uloží `pathname+search`.
- **Blacklist** (neukládá se): `/` (dashboard = default), auth-flow cesty
  (`reset-password`, `email-verify`, `email-change`, `?openLogin`), a cokoliv s
  `?restore=`. Jen bezpečné relativní cesty (`/`, ne `//`).

### b) Spuštění obnovy — detekce v JS (BEZ změny manifestu)
> **Revize 2026-06-24:** původně přes `start_url: "/?restore=1"`. Zahozeno —
> `manifest.start_url` čte OS/prohlížeč, jeho update je prodlený a na iOS
> nespolehlivý (drží starý manifest do přeinstalace). Detekce v JS se naopak
> nasadí spolehlivě s každou aktualizací appky (SW má `skipWaiting`, shell je
> network-first), i na existujících instalacích.

`applyStartupRestore()` (modul `shared/lib/lastRoute.ts`) voláno v `router.tsx`
**před** `createBrowserRouter`. Obnoví, jen když platí VŠE:
- `window.location.pathname === '/'` (cold open na rootu, ne deep refresh),
- **standalone PWA** — `matchMedia('(display-mode: standalone)')` nebo
  `navigator.standalone` (iOS) → ne běžný prohlížeč,
- **cold open** — `performance` navigation type `=== 'navigate'` (ne `'reload'`
  /`'back_forward'`) → refresh dashboardu neobnovuje,
- je token (`ikaros.jwt`),
- `lastRoute` existuje, bezpečná, ≠ `/`.

→ `window.history.replaceState(null,'', lastRoute)` → router se inicializuje rovnou
na cílovou route, **bez bliknutí dashboardu**. Jinak no-op.

**Rozlišení cold-open vs „domů":** klik „domů"/logo v appce je SPA navigace —
modul se nespustí znovu, `applyStartupRestore` neběží → zůstaneš na dashboardu.

### Pojistky / edge cases
- **Obnova jen pro přihlášeného** (gate na token). Nepřihlášený → normální `/`.
- lastRoute míří na svět **bez členství** → existující guard `memberOnly`
  (`redirectTo=/svet/:worldSlug`) odbaví (Vstoupit/Požádat). Smazaný svět →
  `WorldNotFound`. Žádná zvláštní logika netřeba.
- Token mezitím vypršel → cílová chráněná route spustí `requireAuth` → login modal
  s intentem. Přijatelné.
- `replace` (ne push) → tlačítko zpět nezacyklí na `?restore=1`.
- Logout vyčistí `ikaros.lastRoute` (ať cold open po odhlášení nevede na cizí/starou
  cestu) — gate na token to už pokrývá, čištění je navíc pro hygienu.

## Dotčené soubory (FE)
- `src/shared/lib/lastRoute.ts` — **NEW**: `saveLastRoute(path)` (+ blacklist),
  `clearLastRoute()`, `applyStartupRestore()` (standalone+cold-open detekce +
  replaceState). Vzor `isSafeRelativePath` z `loginIntent.ts`.
- `src/app/router.tsx` — `applyStartupRestore()` před `createBrowserRouter`;
  `router.subscribe(...)` ukládá `pathname+search` po něm.
- `src/features/auth/api/useAuth.ts` — `clearLastRoute()` v `useLogout`.

**Manifest se NEMĚNÍ** (`start_url` zůstává `/`). Žádná BE změna. Žádný nový balík.

## Hotovo když
- [ ] PWA cold open (z plochy) přihlášeného → naskočí poslední route, ne dashboard.
- [ ] Klik „domů"/logo v appce → čisté `/`, zůstane na dashboardu (žádná smyčka).
- [ ] Nepřihlášený cold open → `/` (žádný redirect na chráněnou cestu).
- [ ] Běžný prohlížeč / přímé URL beze změny chování.
- [ ] `tsc -b` ✓, dotčené testy ✓, `mobil-desktop` (PWA na mobilu) ✓.
