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
**Nepatří sem:** interní implementace, datové modely — ty patří do `data-models.md`.

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
**Nepatří sem:** API definice, datové modely, obecné bezpečnostní principy — ty patří do svých souborů.

---

## Jak vytvořit specifikaci nové komponenty

1. Vytvoř složku `docs/arch/<modul>/<komponenta>/`
2. Zkopíruj šablony ze `docs/arch/_templates/` které jsou relevantní
3. Vyplň zkopírované soubory — odstraň komentáře v závorkách, nahraď je skutečným obsahem
4. Aktualizuj `index.md` — zachovej pouze řádky souborů které jsi vyplnil, ostatní smaž

---

## Workflow AI agenta

Před zahájením práce na komponentě agent vždy nejprve přečte její specifikaci:

1. Agent dostane cestu ke složce komponenty
2. Agent přečte `index.md` — zjistí jaké soubory existují a co každý obsahuje
3. Agent přečte soubory relevantní pro jeho úkol — pokud si není jistý, přečte vše
4. Teprve po prostudování specifikace začne agent pracovat na komponentě
