/* eslint-disable */
// AUTOGENEROVÁNO z docs/arch/phase-2/rulebook-content.md (build-rulebook-data.js). Needituj ručně.
// Pravidlová kniha — master seed (F1: hub Pravidla + kapitoly 1–9). Čísla 1:1 se zdrojem.
export interface RulebookSeedPage {
  slug: string;
  title: string;
  type: string;
  order: number;
  imageUrl?: string;
  content?: string;
  quickRef?: string;
  menu?: { label: string; href: string; order: number }[];
}

export const RULEBOOK_SEED_PAGES: RulebookSeedPage[] = [
  {
    "slug": "pravidla",
    "title": "Pravidla",
    "type": "Seznam",
    "order": 0,
    "content": "<p>Vítej v pravidlech světa Projekt Ikaros. Systém vychází z FATE — hází se třemi možnostmi (+, –, 0). Nehledej nejvýhodnější tah, ale ten, který dává smysl v příběhu tvé postavy.</p>",
    "menu": [
      {
        "label": "Tvorba postav",
        "href": "tvorba-postav",
        "order": 0
      },
      {
        "label": "Aspekty",
        "href": "aspekty",
        "order": 1
      },
      {
        "label": "Body osudu",
        "href": "body-osudu",
        "order": 2
      },
      {
        "label": "Sázky",
        "href": "sazky",
        "order": 3
      },
      {
        "label": "Iniciativa",
        "href": "iniciativa",
        "order": 4
      },
      {
        "label": "Úroveň sil",
        "href": "uroven-sil",
        "order": 5
      },
      {
        "label": "Přetlak",
        "href": "pretlak",
        "order": 6
      },
      {
        "label": "Únava",
        "href": "unava",
        "order": 7
      },
      {
        "label": "Léčení a zranění",
        "href": "leceni-a-zraneni",
        "order": 8
      }
    ]
  },
  {
    "slug": "tvorba-postav",
    "title": "Tvorba postav",
    "type": "Ostatní",
    "order": 1,
    "imageUrl": "/rulebook/tvorba-postav.webp",
    "content": "<p><em>Jak z nápadu vznikne hratelná postava — od konceptu a zázemí přes aspekty po rozdělení 24 bodů do dovedností.</em></p><h3>Základní představa o postavě</h3><p>Představ si postavu jako roli ve filmu nebo hrdinu románu. Kdo je, co ji motivuje, jaký má styl? Polož si otázky:</p><ul><li>Kdo jsem? (povolání, schopnosti, způsob života)</li><li>Co chci? (motivace, cíl)</li><li>Proč jsem zajímavý? (osobnost, konflikty, originalita)</li><li>Jakou mám minulost? (klidně nejasnou, ale inspirativní)</li></ul><h3>Zázemí a detaily postavy</h3><p>Pomáhá pochopit, odkud postava pochází a jakou má pozici v Projektu Ikaros:</p><ul><li><strong>Jméno a příjmení</strong></li><li><strong>Národnost / státní útvar</strong> — např. Evropská unie, AMŘ, NUSA, OSSS, Šamanský stát</li><li><strong>Pohlaví / věk</strong></li><li><strong>Magicky nadaný</strong> — ano / ne</li><li><strong>Vzdělání / výcvik</strong> — např. Císařská magická akademie, Matrixová škola, vojenský výcvik v NÚPA</li><li><strong>Současná role</strong> — voják, mág, špion, hacker, diplomat, člen frakce…</li><li><strong>Rodinné pozadí</strong> — např. dcera obchodníka s artefakty z Nigérie, sirotek z Ruska, britský šlechtic…</li><li><strong>Zajímavost</strong> — např. mluví mimozemským jazykem, má mechanickou ruku, komunikuje s démonem uvnitř sebe…</li></ul><h3>Aspekty — příběh tvé postavy</h3><p>Aspekty jsou klíčové věty, které definují tvou postavu a dávají hře směr. Na začátku máš <strong>3 aspekty</strong>:</p><ul><li><strong>Koncept postavy</strong> — kdo jsi, co tě definuje, hlavní role v příběhu. Příklady: „Poutník mezi realitami“, „Vysloužilý veterán“, „Lovec démonů“, „Tradiční kouzelník“.</li><li><strong>Problém postavy</strong> — temnota, překážka, trauma nebo nevyřešená věc. Příklady: „Tak trochu kokot“, „Nakažen mutací“, „Hledaný“, „Alkoholik“.</li><li><strong>První dobrodružství</strong> — zásadní událost, která tě utvořila. Příklady: „Děda na plný úvazek“, „Člen tajného projektu“, „Zachránil jsem dítě“, „Náboženství“.</li></ul><p><strong>Volitelný 4. aspekt za 6 bodů</strong> — doplňující síla, kontakt, vazba nebo tajemství. Příklady: „Člen NÚPA“, „ACIVťan“, „Alchymista“. V budoucnu můžeš po dohodě s PJ mít i 5. a 6. aspekt; každý stojí 6 bodů z rozpočtu na dovednosti.</p><h3>Dovednosti — bodový systém</h3><p>Pravidla:</p><ul><li>Na začátku máš <strong>24 bodů</strong>. Za každou další hru získáš <strong>1 bod</strong>.</li><li>Každá dovednost má úroveň <strong>1 až 5</strong>.</li><li>Cena úrovní (v závorce cena při zvyšování):<ul><li>Úroveň 1 = 1 bod</li><li>Úroveň 2 = 3 body (zvýšení o 2)</li><li>Úroveň 3 = 6 bodů (zvýšení o 3)</li><li>Úroveň 4 = 10 bodů (zvýšení o 4)</li><li>Úroveň 5 = na začátku nelze (zvýšení o 5)</li></ul></li><li><strong>Počet aspektů = maximální úroveň dovednosti.</strong> (Např. se 3 aspekty nesmíš mít žádnou dovednost na úrovni 4.)</li></ul><p><strong>Ukázkové dovednosti (inspirace)</strong></p><p><em>Boj a přežití</em></p><ul><li><strong>Vojenský výcvik</strong> — marksmanský výcvik, seskoky, infiltrace, velení, orientace ve struktuře</li><li><strong>Ostrostřelec</strong> — rychlé tasení, přesná střelba, vrhací zbraně</li><li><strong>Felčar</strong> — lékařské znalosti, první pomoc, polní chirurgie</li><li><strong>Plížení a vloupání</strong> — stealth, překonávání zabezpečení, vloupání</li></ul><p><em>Technologie, Matrix a inteligence</em></p><ul><li><strong>Hacker (specialista na Matrix)</strong> — penetrační útoky, manipulace systému, sběr dat, přepis reality</li><li><strong>Vyznám se v technologiích</strong> — opravy, deaktivace zařízení, přehled o zbraních a systémech</li></ul><p><em>Společenské schopnosti</em></p><ul><li><strong>Pohyb ve společnosti</strong> — etiketa, diplomacie, manipulace, orientace mezi elitou</li><li><strong>Kouzlo šarmu</strong> — využití vzhledu a charismatu ke klamání, svádění, důvěře</li><li><strong>V podsvětí jako doma</strong> — kontakty, černý trh, kriminalita, neoficiální sítě</li></ul><p><em>Magie a nadpřirozené schopnosti</em></p><ul><li><strong>Magie vody / ohně / stínu…</strong> — elementární školy magie, specifické efekty</li><li><strong>Léčebná magie</strong> — obnova vitality, záchrana zraněných, neutralizace toxinů</li><li><strong>Intuice nebezpečí</strong> — smysl pro hrozby, předtuchy, zvláštní empatie</li></ul>",
    "quickRef": "Start 24 bodů (+1 / hra). Úrovně 1–5, ceny 1 / 3 / 6 / 10 / —. Max. úroveň dovednosti = počet aspektů. 3 aspekty zdarma, další po 6 bodech."
  },
  {
    "slug": "aspekty",
    "title": "Aspekty",
    "type": "Ostatní",
    "order": 2,
    "imageUrl": "/rulebook/aspekty.webp",
    "content": "<p><em>Krátké věty, které tě definují a ohýbají realitu hry. Nejdřív je nabij příběhem, pak vybij ve správnou chvíli.</em></p><h3>Co je aspekt?</h3><p>Aspekt je <strong>krátká věta</strong>, která vystihuje něco důležitého o tvé postavě. Je to nástroj, kterým se mění realita hry — může tě posílit, ale i ohrozit. Používá se při testech i ve vyprávění. Příklady:</p><ul><li>„Lovkyně reliktů z dob první magické války“</li><li>„V Matrixu jsem jako doma“</li><li>„Vnitřní hlas Urielova hněvu mě vede, ale kam?“</li></ul><h3>Nabíjení aspektu — příběh na prvním místě</h3><p>Než hráč aspekt použije (vybije), musí ho nejdřív <strong>nabít</strong> — dostat ho do hry způsobem, který přirozeně reaguje na události a vytváří zajímavé situace. Nabitý aspekt je takový, který:</p><ul><li>se projevil ve scéně (postava jedná podle svého přesvědčení, zažívá trauma, využívá kontakt),</li><li>má důsledky pro děj (spustí událost, ovlivní rozhodnutí, změní směr akce),</li><li>vytváří napětí nebo konflikt.</li></ul><p><strong>Dlouhodobý dopad závisí na přístupu.</strong> Čím víc hráč používá nabíjení pro příběh, tím mírnější a smysluplnější jsou důsledky. Kdo nabíjí aspekt jen pro mechanický zisk, může čekat tvrdší zásah.</p><ul><li><em>Hráč popíše, jak jeho postava pod tlakem ztrácí sebekontrolu kvůli „Síle Urielova hlasu“.</em> → PJ může přinést komplikaci, ale ne zničující — hráč pomohl příběhu.</li><li><em>Hráč bez kontextu řekne: „Aktivuju aspekt, ať si ho můžu vybít.“</em> → PJ má právo na tvrdou komplikaci (ztráta kontroly, zranění, ztráta důvěry).</li></ul><h3>Použití aspektů během hry</h3><p>Hráč může aktivovat jakýkoli aspekt (svůj nebo situace), pokud to dává smysl v příběhovém kontextu. PJ má být co nejvstřícnější, pokud to dává herní a narativní smysl. Při aktivaci máš 3 možnosti:</p><ul><li><strong>Získat nový hod</strong> — místo současného hodu hodíš znovu. Pozor: ztrácíš všechny jednorázové bonusy (např. +1 z runy). Hodí se, když je výsledek špatný.</li><li><strong>Upravit jednu kostku hodu</strong> (svého, cizího nebo CP): <code>–</code> na <code>+</code>, <code>+</code> na <code>–</code>, <code>0</code> na <code>+</code> nebo <code>–</code>.</li><li><strong>Upravit hod někoho jiného</strong> — snížit výsledek soupeře nebo pomoct spoluhráči. Lze reagovat i na situace, které tě přímo nezahrnují, pokud aspekt dává smysl.</li></ul><p><strong>Příklad: Kouzelník vs. démon.</strong> Kouzelník má aspekt „Dědic staré školy mágů“.</p><ul><li>Může jím démona rovnou porazit, pokud to PJ uzná jako hrdinský moment (PJ může požadovat popis, rituál nebo cenu).</li><li>Pokud démon hodil o kousek víc, kouzelník může zvýšit svůj hod, snížit hod démona, nebo ho donutit hodit znovu (čímž démon ztrácí předešlé výhody).</li></ul>"
  },
  {
    "slug": "body-osudu",
    "title": "Body osudu",
    "type": "Ostatní",
    "order": 3,
    "imageUrl": "/rulebook/body-osudu.webp",
    "content": "<p><em>Aspekt, který sis vysloužil hrou — odměna za výjimečné momenty, použitelná jako každý jiný aspekt.</em></p><h3>Co jsou body osudu?</h3><p><strong>Body osudu (BO)</strong> jsou zvláštní typ aspektu. Nevznikají při tvorbě postavy, ale <strong>v průběhu hry</strong> jako odměna za výjimečné momenty. Chovají se stejně jako běžné aspekty — ovlivní hod, zasáhnou do příběhu, pomohou spojenci. Zkrátka: <strong>BO = aspekt, který sis vysloužil hrou.</strong></p><h3>Jak hráč získá bod osudu?</h3><p>Hráč může získat <strong>1 bod osudu za sezení</strong>, a to od PJ nebo na návrh jiného hráče, za:</p><ul><li>vynikající roleplay,</li><li>klíčový nápad nebo zvrat ve hře,</li><li>emocionálně silnou nebo příběhově důležitou linku.</li></ul><p>Za jedno sezení získá hráč <strong>maximálně 1 BO</strong>.</p><h3>Co hráč s BO umí?</h3><p>Po nabité aktivaci můžeš za 1 BO:</p><ul><li><strong>Nový hod</strong> — přeházíš celý hod.</li><li><strong>Úprava jedné kostky</strong> — <code>–</code> na <code>+</code>, <code>+</code> na <code>–</code>, <code>0</code> na <code>+</code>/<code>–</code>.</li><li><strong>Zásah do výsledku jiného</strong> — změníš výsledek protivníka nebo pomůžeš spojenci.</li><li><strong>Odmítnutí negativního dopadu</strong> — zamezíš efektu PJ.</li><li><strong>Záskok za jiného hráče</strong> — zaplatíš BO za někoho jiného.</li></ul><h3>PJ a body osudu</h3><p>I PJ má vlastní body osudu — na každé sezení <strong>počet BO = počet hráčů + 1</strong>. Využije je k aktivaci komplikací z negativních aspektů hráčů, narušení vybitého aspektu, zrušení právě utraceného BO hráče, nebo k vynucení nového hodu (pokud to dává smysl). PJ je strážcem rovnováhy — jeho BO slouží k udržení dramatu a výzvy.</p>",
    "quickRef": "Max 1 BO za sezení. Za 1 BO: nový hod · úprava kostky · zásah do cizího hodu · odmítnutí dopadu PJ · záskok za jiného. PJ má BO = počet hráčů + 1."
  },
  {
    "slug": "sazky",
    "title": "Sázky",
    "type": "Ostatní",
    "order": 4,
    "imageUrl": "/rulebook/sazky.webp",
    "content": "<p><em>Každý hod, kde jde o něco. Vyber schopnost, která dává příběhový smysl, a přičti ji k FATE kostkám.</em></p><h3>Co je sázka?</h3><p><strong>Sázka</strong> je jakýkoli hod kostkami ve chvíli, kdy hrozí riziko nebo zisk. Sází se klasickými FATE kostkami (<code>+</code>, <code>–</code>, <code>0</code>) a k výsledku se přičítá hodnota schopnosti, kterou postava v situaci využívá. Hráč není omezen výběrem schopnosti — pokud dokáže logicky a příběhově vysvětlit, jak ji uplatňuje, může ji použít.</p><p>Sázky nejsou o tom „co je nejvýhodnější“, ale <strong>co dává smysl v příběhu postavy</strong>. <em>Příklad:</em> trojice prchá před pronásledovateli — svůdník přesvědčí náhodnou dívku, aby ho ukryla; kouzelník vytvoří portál domů; voják prostě uteče díky kondici. Stejný problém, jiné řešení podle specializace.</p><h3>Typy sázek</h3><p><strong>1. Pasivní sázka</strong></p><ul><li>Protihráč (prostředí, statická překážka) nehází.</li><li>PJ předem oznámí cílové číslo (např. „náročnost 4“).</li><li>Hráč se rozhodne, zda do sázky vstoupí, nebo hledá jiné řešení.</li><li>Na pasivní sázky nelze přímo pomáhat jinému hráči konkrétním číslem (ani magicky), ale PJ může přihlédnout k okolnostem a upravit náročnost v tichosti.</li></ul><p><strong>2. Aktivní sázka</strong></p><ul><li>Protihráč (hráč, CP nebo prostředí) také hází. Vyšší výsledek vyhrává.</li><li><em>Jednotlivá:</em> každý hází sám za sebe, výsledek se vztahuje jen na něj.</li><li><em>Skupinová:</em> všichni jednají společně se stejným cílem — hází vybraný hráč a PJ může snížit náročnost za dobrou spolupráci. Ideální pro společný útěk, rituály, hackování komplexního systému.</li></ul><p><strong>3. Plošný efekt</strong></p><ul><li>Zasáhne celé prostředí (výbuch granátu, hromadné kouzlo, EM impuls).</li><li>Háže se pasivní sázka na úspěšné použití efektu (např. hod granátem na cíl za 4).</li><li>Při úspěchu PJ určí účinek v oblasti (např. „všichni v dosahu utrpí 3 zranění“).</li><li>Postavy v oblasti reagují hodem na vlastní záchranu (únik, obrana, magie).</li></ul><h3>Remíza</h3><ul><li>Při remíze se hází znovu — jde o <strong>novou sázku</strong>.</li><li>Všechny jednorázové bonusy (runy, výbava…) se zneutralizují, jako by nebyly použity.</li><li>Hráč má právo navrhnout změnu sázky (nižší riziko, jiné podmínky).</li></ul><p><em>Příklad:</em> Kouzelník použije runu +1 a má šanci vyhrát. Nastane remíza → runu už nemůže použít. Oba se dohodnou na menším zranění (místo „3 za 3“ jen „1 za 1“). Kouzelník prohraje, ale místo rány do břicha dostane jen škrábanec do boku.</p>",
    "quickRef": "Pasivní (proti cílovému číslu, bez přímé pomoci) · Aktivní jednotlivá / skupinová (vyšší výsledek vyhrává) · Plošný efekt (zásah oblasti). Remíza = nový hod bez jednorázových bonusů."
  },
  {
    "slug": "iniciativa",
    "title": "Iniciativa",
    "type": "Ostatní",
    "order": 5,
    "imageUrl": "/rulebook/iniciativa.webp",
    "content": "<p><em>Kdo jedná první. Připravenost = nabité aspekty, takže iniciativa odměňuje toho, kdo žije příběhem.</em></p><p>Iniciativa určuje <strong>pořadí postav v akci</strong> — v boji, konfliktech, přestřelkách. Ve světě Projekt Ikaros je upravena tak, aby zohledňovala příběhovou připravenost postavy skrze nabití aspektů.</p><h3>Jak se určuje?</h3><p>Každá postava hodí <strong>4 FATE kostkami</strong> a přičte <strong>počet nabitých aspektů dělený dvěma, zaokrouhleno dolů</strong>:</p><blockquote><p><strong>Iniciativa = 4dF + (nabité aspekty / 2)</strong></p></blockquote><p>Čím víc aspektů jsi aktivně zapojil do děje, tím líp jsi připraven jednat.</p><h3>Stejný výsledek</h3><ul><li>Dva hráči se stejným výsledkem se můžou domluvit, kdo jde první.</li><li>Pokud se nedomluví, hodí spolu <strong>soustřel iniciativy</strong> — nový jednorázový hod.</li><li>Stejný výsledek hráče a CP (příšery) → soustřel hráč vs. CP.</li></ul><h3>Pozdržení tahu</h3><p>Hráč může svůj tah pozdržet (čeká na akci CP, chce zasáhnout později), maximálně do dalšího hodu iniciativy. Musí označit typ reakce:</p><ul><li><strong>Útok</strong> — chce způsobit zranění nebo ofenzivně zasáhnout.</li><li><strong>Obrana</strong> — chce reagovat na útok nebo se chránit. Reaguje na sázku protivníka, možnosti určuje PJ podle situace.</li><li><strong>Podpora</strong> — chce zvýšit/snížit hod jiným. Nemůže přímo udělovat ani chránit životy, slouží jen k ovlivnění výsledků.</li></ul><h3>PJ a iniciativa</h3><p>I PJ hází na iniciativu za nestvůry a CP. Každá bytost má předem určený bonus k iniciativě podle své nebezpečnosti.</p>",
    "quickRef": "Iniciativa = 4dF + (nabité aspekty / 2). Při shodě domluva, jinak soustřel."
  },
  {
    "slug": "uroven-sil",
    "title": "Úroveň sil",
    "type": "Ostatní",
    "order": 6,
    "imageUrl": "/rulebook/uroven-sil.webp",
    "content": "<p><em>Co postava na dané úrovni reálně zvládá — pět profesních žebříčků od talentu po entitu měnící realitu.</em></p><p>Stupnice schopností 1–7+ podle profesního zaměření. Popisuje, co postava na dané úrovni reálně zvládá.</p><h3>Mágové</h3><ul><li><strong>Intuitivní talent</strong> — cítí magii, ale neumí ji ovládat. Schopnosti se objevují nahodile, ve stresu nebo silných emocích. Nestabilní, ale občas překvapivě silné.</li><li><strong>Student magie</strong> — po základním výcviku. Ovládá jednoduchá kouzla, ochranné znaky, soustředění a základní rituály. Učí se pod dohledem mistra či na akademii.</li><li><strong>Kvalifikovaný mág</strong> — dokončený běžný výcvik. Bezpečně se pohybuje v magickém prostoru, ovládá jednu či více škol, vede základní rituály, porady a obrany.</li><li><strong>Bojový mág / člen JLA</strong> — kouzlí v boji i pod tlakem, kombinuje magii s taktikou, reaguje na protikouzla.</li><li><strong>Arcimág / mistr oboru</strong> — kouzlí bez gest a slov, modifikuje a tvoří kouzla. Autorita, učitel nebo výzkumník.</li><li><strong>Mimozemský mág / mág s genetickým přesahem</strong> — napojen na zdroje magické energie, mění směr a tok magie jiných.</li><li><strong>Démonická / akronská entita</strong> — není nositelem magie, ale její součástí. Jeho přítomnost mění realitu; vůle je zároveň kouzlem.</li></ul><h3>Vyjednávači</h3><ul><li><strong>Extrovert bez výcviku</strong> — dar řeči, přirozeně přesvědčivý, ale bez znalosti etikety, psychologie či taktického vlivu.</li><li><strong>Základní školení</strong> — ovládá diplomatický protokol, jednání s úřady, sílu ticha, načasování a tónu.</li><li><strong>Profesionál</strong> — rozliší motivace, odhalí lži, vede rozhovor do strategického výsledku, pracuje s davem i jednotlivcem.</li><li><strong>Agent / špion / vysoká diplomacie</strong> — ovládá kultury, manipulaci, vyjednávání na vysoké úrovni, krytí identity.</li><li><strong>Mistr vlivu</strong> — jedním slovem změní náladu v místnosti. Hluboká rétorika, psychologie, neverbální komunikace.</li><li><strong>Božská ikona</strong> — jedná s mimozemskými frakcemi, mění směřování civilizací.</li><li><strong>Božský hlas</strong> — každé slovo je čin; jeho promluva mění rovnováhu světa.</li></ul><h3>Vojáci</h3><ul><li><strong>Fyzicky zdatný civilista</strong> — silný, rychlý, instinkt přežití, ale bez taktiky a výcviku.</li><li><strong>Základní výcvik</strong> — pravidla přežití, základní střelba, pohyb ve formaci.</li><li><strong>Profesionální voják</strong> — vojenská struktura, taktické myšlení, boj v týmu, zkušenost z nasazení.</li><li><strong>Elitní jednotka / operátor</strong> — boj zblízka, infiltrace, improvizace pod tlakem, velení, boj proti nadpřirozenu.</li><li><strong>Válečný stratég / velitel mise</strong> — koordinuje více jednotek, adaptuje se, vede hybridní (techno-magické) operace.</li><li><strong>Bio-technologický supervoják / mimozemský válečník</strong> — propojení těla a technologie, napojené reflexy, boj na více frontách.</li><li><strong>Démon / Akronský bojovník</strong> — každá akce mění bojiště; přepisuje logiku války, nezastavitelný bez vyšší síly.</li></ul><h3>Technici</h3><ul><li><strong>Domácí kutil</strong> — technické myšlení, základní opravy, ale bez standardů a protokolů.</li><li><strong>Základní technický trénink</strong> — čte schémata, zapojí zařízení, spraví běžné závady, odpojí bezpečnostní systém.</li><li><strong>Plně kvalifikovaný technik</strong> — pokročilé opravy, modifikace, energetické toky, základní warpové principy, běžná mimozemská technologie.</li><li><strong>Elitní operátor / inženýr</strong> — vojenská a experimentální technika, integrace, přeprogramování bezpečnostních modulů.</li><li><strong>Projektový architekt</strong> — navrhuje zařízení, upravuje warpové systémy, pracuje na hranici poznání.</li><li><strong>Tvůrce realit / mimozemský inženýr</strong> — rozumí tomu, co ostatní vnímají jako kouzla; tvoří zařízení měnící okolí.</li><li><strong>Architekt existence / myslící technologie</strong> — stroje ovlivňující čas a zákony prostoru; technika je sama sobě vědomím.</li></ul><h3>Matrix</h3><ul><li><strong>Digitální nativ</strong> — intuitivně chápe Matrix, pohybuje se v otevřených systémech, ale neumí do chráněných struktur ani chápat kód.</li><li><strong>Základní školení uživatele</strong> — vstup přes běžná rozhraní, terminály, čtení datových toků, vyhnutí se pasivní ochraně, jednoduché zásahy.</li><li><strong>Certifikovaný operátor</strong> — řízený vstup, menší přepis dat, zásah do uzavřených systémů, masky a ochrana signatury, síťové souboje v reálném čase.</li><li><strong>Síťový infiltrátor / operátor OSSS</strong> — pohyb v Matrixu jako v realitě, vstup do chráněných protokolů, manipulace autonomních programů, Šedá zóna, maskování stopy.</li><li><strong>Programátor Šedé zóny</strong> — pracuje v nestabilních vrstvách, tvoří rozhraní a stabilní body, ovládá zákonitosti nižší vrstvy, kóduje nové oblasti či zbraně.</li><li><strong>Tvůrce platform mimozemského typu</strong> — architektura Matrixu na úrovni běžným lidem nesdělitelné; tvoří <strong>platformy</strong> propojené s realitou bez ztráty datové identity.</li><li><strong>Bytost narozená v Matrixu</strong> — Matrix je jeho domov; žádný rozdíl mezi tělem a kódem, přepisuje i zákony simulovaného času, interaguje s realitou skrze projekce.</li></ul>"
  },
  {
    "slug": "pretlak",
    "title": "Přetlak",
    "type": "Ostatní",
    "order": 7,
    "imageUrl": "/rulebook/pretlak.webp",
    "content": "<p><em>Cena za překročení limitů — mimořádný výkon teď, vedlejší účinky potom.</em></p><h3>Co je přetlak?</h3><p><strong>Přetlak</strong> je negativní efekt přetížení schopností — magie, techniky, fyzických výkonů či psychiky. Vzniká, když hráč překročí bezpečný výkon postavy a tlačí ji za její limity. Každý hráč má <strong>5 bodů přetlaku</strong>; po jejich naplnění se objevují nežádoucí vedlejší účinky.</p><h3>Co způsobí přetlak?</h3><ul><li>Vzniká při velmi vysokých výsledcích hodu (silná magie, nadlidský zásah, kombinace bonusů). Čím vyšší výsledek, tím větší přetlak.</li><li>Počítají se jen bonusy, které „jdou přes tělo“:<ul><li><strong>Počítá se:</strong> bonus ze schopnosti, perku, drog, implantátů, krystalů, fyzického zesílení nebo magického přetížení.</li><li><strong>Nepočítá se:</strong> výhoda z míření, taktická situace, pomoc od spojenců (sázka).</li></ul></li><li>Co započítat, rozhoduje vždy PJ podle situace a logiky příběhu.</li></ul><h3>Jak se přetlak počítá?</h3><p>Z výsledku, který se do přetlaku započítává:</p><ul><li>7 → +1 bod přetlaku</li><li>8 → +2 body</li><li>9 → +3 body</li><li>10 → +5 bodů</li><li>11 → +7 bodů</li><li>12 → +9 bodů</li><li>13 → +12 bodů</li></ul><p>Pokud hráč překročí 5 bodů, zbytek se přenáší do dalšího přetlaku (pokud PJ neurčí jinak). Hráč má právo vědomě si snížit svůj hod, aby přetlak omezil.</p><p><em>Příklad:</em> Ruský velitel střílí na démona a chce ho hned porazit. Schopnost +4, perk +3, droga +1, míření +2, sázka od spojence +2, kostky +1 → <strong>herní hod 13</strong>. Do přetlaku se počítá jen 4 + 3 + 1 + 1 = <strong>9</strong> → <strong>+3 body přetlaku</strong>. (Míření a sázka se do přetlaku nepočítají.)</p><h3>Co se stane při přetlaku?</h3><p>Jakmile postava dosáhne nebo překročí <strong>8 bodů přetlaku</strong>, PJ může okamžitě spustit negativní efekt (podobný zápornému aspektu), bez porady s hráčem — přetlak je automatický důsledek a vždy příběhově odůvodněný.</p><h3>Typy přetlaků</h3><p>Každý přetlak má typ podle použité schopnosti, léčí se samostatně a má specifické účinky:</p><ul><li><strong>Magický</strong> — halucinace, výboje, nepředvídatelná kouzla, narušení reality</li><li><strong>Technický</strong> — přehřátí přístrojů, výpadky Matrixu, ztráta spojení</li><li><strong>Bojový</strong> — křeče, vnitřní krvácení, selhání koordinace, ztráta dechu</li><li><strong>Diplomatický</strong> — paranoia, ztráta přesvědčivosti, jazyková zacyklenost, psychotické reakce</li></ul><h3>Léčení přetlaků</h3><ul><li>Každý typ se léčí odděleně.</li><li>Na <strong>1 bod</strong> je potřeba <strong>2 dny</strong> léčení, každý další bod <strong>1 den navíc</strong>.</li><li><em>Příklad:</em> 2 body magického (2 + 1 = 3 dny) + 1 bod technického (2 dny) = <strong>5 dní</strong> odpočinku. Zranění nebo další přetlak během léčení proces přeruší či zkomplikuje.</li></ul>",
    "quickRef": "Kapacita 5 bodů; negativní efekt může PJ spustit od 8 bodů. Z hodu do přetlaku: 7→+1, 8→+2, 9→+3, 10→+5, 11→+7, 12→+9, 13→+12. Léčení: 2 dny na 1. bod, +1 den na každý další."
  },
  {
    "slug": "unava",
    "title": "Únava",
    "type": "Ostatní",
    "order": 8,
    "imageUrl": "/rulebook/unava.webp",
    "content": "<p><em>Vyčerpání těla i mysli — čím hlubší stupeň, tím tvrdší postih, až po kolaps.</em></p><h3>Co je únava?</h3><p><strong>Únava</strong> je fyzické, psychické nebo magické vyčerpání postavy — během boje, kouzlení, stresu nebo dlouhého nasazení. Každý hráč má <strong>20 bodů únavy</strong> ve čtyřech stupních.</p><h3>Stupně únavy a jejich efekt</h3><ul><li><strong>1. stupeň</strong> (0–5 bodů) — žádný postih</li><li><strong>2. stupeň</strong> (6–10 bodů) — −1 ke všem hodům</li><li><strong>3. stupeň</strong> (11–15 bodů) — −2 ke všem hodům</li><li><strong>4. stupeň</strong> (16–20 bodů) — omdlení (bezvědomí)</li></ul><p>Při překročení 20 bodů postava <strong>umírá na selhání organismu</strong> (pokud PJ neurčí jinak).</p><h3>Jak únava vzniká?</h3><ul><li>náročný fyzický výkon (běh, boj, těžká výstroj),</li><li>opakované nebo extrémní kouzlení,</li><li>zásah do přetlaku,</li><li>psychické vypětí (výslech, ztráta blízkého),</li><li>dlouhodobé nasazení bez odpočinku.</li></ul><p>Výši únavy určuje PJ podle kontextu a intenzity akce.</p><h3>Léčení únavy</h3><ul><li><strong>Kvalitní spánek (6–8 h)</strong> → +2 body</li><li><strong>Klidový den (bez náročné činnosti)</strong> → +1 až +5 bodů (obvykle +3)</li></ul><p>Únava se neléčí automaticky. PJ může upravit efektivitu odpočinku podle prostředí (bojová zóna = méně bodů).</p><p><em>Příklad:</em> Mág bojuje, sešle 3 kouzla, běží a je zasažen → +2 (kouzla) +2 (aktivita) +2 (zásah) = 6 bodů → 2. stupeň (−1). Po 8 h spánku v bezpečí +2 → klesne na 4 body → zpět na 1. stupeň bez postihu.</p><h3>Efekty na hře</h3><ul><li><strong>2. stupeň</strong> — postava je znatelně zpomalená, ztrácí jistotu, unaví se rychleji.</li><li><strong>3. stupeň</strong> — vše je těžké, kouzla hrozí selháním, tělo bolí.</li><li><strong>4. stupeň</strong> — bez vědomí; pokud zůstane při smyslech, jen díky výjimečné vůli.</li><li><strong>Nad 20 bodů</strong> — selhání srdce, vyčerpání duše, kolaps.</li></ul>",
    "quickRef": "20 bodů / 4 stupně: 0–5 bez postihu · 6–10 (−1) · 11–15 (−2) · 16–20 omdlení · nad 20 smrt. Spánek 6–8 h +2, klidový den +1 až +5 (obvykle +3)."
  },
  {
    "slug": "leceni-a-zraneni",
    "title": "Léčení a zranění",
    "type": "Ostatní",
    "order": 9,
    "imageUrl": "/rulebook/leceni-a-zraneni.webp",
    "content": "<p><em>Kolik vydržíš a jak se dáš dohromady — pět životů, tři tíže zranění, čas a magie jako léčitelé.</em></p><h3>Životy</h3><p>Každá postava má <strong>5 životů</strong>. Po ztrátě všech pěti <strong>umírá</strong> — pokud se neodehraje výjimečný příběhový zásah (rituál, Matrix, magie, oběť jiného hráče).</p><h3>Typy zranění</h3><ul><li><strong>Lehké</strong> — ztráta <strong>1 život</strong>; např. škrábnutí, vyražený dech, naražené žebro. Bez herního postihu, vyléčí se rychle nebo po ošetření.</li><li><strong>Střední</strong> — ztráta <strong>2–3 životy</strong>; např. rozseknuté stehno, otřes mozku, zlomená žebra. <strong>−1 ke všem hodům.</strong> Vyžaduje ošetření a několik dní klidu.</li><li><strong>Těžké</strong> — ztráta <strong>4 životy</strong>; např. proražené plíce, vážné popáleniny, rozervané svaly. <strong>−2 ke všem hodům.</strong> Léčí se týdny až měsíce, může být trvalé.</li></ul><h3>Sčítání zranění</h3><p>Zranění se sčítají — víc lehkých může vytvořit těžší zranění příběhově i mechanicky. <em>Příklad:</em> dvě naražená žebra (2×1 život) → −2 životy → mechanicky stále dvě lehká zranění (postih −1), ale příběhově ze žebra je <em>zlomené žebro</em> (střední efekt). Léčení ale zůstává lehčí, protože každé zranění vzniklo zvlášť — místo jednoho dlouhého hojení mohou stačit dvě ošetření.</p><h3>Bonusové životy</h3><p>Odečítají se jako první a chrání postavu před běžným zraněním:</p><ul><li><strong>Neprůstřelná vesta</strong> — +1 život proti střelbě</li><li><strong>Ochranná runa</strong> — +1 život proti magii nebo výbuchu</li><li><strong>Drogy / implantáty</strong> — +1 dočasně (často za cenu přetlaku), nebo jen ruší postihy</li></ul><p>Bonusové životy se neobnovují automaticky — potřebují aktivaci, dobíjení, rituál nebo výměnu.</p><h3>Léčení zranění</h3><p>Běžné léčení:</p><ul><li><strong>Lehké</strong> — do několika hodin nebo jedné scény</li><li><strong>Střední</strong> — několik dní, vyžaduje klid a pomoc</li><li><strong>Těžké</strong> — týdny až měsíce, možné trvalé následky</li></ul><p>Sčítaná zranění (např. dvě lehká) se léčí jednotlivě, často snadněji než stejné zranění vzniklé naráz.</p><p>Magické léčení — řídí se [pravidly léčebné magie](/lecebna-magie). Umí urychlit hojení, zastavit krvácení nebo odstranit zranění okamžitě. <strong>Magicky léčit lze jednou za 48 h.</strong></p>",
    "quickRef": "5 životů. Lehké −1 život (bez postihu) · Střední −2/3 (−1 k hodům) · Těžké −4 (−2 k hodům). Bonusové životy se odečítají první. Magické léčení 1× za 48 h."
  }
];
