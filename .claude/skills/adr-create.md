---
name: adr-create
description: Use when creating a new Architecture Decision Record — guides user through the decision process step by step, researches options, and writes the ADR.
---

# Tvorba ADR

Společně s uživatelem vytvoř nové architektonické rozhodnutí. Uživatel nemusí mít programové zkušenosti — vysvětluj pojmy a důsledky srozumitelně.

## Krok 1: Zjisti téma

Zeptej se uživatele co řeší — jaký problém, jaká oblast, jaká komponenta. Jedna otázka.

## Krok 2: Prozkoumej kontext

Prozkoumej kód, specifikace (`docs/specs/`) a existující ADR (`docs/arch/_index.md`) aby ses orientoval v aktuální situaci projektu.

## Krok 3: Prozkoumej možnosti

Vyhledej na internetu aktuální přístupy a technologie relevantní pro dané téma. Porovnej je s kontextem projektu.

## Krok 4: Vysvětli problém

Srozumitelně vysvětli uživateli:
- Co se rozhoduje
- Proč je to důležité
- Jaký dopad to bude mít na projekt

Bez žargonu. Pokud musíš použít odborný pojem, vysvětli ho.

## Krok 5: Navrhni přístupy

Navrhni 2-3 možnosti. Ke každé uveď:
- Co to je (krátce)
- Výhody
- Nevýhody

**Pokud je jasný vítěz** — doporuč ho a vysvětli proč.
**Pokud je to vyrovnané** — popíš rozdíly a nech uživatele rozhodnout.

Počkej na rozhodnutí uživatele.

## Krok 6: Zapiš ADR

Po rozhodnutí:
1. Zjisti příští číslo ADR (dle existujících souborů v `docs/arch/`)
2. Zkopíruj šablonu `docs/arch/_templates/adr-template.md`
3. Vyplň všechny sekce — odstraň komentáře v `<!-- -->`
4. Název souboru: `ADR-NNN-kratky-popis-kebab-case.md`
5. Ulož do `docs/arch/`

## Krok 7: Aktualizuj index

Přidej nový řádek do tabulky v `docs/arch/_index.md`:
- **Soubor** — odkaz na nově vytvořený ADR
- **Tagy** — vygeneruj relevantní tagy (modul, technologie, oblast)
- **Popis** — jedna věta shrnující rozhodnutí
