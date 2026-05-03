---
name: spec-create
description: Use when a component specification does not exist yet — guides user through creating it step by step, examining context and old implementation for integration points.
---

# Tvorba specifikace

Společně s uživatelem vytvoř specifikaci nové komponenty. Uživatel nemusí mít programové zkušenosti — vysvětluj pojmy a důsledky srozumitelně. Otázky kládej jednu po jedné.

## Krok 1: Zjisti komponentu

Zeptej se uživatele jakou komponentu specifikuje — jaký modul, co má dělat, proč je potřeba. Jedna otázka.

## Krok 2: ADR check

Aktivuj skill `adr-check`. Přečti relevantní architektonická rozhodnutí — specifikace je musí respektovat.

## Krok 3: Prozkoumej kontext

Prozkoumej:
- Existující kód v `backend/src/modules/` — jaké moduly už existují, jak jsou strukturované
- Existující specifikace v `docs/specs/` — specifikace závislých komponent
- Návrhový dokument v `docs/superpowers/specs/` — celkový záměr projektu

## Krok 4: Prozkoumej starou implementaci

Prozkoumej `docs/old/` — hledej pouze **integrační body**:
- API kontrakty (endpointy volané jinými komponentami)
- Datové formáty sdílené mezi komponentami
- Real-time eventy (WebSocket/SignalR) které jiné komponenty poslouchají

Starý backend nepoužívej jako vzor pro novou architekturu.

## Krok 5: Společně vyplň specifikaci

Projdi s uživatelem jednotlivé spec soubory v tomto pořadí. Ke každému polož jasné otázky:

### 5.1 `purpose.md`
- Co komponenta dělá?
- Za co je odpovědná a co je mimo její rozsah?
- Jak zapadá do zbytku systému?

### 5.2 `data-models.md`
- Jaké entity komponenta spravuje?
- Jaká pole mají? Jaké typy, výchozí hodnoty, validace?
- Vysvětli uživateli co jednotlivé volby znamenají

### 5.3 `api.md`
- Jaké endpointy komponenta nabízí?
- Co přijímá a co vrací?
- Kdo je volá (frontend, jiná komponenta)?

### 5.4 `errors.md`
- Co se může pokazit?
- Jak má systém reagovat?

### 5.5 `security.md`
- Kdo má přístup?
- Jaké role a oprávnění jsou potřeba?

### 5.6 `tests.md`
- Co se musí testovat?
- Jaké hraniční případy existují?

### 5.7 `ai-notes.md`
- Závislosti na jiných komponentách
- Omezení a doporučený postup implementace

Ne každá komponenta potřebuje všechny soubory. Pokud sekce není relevantní, přeskoč ji.

## Krok 6: Zapiš soubory

1. Vytvoř složku `docs/specs/<modul>/<komponenta>/`
2. Zkopíruj relevantní šablony z `docs/specs/_templates/`
3. Vyplň je obsahem z kroku 5 — odstraň komentáře v závorkách
4. Ulož všechny soubory

## Krok 7: Aktualizuj index.md

Vytvoř `docs/specs/<modul>/<komponenta>/index.md` se seznamem vytvořených souborů a jednovětým popisem každého.
