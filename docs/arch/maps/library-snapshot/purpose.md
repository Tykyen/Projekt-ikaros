# Účel

Šablona scény (`MapTemplate`) má sloužit jako **pause-and-resume mechanismus** — PJ může uložit aktuální stav hry (mid-session pauza, plánované scenario na později, sdílení mezi vlastními světy) a později obnovit identickou scénu.

## Use case

- **Pauza mid-session.** Hra se přeruší v půlce souboje. PJ uloží šablonu → příště načte → souboj pokračuje s identickou pozicí tokenů, HP, efekty, fog.
- **Cross-world přenos.** PJ má v rukávu připravený dungeon, který sjel ve světě A; chce ho znovu použít ve světě B (jiná družina, případně jiný systém). Šablona neváže na `worldId`, takže to funguje.
- **Skladiště plánovaných scén.** PJ si chystá 20 budoucích scén před kampaní; všechny ve šablonách, do scén je promítne až přijde čas.

**Load semantika (10.2c-edit-3):** Načtení šablony **NEpřepisuje** aktuální scénu — vytvoří **novou** aktivní scénu se jménem šablony a přepne na ni PJ. Současné aktivní scény zůstanou nezměněné (paralelní existence, viz `project_takticka_mapa_assignment`). PJ si tak zachovává historii a může se kdykoli vrátit k předchozí scéně.

## Co se ukládá

| Pole | Save? | Důvod |
|---|---|---|
| `name` | ano | uživatelské pojmenování |
| `imageUrl` | ano | pozadí |
| `config` (hex grid) | ano | velikost, offset, showGrid |
| `tokens` (jen NPC) | ano | NPC instance s pozicemi, HP, customData |
| `tokens` (PC) | **NE** | PC token ve světě A nedává smysl ve světě B (jiné postavy). I ve stejném světě: po načtení šablony se PC tokeny musí placnout znovu, protože hráči se mohou změnit. |
| `npcTemplates` | ano | bestiář scény |
| `effects` (color/barrier/explosion) | ano | nakreslené efekty |
| `revealedHexes` | ano | fog stav |
| `fogEnabled` | ano | toggle |
| `activeSoundIds` | ano | playlist |
| `lastModified` | ano (server timestamp) | metadata |
| `ownerId` | ano (server-derived z auth user) | per-PJ ownership |

**Pole, která se neukládají:** `isActive`, `isHidden`, `isLocked`, `worldId`, `lastSeqNumber`. Šablona je čistá data, ne live state.

## Co se NEukládá explicitně, ale dorazí přes referenci

NPC v `tokens` mají `templateId` ukazující na `npcTemplates` ve stejné šabloně. Při loadu se obojí promítne — reference zůstávají platné, protože templates i tokens jsou v jednom dokumentu.

**Hráčské postavy** (`Character` přes `characterId` v tokenu) — neukládáme PC tokeny vůbec, takže reference na character entity ze cizího světa neuniknou.

**Sounds** (`activeSoundIds`) — odkazuje na globální `Sound` kolekci. Pokud sound ID neexistuje při loadu (sound byl smazán), klient by měl tolerantně přeskočit a ne crashnout. **Implementační detail, ne spec.**

## Per-PJ vlastnictví

**Pravidla:**

- Každý `MapTemplate` má `ownerId: string` (= `User.id` PJ, který šablonu vytvořil).
- PJ vidí **jen své vlastní** šablony v `findAll`.
- `replace`/`delete` jen na vlastní šablony (jinak 403).
- **Admin/Superadmin** vidí všechno + může mazat cizí (administrativní funkce). Konzistence s ostatními modely.
- **Žádné sdílení mezi PJ** v tomto specu. Sdílení / "published" flag = samostatný spec, později.

**Migrace:** existující šablony bez `ownerId` se přiřadí Superadminu (Tyky, `tykytanjunior@gmail.com`). Důvod: bezpečný default; Tyky pak může případně rozdat ostatním ručně.

## Mimo rozsah

- **Sdílení šablon mezi PJ** (published flag, marketplace). Samostatný spec, pokud se rozhodne implementovat.
- **Verzování šablon** (mám V1 a V2 stejné šablony) — není potřeba.
- **Thumbnails** šablon — používá se `imageUrl` přímo. Optional optimization later.
- **Search/filter** v knihovně — současný `MapLibraryModal` má jednoduchý query, beze změny.
- **Bestiář kolize** — pokud šablona má NPC template ID, který se kolize s existujícím templates ve scéně → během loadu klient řeší "replace strategy" (replace celý npcTemplates pole). Detail v `api.md`.

## Odpovědnost komponenty

- BE: rozšířit `MapTemplate` schema + repository, ownership filter + guard, migrace skript.
- FE: rozšířit `MapLibraryModal` save mutation (kompletní snapshot), rozšířit load mutation (sekvence ops), confirm dialog.
- Migrace: jednorázový skript / nest CLI command, který doplní `ownerId` na existující záznamy.
