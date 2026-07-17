# Bezpečnostní útočná sada (skill `pentest`, úroveň T1)

> Skill: [`.claude/skills/pentest/SKILL.md`](../../../Projekt-ikaros-FE/.claude/skills/pentest/SKILL.md)
> (ve FE repu) · spustíš `/pentest` nebo jako proof-vrstvu `+pentest` v `plny-audit`.

**Co to je.** Autentizované útočné testy proti VLASTNÍ platformě. Každý test = jeden reálně vypálený
útok, který má **selhat** (403/400/blok). Běží proti reálné aplikaci přes BE e2e harness
(`test/helpers/app-factory.ts` + `MongoMemoryReplSet`). Zelený test = díra zavřená a **trvale
hlídaná**; červený = díra otevřená.

## Konvence

| Kde | Co | Vzor |
|---|---|---|
| `src/**/**.<vektor>.spec.ts` | atomický pin čisté gate-logiky (unit, bez HTTP) | `world-export/world-export.ssrf.spec.ts` (PT-32) |
| `test/security/*.attack.e2e-spec.ts` | plný útok přes HTTP endpoint (registruj útočníka `helpers/auth.ts`, útoč jeho JWT) | _(v přípravě)_ |

- **ID nálezu:** `PT-<styl>` (styl = číslo auditního stylu, viz `plny-audit`). Např. `PT-32` = SSRF.
- **Útok „za" jiného uživatele:** registruj DRUHÉHO usera a útoč jeho tokenem — NEfabrikuj JWT.
- **Neopravená díra:** napiš útok jako `it.failing(...)` s odkazem na dluh (dokumentuje exploit,
  zčervená ve chvíli opravy → pak překlop na `it`). Nezařazuj do blokující CI brány, dokud je červený.
- **Spuštění:** `npx jest --maxWorkers=2 test/security/` (e2e serialita v `jest-e2e.json`) +
  co-located unit piny `npx jest --maxWorkers=2 src/**/*.<vektor>.spec.ts`.

## Roadmapa útoků (dle attack katalogu skillu)

| # | Útok | Styl | Stav | Pozn. |
|---|---|---|---|---|
| PT-32 | SSRF egress (export světa) | 32 | ✅ unit pin (17 case) | fix `c8c1b9e`; e2e přes `/export` endpoint = TODO |
| PT-2 | cross-world IDOR | 2 | TODO pin | RUN 07-05 fixnuto — dopsat pojistku |
| PT-35a | session freshness (demote → 403) | 35 | TODO pin | fix `c8c1b9e` (role z DB) — dopsat e2e |
| PT-35b | TOTP brute-force (bez lockoutu) | 35 | TODO `it.failing` | díra D-SEC-GAP |
| PT-35c | account enumeration | 35 | TODO `it.failing` | díra D-SEC-GAP |
| PT-46a | forge dice roll (`total:999`) | 46 | TODO `it.failing` | díra D-LAUNCH-GAP |
| PT-46b | HP out-of-bounds (`99999`/zápor) | 46 | TODO `it.failing` | díra D-LAUNCH-GAP; fix = server clamp |
| PT-22 | ReDoS/Mongo injection v search | 22 | TODO pin | SEC-28 fixnuto |
| PT-34 | anti-abuse creation-flood | 34 | TODO `it.failing` | díra — kumulativní cap chybí |
| ~~PT-39a~~ | ~~freemium bypass (`chatSkin`)~~ | 39 | ⚪ **NEPSAT** | **není díra** — prémiové motivy neexistují a nebudou (2026-07-17); viz attack-catalog. Freemium bypass zůstává relevantní u **PT-39b** (cap TOCTOU při `join`). |
| PT-40 | erasure PII zbytek | 40 | TODO `it.failing` | díra D-SEC-GAP |

Priorita psaní: nejdřív **piny opravených děr** (zelené, hlídají regresi), pak **`it.failing` neopravených**
(dokumentují + zčervenají při fixu). Fixy neopravených děr = GATED, návrh před opravou.
