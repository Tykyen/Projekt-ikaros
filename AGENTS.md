# Škálovací limity

Při návrhu a implementaci vždy počítej s těmito limity:
- až 500 světů
- každý svět až 500 členů
- každý svět stovky stran obsahu

Vyhýbej se řešením která dělají N DB queries na jednu operaci (N+1 problem). Nenačítej celé kolekce do paměti pro filtrování — preferuj DB-level filtrování, indexy a pagination. Pokud navrhované řešení tyto limity nezvládne, upozorni na to před implementací.
