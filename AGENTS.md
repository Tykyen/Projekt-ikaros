# Workflow

Mluv česky. Buď stručný.

## Postup při práci na komponentě

1. **ADR check** — Ověř, že existují architektonická rozhodnutí pro danou oblast. Pokud ne, vytvoř je s uživatelem.
   → skill `adr-check`, případně `adr-create`

2. **Specifikace** — Ověř, že existuje specifikace komponenty (`docs/specs/<modul>/<komponenta>/`). Pokud ne, vytvoř ji s uživatelem.
   → skill `spec-create`

3. **Implementace** — Implementuj dle specifikace. Při rozporu nebo mezeře ve spec se zastav — nejprve s uživatelem uprav nebo doplň specifikaci, pak implementuj podle ní.
   → skill `spec-driven-development`

4. **Odchylky od spec** — Aktualizuj specifikaci pouze pokud při implementaci došlo k nutnému odchýlení kvůli nečekaným problémům. Problémy zapiš do specifikace jako varování pro příště.

Nikdy nepřeskakuj kroky 1–2. Bez ADR a specifikace se neimplementuje.

## Git workflow

1. **Větev** — Před prací vytvoř novou větev z `main`. Pojmenování volně.
2. **Commit** — Po dokončeném bloku práce commitni. Zprávy česky.
3. **PR** — Po dokončení práce vytvoř Pull Request do `main`. Schvalují: `F0KsiGen`, `Tykyen`.

Agent nikdy nepushuje ani nevytváří PR bez souhlasu uživatele.
