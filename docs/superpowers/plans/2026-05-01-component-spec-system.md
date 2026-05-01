# Component Spec System — Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vytvořit souborový systém `docs/arch/` se šablonami a průvodcem pro udržování specifikací backendových komponent konzumovaných AI agenty.

**Architecture:** Čistá adresářová struktura bez kódu — šablony Markdown v `_templates/`, referenční průvodce v `_spec-guide.md`. Každá budoucí komponenta dostane vlastní složku s `index.md` jako vstupním bodem pro AI agenta.

**Tech Stack:** Markdown, Git

---

### Task 1: Základní struktura složek a šablona `index.md`

**Files:**
- Create: `docs/arch/_templates/index.md`

- [ ] **Step 1: Vytvoř složku `docs/arch/_templates/`**

```bash
mkdir -p docs/arch/_templates
```

- [ ] **Step 2: Vytvoř `docs/arch/_templates/index.md`**

```markdown
# <NázevKomponenty>

(Krátký popis co komponenta dělá. 1-2 věty.)

## Soubory

(Vypiš pouze soubory které existují v této složce.)

- `purpose.md` — účel, odpovědnosti, kontext
```

- [ ] **Step 3: Zkontroluj výstup**

Ověř že soubor existuje a má správný obsah:
```bash
cat docs/arch/_templates/index.md
```

- [ ] **Step 4: Commit**

```bash
git add docs/arch/_templates/index.md
git commit -m "feat: add spec system index template"
```

---

### Task 2: Šablona `purpose.md`

**Files:**
- Create: `docs/arch/_templates/purpose.md`

- [ ] **Step 1: Vytvoř `docs/arch/_templates/purpose.md`**

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

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_templates/purpose.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_templates/purpose.md
git commit -m "feat: add spec system purpose template"
```

---

### Task 3: Šablona `data-models.md`

**Files:**
- Create: `docs/arch/_templates/data-models.md`

- [ ] **Step 1: Vytvoř `docs/arch/_templates/data-models.md`**

```markdown
# Datové modely

## <NázevModelu>

(Popis modelu — k čemu slouží.)

### Pole

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| `id` | string | ano | (popis) |

### Poznámky

(Invarianty, validační pravidla, zvláštnosti.)

---

(Opakuj sekci pro každý další model.)
```

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_templates/data-models.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_templates/data-models.md
git commit -m "feat: add spec system data-models template"
```

---

### Task 4: Šablona `api.md`

**Files:**
- Create: `docs/arch/_templates/api.md`

- [ ] **Step 1: Vytvoř `docs/arch/_templates/api.md`**

```markdown
# API

## <NázevEndpointu>

**Metoda:** `GET | POST | PUT | DELETE`
**Cesta:** `/api/v1/<cesta>`

### Vstup

(Popis request body nebo query parametrů.)

```json
{
  "pole": "typ"
}
```

### Výstup

(Popis response body při úspěchu.)

```json
{
  "pole": "typ"
}
```

### Chybové stavy

| HTTP kód | Příčina |
|----------|---------|
| 400 | (popis) |
| 404 | (popis) |

---

(Opakuj sekci pro každý další endpoint.)
```

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_templates/api.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_templates/api.md
git commit -m "feat: add spec system api template"
```

---

### Task 5: Šablona `errors.md`

**Files:**
- Create: `docs/arch/_templates/errors.md`

- [ ] **Step 1: Vytvoř `docs/arch/_templates/errors.md`**

```markdown
# Chybové stavy

## <NázevChyby>

**Kód:** `ERROR_CODE`
**HTTP status:** 4xx / 5xx

**Příčina:** (Kdy k této chybě dojde.)

**Handling:** (Jak se chyba zpracuje — logování, retry, odpověď klientovi.)

---

(Opakuj sekci pro každou další chybu.)
```

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_templates/errors.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_templates/errors.md
git commit -m "feat: add spec system errors template"
```

---

### Task 6: Šablona `security.md`

**Files:**
- Create: `docs/arch/_templates/security.md`

- [ ] **Step 1: Vytvoř `docs/arch/_templates/security.md`**

```markdown
# Bezpečnost

## Autentizace

(Jaký mechanismus autentizace komponenta vyžaduje nebo implementuje.)

## Autorizace

(Kdo má přístup k čemu. Role, oprávnění.)

## Validace vstupů

(Co se validuje, jak, kde.)

## Citlivá data

(Jaká data jsou citlivá, jak se s nimi nakládá — šifrování, maskování, logování.)

## Poznámky

(Další bezpečnostní požadavky nebo omezení.)
```

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_templates/security.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_templates/security.md
git commit -m "feat: add spec system security template"
```

---

### Task 7: Šablona `tests.md`

**Files:**
- Create: `docs/arch/_templates/tests.md`

- [ ] **Step 1: Vytvoř `docs/arch/_templates/tests.md`**

```markdown
# Testovací scénáře

## Jednotkové testy

- [ ] (Popis scénáře — co se testuje, vstup, očekávaný výstup.)
- [ ] (Další scénář.)

## Integrační testy

- [ ] (Popis scénáře — jaké části systému spolupracují, co se ověřuje.)

## Hraniční případy

- [ ] (Popis hraničního případu a očekávané chování.)

## Co se netestuje

(Co je záměrně vynecháno a proč.)
```

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_templates/tests.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_templates/tests.md
git commit -m "feat: add spec system tests template"
```

---

### Task 8: Šablona `ai-notes.md`

**Files:**
- Create: `docs/arch/_templates/ai-notes.md`

- [ ] **Step 1: Vytvoř `docs/arch/_templates/ai-notes.md`**

```markdown
# Poznámky pro AI agenta

## Před zahájením práce

(Co musí agent udělat nebo vědět ještě před tím, než začne pracovat na komponentě.)

## Důležitá omezení

(Co agent nesmí dělat nebo měnit. Invarianty které musí zachovat.)

## Závislosti

(Na jakých dalších komponentách nebo systémech tato komponenta závisí. Kde najít jejich specifikace.)

- `docs/arch/<modul>/<komponenta>/` — (popis závislosti)

## Doporučený postup

(Navrhovaný pořadí kroků nebo přístup k implementaci.)

## Časté chyby

(Co se při implementaci této komponenty snadno pokazí a jak se tomu vyhnout.)
```

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_templates/ai-notes.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_templates/ai-notes.md
git commit -m "feat: add spec system ai-notes template"
```

---

### Task 9: Referenční průvodce `_spec-guide.md`

**Files:**
- Create: `docs/arch/_spec-guide.md`

- [ ] **Step 1: Vytvoř `docs/arch/_spec-guide.md`**

```markdown
# Průvodce systémem specifikací

Tento dokument popisuje konvence a strukturu systému specifikací komponent projektu.

---

## Účel systému

Každá plánovaná backendová komponenta má vlastní složku se specifikačními soubory. Specifikace slouží jako vstup pro AI agenty — agent přečte specifikaci před zahájením práce na komponentě.

---

## Struktura složek

```
docs/arch/
  _templates/          # Šablony — základ pro nové komponenty
  _spec-guide.md       # Tento soubor
  <modul>/
    <komponenta>/
      index.md         # Vstupní bod — agent čte jako první
      purpose.md
      data-models.md
      api.md
      errors.md
      security.md
      tests.md
      ai-notes.md
```

Komponenta nemusí mít všechny soubory. `index.md` vždy uvádí pouze soubory, které existují.

---

## Konvence pojmenování

- **Modul:** lowercase, pomlčky místo mezer, např. `user-management`, `billing`
- **Komponenta:** lowercase, pomlčky místo mezer, např. `auth-service`, `invoice-generator`
- **Soubory:** vždy přesně názvy ze šablony, bez změn

---

## Typy souborů

### `index.md`
Vstupní bod pro AI agenta. Obsahuje krátký popis komponenty a seznam existujících souborů s jednovětým popisem každého. Agent čte tento soubor jako první a podle něj rozhoduje co dál číst.

**Patří sem:** název, popis komponenty, seznam existujících spec souborů s popisem.
**Nepatří sem:** obsah ostatních souborů, implementační detaily.

### `purpose.md`
Definuje co komponenta dělá a proč existuje. Vymezuje hranice odpovědnosti.

**Patří sem:** účel, odpovědnosti, co je mimo rozsah, kontext v systému.
**Nepatří sem:** jak je to implementováno, datové struktury, API.

### `data-models.md`
Popis datových struktur a schémat se kterými komponenta pracuje.

**Patří sem:** modely, jejich pole, typy, validační pravidla, invarianty.
**Nepatří sem:** endpointy, business logika, implementační detaily ORM.

### `api.md`
Definice rozhraní komponenty — endpointy nebo jiné vstupní/výstupní body.

**Patří sem:** metoda, cesta, vstup, výstup, chybové HTTP kódy.
**Nepatří sem:** interní implementace, datové modely (odkaz na `data-models.md`).

### `errors.md`
Katalog chybových stavů které komponenta může vrátit nebo se kterými pracuje.

**Patří sem:** kód chyby, HTTP status, příčina, způsob handlingu.
**Nepatří sem:** obecné HTTP chyby bez specifického kontextu komponenty.

### `security.md`
Bezpečnostní požadavky a omezení komponenty.

**Patří sem:** autentizace, autorizace, validace vstupů, nakládání s citlivými daty.
**Nepatří sem:** obecné bezpečnostní principy bez vazby na komponentu.

### `tests.md`
Testovací scénáře — co se musí testovat, ne jak.

**Patří sem:** jednotkové testy, integrační testy, hraniční případy, co se netestuje.
**Nepatří sem:** konkrétní kód testů, implementační detaily testovacího frameworku.

### `ai-notes.md`
Pokyny specificky pro AI agenta pracujícího na komponentě.

**Patří sem:** co udělat před zahájením, omezení, závislosti, doporučený postup, časté chyby.
**Nepatří sem:** obsah který patří do jiných souborů.

---

## Jak vytvořit specifikaci nové komponenty

1. Vytvoř složku `docs/arch/<modul>/<komponenta>/`
2. Zkopíruj šablony ze `docs/arch/_templates/` které jsou relevantní
3. Vyplň zkopírované soubory — odstraň komentáře v závorkách, nahraď je skutečným obsahem
4. Aktualizuj `index.md` — uveď pouze soubory které jsi vyplnil

---

## Workflow AI agenta

Před zahájením práce na komponentě agent vždy nejprve přečte její specifikaci:

1. Agent dostane cestu ke složce komponenty
2. Agent přečte `index.md` — zjistí jaké soubory existují a co každý obsahuje
3. Agent přečte všechny relevantní soubory specifikace
4. Teprve po prostudování specifikace začne agent pracovat na komponentě
```

- [ ] **Step 2: Zkontroluj výstup**

```bash
cat docs/arch/_spec-guide.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/arch/_spec-guide.md
git commit -m "feat: add spec system guide"
```

---
