/**
 * 2.3c — Orientační text pravidel pro stránku „Pravidla", seedovaný podle
 * `world.system` při založení světa.
 *
 * Zdroj: rychly_soupis_pravidel_rpg.pdf (zadání PJ). Jde o parafrázovaný
 * tahák, ne opis pravidel. Obsah je HTML (TipTap), jen povolené tagy
 * (viz sanitize-rich-text.ts: h2, p, ul, li, strong, blockquote …).
 *
 * `matrix` ZÁMĚRNĚ chybí — vlastní text dodá uživatel později. Matrix
 * (default systém), `vlastni` i neznámý systém tak dostanou prázdná Pravidla.
 *
 * Viz spec: Projekt-ikaros-FE/docs/arch/phase-2/spec-2.3c-system-rules-seed.md
 */

interface RulesSpec {
  /** Úvodní odstavec — vysvětlení systému jednou až dvěma větami. */
  intro: string;
  /** Kostky / mechaniky. */
  kostky: string;
  /** Základní hod / jádro systému (odrážky). */
  jadro: string[];
  /** Stavba postavy (odrážky). */
  postava: string[];
  /** Konflikt a souboj (odrážky). */
  konflikt: string[];
  /** Na co si dát u stolu pozor. */
  hlidat: string;
}

const DISCLAIMER =
  'Toto je rychlý orientační tahák, ne plná pravidla. U starších českých ' +
  'systémů se detaily liší podle edice a domácích úprav. Text je tvůj ' +
  'startovní bod — uprav ho podle libosti.';

function list(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

function buildRules(r: RulesSpec): string {
  return [
    `<p>${r.intro}</p>`,
    '<h2>Kostky</h2>',
    `<p>${r.kostky}</p>`,
    '<h2>Základní hod</h2>',
    list(r.jadro),
    '<h2>Postava</h2>',
    list(r.postava),
    '<h2>Konflikt a souboj</h2>',
    list(r.konflikt),
    '<h2>Co hlídat u stolu</h2>',
    `<p>${r.hlidat}</p>`,
    `<blockquote>${DISCLAIMER}</blockquote>`,
  ].join('');
}

const SPECS: Record<string, RulesSpec> = {
  dnd5e: {
    intro:
      'Heroická fantasy na d20 systému. Hráč řekne, co dělá; PJ určí, jestli je ' +
      'potřeba hod. Hodí se k20, přičtou se bonusy a výsledek rozhodne, zda akce ' +
      'projde. Dobré pro družinovou fantasy, taktické souboje a vývoj postav.',
    kostky:
      '1× k20 pro většinu testů; k4/k6/k8/k10/k12 pro zranění a efekty; ' +
      '2× k10 pro procenta.',
    jadro: [
      'Když je výsledek nejistý: 1k20 + opravný bonus vlastnosti + případná zdatnost.',
      'Výsledek se porovnává s obtížností (DC), zbrojí (AC) nebo hodem protivníka. Vyšší je lepší.',
      'Výhoda/nevýhoda: hází se 2k20 a bere se lepší/horší výsledek.',
    ],
    postava: [
      'Původ/druh, povolání, zázemí, šest vlastností, zdatnosti, výbava a schopnosti povolání.',
      'Postavy rostou po úrovních — nové schopnosti, kouzla, více životů, vyšší zdatnost.',
    ],
    konflikt: [
      'Souboj běží v kolech; každá postava má tah: pohyb, akci, případně bonusovou akci a reakci.',
      'Útok je 1k20 proti AC. Kouzla používají útok kouzlem nebo záchranný hod cíle.',
      'Životy ukazují odolnost; na 0 životech se řeší bezvědomí a hody na smrt.',
    ],
    hlidat:
      'Hlídej akční ekonomiku, kouzla, výhodu/nevýhodu, obtížnosti DC a rovnováhu střetnutí.',
  },

  jad: {
    intro:
      'Česká, s D&D 5e kompatibilní fantasy na d20 systému. Pro hráče se ' +
      'vysvětluje stejně jako 5e: popis akce, hod k20, bonusy, porovnání s cílem. ' +
      'Rozdíl je hlavně v českém zpracování, příkladech a dostupnosti.',
    kostky:
      'Stejná základní sada jako D&D 5e: k4, k6, k8, k10, k12, k20 a 2× k10 pro procenta.',
    jadro: [
      'Jádro je 5e kompatibilní: 1k20 + opravy proti obtížnosti, AC nebo soupeři.',
      'Výhoda/nevýhoda funguje jako hod 2k20 s výběrem lepšího/horšího výsledku.',
      'Pravidla jsou psaná česky a víc vysvětlují vedení hry, žánry a domácí úpravy.',
    ],
    postava: [
      'Původ, povolání, zázemí, vlastnosti, zdatnosti, vybavení a schopnosti.',
      'Vývoj je úrovňový; povolání definuje hlavní roli postavy ve hře.',
    ],
    konflikt: [
      'Souboj se řeší po iniciativě v kolech a tazích.',
      'Důležité jsou akce, pohyb, reakce, bonusové akce, životy, zbroj a záchranné hody.',
      'Kouzla a zvláštní schopnosti používají stejné d20 jádro.',
    ],
    hlidat:
      'Hlídej kompatibilitu s 5e, pokud mícháš materiály z D&D a JaD — ne každá ' +
      'domácí úprava musí mechanicky sedět.',
  },

  'draci-hlidka': {
    intro:
      'Česká dobrodružná fantasy ve starším stylu. Řekni, co děláš, PJ určí ' +
      'pravidlový postup, hod rozhodne výsledek a postava postupně sílí. Vhodná ' +
      'pro klasické výpravy, podzemí, nestvůry a hrdinskou fantasy.',
    kostky:
      'Používá k10 a k6. Pro hru stačí 1× k10 a 1× k6; pohodlnější je víc k6.',
    jadro: [
      'Hráč popíše záměr, PJ určí postup, obtížnost a případné výhody/nevýhody situace.',
      'Mechanika stojí na jednoduchém ověřování činností a rychlém rozhodování u stolu.',
      'Klasický model: družina, dobrodružství, nebezpečí, povolání, výbava, postupné zlepšování.',
    ],
    postava: [
      'Rasa/původ, povolání, vlastnosti, vybavení a schopnosti daného archetypu.',
      'Jasné role v družině: bojovník, kouzelník, hraničář, zloděj a podobné fantasy typy.',
    ],
    konflikt: [
      'Souboj je přímější než v těžkých taktických systémech, ale pořád rozlišuje útok, obranu, zranění, výbavu a schopnosti.',
      'PJ má výraznou roli při nastavování situace, nebezpečí a následků.',
      'Kostky rozhodují nejistotu; popis a úsudek PJ zůstávají velmi důležité.',
    ],
    hlidat:
      'Hlídej jasné vysvětlení situací před hodem. U nováčků měj po ruce přehled ' +
      'povolání a bojových možností.',
  },

  drd16: {
    intro:
      'Klasické české old-school fantasy s více různými mechanikami. Hráči ' +
      'prozkoumávají svět, sbírají zkušenosti, rostou po úrovních a často se ' +
      'opírají o rozhodnutí PJ. Není to jednotný moderní systém — počítej s ' +
      'tabulkami a old-school stylem.',
    kostky: 'k6, k10 a procentové kostky k100 (obvykle 2× k10).',
    jadro: [
      'Nepoužívá jednu jednotnou mechaniku — různé situace se řeší různými druhy hodů.',
      'Boj, pasti, zlodějské schopnosti, kouzla a zvláštní situace mají vlastní tabulky a postupy.',
      'PJ má silnou rozhodovací roli a vyhodnocuje situace podle kontextu.',
    ],
    postava: [
      'Rasa, povolání, vlastnosti, životy, zkušenosti, úroveň a vybavení.',
      'Povolání se výrazně liší: kouzelníci řeší magenergii, zloději procentové schopnosti, bojovníci bojové hodnoty.',
    ],
    konflikt: [
      'Starší tabulkový model: útok, obrana, zbroj, životy, zranění a konkrétní čísla z pravidel.',
      'Nebezpečí mimo boj často přes hody proti pasti nebo procentové ověřování.',
      'Smrtelnost a náhodnost jsou vyšší než v modernějších hrdinských systémech.',
    ],
    hlidat:
      'Hlídej konkrétní edici a tabulky — bez pravidel po ruce se hra rychle ' +
      'rozpadne na odhady.',
  },

  'drd-plus': {
    intro:
      'Detailnější česká fantasy s důrazem na povolání a pravidlovou hloubku. ' +
      'Vhodné pro hráče, kteří chtějí českou fantasy, ale snesou víc čísel a ' +
      'samostatné subsystémy. Oproti DrD 1.6 propracovanější, ale náročnější ' +
      'na čtení a vedení.',
    kostky: 'Hlavně k6, prakticky 2× k6.',
    jadro: [
      'Mechanicky podrobnější než původní DrD, víc specifických pravidel pro jednotlivé oblasti hry.',
      'Základní vyhodnocování: šestistěnné kostky, bonusy, postihy a pravidlově určené postupy.',
      'Důležité je znát konkrétní subsystém, který právě používáš.',
    ],
    postava: [
      'Vlastnosti, rasa, povolání, schopnosti, vybavení a postupný vývoj.',
      'Povolání mají odlišnou strukturu a vlastní pravidla — některá přímější, jiná dovednostní nebo magická.',
    ],
    konflikt: [
      'Souboj je robustnější a počítá s víc čísly, výbavou a konkrétními pravidlovými následky.',
      'Odměňuje hráče, kteří chtějí znát svou postavu mechanicky do hloubky.',
      'PJ by měl situace dobře připravit — improvizace bez znalosti pravidel zpomaluje.',
    ],
    hlidat:
      'Hlídej tempo hry. Před začátkem vyber, které části pravidel bude družina ' +
      'opravdu používat.',
  },

  drd2: {
    intro:
      'Příběhovější fantasy o ceně úspěchu, zdrojích a ohrožení. Kostky neurčují ' +
      'jen výhru/prohru, ale cenu za výsledek — postava může uspět, i když hod ' +
      'nevyjde, ale musí za to zaplatit zdroji nebo přijmout následky.',
    kostky: '2× k6, občas 3× k6.',
    jadro: [
      'Hráč popíše záměr a použije vhodnou dovednost/povolání; hází 2k6 a přičte odpovídající hodnotu.',
      'Klíčová otázka není jen „uspěl jsi?", ale i „kolik tě to stálo?".',
      'Neúspěch lze často odvrátit vyčerpáním — zaplacením zdrojů postavy.',
    ],
    postava: [
      'Vzniká kombinací povolání, dovedností, charakteristik a zdrojů.',
      'Vývoj není jen o vyšších číslech, ale o širších možnostech a přístupu k dalším povoláním.',
    ],
    konflikt: [
      'Pracuje s ohrožením, zdroji, následky a možností zaplatit cenu za odvrácení špatného výsledku.',
      'Souboj není jen výměna ran — důležitý je popis cíle, získávání výhody a tlačení protivníka do horší situace.',
      'Podporuje dramatické rozhodování a dohody u stolu.',
    ],
    hlidat:
      'Hlídej, aby hráči chápali vyčerpání, ohrožení a vyjednávání výsledků — ' +
      'bez toho může hra působit nejasně.',
  },

  gurps: {
    intro:
      'Univerzální simulační systém s bodovou tvorbou postavy. Základ je ' +
      'jednoduchý: hoď 3k6 pod své číslo. Složitost vzniká tím, kolik volitelných ' +
      'pravidel zapneš. Vhodné pro PJ, který chce přesně modelovat svět.',
    kostky: '3× k6 pro většinu testů; další k6 pro zranění podle situace.',
    jadro: [
      'Základní test: hoď 3k6 a snaž se hodit stejně nebo méně než cílová hodnota schopnosti.',
      'Nižší výsledek je lepší; rozdíl mezi cílem a hodem určuje míru úspěchu nebo neúspěchu.',
      'Obtížnost se řeší modifikátory — GURPS umí být jednoduchý i velmi detailní.',
    ],
    postava: [
      'Tvoří se za body: vlastnosti, výhody, nevýhody, dovednosti, vybavení a zvláštní schopnosti.',
      'Není vázaný na jeden žánr — stejné jádro pro fantasy, sci-fi, historii i horor.',
    ],
    konflikt: [
      'Souboj může být velmi taktický: manévry, aktivní obrany, zásahové lokace, zbroj, zranění, únava a kryt.',
      'Útok obvykle vyžaduje úspěšný hod útočníka a možnost obrany cíle.',
      'Zranění může být tvrdé a realistické, pokud se použijí detailnější moduly.',
    ],
    hlidat:
      'Hlídej rozsah pravidel — na začátek použij jen GURPS Lite nebo úzký výběr modulů.',
  },

  shadowrun: {
    intro:
      'Cyberpunk s magií, dice-pool z k6, heisty a vysoká komplexita. Hra o ' +
      'profesionálech na špinavou práci ve světě megakorporací, magie a Matrixu. ' +
      'Vezmeš hromadu k6, spočítáš pětky a šestky a porovnáš úspěchy.',
    kostky: 'Větší množství k6. Minimum 12× k6, pohodlně 20× k6 pro hráče.',
    jadro: [
      'Hráč vytvoří dice pool (obvykle vlastnost + dovednost + úpravy) a hodí tolik k6.',
      'Každá 5 nebo 6 je úspěch/hit; výsledek se porovnává s prahem nebo úspěchy protivníka.',
      'Hodně jedniček může vyvolat glitch (komplikaci); Edge umožňuje upravovat hody a získávat výhodu.',
    ],
    postava: [
      'Specialisté: street samurai, mág, decker, rigger, face, adept a další archetypy.',
      'Důležité jsou atributy, dovednosti, výbava, augmentace, magie, kontakty a životní styl.',
    ],
    konflikt: [
      'Rozlišuje fyzický svět, Matrix, magii, střelbu, boj zblízka, drony a sociální manipulaci.',
      'Mise pracují s krytem, vybavením, překvapením, bezpečností, alarmy a následky mimo boj.',
      'Úspěch stojí na přípravě akce, informacích a plánování, ne jen na palbě.',
    ],
    hlidat:
      'Hlídej rozsah subsystémů. Nováčkům dej jednoduchou misi, předpřipravené ' +
      'postavy a omez hacking/magii na základní volby.',
  },

  pi: {
    intro:
      'Česká vyprávěcí hra ve viktoriánském magickém světě na základu Fate/Fudge. ' +
      'Hráči popíší akci, hodí 4 Fate kostkami, přičtou dovednost a pomocí aspektů ' +
      'dělají scénu osobnější a dramatičtější.',
    kostky:
      '4× Fate/Fudge kostka. Alternativně 4× k6 čtené jako minus / nula / plus.',
    jadro: [
      'Hráč hází 4 Fate kostkami, sečte výsledek od −4 do +4 a přičte dovednost nebo vhodnou hodnotu.',
      'Výsledek se porovnává s obtížností nebo proti hodu soupeře.',
      'Aspekty a body osudu umožňují ovlivňovat fikci, přidávat bonusy a přijímat komplikace.',
    ],
    postava: [
      'Definována hlavně aspekty, dovednostmi, vztahy, problémy a příběhovým ukotvením.',
      'Čísla jsou důležitá, ale největší váhu mají formulace aspektů a jejich zapojení do děje.',
    ],
    konflikt: [
      'Konflikty mohou být sociální, fyzické i magické — nejde jen o zranění, ale o tlak, následky a proměnu situace.',
      'Stres a následky určují, kolik tlaku postava vydrží.',
      'Vítězství často znamená získat vypravěčskou pozici, ne jen někoho porazit.',
    ],
    hlidat:
      'Hlídej, aby aspekty nebyly prázdná dekorace — každý aspekt by měl jít ' +
      'využít i zkomplikovat.',
  },

  'call-of-cthulhu': {
    intro:
      'Hororové vyšetřování na procentovém roll-under systému. Máš procenta u ' +
      'dovedností, hodíš pod své číslo a snažíš se přežít pravdu. Nehraje se na ' +
      'vítězství nad monstrem, ale na zjištění, co se děje, a na cenu, kterou za ' +
      'to zaplatíš.',
    kostky: '2× k10 pro k100; dále k4, k6, k8 a k20 podle zranění a efektů.',
    jadro: [
      'Většina testů je procentový hod: hoď k100 a snaž se hodit stejně nebo méně než hodnota dovednosti.',
      'Obtížnost má úrovně: běžný úspěch, těžký úspěch (pod polovinou), extrémní úspěch (pod pětinou).',
      'Pushed roll dovolí riskovat druhý pokus, ale neúspěch má horší následky.',
    ],
    postava: [
      'Vyšetřovatelé, ne superhrdinové: vlastnosti, povolání, dovednosti, zázemí a příčetnost.',
      'Vývoj je pomalejší — vychází ze zkušenosti, přežití a používání dovedností.',
    ],
    konflikt: [
      'Souboj je nebezpečný a často špatná volba; zbraně, zranění a šílenství mohou postavu rychle vyřadit.',
      'Klíčová je atmosféra, stopy, vyšetřování, tlak času a postupné odhalování pravdy.',
      'SAN testy ukazují psychický rozpad při kontaktu s hrůzou.',
    ],
    hlidat:
      'Hlídej tón hororu — příliš mnoho boje udělá ze hry akční systém, na který ' +
      'Call of Cthulhu není primárně stavěné.',
  },

  fate: {
    intro:
      'Univerzální vyprávěcí systém s aspekty a body osudu. Hra o dramatických ' +
      'postavách: řekni, co děláš, hoď 4 Fate kostkami, přičti dovednost a využij ' +
      'aspekty, když chceš scénu zlomit ve svůj prospěch. Komplikace nejsou chyba ' +
      '— jsou palivo příběhu.',
    kostky: '4× Fate/Fudge kostka. Výsledek hodu je od −4 do +4.',
    jadro: [
      'Hod: 4 Fate kostky + dovednost/přístup proti obtížnosti nebo proti soupeři.',
      'Čtyři základní akce: překonat překážku, vytvořit výhodu, zaútočit, bránit se.',
      'Aspekty jsou pravdivé výroky o postavě, scéně nebo světě; lze je vyvolávat za body osudu.',
    ],
    postava: [
      'Koncept, problém, další aspekty, dovednosti nebo přístupy, stres a následky.',
      'Silná postava není o vysokém čísle, ale o dobře napsaných aspektech, které vstupují do hry.',
    ],
    konflikt: [
      'Konflikty mohou být fyzické, mentální i sociální — důležité je, o co ve scéně jde.',
      'Stres pohlcuje krátkodobý tlak; následky jsou vážnější zranění, traumata nebo komplikace.',
      'Vytváření výhod je často důležitější než přímý útok.',
    ],
    hlidat:
      'Hlídej ekonomiku bodů osudu — hra funguje nejlíp, když hráči aspekty nejen ' +
      'využívají, ale i přijímají jejich komplikace.',
  },
};

/**
 * systemId → HTML obsah stránky „Pravidla". `matrix` chybí záměrně (viz hlavička).
 */
export const SYSTEM_RULES_TEMPLATES: Record<string, string> =
  Object.fromEntries(
    Object.entries(SPECS).map(([id, spec]) => [id, buildRules(spec)]),
  );
