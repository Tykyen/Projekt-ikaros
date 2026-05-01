# Návrh: Spec-first vývojový workflow

## Přehled

Pravidlo + skill zajišťující, že každá implementace komponent prochází spec-first workflow: ověření specifikace → implementace → aktualizace specifikace.

## Cíle

- Žádná implementace bez existující specifikace (`index.md` + `purpose.md`)
- Skill jako jediná autorita — pravidlo pouze aktivuje skill
- Specifikace se po implementaci doplní o nové poznatky

## Komponenty

### Pravidlo `.claude/rules/spec-first.md`

Jedno pravidlo bez logiky: před jakoukoli implementací bezpodmínečně aktivuj skill `spec-driven-development`. Skill rozhoduje o dalším postupu.

### Skill `.claude/skills/spec-driven-development.md`

Skill řídí tři fáze:

**Fáze 1 — Ověření specifikace**
- Najdi `docs/arch/<modul>/<komponenta>/` pro danou komponentu
- Zkontroluj existenci `index.md` a `purpose.md`
- Chybí-li → zastav, informuj uživatele, odmítni implementovat
- Existují-li → přečti všechny dostupné spec soubory, pak pokračuj

**Fáze 2 — Implementace**
- Implementuj dle specifikace
- Při rozhodování odkazuj na konkrétní části specifikace

**Fáze 3 — Aktualizace specifikace**
- Projdi existující spec soubory, doplň co se změnilo
- Chybí-li relevantní soubory (api.md, tests.md, ...) → vytvoř ze šablony, vyplň
- Aktualizuj `index.md` pokud přibyly nové soubory

## Co systém záměrně neřeší

- Validaci úplnosti nebo kvality specifikace
- Automatické vytváření specifikací pro nové komponenty
