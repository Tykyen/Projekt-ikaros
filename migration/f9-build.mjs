// F9 build — GameEvents.bson -> f9-data.json(.gz) = {events[]}.
// date uz ISO (1:1). imageUrl base64 -> Cloudinary URL (f9-image-map). confirmedBy userId -> F1 map.
// targetGroup ""->null, groupOnly=false. worldId/timestamps/_mig doplni workflow.
// Spec: docs/arch/migration-matrix/f9-game-events.md (FE repo).
//
// Spusteni: node migration/f9-build.mjs  (nejdriv f9-upload.mjs kvuli f9-image-map.json)

import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const OUT = `${MIGRATION}/f9-data.json`;

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

// --- image map (eventId -> secure_url) ---
const imageMap = new Map();
try {
  for (const m of JSON.parse(fs.readFileSync(`${MIGRATION}/f9-image-map.json`, 'utf8'))) imageMap.set(m.eventId, m.secure_url);
} catch (e) {
  console.warn('VAROVANI: f9-image-map.json nenacten -> akce bez obrazku.', e.message);
}

// --- F1 user-map (oldId -> newId) pro confirmedBy ---
const byOld = {};
try {
  const umap = JSON.parse(fs.readFileSync('C:/tmp/f1-user-map.json', 'utf8'));
  for (const k of Object.keys(umap)) {
    const u = umap[k];
    if (u && u.oldId) byOld[u.oldId] = u.newId;
  }
} catch (e) {
  console.warn('VAROVANI: f1-user-map.json nenacten -> confirmedBy userId zustanou stare.', e.message);
}
let rsvpMapped = 0, rsvpKept = 0;
function mapUser(oldId) {
  const n = byOld[oldId];
  if (n) {
    rsvpMapped++;
    return n;
  }
  rsvpKept++;
  return oldId;
}

const rawEvents = readBson('GameEvents');
let imgMatched = 0;
const events = rawEvents.map((e) =>
  clean({
    _id: String(e._id),
    title: e.title,
    date: e.date,
    description: e.description || '',
    imageUrl: (() => {
      if (!e.imageUrl) return undefined;
      const url = imageMap.get(String(e._id));
      if (url) imgMatched++;
      return url || undefined; // base64 bez napárování -> radsi nic nez inline 1MB
    })(),
    targetGroup: e.targetGroup || undefined, // "" -> undefined -> workflow null
    groupOnly: false,
    confirmable: e.confirmable !== false,
    confirmedBy: (e.confirmedBy || []).map((c) => ({ userId: mapUser(c.userId), userName: c.userName })),
    comments: [],
    reminderSent: false,
  }),
);

const data = { events };
fs.writeFileSync(OUT, JSON.stringify(data));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(data)));

const now = new Date();
const future = events.filter((e) => new Date(e.date) >= now).length;
const archive = events.length - future;
const tgDist = events.reduce((m, e) => ((m[e.targetGroup || '(žádná)'] = (m[e.targetGroup || '(žádná)'] || 0) + 1), m), {});
console.log('=== F9 build hotovo ===');
console.log(`events: ${events.length} | budoucí: ${future} | archiv (minulé): ${archive}`);
console.log(`obrázků napárováno (Cloudinary): ${imgMatched} | bez obrázku: ${events.length - imgMatched}`);
console.log(`confirmedBy: userId mapováno přes F1=${rsvpMapped} | ponecháno staré=${rsvpKept}`);
console.log('targetGroup:', JSON.stringify(tgDist));
console.log('\nakce (date | title | targetGroup | img?):');
for (const e of events) console.log(`  ${e.date}  "${e.title}"  tg=${e.targetGroup || '-'}  img=${e.imageUrl ? 'ANO' : 'ne'}  rsvp=${e.confirmedBy.length}`);
console.log('\nVystup:', OUT, '(+ .gz)');
