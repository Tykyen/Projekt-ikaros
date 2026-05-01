---
name: spec-driven-development
description: Use when implementing any component feature — before writing code, to verify spec exists, and after implementation to update the spec. Use when user asks to build, modify, or fix a component.
---

# Spec-driven development

Řídí celý vývojový cyklus komponenty: ověření specifikace → implementace → aktualizace specifikace.

## Fáze 1: Ověření specifikace

1. Identifikuj modul a komponentu z kontextu úkolu
2. Zkontroluj existenci `docs/arch/<modul>/<komponenta>/index.md` a `purpose.md`
3. **Pokud chybí `index.md` nebo `purpose.md`:**
   - Zastav práci
   - Informuj uživatele které soubory chybí a kde je vytvořit (`docs/arch/_templates/`)
   - Odmítni implementovat dokud specifikace neexistuje
4. **Pokud existují:**
   - Přečti `index.md` — zjisti jaké soubory specifikace existují
   - Přečti všechny relevantní spec soubory pro daný úkol
   - Pokud si nejsi jistý relevancí, přečti vše

## Fáze 2: Implementace

- Implementuj dle specifikace
- Při každém netriviálním rozhodnutí ověř, zda je v souladu se specifikací
- Pokud implementace odhalí rozpor nebo mezeru ve specifikaci — zastav se a upozorni uživatele před pokračováním

## Fáze 3: Aktualizace specifikace

Po dokončení implementace projdi specifikaci a doplň co se změnilo nebo přibylo:

1. **Aktualizuj existující soubory** — doplň nové API endpointy, datové modely, chybové stavy, testovací scénáře
2. **Vytvoř chybějící soubory** — pokud implementace přinesla obsah pro `api.md`, `tests.md`, `errors.md`, `security.md` nebo `data-models.md` a soubor neexistuje, zkopíruj šablonu z `docs/arch/_templates/` a vyplň
3. **Aktualizuj `index.md`** — přidej záznamy pro nově vytvořené soubory

Konvence pojmenování a formát viz `docs/arch/_spec-guide.md`.
