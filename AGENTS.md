# Zdroje znalostí o herním systému

Při zjišťování jak funguje daný princip, feature nebo herní mechanika v existujícím systému čti z obou zdrojů:

1. **`docs/old/`** — dokumentace starého backendu (datové modely, API, huby)
2. **`C:/Matrix/Matrix`** — zdrojový kód starého systému (backend C# + frontend React/TS)

Kdy sáhnout přímo do `C:/Matrix/Matrix`:
- Dokumentace v `docs/old/` popisuje věc jen povrchně nebo chybí
- Potřebuješ vidět skutečnou implementaci (business logika, edge cases, validace)
- Frontend komponenty (UX flow, jak se data renderují, jaké eventy se posílají)

Postup: nejdřív zkus `docs/old/`, pokud nestačí dohledej konkrétní soubory v `C:/Matrix/Matrix` pomocí `find` nebo `grep`.

---

# Škálovací limity

Při návrhu a implementaci vždy počítej s těmito limity:
- až 500 světů
- každý svět až 500 členů
- každý svět stovky stran obsahu

Vyhýbej se řešením která dělají N DB queries na jednu operaci (N+1 problem). Nenačítej celé kolekce do paměti pro filtrování — preferuj DB-level filtrování, indexy a pagination. Pokud navrhované řešení tyto limity nezvládne, upozorni na to před implementací.
