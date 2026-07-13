/**
 * 21.5d — Seed komunitních hádanek (48 ks, 4 úrovně) — jen volné látky
 * (lidová slovesnost, antika, bible, logický folklór ve vlastní formulaci).
 * Zdroj/kurátorský soupis: Projekt-ikaros-FE/docs/arch/phase-21/hadanky-seed-21.5d.md
 *
 * Vloží community hádanky (status approved, autor Superadmin) do kolekce
 * `riddles`. Idempotence: dle `question` + `scope:'community'` — re-run
 * přeskočí existující. Vzor: scripts/seed-plants.
 *
 * Spuštění (cwd = backend):
 *   npx ts-node scripts/seed-riddles/index.ts --dry-run
 *   npx ts-node scripts/seed-riddles/index.ts             (ostrý)
 * Pro PROD: $env:MONGODB_URI = "<PROD>" před ostrým během (jinak localhost).
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' }); // tajné override (gitignored) — sem patří PROD MONGODB_URI
dotenv.config(); // .env (dev default; nepřepíše již nastavené z .env.local)

const DRY = process.argv.includes('--dry-run');
const AUTHOR_EMAIL = 'tykytanjunior@gmail.com';

type Diff = 'lehka' | 'stredni' | 'tezka' | 'ultratezka';
interface RiddleSrc {
  question: string;
  answer: string;
  hints?: string[];
  difficulty: Diff;
  origin?: string;
  description?: string;
}

const RIDDLES: RiddleSrc[] = [
  // ── LEHKÉ (12) ──
  { difficulty: 'lehka', origin: 'lidová', question: 'Zubů plnou hubu má, a přece nikdy nekouše.', answer: 'hřeben', hints: ['Najdeš ho u zrcadla.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Sedí pán na střeše a kouří, i když si nikdy nekřesal.', answer: 'komín', hints: ['Kouří hlavně v zimě.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Roste hlavou dolů; v zimě se rodí, na slunci umírá.', answer: 'rampouch', hints: ['Visí ze střechy.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Přiběhl k nám bílý kůň, zalehl nám celý dvůr.', answer: 'sníh', hints: ['Přijde bez pozvání a roztaje bez rozloučení.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Krk má, ale hlavu ne.', answer: 'láhev', hints: ['Drží se za něj při pití.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Oko má, ale nevidí.', answer: 'jehla', hints: ['Prochází jím nit.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Čtyři nohy má, a přece nikam nedojde.', answer: 'stůl', hints: ['Stojí uprostřed světnice.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Pořád chodí, a nikdy nikam nedojde.', answer: 'hodiny', hints: ['Chodí i v noci, slyšíš je tikat.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Vede nahoru i dolů, a samo se nehne z místa.', answer: 'schodiště', hints: ['Šlapeš po něm.'] },
  { difficulty: 'lehka', origin: 'lidová (chyták)', question: 'Oči jako kočka, ocas jako kočka, mňouká jako kočka — a kočka to není.', answer: 'kocour', hints: ['Je to skoro kočka.'] },
  { difficulty: 'lehka', origin: 'lidová (slovní hříčka)', question: 'Která rána létá?', answer: 'vrána', hints: ['Přidej na začátek jedno písmeno.'] },
  { difficulty: 'lehka', origin: 'lidová', question: 'Celý den jí a jí, a pořád má hlad; když se napije, umře.', answer: 'oheň', hints: ['Krmíš ho dřevem.'] },
  // ── STŘEDNÍ (14) ──
  { difficulty: 'stredni', origin: 'antika — Sfinga', question: 'Ráno chodí po čtyřech, v poledne po dvou a večer po třech. Co je to?', answer: 'člověk (dítě leze, dospělý chodí, stařec s holí)', hints: ['Ráno, poledne a večer je celý život.'], description: 'Nejslavnější hádanka historie — Sfinga ji dávala poutníkům u Théb, rozluštil ji Oidipús.' },
  { difficulty: 'stredni', origin: 'lidová', question: 'Dvě matky mají každá pět synů — a všech deset se narodilo naráz.', answer: 'ruce a prsty', hints: ['Nosíš je pořád s sebou.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'Bez oken, bez dveří — a komora plná zrní.', answer: 'makovice', hints: ['Roste na poli, zrní je drobounké.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'Čím víc z ní bereš, tím je větší.', answer: 'jáma', hints: ['Ber lopatou.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'Běží kolem celé zahrady, a přece se ani nepohne.', answer: 'plot', hints: ['Běží jen očima.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'Čtyři bratři stojí pod jedním kloboukem.', answer: 'nohy stolu (deska je klobouk)', hints: ['Bratři se nikdy nerozejdou.'] },
  { difficulty: 'stredni', origin: 'folklór 19. stol.', question: 'Objede celý svět, a přitom pořád sedí v koutě.', answer: 'poštovní známka', hints: ['Cestuje nalepená.'] },
  { difficulty: 'stredni', origin: 'folklór', question: 'Čím víc suší, tím víc mokne.', answer: 'ručník', hints: ['Suší tebe, ne sebe.'] },
  { difficulty: 'stredni', origin: 'folklór', question: 'Má města bez domů, lesy bez stromů a řeky bez vody.', answer: 'mapa', hints: ['Celý svět na jednom stole.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'V noci se po nebi pase stádo bílých ovcí a hlídá je zlatý beran.', answer: 'hvězdy a měsíc', hints: ['Ve dne se stádo schová.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'Tělo ani kosti nemá, a přece tě za slunce všude doprovází.', answer: 'stín', hints: ['V poledne je nejmenší.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'Beze rtů mluví, bez uší slyší; ozve se, jen když na ni zavoláš.', answer: 'ozvěna', hints: ['Bydlí ve skalách a v lese.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'Soudek bez obruček a jsou v něm dvě vína — bílé a žluté.', answer: 'vejce', hints: ['Soudek se rozbije jen jednou.'] },
  { difficulty: 'stredni', origin: 'lidová', question: 'V noci se narodí, a než slunce vystoupá, zemře.', answer: 'rosa', hints: ['Najdeš ji ráno v trávě.'] },
  // ── TĚŽKÉ (14) ──
  { difficulty: 'tezka', origin: 'folklór', question: 'Kdo to vyrábí, nepotřebuje to. Kdo to kupuje, pro sebe to nekoupí. A kdo to užívá, ten o tom neví.', answer: 'rakev', hints: ['Vyrábí ji truhlář.'] },
  { difficulty: 'tezka', origin: 'folklór', question: 'Zmizí ve chvíli, kdy ho vyslovíš jménem.', answer: 'ticho', hints: ['Je ho plná noc.'] },
  { difficulty: 'tezka', origin: 'folklór', question: 'Pořád přichází, a nikdy nepřijde.', answer: 'zítřek', hints: ['Až přijde, změní jméno.'] },
  { difficulty: 'tezka', origin: 'folklór', question: 'Je tvoje, ale ostatní ho užívají mnohem víc než ty.', answer: 'tvoje jméno', hints: ['Dostal jsi ho darem hned na začátku života.'] },
  { difficulty: 'tezka', origin: 'lidová', question: 'Oheň ho nespálí, voda ho neutopí; do trávy padá — a nezašustí.', answer: 'stín', hints: ['Nic neváží.'] },
  { difficulty: 'tezka', origin: 'lidová', question: 'V lese vyrostlo, listím šumělo; teď v krčmě zpívá, až se stoly třesou.', answer: 'housle', hints: ['Zpívá, jen když se ho dotkneš žíněmi.'] },
  { difficulty: 'tezka', origin: 'lidová', question: 'Celý život kráčí hlavou dolů, a přesto věrně slouží.', answer: 'hřebík v podkově', hints: ['Slouží koni i jezdci.'] },
  { difficulty: 'tezka', origin: 'logický folklór', question: 'Dva strážci u dvou bran: jeden vždy lže, druhý vždy mluví pravdu — a ty nevíš který. Jedna brána vede k pokladu, druhá do zkázy. Smíš položit jedinou otázku jednomu z nich. Jakou?', answer: '„Na kterou bránu by mě poslal ten druhý?" — a jdi opačnou', hints: ['Zapoj do otázky i toho, koho se neptáš.', 'Lhář i pravdomluvný ti ukážou stejnou (špatnou) bránu.'] },
  { difficulty: 'tezka', origin: 'Alcuin, 8. století', question: 'Převozník má na břehu vlka, kozu a hlávku zelí; do loďky se mu vejde jen jedno. Bez dozoru vlk sežere kozu a koza zelí. Jak všechno převeze?', answer: 'kozu tam · zpět sám · vlka tam · kozu zpět · zelí tam · zpět sám · kozu tam', hints: ['Něco musí vozit i zpátky.'] },
  { difficulty: 'tezka', origin: 'folklór', question: 'Zlomí se, i když se ho nikdo ani nedotkne.', answer: 'slib', hints: ['Láme se slovy.'] },
  { difficulty: 'tezka', origin: 'lidová', question: 'Otec se ještě nenarodil, a syn už běhá po střeše.', answer: 'oheň a kouř (kouř stoupá dřív, než vyšlehne plamen)', hints: ['Syn je z dálky vidět dřív než otec.'] },
  { difficulty: 'tezka', origin: 'antická tradice', question: 'Jsem černé dítě ohnivého otce; křídla nemám, a přesto stoupám k oblakům.', answer: 'kouř', hints: ['Rodí se v každém ohništi.'] },
  { difficulty: 'tezka', origin: 'středověká', question: 'Bílé pole, černé símě; kdo je umí zasít, toho hlas se nese přes hory i staletí.', answer: 'papír a písmo', hints: ['Sít se učí ve škole.'] },
  { difficulty: 'tezka', origin: 'folklór', question: 'Je pořád před tebou, a přesto ji nikdy neuvidíš.', answer: 'budoucnost', hints: ['Každým krokem do ní vcházíš.'] },
  // ── ULTRATĚŽKÉ (7; U6 mini-einstein doladit → import dodatečně) ──
  { difficulty: 'ultratezka', origin: 'antika — Homér', question: 'Rybáři na břehu řekli: „Co jsme chytili, to jsme zahodili; co jsme nechytili, to si neseme domů." Co nesli?', answer: 'vši', hints: ['Nechytali jen ryby… ale i na sobě.'], description: 'Dle pověsti tuto hádanku dostal Homér od rybářů na ostrově Íu — a nerozluštil ji do smrti.' },
  { difficulty: 'ultratezka', origin: 'bible — Samson', question: 'Z jedlíka vyšel pokrm, ze siláka vyšla sladkost.', answer: 'med z těla lva (včely se usadily ve lví zdechlině)', hints: ['Silák bylo zvíře.'], description: 'Samsonova svatební hádanka pro třicet filištínských družbů (Kniha Soudců).' },
  { difficulty: 'ultratezka', origin: 'antika — Kleobúlos', question: 'Jeden otec má dvanáct synů; každý syn třicet dcer, napůl bílých a napůl černých. Neumírají — a přece každý den jedna zhyne.', answer: 'rok, měsíce, dny a noci', hints: ['Otec se každý leden vrací.'] },
  { difficulty: 'ultratezka', origin: 'stará lidová', question: 'Přiletěl pták bez peří a usedl na strom bez listí; přišla panna bez úst — a ptáka snědla.', answer: 'sníh na holém stromě, který sežralo slunce', hints: ['Pták padá z nebe celou zimu.'] },
  { difficulty: 'ultratezka', origin: 'stará lidová', question: 'Bůh to nevidí nikdy, král jen zřídka, a sedlák každý den.', answer: 'sobě rovného', hints: ['Nejde o věc, ale o setkání.'] },
  { difficulty: 'ultratezka', origin: 'logický folklór', question: '„Předevčírem mi bylo ještě dvacet pět. A příští rok oslavím dvacet osm." Kdy to mohl říct a kdy má narozeniny?', answer: '1. ledna; narozeniny má 31. prosince (předevčírem 25, včera 26, letos oslaví 27, příští rok 28)', hints: ['Záleží, který den v roce mluví.'] },
  { difficulty: 'ultratezka', origin: 'folklór', question: 'Chudí to mají. Bohatým to chybí. A kdo to jí, umře.', answer: 'nic', hints: ['Odpověď je kratší než otázka.'] },
];

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ikaros';
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  let safeHost = uri;
  try {
    const u = new URL(uri);
    safeHost = `${u.protocol}//${u.host}${u.pathname}`; // bez credentials
  } catch {
    /* ponech */
  }
  console.log('DB:', safeHost, DRY ? '(DRY RUN)' : '(OSTRY)');

  const author = await db.collection('users').findOne({ email: AUTHOR_EMAIL });
  if (!author && !DRY) {
    throw new Error(
      'Autor (Superadmin) nenalezen: ' +
        AUTHOR_EMAIL +
        ' — míříš na správnou (prod) DB? Zkontroluj MONGODB_URI.',
    );
  }
  const authorId = author ? String(author._id) : 'DRY-PLACEHOLDER';
  console.log('Autor:', AUTHOR_EMAIL, '->', authorId);

  const col = db.collection('riddles');
  let inserted = 0;
  let skipped = 0;

  for (const r of RIDDLES) {
    const exists = await col.findOne({
      question: r.question,
      scope: 'community',
    });
    if (exists) {
      skipped++;
      continue;
    }
    const now = new Date();
    const doc = {
      scope: 'community',
      question: r.question,
      answer: r.answer,
      hints: r.hints ?? [],
      difficulty: r.difficulty,
      origin: r.origin,
      description: r.description,
      imageFocalX: null,
      imageFocalY: null,
      imageZoom: null,
      imageFit: null,
      status: 'approved', // kurátorský seed (jako herbář)
      authorId,
      approvedAt: now,
      approvedBy: authorId,
      moderationHidden: false,
      createdAt: now,
      updatedAt: now,
    };
    if (!DRY) await col.insertOne(doc);
    inserted++;
  }

  console.log(
    `Hotovo: vloženo ${inserted}, přeskočeno (už existuje) ${skipped}, celkem v seedu ${RIDDLES.length}.`,
  );
  const perDiff = RIDDLES.reduce<Record<string, number>>((acc, r) => {
    acc[r.difficulty] = (acc[r.difficulty] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Úrovně v seedu:', perDiff);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
