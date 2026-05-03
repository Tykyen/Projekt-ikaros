---
name: adr-check
description: Use before creating or modifying any component specification to identify and read relevant Architecture Decision Records.
---

# ADR check

Před tvorbou specifikace ověř, která architektonická rozhodnutí se vztahují na danou komponentu.

## Krok 1: Přečti index

Přečti `docs/arch/_index.md`.

## Krok 2: Vyber relevantní ADR

Na základě kontextu komponenty (modul, technologie, oblast) vyber relevantní záznamy:
- Porovnej tagy ADR s modulem a technologiemi komponenty
- Pokud si nejsi jistý relevancí, zahrň ADR raději navíc

## Krok 3: Přečti vybraná ADR

Přečti celý obsah každého vybraného ADR.

## Krok 4: Žádné relevantní ADR

Pokud žádné ADR nepokryje komponentu:
- Zastav práci
- Informuj uživatele, že pro tuto oblast neexistuje ADR
- Aktivuj skill `adr-create` pro společné vytvoření nového ADR
- Pokračuj až po vytvoření ADR

## Krok 5: Shrnutí pro specifikaci

Shrň která rozhodnutí se vztahují na komponentu a co z nich konkrétně plyne — jaká omezení nebo požadavky musí specifikace respektovat.
