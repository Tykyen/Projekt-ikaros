# Návrh systému pro specifikace komponent

## Přehled

Souborový systém pro udržování specifikací budoucích backendových komponent. Specifikace jsou primárně konzumovány AI agenty pro generování kódu a implementačních plánů.

## Cíle

- Specifikace každé komponenty je složka zaměřených Markdown souborů
- Vstupní bod pro AI agenta je vždy `index.md`
- Konzistentní struktura zajištěna šablonami
- Čitelné pro lidi i zpracovatelné AI bez extra nástrojů

## Struktura složek

```
docs/arch/
  _templates/                  # Šablony pro nové komponenty
    index.md
    purpose.md
    data-models.md
    api.md
    errors.md
    security.md
    tests.md
    ai-notes.md
  _spec-guide.md               # Reference: co je každý typ souboru, proč, jak
  <modul>/
    <komponenta>/
      index.md                 # Vstupní bod — seznam souborů s krátkým popisem
      purpose.md
      data-models.md
      api.md
      errors.md
      security.md
      tests.md
      ai-notes.md
```

Komponenta nemusí mít všechny soubory. `index.md` uvádí pouze soubory, které existují.

## Formát index.md

```markdown
# <NázevKomponenty>

Krátký popis co komponenta dělá (1-2 věty).

## Soubory

- `purpose.md` — účel, odpovědnosti, kontext
- `data-models.md` — datové struktury a schémata
- `api.md` — endpointy, vstupy/výstupy
- `errors.md` — chybové stavy a jejich handling
- `security.md` — auth, validace, bezpečnostní požadavky
- `tests.md` — testovací scénáře
- `ai-notes.md` — pokyny specificky pro AI agenta
```

## Šablony

Každý soubor v `_templates/` obsahuje minimální kostru s nadpisy a inline komentáři (v závorkách) vysvětlujícími co do každé sekce patří. Komentáře se po vyplnění obsahu odstraní. Všechny šablony a vyplněné specifikace jsou v češtině.

Příklad šablony `purpose.md`:

```markdown
# Účel

(Co komponenta dělá. Jedna věta.)

## Odpovědnosti

(Bullet list — co patří do této komponenty.)

## Mimo rozsah

(Co komponenta záměrně nedělá.)

## Kontext

(Kde se komponenta nachází v systému, na co navazuje.)
```

## _spec-guide.md

Referenční dokument popisující celý systém specifikací. Obsahuje:

- Účel systému specifikací
- Popis každého typu souboru: co je, proč existuje, co do něj patří a co ne
- Konvence pojmenování modulů a komponent
- Jak vytvořit specifikaci nové komponenty (zkopírovat šablony, vyplnit, aktualizovat index)
- Jak mají AI agenti specifikace procházet

## Workflow AI agenta

Před zahájením práce na komponentě agent vždy nejprve přečte její specifikaci:

1. Agent dostane cestu ke složce komponenty
2. Agent přečte `index.md` — zjistí jaké soubory existují a co každý obsahuje
3. Agent přečte všechny relevantní soubory specifikace
4. Teprve po prostudování specifikace začne agent pracovat na komponentě

## Co systém záměrně neřeší

- CLI nástroje (lze přidat později)
- Validace nebo linting úplnosti specifikace
- Automatický build krok pro sestavení promptů
