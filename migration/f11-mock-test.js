// F11 mock — in-memory mongosh simulace f11-import.js. Ověří: group resolve (find-or-create),
// character merge (linkedMemberUserId), channel id-map, message/readStatus remap (0 skip),
// emote, a IDEMPOTENCI (re-run nezdvojí). Spuštění: node migration/f11-mock-test.js
const fs = require('fs');
const vm = require('vm');
const MIG = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration';
const data = JSON.parse(fs.readFileSync(`${MIG}/f11-data.json`, 'utf8'));
const importSrc = fs.readFileSync(`${MIG}/f11-import.js`, 'utf8');
const WORLD = '6d6174726978000000000001';

// --- ObjectId: callable bez new, stabilní podle hex, jinak unikátní ---
let oidSeq = 0;
function ObjectId(hex) { return { _oid: true, h: hex || `gen${(oidSeq++).toString(16).padStart(24, '0')}`, toString() { return this.h; } }; }

function matches(d, q) {
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') { if (!v.some((sub) => matches(d, sub))) return false; continue; }
    if (v && typeof v === 'object' && '$in' in v) { if (!v.$in.some((x) => String(d[k]) === String(x))) return false; continue; }
    if (v && typeof v === 'object' && '$exists' in v) { if ((d[k] !== undefined) !== v.$exists) return false; continue; }
    if (String(d[k]) !== String(v)) return false;
  }
  return true;
}
function makeColl(name, seed = []) {
  const docs = seed.slice();
  return {
    name, docs,
    find(q = {}) { return { toArray: () => docs.filter((d) => matches(d, q)) }; },
    findOne(q) { return docs.find((d) => matches(d, q)) || null; },
    countDocuments(q = {}) { return docs.filter((d) => matches(d, q)).length; },
    insertOne(doc) { docs.push(doc); return { insertedId: doc._id }; },
    deleteMany(q) { let n = 0; for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i], q)) { docs.splice(i, 1); n++; } return { deletedCount: n }; },
    updateOne(filter, update, opts = {}) {
      const ex = docs.find((d) => matches(d, filter));
      if (ex) { if (update.$set) Object.assign(ex, update.$set); return { modifiedCount: 1 }; }
      if (opts.upsert) { const nd = {}; for (const [k, v] of Object.entries(filter)) { if (v && typeof v === 'object' && ('$in' in v || '$or' in v || '$exists' in v)) continue; nd[k] = v; } if (!nd._id) nd._id = ObjectId(); Object.assign(nd, update.$set); docs.push(nd); return { upsertedCount: 1 }; }
      return {};
    },
  };
}

// --- seed živého světa: auto skupiny + auto kanály + 5 existujících character kanálů ---
function seedDb() {
  const gGlob = ObjectId(), gPost = ObjectId(), gEvr = ObjectId(), gLum = ObjectId(), gMi6 = ObjectId();
  const groups = [
    { _id: gGlob, worldId: WORLD, name: 'Globální', order: 0 },
    { _id: gPost, worldId: WORLD, name: 'Postavy', order: 1 },
    { _id: gEvr, worldId: WORLD, name: 'Evropani', order: 2, linkedWorldGroup: 'Evropani' },
    { _id: gLum, worldId: WORLD, name: 'Lumíci', order: 3, linkedWorldGroup: 'Lumíci' },
    { _id: gMi6, worldId: WORLD, name: 'MI6', order: 4, linkedWorldGroup: 'MI6' },
  ];
  // auto kanály (globální + frakční default) — měly by zůstat, migrace přidává své
  const channels = [
    { _id: ObjectId(), worldId: WORLD, groupId: String(gGlob), name: 'globální', accessMode: 'all', type: 'all' },
    { _id: ObjectId(), worldId: WORLD, groupId: String(gEvr), name: 'Evropani', accessMode: 'members', type: 'all', linkedWorldGroup: 'Evropani' },
    { _id: ObjectId(), worldId: WORLD, groupId: String(gLum), name: 'Lumíci', accessMode: 'members', type: 'all', linkedWorldGroup: 'Lumíci' },
    { _id: ObjectId(), worldId: WORLD, groupId: String(gMi6), name: 'MI6', accessMode: 'members', type: 'all', linkedWorldGroup: 'MI6' },
  ];
  // 5 už existujících character kanálů (auto-backfill) -> test merge
  const charChans = data.channels.filter((c) => c.type === 'character').slice(0, 5);
  for (const c of charChans) channels.push({ _id: ObjectId(), worldId: WORLD, groupId: String(gPost), name: 'starý-' + c.name, accessMode: 'members', type: 'character', linkedMemberUserId: c.linkedMemberUserId, allowedMemberIds: [c.linkedMemberUserId] });
  // memberships — Tyky PJ + pár hráčů per frakce (newIds z dat)
  const memberIds = [...new Set(data.channels.flatMap((c) => c.allowedMemberIds || []))];
  const members = [{ userId: data.meta.tykyId, role: 5, group: null }];
  memberIds.forEach((uid, i) => members.push({ userId: uid, role: 2, group: ['Evropani', 'Lumíci', 'MI6'][i % 3] }));

  return {
    chatgroups: makeColl('chatgroups', groups),
    chatchannels: makeColl('chatchannels', channels),
    chatmessages: makeColl('chatmessages'),
    channelreadstatus: makeColl('channelreadstatus'),
    custom_emotes: makeColl('custom_emotes'),
    worldmemberships: makeColl('worldmemberships', members),
  };
}

function run(label, { DRY, DIAG, db }) {
  const logs = [];
  const sandbox = { DRY: !!DRY, DIAG: !!DIAG, WORLD, data, db, ObjectId, Date, Set, Object, Array, print: (...a) => logs.push(a.join(' ')) };
  vm.createContext(sandbox);
  vm.runInContext(importSrc, sandbox);
  console.log('\n===== ' + label + ' =====');
  logs.forEach((l) => console.log('  ' + l));
  return db;
}

// 1) DIAG
run('1) DIAG', { DIAG: true, db: seedDb() });
// 2) DRY
run('2) DRY', { DRY: true, db: seedDb() });
// 3) IMPORT
const db = seedDb();
run('3) IMPORT', { DRY: false, db });
const groups = db.chatgroups.docs, channels = db.chatchannels.docs, msgs = db.chatmessages.docs;
console.log('\n  --- kontrola po IMPORTu ---');
console.log('  chatgroups: ' + groups.length + ' (čekáno 7: 5 auto + GMOI + Komunikace Hráči)');
console.log('  group názvy: ' + groups.map((g) => g.name).join(', '));
console.log('  chatchannels: ' + channels.length + ' (čekáno 46: 42 migr + 4 auto)');
console.log('  character kanálů: ' + channels.filter((c) => c.type === 'character').length + ' (čekáno 14: 5 merge + 9 nových)');
console.log('  merge ověření (starý- prefix zmizel?): ' + channels.filter((c) => c.name.startsWith('starý-')).length + ' (čekáno 0)');
console.log('  chatmessages: ' + msgs.length + ' (čekáno 1506)');
console.log('  zprávy bez channelId: ' + msgs.filter((m) => !m.channelId).length + ' (čekáno 0)');
console.log('  channelreadstatus: ' + db.channelreadstatus.docs.length + ' (čekáno 281)');
console.log('  custom_emotes: ' + db.custom_emotes.docs.length + ' (čekáno 1)');
const sample = msgs.find((m) => m.attachments && m.attachments.length);
console.log('  vzorek zprávy s přílohou: _mig=' + sample._mig + ' att=' + sample.attachments.length + ' url0=' + sample.attachments[0].url.slice(0, 50));
const reply = msgs.find((m) => m.replyToId);
console.log('  reply zachován: replyToId cílí existující _id? ' + msgs.some((m) => String(m._id) === String(reply.replyToId)));
// 4) RE-RUN idempotence
run('4) RE-RUN (idempotence)', { DRY: false, db });
console.log('\n  --- po RE-RUNu (nesmí růst) ---');
console.log('  chatgroups: ' + db.chatgroups.docs.length + ' (musí 7)');
console.log('  chatchannels: ' + db.chatchannels.docs.length + ' (musí 46)');
console.log('  chatmessages: ' + db.chatmessages.docs.length + ' (musí 1506)');
console.log('  channelreadstatus: ' + db.channelreadstatus.docs.length + ' (musí 281)');
console.log('  custom_emotes: ' + db.custom_emotes.docs.length + ' (musí 1)');
