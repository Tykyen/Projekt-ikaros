// F-favorites build — Users.bson -> f-favorites-data.json(.gz) = {favorites:[{userId,slugs}]}.
// Staré User.FavoritePagesSlugs (per uživatel, plochý jednosvětový) -> Ikaros
// User.favoritePageSlugs[<matrix worldId>]. userId mapován přes F1 (oldId->newId).
// Pořadí slugů ZACHOVÁNO (starý reorder). Propadlé slugy (smazané stránky)
// filtruje až IMPORT proti pages světa. Spec: docs/arch/migration-matrix/f-favorites.md (FE repo).
//
// Spuštění: node migration/f-favorites-build.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const OUT = `${MIGRATION}/f-favorites-data.json`;

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

// --- F1 user-map (oldId -> newId) ---
const byOld = {};
const umap = JSON.parse(fs.readFileSync('C:/tmp/f1-user-map.json', 'utf8'));
for (const k of Object.keys(umap)) {
  const u = umap[k];
  if (u && u.oldId) byOld[u.oldId] = u.newId;
}

const users = readBson('Users');
let withFav = 0, mapped = 0, skippedNoMap = 0;
const favorites = [];
for (const u of users) {
  const raw = Array.isArray(u.FavoritePagesSlugs) ? u.FavoritePagesSlugs : [];
  const slugs = [...new Set(raw.filter((s) => typeof s === 'string' && s))]; // dedup, pořadí drží
  if (slugs.length === 0) continue;
  withFav++;
  const newId = byOld[String(u._id)];
  if (!newId) {
    skippedNoMap++;
    console.warn(`  VAROVÁNÍ: user ${u._id} (${u.Username || '?'}) má ${slugs.length} oblíbených, ale není ve F1 mapě → SKIP`);
    continue;
  }
  favorites.push({ userId: newId, slugs });
  mapped++;
}

const data = { favorites };
fs.writeFileSync(OUT, JSON.stringify(data));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(data)));

console.log('=== F-favorites build hotovo ===');
console.log(`users celkem: ${users.length} | s oblíbenými: ${withFav} | mapováno přes F1: ${mapped} | bez F1 mapy (skip): ${skippedNoMap}`);
const totalSlugs = favorites.reduce((n, f) => n + f.slugs.length, 0);
console.log(`oblíbených slugů celkem: ${totalSlugs}`);
for (const f of favorites) console.log(`  ${f.userId}: ${f.slugs.length} slugů  [${f.slugs.slice(0, 5).join(', ')}${f.slugs.length > 5 ? ', …' : ''}]`);
console.log('\nVýstup:', OUT, '(+ .gz). Propadlé slugy filtruje až import proti pages světa.');
