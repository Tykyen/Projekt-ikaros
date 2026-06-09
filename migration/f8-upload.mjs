// F8 fáze A — rehost GDrive obrázků TimelineEvents na Cloudinary (webp).
// Kopie F12 logiky, ale ODDĚLENÉ soubory (f8-image-progress.ndjson, f8-image-map.json)
// + folder matrix/timeline, ať nerozbije F12 data. public_id = gdriveId (idempotence).
// Výstup f8-image-map.json [{eventId,gdriveId,secure_url,public_id,width,height}] (+ .gz).
// Spec: docs/arch/migration-matrix/f8-timeline-sounds.md (FE repo).
//
// Spuštění: node migration/f8-upload.mjs [--limit N]
// Resume: crash-safe NDJSON → re-run přeskočí hotová gdriveId.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BACKEND = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/backend';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const MAP_OUT = `${MIGRATION}/f8-image-map.json`;
const NDJSON = `${MIGRATION}/f8-image-progress.ndjson`;

const require = createRequire(`${BACKEND}/package.json`);
const cloudinary = require('cloudinary').v2;
const { BSON } = require(`${BACKEND}/node_modules/bson`);

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const CONCURRENCY = 6;
const RETRIES = 3;
const TIMEOUT_MS = 60000;
const FOLDER = 'matrix/timeline';

function loadCloudinaryUrl() {
  const env = readFileSync(`${BACKEND}/.env`, 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('CLOUDINARY_URL='));
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

function readBson(name) {
  const buf = readFileSync(`${DUMP}/${name}.bson`);
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

function buildTasks() {
  const events = readBson('TimelineEvents');
  const tasks = [];
  for (const e of events) {
    if (e.imageUrl) tasks.push({ eventId: String(e._id), gdriveId: String(e.imageUrl), folder: FOLDER });
  }
  return tasks;
}

function loadDone() {
  const done = new Set();
  if (!existsSync(NDJSON)) return done;
  for (const line of readFileSync(NDJSON, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.secure_url) done.add(r.gdriveId);
    } catch {
      /* ignore */
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
      await sleep(1000 * (a + 1) * (a + 1));
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
    eventId: t.eventId,
    gdriveId: t.gdriveId,
    folder: t.folder,
    secure_url: res.secure_url,
    public_id: res.public_id,
    width: res.width,
    height: res.height,
    viaThumb,
  };
}

async function runPool(items, worker, concurrency) {
  let idx = 0, ok = 0, fail = 0;
  const total = items.length;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      try {
        const r = await worker(items[i]);
        appendFileSync(NDJSON, JSON.stringify(r) + '\n');
        ok++;
      } catch (e) {
        appendFileSync(NDJSON, JSON.stringify({ eventId: items[i].eventId, gdriveId: items[i].gdriveId, error: String(e?.message || e) }) + '\n');
        fail++;
      }
      const n = ok + fail;
      if (n % 25 === 0 || n === total) console.log(`  ${n}/${total}  ok=${ok} fail=${fail}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return { ok, fail };
}

function buildMap() {
  const byId = new Map();
  for (const line of readFileSync(NDJSON, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.secure_url) byId.set(r.gdriveId, r);
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
  console.log(`Cloudinary cloud: ${cloud} | folder: ${FOLDER}`);
  const done = loadDone();
  let tasks = buildTasks();
  const before = tasks.length;
  tasks = tasks.filter((t) => !done.has(t.gdriveId));
  if (Number.isFinite(LIMIT)) tasks = tasks.slice(0, LIMIT);
  console.log(`Úkolů: ${before} | hotovo (resume): ${done.size} | teď: ${tasks.length}` + (Number.isFinite(LIMIT) ? ` (LIMIT ${LIMIT})` : ''));
  if (tasks.length) {
    const t0 = Date.now();
    const { ok, fail } = await runPool(tasks, uploadOne, CONCURRENCY);
    console.log(`Hotovo: ok=${ok} fail=${fail} za ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } else {
    console.log('Nic k uploadu.');
  }
  const map = buildMap();
  console.log(`f8-image-map.json: ${map.length} obrázků → ${MAP_OUT} (+ .gz)`);
  const viaThumb = map.filter((m) => m.viaThumb).length;
  if (viaThumb) console.log(`  (z toho ${viaThumb} přes thumbnail fallback)`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
