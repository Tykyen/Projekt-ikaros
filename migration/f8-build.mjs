// F8 build — TimelineEvents + sounds .bson -> f8-data.json(.gz) = {timeline[], sounds[]}.
// Timeline: year/month/day parse, title=text, link/page/X->pageSlug, imageUrl z f8-image-map.
// Sounds: PascalCase->camelCase, ciselne enumy->string (poradi Ikaros enumu).
// worldId/createdBy/status/_mig doplni workflow.
// Spec: docs/arch/migration-matrix/f8-timeline-sounds.md (FE repo).
//
// Spusteni: node migration/f8-build.mjs  (nejdriv f8-upload.mjs kvuli f8-image-map.json)

import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const OUT = `${MIGRATION}/f8-data.json`;

function readBson(name) {
  const buf = fs.readFileSync(`${DUMP}/${name}.bson`);
  const docs = [];
  let off = 0;
  while (off < buf.length) {
    const size = buf.readInt32LE(off);
    if (size <= 0 || off + size > buf.length) break;
    docs.push(BSON.deserialize(buf.subarray(off, off + size), { promoteValues: true }));
    off += size;
  }
  return docs;
}
const clean = (o) => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
};

// --- Sounds enum mapy (index -> Ikaros enum string, dle sound.schema.ts) ---
const MEDIA = ['music', 'ambient', 'sfx', 'signal', 'voice'];
const PRIMARY = ['safe', 'social', 'exploration', 'tension', 'threat', 'combat', 'ritual', 'horror', 'revelation', 'aftermath', 'transition', 'system'];
const ENV = ['neutral', 'nature', 'urban', 'interior', 'industrial', 'military', 'sacral', 'arcane', 'digital', 'alien', 'ruin', 'void'];
const TONE = ['calm', 'wonder', 'melancholy', 'mystery', 'dread', 'fear', 'urgency', 'aggression', 'grief', 'awe', 'faith', 'corruption'];
const ONSET = ['instant', 'fast', 'soft', 'slow'];
const OUTRO = ['hard', 'soft', 'fade', 'seamless'];
const FACTION = ['civilian', 'noble', 'religious', 'military', 'corporate', 'criminal', 'tribal', 'arcane', 'alien'];
const TECH = ['preindustrial', 'industrial', 'modern', 'advanced', 'posthuman'];
const MAGIC = ['none', 'low', 'medium', 'high', 'extreme'];
const COMBAT = ['none', 'low', 'medium', 'high'];
const pick = (arr, i, def) => (typeof i === 'number' && arr[i] !== undefined ? arr[i] : def);

// --- Slug-drift (F6/F7) ---
const ALIAS = {
  john: 'john-willscar',
  kraven: 'pumi-stin',
  mingguo: 'li-mingguo',
  'abigail-wattson': 'abi',
  katerina: 'katerina-penkavova',
};
const aliased = new Set();
function mapSlug(slug) {
  const a = ALIAS[slug];
  if (a) {
    aliased.add(`${slug} -> ${a}`);
    return a;
  }
  return slug;
}

// --- image map (gdriveId -> secure_url) ---
const imageMap = new Map();
try {
  const arr = JSON.parse(fs.readFileSync(`${MIGRATION}/f8-image-map.json`, 'utf8'));
  for (const m of arr) imageMap.set(m.gdriveId, m.secure_url);
} catch (e) {
  console.warn('VAROVANI: f8-image-map.json nenacten -> timeline bez obrazku.', e.message);
}

// --- TIMELINE ---
const rawTimeline = readBson('TimelineEvents');
let imgMatched = 0, withPage = 0;
const timeline = rawTimeline.map((t) => {
  const year = parseInt(t.year, 10);
  const pm = t.month != null ? parseInt(t.month, 10) : NaN;
  const pd = t.day != null ? parseInt(t.day, 10) : NaN;
  const month = Number.isNaN(pm) ? 1 : Math.max(1, pm);
  const day = Number.isNaN(pd) ? 1 : Math.max(1, pd);
  const title = String(t.text || '').trim();
  let pageSlug;
  if (t.link && /^\/page\//.test(t.link)) {
    pageSlug = mapSlug(t.link.replace(/^\/page\//, '').replace(/\/$/, ''));
    if (pageSlug) withPage++;
  }
  let imageUrl;
  if (t.imageUrl) {
    imageUrl = imageMap.get(String(t.imageUrl));
    if (imageUrl) imgMatched++;
  }
  return clean({
    _id: String(t._id),
    year,
    month,
    day,
    title,
    text: title, // Matrix ma jen `text`; oba Ikaros fieldy required not-empty
    imageUrl: imageUrl || undefined,
    pageSlug: pageSlug || undefined,
  });
});

// --- SOUNDS ---
const rawSounds = readBson('sounds');
const sounds = rawSounds.map((s) =>
  clean({
    _id: String(s._id),
    name: s.Name,
    youtubeUrl: s.YoutubeUrl,
    mediaType: pick(MEDIA, s.MediaType, 'music'),
    primaryFunction: pick(PRIMARY, s.PrimaryFunction, 'safe'),
    environment: pick(ENV, s.Environment, 'neutral'),
    emotionalTone: pick(TONE, s.EmotionalTone, 'calm'),
    intensity: typeof s.Intensity === 'number' ? s.Intensity : 1,
    duration: typeof s.Duration === 'number' ? s.Duration : 0,
    loop: s.Loop !== false,
    onsetProfile: pick(ONSET, s.OnsetProfile, 'soft'),
    outroProfile: pick(OUTRO, s.OutroProfile, 'fade'),
    factionStyle: pick(FACTION, s.FactionStyle, 'civilian'),
    techLevel: pick(TECH, s.TechLevel, 'modern'),
    magicLevel: pick(MAGIC, s.MagicLevel, 'none'),
    combatEnergy: pick(COMBAT, s.CombatEnergy, 'none'),
    tags: s.Tags || [],
    notes: s.Notes || '',
  }),
);

const data = { timeline, sounds };
fs.writeFileSync(OUT, JSON.stringify(data));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(data)));

console.log('=== F8 build hotovo ===');
console.log(`TIMELINE: ${timeline.length} | s obrazkem (Cloudinary): ${imgMatched}/${rawTimeline.length} | s pageSlug: ${withPage}`);
console.log('slug premapovano aliasem:', aliased.size ? [...aliased].join(', ') : '(zadne)');
console.log('rok rozsah:', Math.min(...timeline.map((t) => t.year)), 'az', Math.max(...timeline.map((t) => t.year)));
console.log(`\nSOUNDS: ${sounds.length} — kontrola enum mapovani (nazev -> kategorie):`);
for (const s of sounds) {
  console.log(`  "${s.name}": media=${s.mediaType} fn=${s.primaryFunction} env=${s.environment} tone=${s.emotionalTone} faction=${s.factionStyle} tech=${s.techLevel} magic=${s.magicLevel} combat=${s.combatEnergy} int=${s.intensity}`);
}
console.log(`\nVystup: ${OUT} (+ .gz)`);
console.log('Vzorek timeline:', JSON.stringify(timeline[0]));
