# Připomínky uživatele (checklist změn)

Seznam věcí, které chce PJ změnit. Žije napříč sezeními. Jak se každý bod
upřesní → rozepíše se na konkrétní zadání (spec) a teprve pak se řeší.

Legenda: `[ ]` čeká · `[~]` rozpracováno · `[x]` hotovo · ❓ potřebuje upřesnit

---

- [x] **1) Odkaz po kliknutí předpřipraví** ✅ 2026-06-06
  Na 404 („Stránka nenalezena") tlačítko „Vytvořit" teď předvyplní pole NÁZEV
  v editoru nové stránky podle slugu z URL (`kralovna-vil` → „Kralovna vil").
  Odkaz `?slug=` se předával už dřív, ale editor ho ignoroval — dotaženo.
  Spec 7.1 revize 2026-06-06.

- [x] **2) Bestie — vložit normální fotku** ✅ 2026-06-06
  Obrázek bestie v editoru (`BestieEditorModal`) má nově upload souboru
  (klik/drag&drop, jako u postav) + fallback ruční URL. Přes sdílenou
  `HeroUploadCard`, čistě FE. Spec 10.2d-prep-B revize 2026-06-06.

- [x] **3) Vkládání map (atlas)** ✅ 2026-06-06
  Nová sekce „Mapy" v menu Svět = atlas nahraných obrázkových map. PJ nahraje
  obrázek + název/popis a u každé mapy určí viditelnost (veřejná / vybraní
  hráči). Hráč vidí jen své. FE+BE (nový modul `world-maps`). Spec 13.4.

- [~] **4) Nápověda — kompletní přepracování** 📋 spec hotový 2026-06-06
  Plný redesign `/ikaros/napoveda`: vnořené rozevírací sekce, bohaté bloky
  (karty/štítky/tabulky/návody), ilustrace + sloty na screenshoty, pokrýt vše.
  Vzor = stará nápověda `C:\Matrix\Matrix\…\IkarosHelp.tsx`. **Realizace v
  čisté session** dle handoff specu `docs/arch/phase-13/spec-13.5-napoveda-redesign.md`.

- [ ] **5) Na stránkách „co všechno umí"** ❓
  _Mé chápání:_ přímo na (světových) stránkách ukázat uživateli, co daná
  stránka/funkce umí — kdyby chtěl vědět. Forma nejasná: kontextová nápověda
  (ikona „?"), uvítací tip, nebo odkaz do Nápovědy? → upřesnit.
