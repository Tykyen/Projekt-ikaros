# Spec — Objevitelnost chatu světa

> Side-task (tester-feedback 2026-06-24). Dva testeři přehlédli chat — je málo
> výrazný a v navigaci úplně chybí.

## Problém

- `buildWorldNav` **neobsahuje chat vůbec** → z jiných stránek světa se k němu z
  navigace nedostaneš (jen přímá URL).
- Na dashboardu je chat jen `DashTile` bez `value` (na rozdíl od „Hráči 21") →
  pravá strana prázdná, dlaždice splývá z trojice HRÁČI/CHAT/OBLÍBENÉ.

## Rozhodnutí (odsouhlaseno: obojí)

1. **Chat jako první top-level položka v top nav** (před Informace) — zvýrazněná
   accent pill + unread badge. Řeší objevitelnost **na všech stránkách světa**.
2. **Zvýraznit dashboard dlaždici** — accent fill/obrys/glow + CTA „Otevřít ›"
   (naplní prázdné místo po chybějícím čísle).

Vše přes **accent tokeny** (`--accent-soft/dim/bright`) → funguje na všech 33
skinech (zelený svět = zelený chat). Žádná barva natvrdo.

## Mechanismus

### Nav položka — komponenta `ChatNavLink`
Chat **není** v `buildWorldNav` (badge je dynamický `useWorldChatUnread`, hook
nelze volat podmíněně v `NavDropdown`). Místo toho samostatná komponenta
`features/world/chat/components/ChatNavLink`:
- `NavLink` na `/svet/:slug/chat`, accent pill (`--accent-soft` bg, `--accent-dim`
  border, `--accent-bright` text), ikona `MessageSquare`, label „Chat".
- unread badge (jen `>0`), jemný **pulz** (vypnutý při `prefers-reduced-motion`).
- 2 varianty: `bar` (desktop header, první v řadě) a `drawer` (mobilní menu).

Renderuje se v `WorldLayout` uvnitř `showFullNav` (jen členové) — v headeru před
`<nav>` a v draweru nahoře.

### Dashboard dlaždice — `DashTile` rozšíření
- nové props `accent?: boolean` a `cta?: string`.
- chat tile: `accent` (gradient `--accent-soft`→`--surface-2`, accent obrys, glow)
  + `cta="Otevřít"` (accent text místo chybějícího čísla).
- „Hráči" beze změny.

## Dotčené soubory (FE)
- `features/world/chat/components/ChatNavLink/` — **NEW** (tsx + module.css).
- `app/layout/WorldLayout/WorldLayout.tsx` — render `ChatNavLink` (header + drawer).
- `features/world/.../DashTile.tsx` + `.module.css` — `accent`/`cta` props + styly.
- `features/world/.../WorldDashboard.tsx` — chat tile `accent cta="Otevřít"`.

Žádná BE změna. Žádný nový balík (lucide, clsx už jsou).

## Hotovo když
- [ ] Chat je první v top nav (desktop) i v draweru (mobil), accent + unread badge.
- [ ] Dashboard chat dlaždice vizuálně vyčnívá (accent + CTA), neprázdná.
- [ ] Funguje na víc skinech (accent tokeny), mobil i desktop.
- [ ] `tsc -b` ✓, dotčené testy ✓, `mobil-desktop` ✓.
