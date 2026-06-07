/**
 * 2.3d — Univerzální škála technologie (TÚ 0–14) pro seedovanou stránku
 * „Technologie". Na rozdíl od pravidel NENÍ per-systém — stejná škála pro
 * všechny světy. Rozsah TÚ tohoto světa volí PJ ve formu tvorby.
 *
 * Zdroj: univerzalni_skala_technologie_rpg.pdf (zadání PJ). Obsah je HTML
 * (TipTap), jen povolené tagy — žádné `<table>` (viewer běží bez table extension).
 *
 * Viz spec: Projekt-ikaros-FE/docs/arch/phase-2/spec-2.3d-technology-seed.md
 */

interface TechLevel {
  level: number;
  name: string;
  /** Jádro úrovně — co je v této době běžné. */
  core: string;
}

export const TECH_LEVELS: TechLevel[] = [
  {
    level: 0,
    name: 'Prvotní / předtechnická',
    core: 'bez ustáleného řemesla, písma a dlouhodobé výroby; lovecko-sběračské kmeny, kámen, dřevo, oheň.',
  },
  {
    level: 1,
    name: 'Kmenová / neolitická',
    core: 'usedlejší život, zemědělství, domestikace, keramika, tkaní a první trvalejší osady.',
  },
  {
    level: 2,
    name: 'Bronzová / dávnověká',
    core: 'první města, bronzové zbraně, organizované kněžstvo, písmo, obchodní stezky a monumentální stavby.',
  },
  {
    level: 3,
    name: 'Železná / antická',
    core: 'rozšířené železo, organizované armády, silnice, lodě, města, zákony a inženýrské stavby.',
  },
  {
    level: 4,
    name: 'Středověká / feudální',
    core: 'rytíři, hrady, cechy, ocelové zbraně, kuše, mlýny a řemeslná města.',
  },
  {
    level: 5,
    name: 'Renesanční / raný střelný prach',
    core: 'knihtisk, přesnější mapy, navigace, arkebuzy, muškety, děla a alchymie jako řemeslo.',
  },
  {
    level: 6,
    name: 'Parní / raně průmyslová',
    core: 'parní stroje, železnice, továrny, masová výroba, telegraf a revolvery.',
  },
  {
    level: 7,
    name: 'Elektrická / dieselová',
    core: 'elektřina, rádio, spalovací motory, automobily, letadla, tanky, kulomety a film.',
  },
  {
    level: 8,
    name: 'Moderní / digitální',
    core: 'počítače, internet, satelity, chytré telefony, jaderná energie, drony a moderní medicína.',
  },
  {
    level: 9,
    name: 'Kyberpunková / blízká budoucnost',
    core: 'běžné implantáty, rozšířená realita, pokročilá AI, korporátní dohled, genetické zásahy a autonomní drony.',
  },
  {
    level: 10,
    name: 'Pokročilá planetární sci-fi',
    core: 'fúzní energie, nanotechnologie, pokročilá robotika, mechy, orbitální ekonomika a vyspělá medicína.',
  },
  {
    level: 11,
    name: 'Meziplanetární',
    core: 'základny na měsících a planetách, těžba asteroidů, flotily bez nadsvětelného pohonu a kosmické habitaty.',
  },
  {
    level: 12,
    name: 'Mezihvězdná',
    core: 'nadsvětelný / skokový pohon, mezihvězdné cestování, energetické štíty, lasery a plazmové zbraně.',
  },
  {
    level: 13,
    name: 'Galaktická / postnedostatková',
    core: 'masová terraformace, replikace hmoty, prodlužování života, přesun vědomí a stavba umělých světů.',
  },
  {
    level: 14,
    name: 'Transcendentní / božská technologie',
    core: 'technologie nerozeznatelná od magie — manipulace časem, dimenzemi, realitou, vědomím a zákony fyziky.',
  },
];

const DISCLAIMER =
  'Toto je orientační worldbuilding nástroj, ne historická periodizace ani ' +
  'pravidlový strop. Uprav, doplň nebo smaž podle libosti — je to tvůj ' +
  'startovní bod pro práci s technologiemi světa.';

function nameOf(level: number): string {
  return TECH_LEVELS.find((t) => t.level === level)?.name ?? `TÚ ${level}`;
}

/** Zvýrazněný řádek „Tento svět" — jen když je rozsah zadán. */
function worldBand(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return '';
  const lo = min ?? max!;
  const hi = max ?? min!;
  const body =
    lo === hi
      ? `běžně <strong>TÚ ${lo}</strong> (${nameOf(lo)})`
      : `běžně <strong>TÚ ${lo}–${hi}</strong> (${nameOf(lo)} až ${nameOf(hi)})`;
  return (
    '<h2>Tento svět</h2>' +
    `<p>Technologická úroveň tohoto světa: ${body}. ` +
    'Uprav podle libosti — můžeš popsat i výjimky (relikvie, prototypy, ' +
    'cizí nálezy), které do běžného pásma nepatří.</p>'
  );
}

const HOW_TO =
  '<h2>Jak škálu používat</h2>' +
  '<p>Technologická úroveň (TÚ) říká, jaká technika je ve světě běžná, co je ' +
  'výsadou elit a co musí být vzácný artefakt. Neurčuje hodnotu ani morálku ' +
  'civilizace — je to herní pomůcka.</p>' +
  '<p>Rozlišuj čtyři vrstvy: TÚ <strong>světa</strong>, TÚ <strong>regionu / ' +
  'frakce</strong>, TÚ <strong>postavy</strong> a TÚ <strong>jednotlivého ' +
  'artefaktu</strong>. Středověký svět může mít izolovanou říši s parními ' +
  'stroji nebo prastarou věž s kosmickou technologií.</p>' +
  '<p>Magii, psioniku a božské zázraky veď jako <strong>samostatnou osu</strong>, ' +
  'ne jako technologii. Temný vílí dvůr může mít materiální TÚ 4, ale magickou ' +
  'úroveň mnohem vyšší.</p>';

const PER_CHARACTER =
  '<h2>Rychlé pravidlo pro postavy</h2>' +
  '<p>Běžná postava má výbavu na úrovni svého původu nebo frakce. Chudá, ' +
  'izolovaná nebo tradiční postava může mít vybavení o 1–3 úrovně níže. Voják, ' +
  'šlechtic, mág, tajná služba, korporace nebo řád může mít ve své specializaci ' +
  'o 1–2 úrovně výše. Vybavení o 3+ úrovní výše by nemělo být běžný nákup — má ' +
  'jít o relikvii, prototyp, cizí nález nebo odměnu, která mění rovnováhu kampaně.</p>';

function levelsList(): string {
  const items = TECH_LEVELS.map(
    (t) => `<li><strong>TÚ ${t.level} — ${t.name}:</strong> ${t.core}</li>`,
  ).join('');
  return `<h2>Přehled úrovní (TÚ 0–14)</h2><ul>${items}</ul>`;
}

const UNEVEN =
  '<h2>Nerovnoměrný vývoj</h2>' +
  '<p>Jedna říše může mít TÚ 4 na venkově, TÚ 5 v hlavním městě, TÚ 6 v tajných ' +
  'dílnách a jediný artefakt na TÚ 12. Urči <strong>normu</strong> (co si běžný ' +
  'člověk koupí) a <strong>výjimky</strong> (co má jen šlechta, církev, armáda, ' +
  'prastarý řád, cizinci nebo magická elita). Vybavení postavy pak není jen ' +
  'číslo, ale i sociální informace: kdo jí dovolil takovou věc vlastnit.</p>';

const EXAMPLES =
  '<h2>Příklad zápisu</h2><ul>' +
  '<li><strong>Temný vílí svět (TÚ 4, vysoká magie):</strong> běžné — meče, ' +
  'zbroje, hrady, dvory, rituální řemesla; výjimka — vílí relikvie, trůn, živé zbroje.</li>' +
  '<li><strong>Steampunkové impérium (TÚ 6):</strong> běžné — pára, železnice, ' +
  'továrny, revolvery; výjimka — automatoni, éterické lodě, okultní stroje.</li>' +
  '<li><strong>Moderní horor (TÚ 8):</strong> běžné — mobily, auta, internet, ' +
  'policie, nemocnice; výjimka — tajné vládní laboratoře, mimozemská zařízení.</li>' +
  '<li><strong>Cyberpunková metropole (TÚ 9):</strong> běžné — implantáty, AR, ' +
  'korporace, drony; výjimka — experimentální AI, vojenský prototyp, černý kyberware.</li>' +
  '<li><strong>Galaktická říše (TÚ 12):</strong> běžné — lodě, štíty, lasery, ' +
  'androidi; výjimka — artefakty prastaré rasy, časové brány.</li>' +
  '</ul>';

/**
 * Sestaví HTML stránky „Technologie". `min`/`max` (rozsah TÚ světa) jsou
 * volitelné — když chybí, vynechá se sekce „Tento svět".
 */
export function buildTechnologyPage(
  min?: number | null,
  max?: number | null,
): string {
  return [
    '<p>Tahle stránka ti dává univerzální škálu technologické vyspělosti pro ' +
      'worldbuilding — od pravěku po transcendentní sci-fi.</p>',
    worldBand(min, max),
    HOW_TO,
    PER_CHARACTER,
    levelsList(),
    UNEVEN,
    EXAMPLES,
    `<blockquote>${DISCLAIMER}</blockquote>`,
  ]
    .filter(Boolean)
    .join('');
}
