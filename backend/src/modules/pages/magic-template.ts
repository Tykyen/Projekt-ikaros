/**
 * 2.3e — Univerzální škála magie (MÚ 0–14) + doplňkové štítky pro seedovanou
 * stránku „Magický systém". Stejná škála pro všechny světy; konkrétní tradice
 * magie zatrhá PJ ve formu tvorby.
 *
 * Zdroj: univerzalni_skala_magie_rpg.pdf (zadání PJ). Obsah je HTML (TipTap),
 * jen povolené tagy — žádné `<table>` (viewer běží bez table extension).
 *
 * Viz spec: Projekt-ikaros-FE/docs/arch/phase-2/spec-2.3e-magic-seed.md
 */

interface MagicLevel {
  level: number;
  name: string;
  core: string;
}

export const MAGIC_LEVELS: MagicLevel[] = [
  {
    level: 0,
    name: 'Bez magie / sporná magie',
    core: 'magie není potvrzená; existují pověry, víra, sny, náhody nebo podvody, ale žádná jistota.',
  },
  {
    level: 1,
    name: 'Pověrná / znamení',
    core: 'náznaky, znamení, prokletá místa, věštby a sny; nikdo magii neovládá jako řemeslo.',
  },
  {
    level: 2,
    name: 'Rituální / šamanská',
    core: 'skutečná, ale skrze rituály, duchy, předky, tabu, oběti, posvátná místa a výjimečné osoby.',
  },
  {
    level: 3,
    name: 'Zasvěcenecká / skrytá',
    core: 'potvrzená, ale skrytá; ovládají ji tajné řády, čarodějnice, zasvěcení kněží a okultisté.',
  },
  {
    level: 4,
    name: 'Lidová / praktická',
    core: 'známá a používaná, ale omezená; léčitelé, věštci, kletby a drobné očarované předměty.',
  },
  {
    level: 5,
    name: 'Učená / akademická',
    core: 'školy, knihy, mistři, zkoušky, cechy a teorie; dá se studovat, zapisovat a předávat.',
  },
  {
    level: 6,
    name: 'Dvorská / válečná',
    core: 'nástroj moci; slouží šlechtě, armádám, církvím, rodům a elitním jednotkám.',
  },
  {
    level: 7,
    name: 'Institucionální / regulovaná',
    core: 'spravují ji zákony, úřady, licence, církevní kontrola, akademie a státní dohled.',
  },
  {
    level: 8,
    name: 'Civilizační',
    core: 'jeden ze základů civilizace; ovlivňuje dopravu, medicínu, zemědělství, obranu a ekonomiku.',
  },
  {
    level: 9,
    name: 'Magokratická / vysoká magie',
    core: 'hlavní pilíř moci; vládnou mágové, vílí dvory, dračí dynastie a čarodějné elity.',
  },
  {
    level: 10,
    name: 'Dimenzionální',
    core: 'běžně pracuje s jinými světy, říšemi duchů, démony, vílami, astrálem a portály.',
  },
  {
    level: 11,
    name: 'Planetární / osudová',
    core: 'mění krajiny, národy, počasí, dějiny, krevní linie a osud celých civilizací.',
  },
  {
    level: 12,
    name: 'Kosmická / božská',
    core: 'zasahuje hvězdy, sféry, bohy, pradávné entity, časové proudy a kosmický řád.',
  },
  {
    level: 13,
    name: 'Mytická / přepis reality',
    core: 'mění pravidla světa; přepisuje paměť, zákony smrti, dějiny a logiku reality.',
  },
  {
    level: 14,
    name: 'Transcendentní / absolutní',
    core: 'na hranici božství; existence, neexistence, čas, stvoření, zánik a struktura reality.',
  },
];

/** Doporučené tradice magie (zatrhávací typy ve formu tvorby). */
export const MAGIC_TRADITIONS: string[] = [
  'Vílí',
  'Božská',
  'Šamanská',
  'Runová',
  'Akademická',
  'Krevní',
  'Démonická',
  'Nekromantická',
  'Psionická',
  'Přírodní',
  'Kosmická',
  'Snová',
  'Alchymická',
];

const COMBINATIONS: string[] = [
  '<strong>TÚ 4 / MÚ 2:</strong> středověký svět se šamany a posvátnými lesy — magie duchovní a lokální.',
  '<strong>TÚ 4 / MÚ 8:</strong> klasická vysoká fantasy — hradní společnost, ale civilizace stojí na magii.',
  '<strong>TÚ 6 / MÚ 3:</strong> viktoriánský okultismus — pára navenek, tajné řády pod povrchem.',
  '<strong>TÚ 8 / MÚ 1:</strong> moderní horor — současná technika, ale nadpřirozeno je nejisté a děsivé.',
  '<strong>TÚ 9 / MÚ 7:</strong> urban fantasy / cyberpunk s regulovanou magií — stát či korporace sledují nadané.',
  '<strong>TÚ 12 / MÚ 10:</strong> sci-fantasy — lodě a portály, démonické sféry nebo psionické dimenze.',
  '<strong>TÚ 3 / MÚ 12:</strong> mytologický starověk, kde bohové skutečně kráčejí světem.',
];

const DISCLAIMER =
  'Toto je orientační worldbuilding nástroj, ne pravidlový strop. Magie je ' +
  'samostatná osa vedle technologie. Uprav, doplň nebo smaž podle libosti — ' +
  'je to tvůj startovní bod pro magický systém světa.';

/** Zvolené tradice — jen když nějaké jsou. */
function worldTraditions(traditions?: string[]): string {
  if (!traditions || traditions.length === 0) return '';
  return (
    '<h2>Magie tohoto světa</h2>' +
    `<p>Tradice magie: <strong>${traditions.join(', ')}</strong>. ` +
    'Uprav podle libosti — můžeš doplnit cenu, kontrolu a dostupnost magie ' +
    '(viz doplňkové štítky níže).</p>'
  );
}

const HOW_TO =
  '<h2>Jak škálu používat</h2>' +
  '<p>Magická úroveň (MÚ) říká, jak hluboko je magie zabudovaná do reality a ' +
  'společnosti — jak je běžná, účinná a civilizačně důležitá. Neurčuje typ ' +
  'magie ani její morálku.</p>' +
  '<p>Rozlišuj čtyři vrstvy: MÚ <strong>světa</strong>, MÚ <strong>regionu / ' +
  'frakce</strong>, MÚ <strong>postavy</strong> a MÚ <strong>artefaktu</strong>. ' +
  'Nízká MÚ světa nevylučuje jediný prastarý chrám s MÚ 11; vysoká MÚ vílího ' +
  'dvora neznamená, že každý sedlák umí kouzlit.</p>' +
  '<p>MÚ je hlavní osa, <strong>tradice magie</strong> je druhá informace. Dva ' +
  'světy s MÚ 8 mohou fungovat úplně jinak — akademická magie se školami vs. ' +
  'vílí smluvní magie založená na jménech a slibech.</p>';

const PER_CHARACTER =
  '<h2>Rychlé pravidlo pro postavy</h2>' +
  '<p>Běžná postava má přístup k magii na úrovni své kultury, rodu nebo frakce. ' +
  'Chudá, cizí, izolovaná nebo nemagická postava může být o 1–4 úrovně níže. ' +
  'Kněz, mág, vílí rytíř, člen tajného řádu nebo vyvolený může mít o 1–2 úrovně ' +
  'výše ve své specializaci. Magie o 3+ úrovní vyšší než MÚ světa není běžný ' +
  'nákup — má jít o relikvii, pakt, prastaré jméno, božský zásah nebo cenu, ' +
  'která mění rovnováhu kampaně.</p>';

function levelsList(): string {
  const items = MAGIC_LEVELS.map(
    (m) => `<li><strong>MÚ ${m.level} — ${m.name}:</strong> ${m.core}</li>`,
  ).join('');
  return `<h2>Přehled úrovní (MÚ 0–14)</h2><ul>${items}</ul>`;
}

function combinations(): string {
  const items = COMBINATIONS.map((c) => `<li>${c}</li>`).join('');
  return (
    '<h2>Jak kombinovat magii a technologii</h2>' +
    '<p>Technologická úroveň (TÚ) a magická úroveň (MÚ) jsou samostatné osy. ' +
    'Teprve jejich kombinace vystihne žánr světa:</p>' +
    `<ul>${items}</ul>`
  );
}

const TAGS =
  '<h2>Doplňkové štítky magie</h2>' +
  '<p>Po výběru tradic je vhodné doplnit, jak magie působí u stolu:</p>' +
  '<ul>' +
  `<li><strong>Tradice:</strong> ${MAGIC_TRADITIONS.join(', ')}.</li>` +
  '<li><strong>Cena magie:</strong> únava, čas, krev, oběť, paměť, jméno, dluh, příčetnost, korupce, společenský zákaz, riziko selhání.</li>' +
  '<li><strong>Kontrola:</strong> nikdo, rody, církev, akademie, stát, cechy, korporace, nadpřirozené bytosti, tajné řády.</li>' +
  '<li><strong>Dostupnost pro postavy:</strong> nikdo, vyvolení, kněží, mágové, šlechta, vojáci, běžní obyvatelé, monstra, artefakty.</li>' +
  '</ul>';

/**
 * Sestaví HTML stránky „Magický systém". `traditions` (zvolené ve formu) jsou
 * volitelné — když chybí, vynechá se sekce „Magie tohoto světa".
 */
export function buildMagicPage(traditions?: string[]): string {
  return [
    '<p>Tahle stránka ti dává univerzální škálu přítomnosti magie pro ' +
      'worldbuilding — od pověr po transcendentní magii.</p>',
    worldTraditions(traditions),
    HOW_TO,
    PER_CHARACTER,
    levelsList(),
    combinations(),
    TAGS,
    `<blockquote>${DISCLAIMER}</blockquote>`,
  ]
    .filter(Boolean)
    .join('');
}
