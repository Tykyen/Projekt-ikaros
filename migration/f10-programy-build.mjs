// F10 programy build — "Programy ceník.csv" (Skupina;slug;titul;Cena;Měna) + Pages.plainText
// -> f10-programy-data.json(.gz). Rozsiruje F10 obchod o 57 programu (51 stranek + 6 cenovych variant).
// Skupiny ze sloupce "Skupina" (5x), polozka -> groupId. Varianty (vic cen na slug) = samostatne polozky
// se sdilenym referenceLink; deterministicke _id (slug+nazev) => idempotence i pri N:1 strance.
// name=titul, price=cislo z ceniku, currencyCode=mena, description=text stranky (+ 💷 u jednotkovych cen).
// Spec: docs/arch/migration-matrix/f10-obchod.md (FE repo, sekce "Programy follow-up").
//
// Spusteni: node migration/f10-programy-build.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const CENIK = 'C:/Users/arafo/Downloads/Programy ceník.csv';
const DUMP_PAGES = 'C:/Matrix/dump/MatrixDatabase/Pages.bson';
const OUT = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration/f10-programy-data.json';
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
function readBson(path) {
  const buf = fs.readFileSync(path);
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

// price + jednotka z "X" nebo "X/jednotka" (mezery jako oddelovac tisicu se odstrani)
function parsePrice(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { price: 0, unit: null };
  const slash = raw.indexOf('/');
  const numPart = slash >= 0 ? raw.slice(0, slash) : raw;
  const unit = slash >= 0 ? raw.slice(slash + 1).trim() : null;
  const price = parseFloat(numPart.replace(/[\s ]/g, '').replace(',', '.')) || 0;
  return { price, unit };
}

// --- cenik ---
const rows = parseCsv(fs.readFileSync(CENIK, 'utf8'), ';');
const h = rows[0].map((x) => x.trim());
const col = (name) => h.findIndex((x) => x.toLowerCase() === name.toLowerCase());
const GI = col('Skupina'), SI = col('slug'), NI = col('titul'), PI = col('Cena'), MI = col('Měna');
if ([GI, SI, NI, PI, MI].some((i) => i < 0)) {
  console.error('CHYBA: chybi sloupec v hlavicce. Nasel jsem:', h, '-> indexy', { GI, SI, NI, PI, MI });
  process.exit(1);
}
const cenik = rows.slice(1).filter((r) => (r[SI] || '').trim() && (r[NI] || '').trim());

// --- Pages plainText (popis) ---
const textBySlug = {};
for (const p of readBson(DUMP_PAGES)) textBySlug[p.slug] = (p.plainText || '').replace(/\s+/g, ' ').trim();

// --- skupiny ze sloupce "Skupina" (deterministicke _id, stejny vzor jako F10 groups) ---
const gid = (name) => crypto.createHash('md5').update(WORLD + '|grp|' + name).digest('hex').slice(0, 24);
const groupNames = [...new Set(cenik.map((r) => (r[GI] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
// order 100+ => za stavajicimi 19 skupinami F10 (ty maji order 0..18), PJ doladi v UI
const groups = groupNames.map((name, i) => ({ _id: gid(name), name, order: 100 + i }));
const gidByName = {};
for (const g of groups) gidByName[g.name] = g._id;

// --- polozky (varianty = samostatne polozky, deterministicke _id ze slug+nazev) ---
const iid = (slug, name) => crypto.createHash('md5').update(WORLD + '|f10p|' + slug + '|' + name).digest('hex').slice(0, 24);
let withUnit = 0, withPrice = 0, noText = 0;
const seen = new Set();
const items = cenik.map((r) => {
  const slug = r[SI].trim();
  const name = r[NI].trim();
  const groupName = (r[GI] || '').trim();
  const currencyCode = (r[MI] || '').trim() || 'GBP';
  const { price, unit } = parsePrice(r[PI]);
  if (price > 0) withPrice++;
  let description = textBySlug[slug] || '';
  if (!description) noText++;
  if (unit) {
    withUnit++;
    description = `💷 Cena: ${price} ${currencyCode} za ${unit}` + (description ? `\n\n${description}` : '');
  }
  const _id = iid(slug, name);
  if (seen.has(_id)) console.warn('VAROVANI: kolize _id (stejny slug+nazev):', slug, name);
  seen.add(_id);
  return { _id, slug, name, price, currencyCode, description, groupId: gidByName[groupName] || '' };
});

const out = { groups, items };
fs.writeFileSync(OUT, JSON.stringify(out));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(out)));

const curDist = items.reduce((m, i) => ((m[i.currencyCode] = (m[i.currencyCode] || 0) + 1), m), {});
console.log('=== F10 programy build hotovo ===');
console.log(`polozek: ${items.length} | s cenou>0: ${withPrice} | bez ceny: ${items.length - withPrice}`);
console.log(`jednotkove ceny (💷 prefix): ${withUnit} | bez textu stranky: ${noText} | unik. _id: ${seen.size}`);
console.log('meny:', JSON.stringify(curDist));
console.log('skupiny (nazev: pocet polozek):');
for (const g of groups) console.log('  ' + g.name + ' [order ' + g.order + ']: ' + items.filter((i) => i.groupId === g._id).length);
console.log('\nvzorek jednotkova:', JSON.stringify(items.find((i) => i.description.startsWith('💷'))?.description.slice(0, 70)));
console.log('Vystup:', OUT, '(+ .gz)');
