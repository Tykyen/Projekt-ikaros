# Friendly messaging policy

Pravidlo pro **tón všech hlášek**, hlavně odepření přístupu (403) a nenalezení (404).
Sjednoceno 2026-06-15.

## Princip

Uživatel nemá mít pocit **rozbité appky**, ale pocit, že **některé věci jsou schválně
zamčené a jen k nim nemá přístup**. Anchor (už existuje): zamčené AKJ záložky — „🔒 jméno +
úroveň". Ten klidný „zamčeno schválně" vibe roztahujeme na všechny hlášky.

## Hlas

- **Žádné** „Chyba / Error / Forbidden / Odepřeno / Nedostatečná oprávnění / Zakázáno".
- Rámuj jako **záměr**, ne zákaz: „je jen pro… / je vyhrazené… / je soukromé…", ne „nesmíš".
- **Druhá osoba**, vlídně, krátce.
- Kde dává smysl, **naznač cestu ven** („požádej o vstup", „poprosit PJ").
- **Status = bezpečnost, text = vlídnost.** Friendly text NEMĚNÍ HTTP status (viz
  [`auth-leak-policy.md`](auth-leak-policy.md)) — privátní svět dál vrací 404 (skrývá existenci),
  jen s vlídným textem.

## Vzorník

| Situace | ❌ ne | ✅ ano |
|---|---|---|
| Nečlen privátního světa (obsah) | „Forbidden" | „Tahle část světa je jen pro jeho členy." |
| Vstup do světa | „Forbidden" | „Do tohoto světa zatím nemáš přístup — můžeš požádat o vstup." |
| Role gate (jen PJ) | „Nedostatečná oprávnění" | „Tohle spravuje jen PJ světa." |
| Role gate (PomocnyPJ+) | „Nedostatečná oprávnění" | „Na tohle potřebuješ roli Pomocný PJ nebo vyšší." |
| Vlastník-only úprava | _(holé)_ | „Upravit to může jen autor nebo PJ." |
| Subdoc soukromý (403) | „Soukromé" | „Soukromé — vidí jen vlastník postavy a PJ." |
| Read-only systémový zdroj | „… read-only přes API" | „Systémové bestie se upravovat nedají — můžeš si udělat vlastní kopii." |
| AKJ záložka | _(už OK)_ | „🔒 [název] — vyžaduje [úroveň]" ← anchor |
| Svět nenalezen (404) | „Svět nenalezen" | „Tenhle svět tu není — možná byl smazaný, nebo k němu nemáš přístup." |
| Stránka nenalezena (404) | „Stránka nenalezena" | „Tahle stránka tu není — možná byla přesunutá nebo smazaná." |

## BE konvence

- Každý `throw new ForbiddenException(...)` / `UnauthorizedException` / `NotFoundException`
  nese `{ code, message }` s **vlídným českým textem**. Holý throw bez message = bug.
- `code` z [`common/errors/error-codes.generated.ts`](../../backend/src/common/errors/error-codes.generated.ts).
- **Text bez emoji/ikon** — ikonu (🔒) přidává FE. BE posílá čistou větu.
- Měň jen text/tvar hlášky, **nikdy status ani logiku** (status drží auth-leak-policy).

## FE konvence

- Zobraz **serverovou `message`** přes `parseApiError` — ne hardcoded ani generické „Chyba".
- 403 rámuj jako **„zamčeno schválně"** (klidné, zámek), ne červený error.
- 404 rámuj jako **„tu není"**, ne tvrdá chyba.
- **Žádné tiché selhání** — mutace musí mít `onError` (klidný toast se server hláškou).
- Výjimka: **auth flow** (login/registrace/reset) drží řízené hlášky kvůli anti-enumeraci —
  nezobrazovat tam syrový server text.

## Enforcement

- Nový access/error throw bez vlídné message je **bug** (jako auth-leak-policy „výjimky: žádné").
- Kandidát na automatickou kontrolu ve skillu `plny-audit` (sweep friendly hlášek).
