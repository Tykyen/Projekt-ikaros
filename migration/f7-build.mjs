// F7 — build: Calenders.bson -> f7-calendars.json(.gz)
// Per-entita kalendarni udalosti stareho Matrixu -> Ikaros CalendarEvent[].
// Spec: docs/arch/migration-matrix/f7-calendars.md (FE repo).
//
// Transform: ISO start/end (gregorian UTC) -> FantasyDate {year, monthIndex(0-based), day}.
// Skip: test-kalendar, prazdne kalendare, placeholder ("Neznama udalost" & rok 0001).
// Marker _mig:'f7' na kazdou udalost (idempotence + rollback ve workflow).
//
// Spusteni: node migration/f7-build.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const SRC = 'C:/Matrix/dump/MatrixDatabase/Calenders.bson';
const OUT = new URL('./f7-calendars.json', import.meta.url).pathname.replace(/^\//, '');

function readBson(path) {
  const buf = fs.readFileSync(path);
  const docs = [];
  let off = 0;
  while (off < buf.length) {
    const size = buf.readInt32LE(off);
    docs.push(BSON.deserialize(buf.subarray(off, off + size)));
    off += size;
  }
  return docs;
}

function toFantasy(d) {
  // d je BSON Date (UTC). getUTCMonth() je uz 0-based = monthIndex.
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth(), day: d.getUTCDate() };
}

const cals = readBson(SRC);

// Slug-drift: stare Calenders pouzivaji kratky slug, produkcni Ikaros Page
// ma jiny (prejmenovane entity). Mapa overena dry-run DIAG kandidaty.
const ALIAS = {
  john: 'john-willscar',
  kraven: 'pumi-stin',
  mingguo: 'li-mingguo',
};

let skipEmpty = 0, skipTest = 0, skipPlaceholder = 0, totalIn = 0;
const out = [];

for (const cal of cals) {
  const rawBase = String(cal.characterSlug || '').replace(/-kalendar$/, '');
  const base = ALIAS[rawBase] || rawBase;
  const events = cal.events || [];
  if (events.length === 0) { skipEmpty++; continue; }
  if (base === 'test') { skipTest += events.length; continue; }

  const mapped = [];
  for (const e of events) {
    totalIn++;
    const start = e.start instanceof Date ? e.start : new Date(e.start);
    const title = String(e.title || '').trim();
    // Placeholder: nevyplnene datum (.NET DateTime.MinValue rok 1) + generic titul
    if (title === 'Neznámá událost' && start.getUTCFullYear() === 1) { skipPlaceholder++; continue; }

    const ev = {
      id: String(e._id),
      title,
      start: toFantasy(start),
      allDay: e.allDay !== false,
      _mig: 'f7',
    };
    if (e.end != null) {
      const end = e.end instanceof Date ? e.end : new Date(e.end);
      ev.end = toFantasy(end);
    }
    mapped.push(ev);
  }
  if (mapped.length) out.push({ slug: base, events: mapped });
}

out.sort((a, b) => b.events.length - a.events.length);

fs.writeFileSync(OUT, JSON.stringify(out));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(out)));

const totalOut = out.reduce((s, e) => s + e.events.length, 0);
console.log('=== F7 build hotovo ===');
console.log('Vstup kalendaru:', cals.length, '| prazdnych (skip):', skipEmpty, '| test (skip):', skipTest, 'ev');
console.log('Udalosti: vstup', totalIn, '| placeholder skip', skipPlaceholder, '| VYSTUP', totalOut);
console.log('Entit k importu:', out.length);
console.log('\nslug -> pocet udalosti:');
out.forEach((e) => console.log(`  ${String(e.events.length).padStart(4)}  ${e.slug}`));
console.log('\nVystup:', OUT, '(+ .gz)');
console.log('Vzorek eventu:', JSON.stringify(out[0].events[0]));
