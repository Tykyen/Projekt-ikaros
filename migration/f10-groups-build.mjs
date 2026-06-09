// F10 skupiny build — sloupec "Typ" z rucniho ceniku -> campaignShopGroups + polozka->groupId.
// 19 jednourovnovych skupin (deterministicke _id z nazvu). Vystup f10-groups-data.json(.gz).
// Spec: docs/arch/migration-matrix/f10-obchod.md (FE repo).
//
// Spusteni: node migration/f10-groups-build.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const CENIK = 'C:/Users/arafo/Downloads/f10-obchod-cenik.csv';
const OUT = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration/f10-groups-data.json';
const WORLD = '6d6174726978000000000001';

function parseCsv(text, d) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === d) { row.push(field); field = ''; } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (c === '\r') {} else field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const cr = parseCsv(fs.readFileSync(CENIK, 'utf8'), ';');
const h = cr[0];
const TI = h.findIndex((x) => x.trim() === 'Typ');
const SI = h.length - 1;
const FIX = { 'Achymistické látky': 'Alchymistické látky' }; // překlep -> sloučit

const data = cr.slice(1).filter((r) => r[0] && r[SI]).map((r) => ({ slug: r[SI].trim(), typ: FIX[(r[TI] || '').trim()] || (r[TI] || '').trim() }));
const names = [...new Set(data.filter((d) => d.typ).map((d) => d.typ))].sort((a, b) => a.localeCompare(b, 'cs'));
const gid = (name) => crypto.createHash('md5').update(WORLD + '|grp|' + name).digest('hex').slice(0, 24);
const groups = names.map((name, i) => ({ _id: gid(name), name, order: i }));
const gidByName = {};
for (const g of groups) gidByName[g.name] = g._id;
const items = data.filter((d) => d.typ).map((d) => ({ slug: d.slug, groupId: gidByName[d.typ] }));

const out = { groups, items };
fs.writeFileSync(OUT, JSON.stringify(out));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(out)));

console.log('=== F10 skupiny build hotovo ===');
console.log('skupin:', groups.length, '| položek zařazeno:', items.length, '| bez Typu:', data.length - items.length);
console.log('skupiny (název: počet):');
for (const g of groups) console.log('  ' + g.name + ': ' + items.filter((i) => i.groupId === g._id).length);
