// F9 fáze A — rehost base64 PNG obrázků GameEvents na Cloudinary (webp).
// Matrix GameEvents maji imageUrl = data:image/png;base64,... inline (proto 9.8MB/15 docs).
// Cloudinary upload(dataUri) bere base64 primo (ne GDrive). public_id = eventId (idempotence).
// ODDELENE od F8/F12: f9-image-progress.ndjson + f9-image-map.json, folder matrix/events.
// Vystup f9-image-map.json [{eventId,secure_url,public_id,width,height,bytes}] (+ .gz).
// Spec: docs/arch/migration-matrix/f9-game-events.md (FE repo).
//
// Spusteni: node migration/f9-upload.mjs [--limit N]

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BACKEND = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/backend';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const MAP_OUT = `${MIGRATION}/f9-image-map.json`;
const NDJSON = `${MIGRATION}/f9-image-progress.ndjson`;

const require = createRequire(`${BACKEND}/package.json`);
const cloudinary = require('cloudinary').v2;
const { BSON } = require(`${BACKEND}/node_modules/bson`);

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const CONCURRENCY = 4;
const RETRIES = 3;
const TIMEOUT_MS = 120000;
const FOLDER = 'matrix/events';

function loadCloudinaryUrl() {
  const env = readFileSync(`${BACKEND}/.env`, 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('CLOUDINARY_URL='));
  if (!line) throw new Error('CLOUDINARY_URL chybí v backend/.env');
  return line.slice(line.indexOf('=') + 1).trim();
}
function configureCloudinary() {
  const u = new URL(loadCloudinaryUrl());
  cloudinary.config({ cloud_name: u.hostname, api_key: decodeURIComponent(u.username), api_secret: decodeURIComponent(u.password), secure: true });
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
  const events = readBson('GameEvents');
  const tasks = [];
  for (const e of events) {
    if (e.imageUrl && /^data:/.test(e.imageUrl)) tasks.push({ eventId: String(e._id), dataUri: e.imageUrl });
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
      if (r.secure_url) done.add(r.eventId);
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
async function uploadOne(t) {
  const res = await withRetry(() =>
    cloudinary.uploader.upload(t.dataUri, {
      folder: FOLDER,
      public_id: t.eventId,
      overwrite: true,
      resource_type: 'image',
      format: 'webp',
      transformation: [{ width: 4096, crop: 'limit', quality: 'auto:good' }],
      timeout: TIMEOUT_MS,
    }),
  );
  return { eventId: t.eventId, folder: FOLDER, secure_url: res.secure_url, public_id: res.public_id, width: res.width, height: res.height, bytes: res.bytes };
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
        appendFileSync(NDJSON, JSON.stringify({ eventId: items[i].eventId, error: String(e?.message || e) }) + '\n');
        fail++;
      }
      console.log(`  ${ok + fail}/${total}  ok=${ok} fail=${fail}`);
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
      if (r.secure_url) byId.set(r.eventId, r);
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
  tasks = tasks.filter((t) => !done.has(t.eventId));
  if (Number.isFinite(LIMIT)) tasks = tasks.slice(0, LIMIT);
  console.log(`Úkolů (base64 obrázky): ${before} | hotovo (resume): ${done.size} | teď: ${tasks.length}`);
  if (tasks.length) {
    const t0 = Date.now();
    const { ok, fail } = await runPool(tasks, uploadOne, CONCURRENCY);
    console.log(`Hotovo: ok=${ok} fail=${fail} za ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } else {
    console.log('Nic k uploadu.');
  }
  const map = buildMap();
  console.log(`f9-image-map.json: ${map.length} obrázků → ${MAP_OUT} (+ .gz)`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
