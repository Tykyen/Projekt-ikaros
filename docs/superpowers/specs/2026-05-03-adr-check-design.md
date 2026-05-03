# Návrh: ADR + spec systém (check, create, spec-create)

## Přehled

Agentický systém zajišťující, že agent při tvorbě specifikace přečte relevantní architektonická rozhodnutí (ADR) a při psaní specifikace je respektuje. Pokud ADR chybí, agent společně s uživatelem nové ADR vytvoří. Obdobně pro specifikace — pokud chybí, agent uživatele provede tvorbou.

---

## Komponenty

### 1. `docs/arch/_index.md`

Index všech ADR. Každý záznam obsahuje:
- Název ADR (soubor — název je sám o sobě vypovídající)
- Tagy (oblasti/moduly kterých se rozhodnutí týká)
- Krátký popis jednou větou

Příklad:
```
| Soubor | Tagy | Popis |
|--------|------|-------|
| ADR-001-nestjs-over-express.md | framework, backend | Volba NestJS jako hlavního backendového frameworku. |
| ADR-002-mongodb-repository-pattern.md | databáze, architektura | Abstrakce přístupu k DB přes repository pattern. |
```

---

### 2. `.claude/skills/adr-check.md`

Skill řídící celý ADR workflow. Voláno na začátku tvorby specifikace.

**Workflow:**
1. Přečti `docs/arch/_index.md`
2. Na základě kontextu komponenty (modul, technologie, oblast) vyber relevantní ADR podle tagů a názvu
3. Přečti vybrané ADR celé
4. Pokud žádné ADR není relevantní — informuj uživatele a vyzvi ho k vytvoření nového ADR pomocí šablony `docs/arch/_templates/adr-template.md` před pokračováním
5. Shrň agentovi která rozhodnutí se vztahují na komponentu a co z nich plyne pro specifikaci

---

### 3. `.claude/skills/spec-driven-development.md` (aktualizace)

Přidána Fáze 0 před stávající Fázi 1:

```
## Fáze 0: ADR check
Aktivuj skill `adr-check`.
```

---

### 4. `.claude/rules/adr-check.md`

Záchranná síť — pravidlo aktivující `adr-check` i mimo `spec-driven-development`:

> Před tvorbou nebo úpravou jakékoli specifikace bezpodmínečně aktivuj skill `adr-check`.

---

## Tok dat

```
Uživatel zadá komponentu
        ↓
rule: adr-check.md (záchranná síť)
        ↓
skill: adr-check
  → přečte docs/arch/_index.md
  → vybere relevantní ADR
  → přečte je celé
  → shrne omezení pro komponentu
        ↓
skill: spec-driven-development (Fáze 1+)
  → ověří existenci specifikace
  → implementuje dle specifikace + ADR omezení
```

---

### 5. `.claude/skills/adr-create.md`

Skill pro společnou tvorbu ADR s uživatelem. Agent provádí uživatele celým procesem, pomáhá mu porozumět problému a rozhodnout se.

**Workflow:**
1. **Zjisti téma** — zeptej se uživatele co řeší (jaký problém, jaká oblast)
2. **Prozkoumej kontext** — prozkoumej kód, specifikace a existující ADR aby ses orientoval v situaci
3. **Prozkoumej možnosti** — vyhledej na internetu aktuální možnosti a přístupy
4. **Vysvětli problém** — srozumitelně vysvětli uživateli co se rozhoduje a proč je to důležité
5. **Navrhni přístupy** — 2-3 možnosti s výhodami/nevýhodami. Pokud je jasný vítěz, doporuč ho. Pokud ne, nech uživatele rozhodnout
6. **Zapiš ADR** — po rozhodnutí vyplň šablonu `docs/arch/_templates/adr-template.md`, ulož jako `docs/arch/ADR-NNN-nazev.md`
7. **Aktualizuj index** — automaticky přidej řádek do `docs/arch/_index.md` včetně tagů a popisu

Klíčové principy:
- Otázky klade jednu po jedné, srozumitelným jazykem
- Uživatel nemusí mít programové zkušenosti — agent vysvětluje pojmy a důsledky
- Agent doporučuje jasně lepší řešení, ale nechá uživatele rozhodnout když je to vyrovnané

---

### Propojení `adr-check` → `adr-create`

Když `adr-check` (krok 4) zjistí, že žádné ADR nepokrývá komponentu, vyzve uživatele a odkáže na skill `adr-create`.

---

### 6. `.claude/skills/spec-create.md`

Skill pro společnou tvorbu specifikace s uživatelem. Agent provádí uživatele procesem, pomáhá mu porozumět a definovat komponentu.

**Workflow:**
1. **Zjisti komponentu** — zeptej se uživatele co specifikuje
2. **Aktivuj `adr-check`** — přečti relevantní ADR
3. **Prozkoumej kontext** — kód, existující specifikace závislých komponent
4. **Prozkoumej starou implementaci** — jen integrační body z `docs/old/`, pokud existují
5. **Společně s uživatelem vyplň specifikaci** — otázka po otázce, od `purpose.md` po další soubory
6. **Zapiš soubory** — do `docs/specs/<modul>/<komponenta>/` dle šablon z `docs/specs/_templates/`
7. **Aktualizuj `index.md`** — seznam vytvořených souborů

Klíčové principy:
- Otázky klade jednu po jedné, srozumitelným jazykem
- Uživatel nemusí mít programové zkušenosti — agent vysvětluje pojmy a důsledky
- Starý backend (`docs/old/`) jen pro zjištění integračních bodů, ne jako vzor

---

### Propojení `spec-driven-development` → `spec-create`

Když `spec-driven-development` (Fáze 1) zjistí, že specifikace chybí, aktivuje skill `spec-create` místo pouhého odmítnutí.

---

## Co systém neřeší

- Aktivní validaci hotové specifikace proti ADR (agent pouze čte a respektuje, nekontroluje shodu)
- Automatické přiřazení tagů k ADR (tagy generuje `adr-create` automaticky)
