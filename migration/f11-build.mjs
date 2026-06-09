// F11 build — chat kolekce z dumpu -> f11-data.json(.gz) = {groups,channels,messages,readStatuses,emote,meta}.
// Logika: viz docs/arch/migration-matrix/f11-chat.md (FE repo). Vzor F9 build.
//
// Mapování: skupiny logickým klíčem (runtime resolve), channelId zpráv = channelOldId (runtime remap),
// senderId/Participants/reactions -> F1(newId), customFont CSS->klíč, image/images[]->attachments[]
// (Cloudinary z f11-img-map, tenor ponechán). _id zpráv ZACHOVÁNY (reply funguje). PascalCase->camel.
//
// Spuštění: node migration/f11-build.mjs   (nejdřív f11-upload.mjs kvůli f11-img-map.json)

import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const MIG = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const OUT = `${MIG}/f11-data.json`;

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
const newOid = () => new BSON.ObjectId().toHexString();
const clean = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
const stripDrive = (s) => (s && s.startsWith('drive:') ? s.slice(6) : s);
const toIso = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : null);

// --- F1 user-map (oldId -> {newId,username}) ---
const f1 = JSON.parse(fs.readFileSync('C:/tmp/f1-user-map.json', 'utf8'));
const byOld = {};
let tykyId = null;
for (const v of Object.values(f1)) {
  if (v && v.oldId) byOld[v.oldId] = v.newId;
  if (v && v.username === 'Tyky') tykyId = v.newId;
}
let mapHit = 0, mapMiss = 0;
const mapUser = (oldId) => { const n = byOld[String(oldId)]; if (n) { mapHit++; return n; } mapMiss++; return null; };

// --- image map ---
const imgMap = JSON.parse(fs.readFileSync(`${MIG}/f11-img-map.json`, 'utf8'));
const imgByGid = (gid) => imgMap[gid] || null;
const imgByKey = (key) => imgMap[key] || null;

// --- font CSS -> Ikaros klíč ---
const FONT_MAP = {
  inherit: null,
  "'Crimson Text', serif": 'crimson',
  "'Lora', serif": 'lora',
  "'Courier New', Courier, monospace": 'mono',
  "'Cormorant Garamond', serif": 'cormorant',
  "'VT323', monospace": 'sharetech',
  "'Great Vibes', cursive": 'greatvibes',
};
let fontUnknown = new Set();
const mapFont = (css) => {
  if (!css) return null;
  if (css in FONT_MAP) return FONT_MAP[css];
  fontUnknown.add(css);
  return null;
};

const groupsRaw = readBson('chatGroups');
const channelsRaw = readBson('ChatChannels');
const msgsRaw = readBson('ChatMessages');
const readRaw = readBson('ChannelReadStatuses');
const emoteRaw = readBson('CustomEmotes');

// group _id(hex) -> name (pro mapování channel.groupId reference)
const groupNameById = {};
for (const g of groupsRaw) groupNameById[g._id.toString()] = g.name;

// === GROUP PLAN (logické klíče) ===
// Globální/Postavy = default (find by name); frakce = linked (find by linkedWorldGroup);
// GMOI/Komunikace Hráči = standalone (find-or-create).
const groups = [
  { key: 'Globální', kind: 'default', name: 'Globální', desiredColor: '3' }, // #00ff41 -> slot4
  { key: 'Postavy', kind: 'default', name: 'Postavy' },
  { key: 'linked:Evropani', kind: 'linked', name: 'Evropani', linkedWorldGroup: 'Evropani' },
  { key: 'linked:Lumíci', kind: 'linked', name: 'Lumíci', linkedWorldGroup: 'Lumíci' },
  { key: 'linked:MI6', kind: 'linked', name: 'MI6', linkedWorldGroup: 'MI6' },
  { key: 'standalone:GMOI', kind: 'standalone', name: 'GMOI', desiredColor: '7', order: 6,
    imageUrl: (() => { const g = groupsRaw.find((x) => x.name === 'GMOI'); const m = g && g.icon ? imgByGid(stripDrive(g.icon)) : null; return m ? m.url : undefined; })() },
  { key: 'standalone:Komunikace Hráči', kind: 'standalone', name: 'Komunikace Hráči', order: 4,
    imageUrl: (() => { const g = groupsRaw.find((x) => x.name === 'Komunikace Hráči'); const m = g && g.icon ? imgByGid(stripDrive(g.icon)) : null; return m ? m.url : undefined; })() },
].map(clean);

// === CHANNELS ===
// rozhodne groupKey + accessMode + memberIds dle Type/Team/groupId.
const SKIP_CHANNELS = new Set(['w_69fc60afff52bf6968156585_global']); // cizí svět, 0 zpráv
const channelIdMapPreview = {}; // oldId -> newId (jen pro lokální dangling check)
const orderByGroup = {};
const channels = [];
for (const c of channelsRaw) {
  const oldId = String(c._id);
  if (SKIP_CHANNELS.has(oldId)) continue;
  const type = c.Type;
  const parts = (Array.isArray(c.Participants) ? c.Participants : []).map(mapUser).filter(Boolean);
  let groupKey, accessMode, chanType = 'all', linkedMemberUserId, factionGroup, allowedMemberIds;

  if (type === 'team_ic' || type === 'team_ooc') {
    if (c.Team) { groupKey = `linked:${c.Team}`; accessMode = 'members'; factionGroup = c.Team; }
    else if (c.groupId && groupNameById[String(c.groupId)] === 'GMOI') { groupKey = 'standalone:GMOI'; accessMode = 'all'; }
    else { groupKey = 'Globální'; accessMode = 'all'; }
  } else if (type === 'pj_dm') {
    groupKey = 'Postavy'; accessMode = 'members'; chanType = 'character';
    linkedMemberUserId = parts[0] || null;
    allowedMemberIds = parts[0] ? [parts[0]] : [];
  } else if (type === 'pj_group' || type === 'inter') {
    groupKey = 'standalone:Komunikace Hráči'; accessMode = 'members'; allowedMemberIds = parts;
  } else {
    groupKey = 'Globální'; accessMode = 'all'; // fallback
  }

  const newId = newOid();
  channelIdMapPreview[oldId] = newId;
  orderByGroup[groupKey] = (orderByGroup[groupKey] || 0) + 1;
  const icon = c.Icon ? imgByGid(stripDrive(c.Icon)) : null;

  channels.push(clean({
    oldId,
    newId,
    groupKey,
    name: c.Name,
    type: chanType,
    accessMode,
    allowedRoles: [],
    allowedMemberIds: allowedMemberIds, // undefined u faction -> runtime spočítá
    factionGroup,
    linkedMemberUserId,
    imageUrl: icon ? icon.url : undefined,
    order: orderByGroup[groupKey] - 1,
    isDeleted: false,
  }));
}

// === MESSAGES (zachovat _id; channelId = channelOldId, runtime remap) ===
function buildAttachments(m) {
  const mid = String(m._id);
  const out = [];
  const push = (entry, key, mime) => {
    if (!entry) return;
    out.push(clean({
      url: entry.url,
      publicId: entry.public_id || key,
      type: 'image',
      mimeType: mime || 'image/webp',
      filename: `${mid}.${(mime || 'image/webp').split('/')[1]}`,
      size: entry.bytes || 1,
    }));
  };
  if (m.image) {
    if (m.image.startsWith('data:')) push(imgByKey(`b64:${mid}:s`), `chat-${mid}-s`);
    else if (m.image.startsWith('drive:')) push(imgByGid(stripDrive(m.image)), stripDrive(m.image));
    else if (m.image.startsWith('http')) out.push(clean({ url: m.image, publicId: `tenor-${mid}-s`, type: 'image', mimeType: 'image/gif', filename: `${mid}.gif`, size: 1 }));
  }
  if (Array.isArray(m.images)) m.images.forEach((img, i) => {
    if (img && img.startsWith('data:')) push(imgByKey(`b64:${mid}:${i}`), `chat-${mid}-${i}`);
    else if (img && img.startsWith('http')) out.push(clean({ url: img, publicId: `tenor-${mid}-${i}`, type: 'image', mimeType: 'image/gif', filename: `${mid}.gif`, size: 1 }));
  });
  return out;
}
function mapReactions(r) {
  if (!r || Array.isArray(r) || typeof r !== 'object') return {};
  const out = {};
  for (const [emoji, users] of Object.entries(r)) {
    const mapped = (Array.isArray(users) ? users : []).map(mapUser).filter(Boolean);
    if (mapped.length) out[emoji] = mapped;
  }
  return out;
}
function splitReply(preview) {
  // Matrix replyToPreview = "Jméno: text" -> {name, text}
  if (!preview) return { name: undefined, text: preview };
  const i = preview.indexOf(': ');
  if (i > 0 && i < 40) return { name: preview.slice(0, i), text: preview.slice(i + 2) };
  return { name: undefined, text: preview };
}

let attCount = 0, senderMiss = 0;
const messages = msgsRaw.map((m) => {
  const sender = mapUser(m.senderId);
  if (!sender) senderMiss++;
  const att = buildAttachments(m);
  attCount += att.length;
  const reply = m.replyToId ? splitReply(m.replyToPreview) : { name: undefined, text: undefined };
  const avatar = m.overrideAvatarUrl ? imgByGid(stripDrive(m.overrideAvatarUrl)) : null;
  return clean({
    _id: String(m._id),
    channelOldId: String(m.channelId),
    senderId: sender || String(m.senderId),
    senderName: m.senderName,
    content: m.content != null ? m.content : null,
    createdAt: toIso(m.timestamp),
    updatedAt: toIso(m.editedAt || m.timestamp),
    isEdited: !!m.isEdited,
    isDeleted: !!m.isDeleted,
    attachments: att,
    reactions: mapReactions(m.reactions),
    customFont: mapFont(m.customFont),
    overrideName: m.overrideName || undefined,
    overrideAvatarUrl: avatar ? avatar.url : (m.overrideAvatarUrl && m.overrideAvatarUrl.startsWith('http') ? m.overrideAvatarUrl : undefined),
    rpDate: m.rpDate || undefined,
    replyToId: m.replyToId || undefined,
    replyToPreview: reply.text || undefined,
    replyToSenderName: reply.name || undefined,
  });
});

// === READ STATUSES (skip uživatel mimo F1; skip dangling na smazaný/skipnutý kanál) ===
let rsSkip = 0, rsDangling = 0;
const chanOldIdSet = new Set(channels.map((c) => c.oldId));
const readStatuses = [];
for (const r of readRaw) {
  const uid = byOld[String(r.UserId)];
  if (!uid) { rsSkip++; continue; }
  if (!chanOldIdSet.has(String(r.ChannelId))) { rsDangling++; continue; } // kanál neexistuje
  readStatuses.push(clean({ channelOldId: String(r.ChannelId), userId: uid, lastReadAt: toIso(r.LastReadUtc) }));
}

// === EMOTE ===
const emote = (() => {
  const e = emoteRaw[0];
  if (!e) return null;
  const img = imgByGid(stripDrive(e.imageId));
  return clean({ name: e.name, shortcode: e.shortcode, imageId: stripDrive(e.imageId), imageUrl: img ? img.url : null, createdBy: tykyId });
})();

// === dangling check (lokální) ===
const chanOldIds = new Set(channels.map((c) => c.oldId));
const danglingMsgs = messages.filter((m) => !chanOldIds.has(m.channelOldId));
const danglingRs = readStatuses.filter((r) => !chanOldIds.has(r.channelOldId));

const data = { groups, channels, messages, readStatuses, emote, meta: { tykyId, builtAt: new Date().toISOString() } };
fs.writeFileSync(OUT, JSON.stringify(data));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(data)));

// === log ===
const byKey = channels.reduce((m, c) => ((m[c.groupKey] = (m[c.groupKey] || 0) + 1), m), {});
console.log('=== F11 build hotovo ===');
console.log(`skupiny(plan): ${groups.length} | kanály: ${channels.length} (skip ${SKIP_CHANNELS.size}) | zprávy: ${messages.length} | readStatus: ${readStatuses.length} (skip uživatel ${rsSkip} / dangling ${rsDangling}) | emote: ${emote ? 1 : 0}`);
console.log('kanály per groupKey:', JSON.stringify(byKey));
console.log(`F1 mapování: hit=${mapHit} miss=${mapMiss} | senderMiss=${senderMiss}`);
console.log(`attachments celkem: ${attCount} | character kanálů(pj_dm): ${channels.filter((c) => c.type === 'character').length}`);
console.log(`reply zpráv: ${messages.filter((m) => m.replyToId).length} | override(NPC): ${messages.filter((m) => m.overrideName).length} | rpDate: ${messages.filter((m) => m.rpDate).length}`);
console.log(`font neznámé (->null): ${fontUnknown.size}`, [...fontUnknown]);
console.log(`DANGLING: zprávy=${danglingMsgs.length} readStatus=${danglingRs.length}` + (danglingMsgs.length ? ' !!! ' + [...new Set(danglingMsgs.map((m) => m.channelOldId))].slice(0, 5) : ''));
console.log('Tyky id:', tykyId);
console.log('Výstup:', OUT, '(+ .gz)');
