// F10 build — f10-obchod-cenik.csv (rucni ceny) + Pages.plainText (popis) -> f10-data.json(.gz).
// name=titul, price=cislo z ceniku, currencyCode=mena, description=text stranky
// (+ u jednotkovych cen "Cena/jednotka" prefix). referenceLink/_id resi workflow (slug->Page).
// Spec: docs/arch/migration-matrix/f10-obchod.md (FE repo).
//
// Spusteni: node migration/f10-build.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const CENIK = 'C:/Users/arafo/Downloads/f10-obchod-cenik.csv';
const DUMP_PAGES = 'C:/Matrix/dump/MatrixDatabase/Pages.bson';
const OUT = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration/f10-data.json';

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

// --- ceník ---
const rows = parseCsv(fs.readFileSync(CENIK, 'utf8'), ';');
const h = rows[0];
const NI = 0, PI = 1, MI = 2, SI = h.length - 1; // Nazev, Cena, Mena, slug (posledni)
const cenik = rows.slice(1).filter((r) => r[SI] && r[NI]);

// --- Pages plainText ---
const textBySlug = {};
for (const p of readBson(DUMP_PAGES)) textBySlug[p.slug] = (p.plainText || '').replace(/\s+/g, ' ').trim();

// price + jednotka z "X" nebo "X/jednotka"
function parsePrice(raw) {
  raw = String(raw || '').trim();
  if (!raw) return { price: 0, unit: null };
  const slash = raw.indexOf('/');
  const numPart = slash >= 0 ? raw.slice(0, slash) : raw;
  const unit = slash >= 0 ? raw.slice(slash + 1).trim() : null;
  const price = parseFloat(numPart.replace(/[\s ]/g, '').replace(',', '.')) || 0;
  return { price, unit };
}

let withUnit = 0, withPrice = 0, noText = 0;
const items = cenik.map((r) => {
  const slug = r[SI].trim();
  const name = (r[NI] || '').trim();
  const currencyCode = (r[MI] || '').trim() || 'GBP';
  const { price, unit } = parsePrice(r[PI]);
  if (price > 0) withPrice++;
  let description = textBySlug[slug] || '';
  if (!description) noText++;
  if (unit) {
    withUnit++;
    description = `💷 Cena: ${price} ${currencyCode} za ${unit}` + (description ? `\n\n${description}` : '');
  }
  return { slug, name, price, currencyCode, description };
});

fs.writeFileSync(OUT, JSON.stringify({ items }));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify({ items })));

const curDist = items.reduce((m, i) => ((m[i.currencyCode] = (m[i.currencyCode] || 0) + 1), m), {});
console.log('=== F10 build hotovo ===');
console.log(`položek: ${items.length} | s cenou>0: ${withPrice} | bez ceny (price 0): ${items.length - withPrice}`);
console.log(`jednotkové ceny (prefix v popisu): ${withUnit} | bez textu stránky: ${noText}`);
console.log('měny:', JSON.stringify(curDist));
console.log('\nvzorek jednotkové:', JSON.stringify(items.find((i) => i.description.startsWith('💷'))?.description.slice(0, 80)));
console.log('vzorek běžné:', JSON.stringify({ ...items[0], description: items[0].description.slice(0, 60) + '…' }));
console.log('\nVystup:', OUT, '(+ .gz)');
