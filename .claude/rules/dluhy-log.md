# Tech debt log — pravidla

Single source of truth pro technické dluhy: `docs/dluhy.md`.

## Kdy zapsat (povinné, okamžité)

Zapiš **ihned** když narazíš na cokoli z následujícího a **neopravíš to v rámci aktuální tasky**:

- chyba v kódu (bug, race condition, security smell, broken test/build)
- pre-existing dluh (kód, co někdo nedodělal nebo opomněl)
- nesrovnalost se specem / pravidlem / kontraktem starého systému
- riziko, které může v budoucnu způsobit problém (missing validation, stylistic debt, který bobtná, deprecated API, …)
- TODO/FIXME komentáře, na které narazíš a nejsou v současné tasce
- "tichý dluh" — kód běží, ale build selhává (TS errory, lint errory mimo `--fix` schopnost)

**Bez výjimky.** Nikdy nech kontext k vyřešení zmizet jen proto, že "to není moje task". Komunikuj userovi (per `base.md`) **i** zapiš do `dluhy.md` — obojí.

## Formát záznamu

Otevřený dluh:

```markdown
### [otevřeno YYYY-MM-DD] Krátký popis (max 80 znaků)
- **Soubor:** `cesta/k/souboru.ts:řádek` (nebo `mnoho` pokud sweep)
- **Typ:** bug | code quality | security | UX | data konzistence | build/CI | …
- **Riziko:** co může nastat, jak to bobtná
- **Co vyžaduje:** krátký popis fixu (migration plán, separátní spec, atd.)
- **Zdroj:** kdo/co flagoval — odkaz na konverzaci/PR/audit pokud existuje
```

## Když opravíš

Přesuň záznam ze sekce "Otevřené" do sekce "Vyřešené" s:

```markdown
### YYYY-MM-DD — Krátký popis
- **Commit:** `<8-znaků SHA>`
- **Soubor:** `cesta/k/souboru.ts` (nebo seznam)
- **Co bylo:** 1-2 řádky popisu problému
- **Fix:** 1-2 řádky popisu opravy
- **Prevence (volitelné):** odkaz na hook/test/CI který zamezí návratu
```

## Kdy NE zapsat

- Ephemeral věci vyřešené v aktuální tasce — když se to opraví v rámci téhož commitu, nepotřebuje záznam.
- Designové preference bez konkrétního dopadu (subjektivní "šlo by líp").
- Pravidla, která projekt explicitně schválil (existující auth pattern, pojmenování, …).
- Hlavička "TODO" pokud je v aktivně rozpracovaném souboru a víš, že se to vyřeší v současné session.
