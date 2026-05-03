# Průvodce architektonickými rozhodnutími (ADR)

Každé významné architektonické rozhodnutí má vlastní soubor v `docs/arch/`.

---

## Struktura složky

```
docs/arch/
  _guide.md              # Tento soubor
  _templates/
    adr-template.md      # Šablona pro nové ADR
  ADR-001-nazev.md
  ADR-002-nazev.md
  ...
```

---

## Kdy vytvořit ADR

- Volba technologie nebo frameworku
- Změna architektury (struktura modulů, komunikační vzory)
- Bezpečnostní nebo autorizační model
- Rozhodnutí s dlouhodobými důsledky, které nejsou zřejmé z kódu

Drobné implementační detaily ADR nepotřebují.

---

## Konvence pojmenování

`ADR-NNN-kratky-popis-kebab-case.md`

Příklady:
- `ADR-001-nestjs-over-express.md`
- `ADR-002-mongodb-repository-pattern.md`

---

## Stavy

| Stav | Význam |
|------|--------|
| `Proposed` | Navrženo, čeká na schválení |
| `Accepted` | Platné a aktivní |
| `Deprecated` | Zastaralé, ale nenahrazené |
| `Superseded by ADR-XXX` | Nahrazeno novějším ADR |

---

## Jak vytvořit nové ADR

1. Zkopíruj `docs/arch/_templates/adr-template.md`
2. Pojmenuj soubor dle konvence (příští číslo v řadě)
3. Vyplň všechny sekce — odstraň komentáře v `<!-- -->`
4. Nastav status na `Proposed` nebo rovnou `Accepted`
