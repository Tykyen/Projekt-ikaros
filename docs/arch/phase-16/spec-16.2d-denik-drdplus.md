# 16.2d — Deník DrD+ (Dračí doupě Plus): redesign na jednotný erb-driven list

Status: 🚧 implementace
Navazuje: [16.2b drd16](spec-16.2b-denik-drd16.md), [16.2c skiny deníků](spec-16.2c-skiny-deniku.md), 8.7f (původní DrdPlus sheet)

## Cíl

Přepsat deník DrD+ z původní podoby (4 taby + `<select>` povolání, fialový „Arkanní svět") na **jeden souvislý list** věrný oficiálním papírovým deníkům DrD+ (6 povolání: Bojovník, Čaroděj, Hraničář, Kněz, Theurg, Zloděj).

Zdroj pravdy vizuálu = odsouhlasený mockup (scratchpad `drdplus-denik-navrh.html`).

## Rozhodnutí (potvrzeno uživatelem)

1. **Pergamen-kodex jako základní vzhled** (nahrazuje fialový Arkanní svět). Skin-reaktivita (jako drd16 16.2c) NENÍ součástí — řeší se případně později. Akcent se mění **per povolání** (Bojovník krev, Čaroděj indigo, Hraničář les, Kněz zlato, Theurg vínová, Zloděj stín).
2. **Žádné taby** — Postava → Boj → Na cesty → Profese plynou pod sebou, jeden scroll.
3. **Povolání se volí erbem** (klik na štít → popover s 6 erby). Erb řídí akcent + spodní proměnlivou sekci Profese. Ukládá se do stávajícího `drdp_profession`.
4. **Celé naráz** (ne po fázích).
5. **Bez Vybavení / Peněz / Zásob / Nákladu** (vědomě vynecháno).
6. **Bez předvyplněných seznamů** kouzel / modifikátorů / démonů (autorská práva k obsahu DrD+) — jen prázdné struktury k vyplnění.

## Data (`drdp_` prefix, `cdAccess`, delta-merge)

Beze změny zachováno (žádná migrace postav): `name, race, profession, stat_*, odv_*, uroven, xp, boj_*, zbrane, zbroje, spd_*, dovednosti` + per-povolání JSON.

Nová pole (additivní): lišty `*_mez`, `*_smrt` (bool 4. řádek); body `profibody, body, the_body, w_finty_left`; principy `pri_b_*` (rozpočet 6); forma os formulí; JSON `formule`, `demoni`, `vazby`. Osiří (zůstanou v DB, nezobrazí se): `age, postava_popis`.

## Struktura listu

- **Postava** — erb(=výběr povolání) + Jméno/Rasa/Úroveň/Zkušenosti; 6 hlavních + 9 odvozených vlastností (Krása/Nebezpečnost/Důstojnost auto z hlavních).
- **Boj** — Boj/Útok/Střelba/Obrana; Kombinace zbraní (BČ·ÚČ·ZZ·OČ čísla); Zbroj (Ochrana 1 číslo); lišty Zranění (řádky Bez postihu/Postih/Bezvědomí + volitelný Smrt, mez = políček/řádek); Velká zranění/postižení.
- **Na cesty** — Pohyb (Chůze/Spěch/Běh/Sprint); lišta Únavy (stejná mechanika); Dovednosti; Poznámky.
- **Profese (proměnlivá dle erbu)** + bodový rozpočet v hlavičce povolání:
  - Bojovník: Archetyp (stupnice 1–10), Finty (+pozn.), Schopnosti (stupeň 1–3 + pozn.) · *Zbývající finty*
  - Čaroděj: Magenergie+Pomocníček, Projevy (Vit/Men/Inv/Mat/Enr/Čas 1–10), Kouzla = karty (✦přímá/✧nepřímá, mg+sféra, náročnost→kvalita 1–3, vyvolání/dosah/rozsah/trvání, popis)
  - Hraničář: Zaměření (Znalost/Praxe 1–5 + mechanismus), Totem+lékárnička, Zvířecí společníci · *Body*
  - Kněz: Princip-hexagon (rozpočet 6 bodů, segmenty se rozsvěcí), Aspekt, Základní schopnosti (1–10), Zázračné (Stupeň 1–3 · Hloubka 1–3 · pozn.), Vliv
  - Theurg: Nakloněnost (Denní/Měsíční/Roční ± rozsah 10; Životní jen + max 21), Theurgické schopnosti (znalost I/II/III + bonus + pozn.), Formule (karty s profily ♀/♂, forma 4 osy, parametry Základ·Krok·zaNár, rysy, **modifikátory** s živým součtem Nár/Nákl/Vyv), Démoni (druh vazbochyt/nižší/vyšší, rysy mění Sféru+Náklonnost), samostatná tabulka Vazby (osoba·síla) · *Theurgické body*
  - Zloděj: Schopnosti (znalost I/II/III + bonus + hod + pozn. + **Mistr** jen při 3. stupni), Pomůcky, Finty (+pozn.) · *Profibody*

Formule/Démoni karty jsou **sbalitelné**.

## Komponenty (FE)

`sheets/drdplus/`: `DrdPlusSheet.tsx` (kostra+strany+povolání), vyčleněné velké karty (`SpellCard`, `FormuleCard`, `DemonCard`), sdílené prvky (`StupenScale`, `TriScale`, `WoundGrid`, `SignedScale`, `PrincipHex`, `CrestPicker`). `styles/drdplus.css` přepis (pergamen, scoped `[data-diary-system='drdplus']`, vlastní `--dp-*` tokeny, akcent per `[data-prof]`). Print = lineární read-only. Testy `__tests__/DrdPlusSheet.spec.tsx` přepsat (taby → sekce).
