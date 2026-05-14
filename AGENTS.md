# Sourozenecké repo — Frontend

Tento repozitář je **backend** Projektu Ikaros. Frontend žije v samostatném repu:

- **FE:** `c:\Matrix\ProjektIkaros\Projekt-ikaros-FE` (Vite + React 19 + TS)
- **GitHub:** https://github.com/Tykyen/Projekt-Ikaros-FE
- **Dev port:** `5173` (BE běží na `3000`)

API kontrakty (DTO, REST endpointy) drží **BE** — pokud FE potřebuje něco jinak, mění se nejdřív tady. CORS pro `http://localhost:5173` musí být povolen v BE pro dev.

---

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

# Paralelní agenti

Kdykoli je možné spustit více agentů současně bez vzájemného konfliktu (různé soubory, různé moduly, nezávislé operace), **vždy je spusť v jedné zprávě jako paralelní volání**. Nečekej na dokončení jednoho před spuštěním dalšího, pokud na sobě nezávisí.

Příklady kdy spouštět paralelně:
- spec review + quality review (různí recenzenti, stejné soubory — čtení nekonfliktuje)
- implementace více nezávislých modulů najednou
- průzkum kódu (Explore agenti na různých částech codebase)
- čtení více spec/doc souborů pro přípravu kontextu

Výjimky — nespouštěj paralelně pokud:
- agent B závisí na výstupu agenta A (sekvenční závislost)
- oba agenti by zapisovali do stejného souboru
- implementační agenti v rámci subagent-driven-development (ti musí být sekvenční kvůli git historii)

---

# Škálovací limity

Při návrhu a implementaci vždy počítej s těmito limity:
- až 500 světů
- každý svět až 500 členů
- každý svět stovky stran obsahu

Vyhýbej se řešením která dělají N DB queries na jednu operaci (N+1 problem). Nenačítej celé kolekce do paměti pro filtrování — preferuj DB-level filtrování, indexy a pagination. Pokud navrhované řešení tyto limity nezvládne, upozorni na to před implementací.
