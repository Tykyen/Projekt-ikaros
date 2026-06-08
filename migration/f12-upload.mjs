// F12 fáze A — rehost GDrive obrázků na Cloudinary (webp).
// Stáhne každý veřejný GDrive obrázek PŘES Cloudinary upload(url), zkonvertuje na
// webp, uloží pod deterministickým public_id = gdriveId (idempotence + cleanup).
// Výstup: f12-map.json [{slug,gdriveId,secure_url,public_id,width,height}] (+ .gz)
// pro fázi B (mongosh zápis do Page.imageUrl).
//
// Spuštění (odkudkoli):
//   node migration/f12-upload.mjs --limit 5     # smoke test (prvních 5)
//   node migration/f12-upload.mjs --groups      # jen 3 znaky frakcí
//   node migration/f12-upload.mjs               # plný běh (stránky + frakce)
//
// Resume: crash-safe NDJSON log → re-run přeskočí už hotová gdriveId.

import { createRequire } from 'node:module';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  appendFileSync,
} from 'node:fs';
import { gzipSync } from 'node:zlib';

// --- cesty (absolutní — skript je nezávislý na cwd) ---
const BACKEND = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/backend';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const PAGES_IN = 'C:/tmp/f12-pages.json'; // [{slug,gdriveId}]
const GROUPS_IN = 'C:/tmp/f-groups-settings.json'; // {groupImages:{...}}
const MAP_OUT = `${MIGRATION}/f12-map.json`;
const NDJSON = `${MIGRATION}/f12-progress.ndjson`;

// cloudinary je CJS v backend/node_modules → createRequire od backend package.json
const require = createRequire(`${BACKEND}/package.json`);
const cloudinary = require('cloudinary').v2;

// --- CLI ---
const args = process.argv.slice(2);
const LIMIT = args.includes('--limit')
  ? Number(args[args.indexOf('--limit') + 1])
  : Infinity;
const GROUPS_ONLY = args.includes('--groups');
// --input <path>: alternativní zdroj [{slug,gdriveId}] (2. kolo NOMAP); bez frakcí
const INPUT = args.includes('--input')
  ? args[args.indexOf('--input') + 1]
  : null;
const CONCURRENCY = 6;
const RETRIES = 3;
const TIMEOUT_MS = 60000;

// --- Cloudinary config z backend/.env (CLOUDINARY_URL) ---
function loadCloudinaryUrl() {
  const env = readFileSync(`${BACKEND}/.env`, 'utf8');
  const line = env
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('CLOUDINARY_URL='));
  if (!line) throw new Error('CLOUDINARY_URL chybí v backend/.env');
  return line.slice(line.indexOf('=') + 1).trim();
}
function configureCloudinary() {
  const u = new URL(loadCloudinaryUrl());
  cloudinary.config({
    cloud_name: u.hostname,
    api_key: decodeURIComponent(u.username),
    api_secret: decodeURIComponent(u.password),
    secure: true,
  });
  return u.hostname;
}

// --- sestavení seznamu úkolů ---
function buildTasks() {
  const tasks = [];
  // --input: alternativní zdroj (2. kolo), bez frakcí
  if (INPUT) {
    const rows = JSON.parse(readFileSync(INPUT, 'utf8'));
    for (const p of rows)
      tasks.push({ slug: p.slug, gdriveId: p.gdriveId, folder: 'matrix/pages' });
    return tasks;
  }
  if (!GROUPS_ONLY) {
    const pages = JSON.parse(readFileSync(PAGES_IN, 'utf8'));
    for (const p of pages)
      tasks.push({
        slug: p.slug,
        gdriveId: p.gdriveId,
        folder: 'matrix/pages',
      });
  }
  // znaky frakcí (worldsettings.groupImages)
  const groups = JSON.parse(readFileSync(GROUPS_IN, 'utf8')).groupImages || {};
  for (const [name, gid] of Object.entries(groups))
    tasks.push({ slug: `__group__${name}`, gdriveId: gid, folder: 'matrix/groups' });
  return tasks;
}

// --- resume: už hotová gdriveId z NDJSON ---
function loadDone() {
  const done = new Set();
  if (!existsSync(NDJSON)) return done;
  for (const line of readFileSync(NDJSON, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.secure_url) done.add(r.gdriveId);
    } catch {
      /* poškozený řádek ignoruj */
    }
  }
  return done;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  let last;
  for (let a = 0; a < RETRIES; a++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(1000 * (a + 1) * (a + 1)); // 1s, 4s, 9s backoff
    }
  }
  throw last;
}

function uploadVariant(url, t) {
  return cloudinary.uploader.upload(url, {
    folder: t.folder,
    public_id: t.gdriveId,
    overwrite: true,
    resource_type: 'image',
    format: 'webp',
    transformation: [{ width: 4096, crop: 'limit', quality: 'auto:good' }],
    timeout: TIMEOUT_MS,
  });
}

async function uploadOne(t) {
  // primárně originál; Cloudinary free má limit 10 MB na stahovaný soubor →
  // velké originály padají na "File size too large". Fallback: GDrive thumbnail
  // API (sz=w2560) vrátí zmenšený náhled pod limitem (kvalita pro web dostačuje).
  const primary = `https://drive.google.com/uc?export=download&id=${t.gdriveId}`;
  const thumb = `https://drive.google.com/thumbnail?id=${t.gdriveId}&sz=w2560`;
  let res, viaThumb = false;
  try {
    res = await withRetry(() => uploadVariant(primary, t));
  } catch (e) {
    if (String(e?.message || e).includes('File size too large')) {
      res = await withRetry(() => uploadVariant(thumb, t));
      viaThumb = true;
    } else throw e;
  }
  return {
    slug: t.slug,
    gdriveId: t.gdriveId,
    folder: t.folder,
    secure_url: res.secure_url,
    public_id: res.public_id,
    width: res.width,
    height: res.height,
    viaThumb,
  };
}

// --- concurrency pool ---
async function runPool(items, worker, concurrency) {
  let idx = 0,
    ok = 0,
    fail = 0;
  const total = items.length;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      try {
        const r = await worker(items[i]);
        appendFileSync(NDJSON, JSON.stringify(r) + '\n');
        ok++;
      } catch (e) {
        appendFileSync(
          NDJSON,
          JSON.stringify({
            slug: items[i].slug,
            gdriveId: items[i].gdriveId,
            error: String(e?.message || e),
          }) + '\n',
        );
        fail++;
      }
      const n = ok + fail;
      if (n % 25 === 0 || n === total)
        console.log(`  ${n}/${total}  ok=${ok} fail=${fail}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return { ok, fail };
}

// --- sestav f12-map.json z NDJSON (jen úspěšné) ---
function buildMap() {
  const byId = new Map();
  for (const line of readFileSync(NDJSON, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.secure_url) byId.set(r.gdriveId, r); // poslední úspěšný vyhrává
    } catch {
      /* ignore */
    }
  }
  const map = [...byId.values()];
  writeFileSync(MAP_OUT, JSON.stringify(map));
  writeFileSync(`${MAP_OUT}.gz`, gzipSync(JSON.stringify(map)));
  return map;
}

async function main() {
  const cloud = configureCloudinary();
  console.log(`Cloudinary cloud: ${cloud}`);

  const done = loadDone();
  let tasks = buildTasks();
  const before = tasks.length;
  tasks = tasks.filter((t) => !done.has(t.gdriveId));
  if (Number.isFinite(LIMIT)) tasks = tasks.slice(0, LIMIT);

  console.log(
    `Úkolů celkem: ${before} | hotovo (resume): ${done.size} | k uploadu teď: ${tasks.length}` +
      (Number.isFinite(LIMIT) ? ` (LIMIT ${LIMIT})` : ''),
  );
  if (!tasks.length) {
    console.log('Nic k uploadu.');
  } else {
    const t0 = Date.now();
    const { ok, fail } = await runPool(tasks, uploadOne, CONCURRENCY);
    console.log(
      `Hotovo: ok=${ok} fail=${fail} za ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  }

  const map = buildMap();
  console.log(`f12-map.json: ${map.length} obrázků → ${MAP_OUT} (+ .gz)`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
