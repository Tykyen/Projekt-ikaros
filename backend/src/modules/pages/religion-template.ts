/**
 * 2.3g — Univerzální škála role náboženství (BÚ 0–14) + typy náboženství +
 * osnova „co u náboženství vyřešit" pro seedovanou stránku „Náboženství".
 * Stejná škála pro všechny světy; konkrétní roli a typy volí PJ ve formu tvorby.
 *
 * Dolní půle škály = sociální vliv (sekulární → teokracie), horní = reálná
 * přítomnost božského (prokázané zázraky → chodící bohové).
 *
 * Zdroj: rešerše worldbuildingu náboženství (Inkwell Ideas, World Anvil,
 * De Gruyter „5 modelů stát–náboženství", D&D divine rank, religionistická
 * typologie). Obsah je HTML (TipTap), jen povolené tagy — žádné `<table>`
 * (viewer běží bez table extension).
 *
 * Viz spec: Projekt-ikaros-FE/docs/arch/phase-2/spec-2.3g-religion-seed.md
 */

interface ReligionLevel {
  level: number;
  name: string;
  /** Jádro úrovně — co je v této době/světě běžné. */
  core: string;
}

export const RELIGION_LEVELS: ReligionLevel[] = [
  {
    level: 0,
    name: 'Bez náboženství / militantní ateismus',
    core: 'víra je popřená nebo státem potlačená; bohové jsou neznámí, odmítaní nebo považovaní za pověru.',
  },
  {
    level: 1,
    name: 'Sekulární',
    core: 'víra je osobní věc oddělená od státu; instituce jsou slabé a nezasahují do veřejného života.',
  },
  {
    level: 2,
    name: 'Pověra a folklor',
    core: 'víra žije jako zvyky, znamení, pověry a prokletá místa; žádná organizovaná církev.',
  },
  {
    level: 3,
    name: 'Animismus / kult předků',
    core: 'duchové, předci a posvátná místa; slouží šamani a stařešinové, uctívání je lokální a rodové.',
  },
  {
    level: 4,
    name: 'Lidový polyteismus',
    core: 'mnoho bohů, chrámy a kněží, ale volná organizace; víra je tolerantní a bez centrální doktríny.',
  },
  {
    level: 5,
    name: 'Městské / státní kulty',
    core: 'organizované chrámy provázané s obcí a státem; veřejné svátky a občanské náboženství.',
  },
  {
    level: 6,
    name: 'Organizovaná církev',
    core: 'hierarchie, doktrína, písmo a majetek; církev ovlivňuje vzdělání, právo a morálku.',
  },
  {
    level: 7,
    name: 'Mocná církev',
    core: 'církev je mocenský hráč vedle panovníka; náboženská morálka prostupuje zákony a politiku.',
  },
  {
    level: 8,
    name: 'Státní náboženství',
    core: 'jediná oficiální víra; ostatní jsou trpěné, omezované nebo pronásledované.',
  },
  {
    level: 9,
    name: 'Teokratické prvky',
    core: 'kněžstvo přímo spravuje část moci; boží zákon splývá se světským zákonem.',
  },
  {
    level: 10,
    name: 'Teokracie',
    core: 'stát řízený církví; nejvyšší autorita je náboženská, kněžstvo vládne.',
  },
  {
    level: 11,
    name: 'Prokázané zázraky',
    core: 'božský zásah je pozorovatelný (léčení, znamení, věštby); víra je ověřený fakt, ne otázka.',
  },
  {
    level: 12,
    name: 'Přítomní poslové',
    core: 'andělé, avataři, svatí či proroci chodí světem a mluví za bohy; božské se dá potkat.',
  },
  {
    level: 13,
    name: 'Chodící bohové',
    core: 'božstva fyzicky zasahují do dějin; války bohů se vedou přes smrtelníky a mění mapy světa.',
  },
  {
    level: 14,
    name: 'Živá božská realita',
    core: 'hranice mezi smrtelníky a bohy mizí; bohové vládnou přímo a realita je jejich vůlí.',
  },
];

/** Doporučené typy náboženství (zatrhávací chipy ve formu tvorby). */
export const RELIGION_TYPES: string[] = [
  'Monoteismus',
  'Polyteismus',
  'Henoteismus',
  'Dualismus',
  'Panteismus',
  'Animismus',
  'Kult předků',
  'Kult přírody',
  'Šamanismus',
  'Mystika',
  'Kult smrti',
  'Vládní / císařský kult',
  'Non-teismus (filozofie)',
  'Temné kulty',
];

/** Osnova „co u náboženství vyřešit" — hlavní hodnota stránky. */
const CHECKLIST: Array<[string, string]> = [
  [
    'Panteon a domény',
    'kolik bohů (jeden, panteon, nikdo), co spravují (válka, láska, smrt, úroda…), jejich hierarchie a povahy.',
  ],
  [
    'Stvořitelský mýtus',
    'jak podle víry vznikl svět, lidé a bohové — a jak podle ní jednou skončí.',
  ],
  [
    'Kněžstvo a hierarchie',
    'kdo slouží bohům (kněz, mnich, prorok, věštec), jak se člení a jak se úřad získává (povolání, rituál, rod).',
  ],
  [
    'Chrámy a svatá místa',
    'kde se uctívá, poutní místa, kdo smí dovnitř a jak vypadá posvátný prostor.',
  ],
  [
    'Rituály a obřady',
    'jak vypadá modlitba a oběť; obřady životních přechodů — narození, dospělost, svatba, pohřeb.',
  ],
  [
    'Svátky a posvátný kalendář',
    'kdy se slaví, půst a svaté dny (napojení na kalendář světa); co se o svátcích smí a nesmí.',
  ],
  [
    'Písmo a nauka',
    'jak se víra předává (kniha, ústní tradice, píseň, umění) a jestli je přístupná všem, nebo jen zasvěceným.',
  ],
  [
    'Morálka, přikázání a hřích',
    'co víra káže a zakazuje, co je ctnost a co hřích, jak se hřích odčiňuje a trestá.',
  ],
  [
    'Posmrtný život a pohřby',
    'co čeká po smrti (odměna, trest, převtělení, nic) a jak vypadají pohřební a smuteční zvyky.',
  ],
  [
    'Vztah k magii',
    'je magie posvátná, kacířská, nebo neutrální? Kdo se přou o moc — kněží, nebo mágové?',
  ],
  [
    'Tolerance, hereze a schizma',
    'jak spolu vycházejí různé víry; co je kacířství, jak vznikají sekty a kdy se vede svatá válka.',
  ],
  [
    'Relikvie, symboly a ikonografie',
    'posvátné předměty, znaky, barvy, oděv a gesta, podle nichž víru poznáš na první pohled.',
  ],
  [
    'Tabu',
    'co je nečisté nebo zakázané — jídlo, činy, slova, čísla, dny, místa.',
  ],
  [
    'Církev a světská moc',
    'vládne církev, radí panovníkovi, soupeří s ním, nebo je mu podřízená?',
  ],
  [
    'Misie a konverze',
    'šíří se víra aktivně? Existuje vůbec konverze, nebo se do víry jen rodí? Jak se hledí na nevěřící?',
  ],
];

/** Příklady kombinací role náboženství × magie × technologie. */
const COMBINATIONS: string[] = [
  '<strong>Ateistický kyberpunk (TÚ 9 / MÚ 1 / role 0):</strong> víru vytlačily korporace a věda; přežívají jen okrajové kulty na periferii.',
  '<strong>Klasická vysoká fantasy (TÚ 4 / MÚ 8 / role 6):</strong> mocná církev, panteon bohů, kněží konají prokázané zázraky.',
  '<strong>Teokracie s reálnými bohy (TÚ 3 / MÚ 12 / role 13):</strong> bohové chodí světem a kněžstvo vládne jejich jménem — mytologický starověk.',
  '<strong>Animistický kmenový svět (TÚ 1 / MÚ 2 / role 3):</strong> duchové a předci, šamani jako prostředníci, žádná centrální církev.',
  '<strong>Moderní kosmický horor (TÚ 8 / MÚ 1 / role 2):</strong> sekulární svět navenek, ale za oponou skryté kulty a lhostejná božstva.',
  '<strong>Steampunk s dominantní církví (TÚ 6 / MÚ 3 / role 8):</strong> státní víra reguluje pokrok i okultismus, věda se hlásí do zpovědnice.',
  '<strong>Post-teokracie (TÚ 5 / MÚ 6 / role 10→7):</strong> kdysi bohové mlčeli a nastal rozkol; církev ztrácí moc a hledá vinu.',
];

const DISCLAIMER =
  'Toto je orientační worldbuilding nástroj, ne pravidlový strop ani teologie. ' +
  'Náboženství je samostatná osa vedle magie a technologie. Uprav, doplň nebo ' +
  'smaž podle libosti — je to tvůj startovní bod pro víru ve světě.';

function nameOf(level: number): string {
  return (
    RELIGION_LEVELS.find((r) => r.level === level)?.name ?? `úroveň ${level}`
  );
}

/** Zvýrazněný blok „Náboženství tohoto světa" — jen když je něco zvoleno. */
function worldReligion(influence?: number | null, types?: string[]): string {
  const hasInfluence = influence != null;
  const hasTypes = !!types && types.length > 0;
  if (!hasInfluence && !hasTypes) return '';
  const parts: string[] = [];
  if (hasInfluence) {
    parts.push(
      `Role náboženství: <strong>${influence} — ${nameOf(influence)}</strong>.`,
    );
  }
  if (hasTypes) {
    parts.push(`Typy náboženství: <strong>${types.join(', ')}</strong>.`);
  }
  return (
    '<h2>Náboženství tohoto světa</h2>' +
    `<p>${parts.join(' ')} Uprav podle libosti — můžeš popsat i výjimky ` +
    '(kacířské kulty, cizí víry, mrtvé bohy), které do hlavního obrazu nepatří.</p>'
  );
}

const HOW_TO =
  '<h2>Jak škálu používat</h2>' +
  '<p>Role náboženství říká, jak silně víra prostupuje společnost a jak reálně ' +
  'je božské přítomné. Dolní půle škály popisuje <strong>společenský vliv</strong> ' +
  '(od sekulárního světa po teokracii), horní půle <strong>skutečnou přítomnost ' +
  'božského</strong> (od prokázaných zázraků po chodící bohy).</p>' +
  '<p>Rozlišuj čtyři vrstvy: role <strong>světa</strong>, <strong>regionu / ' +
  'frakce</strong>, <strong>postavy</strong> a <strong>konkrétního kultu</strong>. ' +
  'Sekulární říše může mít fanatický pohraniční řád; teokracie svého tajného ateistu.</p>' +
  '<p>Role je hlavní osa, <strong>typy náboženství</strong> jsou druhá informace. ' +
  'Dva světy se stejnou rolí 6 mohou fungovat úplně jinak — monoteistická církev ' +
  's jedním bohem vs. polyteistický panteon s desítkami domén.</p>';

function levelsList(): string {
  const items = RELIGION_LEVELS.map(
    (r) => `<li><strong>${r.level} — ${r.name}:</strong> ${r.core}</li>`,
  ).join('');
  return `<h2>Přehled rolí náboženství (0–14)</h2><ul>${items}</ul>`;
}

function checklist(): string {
  const items = CHECKLIST.map(
    ([title, body]) => `<li><strong>${title}:</strong> ${body}</li>`,
  ).join('');
  return (
    '<h2>Co u náboženství vyřešit</h2>' +
    '<p>Osnova, kterou si projdi, když stavíš víru světa. Nemusíš vyplnit vše — ' +
    'začni tím, co je pro tvůj příběh důležité, zbytek doplníš za hry.</p>' +
    `<ul>${items}</ul>`
  );
}

function typesList(): string {
  const items = RELIGION_TYPES.map((t) => `<li>${t}</li>`).join('');
  return (
    '<h2>Typy náboženství</h2>' +
    '<p>Svět může kombinovat víc typů zároveň (např. státní monoteismus + lidový ' +
    'animismus na venkově):</p>' +
    `<ul>${items}</ul>`
  );
}

function combinations(): string {
  const items = COMBINATIONS.map((c) => `<li>${c}</li>`).join('');
  return (
    '<h2>Jak kombinovat náboženství, magii a technologii</h2>' +
    '<p>Role náboženství, magická úroveň (MÚ) a technologická úroveň (TÚ) jsou ' +
    'samostatné osy. Teprve jejich kombinace vystihne žánr světa:</p>' +
    `<ul>${items}</ul>`
  );
}

/**
 * Sestaví HTML stránky „Náboženství". `influence` (role 0–14) a `types`
 * (zvolené typy) jsou volitelné — když chybí, vynechá se blok „Náboženství
 * tohoto světa".
 */
export function buildReligionPage(
  influence?: number | null,
  types?: string[],
): string {
  return [
    '<p>Tahle stránka ti dává univerzální škálu role náboženství pro ' +
      'worldbuilding — od bezvěreckého světa po realitu, kde bohové chodí ' +
      'mezi lidmi — a osnovu toho, co si u víry světa promyslet.</p>',
    worldReligion(influence, types),
    HOW_TO,
    levelsList(),
    checklist(),
    typesList(),
    combinations(),
    `<blockquote>${DISCLAIMER}</blockquote>`,
  ]
    .filter(Boolean)
    .join('');
}
