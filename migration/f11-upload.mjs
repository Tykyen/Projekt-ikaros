// F11 fáze A — rehost chat obrázků (GDrive + base64) na Cloudinary (webp).
// Zdroj: chat kolekce starého Matrixu (dump). 3 typy assetů:
//   1) GDrive (drive:GID): channel/group ikony, override avatary, emote, pár msg.image
//      → upload přes uc?export=download (fallback thumbnail >10MB, vzor f12).
//   2) base64 (data:): msg.image + msg.images[] → upload dataUri přímo (vzor f9).
//   3) reuse F12: GID už nahrané v f12-map.json.gz → bez re-uploadu, použij hotové URL.
// Tenor URL (media.tenor.com) se NEnahrávají (veřejné CDN, ponechány v fázi B).
//
// Výstup: f11-img-map.json(.gz) = { <gdriveId | "b64:<msgId>:<i>"> : {url,public_id,width,height,bytes} }
//   Fáze B (f11-build.mjs) hledá: drive: zdroj → map[GID]; data: zdroj → map["b64:<msgId>:<i>"].
//
// Spuštění: node migration/f11-upload.mjs [--limit N]   (resume přes f11-progress.ndjson)
// Spec: docs/arch/migration-matrix/f11-chat.md (FE repo).

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

const BACKEND = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/backend';
const MIGRATION = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const MAP_OUT = `${MIGRATION}/f11-img-map.json`;
const NDJSON = `${MIGRATION}/f11-progress.ndjson`;
const F12_MAP = `${MIGRATION}/f12-map.json.gz`;

const require = createRequire(`${BACKEND}/package.json`);
const cloudinary = require('cloudinary').v2;
const { BSON } = require(`${BACKEND}/node_modules/bson`);

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const CONCURRENCY = 5;
const RETRIES = 3;
const TIMEOUT_MS = 120000;
const FOLDER = 'matrix/chat';

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

const stripDrive = (s) => (s && s.startsWith('drive:') ? s.slice(6) : s);

// F12 reuse: gdriveId → secure_url (už nahrané jako page/group obrázky)
function loadF12() {
  const m = new Map();
  try {
    const arr = JSON.parse(gunzipSync(readFileSync(F12_MAP)));
    for (const r of arr) if (r.gdriveId && r.secure_url) m.set(r.gdriveId, r);
  } catch (e) {
    console.warn('VAROVÁNÍ: f12-map nenačtena (žádný reuse):', e.message);
  }
  return m;
}

// Sestaví distinct GDrive tasky + base64 tasky z dumpu.
function buildTasks(f12) {
  const groups = readBson('chatGroups');
  const channels = readBson('ChatChannels');
  const msgs = readBson('ChatMessages');
  const emotes = readBson('CustomEmotes');

  const gdriveIds = new Set();
  const addGid = (raw) => { const g = stripDrive(raw); if (g) gdriveIds.add(g); };

  for (const g of groups) if (g.icon) addGid(g.icon);
  for (const c of channels) if (c.Icon) addGid(c.Icon);
  for (const e of emotes) if (e.imageId) addGid(e.imageId);
  for (const m of msgs) {
    if (m.overrideAvatarUrl) addGid(m.overrideAvatarUrl); // holé GID
    if (m.image && m.image.startsWith('drive:')) addGid(m.image);
  }

  const gdriveTasks = [];
  for (const gid of gdriveIds) {
    if (f12.has(gid)) continue; // reuse → nestahuj
    gdriveTasks.push({ kind: 'gdrive', id: gid, gdriveId: gid });
  }

  const base64Tasks = [];
  for (const m of msgs) {
    const mid = String(m._id);
    if (m.image && m.image.startsWith('data:')) base64Tasks.push({ kind: 'b64', id: `b64:${mid}:s`, dataUri: m.image, publicId: `chat-${mid}-s` });
    if (Array.isArray(m.images)) m.images.forEach((img, i) => {
      if (img && img.startsWith('data:')) base64Tasks.push({ kind: 'b64', id: `b64:${mid}:${i}`, dataUri: img, publicId: `chat-${mid}-${i}` });
    });
  }
  return { gdriveTasks, base64Tasks, gdriveIds, counts: { gdriveDistinct: gdriveIds.size, reuse: gdriveIds.size - gdriveTasks.length } };
}

function loadDone() {
  const done = new Set();
  if (!existsSync(NDJSON)) return done;
  for (const line of readFileSync(NDJSON, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.url) done.add(r.id); } catch { /* ignore */ }
  }
  return done;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn) {
  let last;
  for (let a = 0; a < RETRIES; a++) {
    try { return await fn(); } catch (e) { last = e; await sleep(1000 * (a + 1) * (a + 1)); }
  }
  throw last;
}

function uploadVariant(url, publicId) {
  return cloudinary.uploader.upload(url, {
    folder: FOLDER, public_id: publicId, overwrite: true, resource_type: 'image',
    format: 'webp', transformation: [{ width: 2560, crop: 'limit', quality: 'auto:good' }], timeout: TIMEOUT_MS,
  });
}

async function uploadGdrive(t) {
  const primary = `https://drive.google.com/uc?export=download&id=${t.gdriveId}`;
  const thumb = `https://drive.google.com/thumbnail?id=${t.gdriveId}&sz=w2560`;
  let res, viaThumb = false;
  try {
    res = await withRetry(() => uploadVariant(primary, t.gdriveId));
  } catch (e) {
    if (String(e?.message || e).includes('File size too large')) { res = await withRetry(() => uploadVariant(thumb, t.gdriveId)); viaThumb = true; }
    else throw e;
  }
  return { id: t.id, url: res.secure_url, public_id: res.public_id, width: res.width, height: res.height, bytes: res.bytes, viaThumb };
}
async function uploadB64(t) {
  const res = await withRetry(() => uploadVariant(t.dataUri, t.publicId));
  return { id: t.id, url: res.secure_url, public_id: res.public_id, width: res.width, height: res.height, bytes: res.bytes };
}

async function runPool(items, worker, concurrency) {
  let idx = 0, ok = 0, fail = 0;
  const total = items.length;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      try { const r = await worker(items[i]); appendFileSync(NDJSON, JSON.stringify(r) + '\n'); ok++; }
      catch (e) { appendFileSync(NDJSON, JSON.stringify({ id: items[i].id, error: String(e?.message || e) }) + '\n'); fail++; }
      const n = ok + fail;
      if (n % 20 === 0 || n === total) console.log(`  ${n}/${total}  ok=${ok} fail=${fail}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return { ok, fail };
}

function buildMap(f12, chatGids) {
  const byId = new Map();
  // F12 reuse — jen chat-relevantní GIDy (ne celá F12 mapa 3409 položek)
  for (const gid of chatGids) { const r = f12.get(gid); if (r) byId.set(gid, { url: r.secure_url, public_id: r.public_id, width: r.width, height: r.height, reuse: true }); }
  // F11 NDJSON úspěšné (přebije reuse jen pro vlastní GID/b64)
  if (existsSync(NDJSON)) for (const line of readFileSync(NDJSON, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.url) byId.set(idToMapKey(r.id), { url: r.url, public_id: r.public_id, width: r.width, height: r.height, bytes: r.bytes }); } catch { /* ignore */ }
  }
  const obj = Object.fromEntries(byId);
  writeFileSync(MAP_OUT, JSON.stringify(obj));
  writeFileSync(`${MAP_OUT}.gz`, gzipSync(JSON.stringify(obj)));
  return obj;
}
// gdrive NDJSON id = gdriveId (klíč mapy = GID); b64 id = "b64:.." (klíč = stejný)
function idToMapKey(id) { return id; }

async function main() {
  const cloud = configureCloudinary();
  const f12 = loadF12();
  const { gdriveTasks, base64Tasks, gdriveIds, counts } = buildTasks(f12);
  // gdrive NDJSON resume klíč = gdriveId; map ho ukládá pod GID
  for (const t of gdriveTasks) t.id = t.gdriveId;
  console.log(`Cloudinary: ${cloud} | folder: ${FOLDER}`);
  console.log(`GDrive distinct: ${counts.gdriveDistinct} | reuse z F12: ${counts.reuse} | k uploadu: ${gdriveTasks.length} | base64: ${base64Tasks.length}`);

  const done = loadDone();
  let tasks = [...gdriveTasks, ...base64Tasks].filter((t) => !done.has(t.id));
  if (Number.isFinite(LIMIT)) tasks = tasks.slice(0, LIMIT);
  console.log(`Hotovo (resume): ${done.size} | teď: ${tasks.length}` + (Number.isFinite(LIMIT) ? ` (LIMIT ${LIMIT})` : ''));

  if (tasks.length) {
    const t0 = Date.now();
    const { ok, fail } = await runPool(tasks, (t) => (t.kind === 'gdrive' ? uploadGdrive(t) : uploadB64(t)), CONCURRENCY);
    console.log(`Hotovo: ok=${ok} fail=${fail} za ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } else console.log('Nic k uploadu.');

  const map = buildMap(f12, gdriveIds);
  console.log(`f11-img-map.json: ${Object.keys(map).length} klíčů → ${MAP_OUT} (+ .gz)`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
