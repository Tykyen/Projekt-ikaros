// F6 — build: Campaign*.bson -> f6-campaign.json(.gz)
// Pavucina stareho Matrixu (subjekty/vztahy/linky/poznamky) -> Ikaros campaign modul.
// Spec: docs/arch/migration-matrix/f6-pavucina.md (FE repo).
//
// Transform: zachova _id (reference subjectAId/BId/subjectIds sedi bez premapovani),
//   linkedDiarySlug zahodi, linkedCharacterSlug=linkedPageSlug (jen PC/NPC),
//   sideA/sideB doplni strength:5, *Utc -> *At (ISO).
// worldId/ownerId/isShared/_mig doplni workflow (Tyky lookup na jednom miste).
//
// Spusteni: node migration/f6-build.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BSON } = require('../backend/node_modules/bson');

const DUMP = 'C:/Matrix/dump/MatrixDatabase';
const OUT = new URL('./f6-campaign.json', import.meta.url).pathname.replace(/^\//, '');

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

// Slug-drift (F7): stara data kratky slug, produkcni Page prejmenovana.
// Mapa se finalizuje po dry-run DIAG. Zatim prevzato z F7.
const ALIAS = {
  john: 'john-willscar',
  kraven: 'pumi-stin',
  mingguo: 'li-mingguo',
  // F6 dry-run DIAG (prod-drift, overeno proti newmatrix):
  'abigail-wattson': 'abi', // char abi /Abigail Wattson
  katerina: 'katerina-penkavova', // char katerina-penkavova /Kateřina Pěnkavová
  // zubni-vily (FACTION "Zubní víly") = bez prod stranky -> ponechano (jen jmeno/uzel)
};
const aliased = new Set();
function mapSlug(slug) {
  if (!slug) return undefined;
  const a = ALIAS[slug];
  if (a) {
    aliased.add(`${slug} -> ${a}`);
    return a;
  }
  return slug;
}

// Majitele pavucin = hraci navazani na postavy (F1 user-map). Zachovat per-zaznam.
// bez ownera + neznamy -> Tyky (PJ; uzivatel si nepatricne pak rucne vycisti).
const TYKY = '6a22639538e14e7238e74ef9';
const OWNER = {
  '67fd6557c8454caabb71eba0': TYKY, // Tyky (PJ)
  'PJ_BASE_67fd6557c8454caabb71eba0': TYKY, // Tyky base-variant
  '68066ce33733a3a8e148cc7e': '6a22ae54015caeda1af7d046', // FOksiGen (Kuro)
  '6803c8770438a863c04bdeae': '6a23f4f4f01021af8f8ce5b0', // Willscar (Pumí stín / Kraven)
  '68e39cdd3c661f34cc0ae028': '6a23f4f4f01021af8f8ce5c0', // Mandloň (Li Mingguo)
};
const ownerOf = (oldId) => (oldId && OWNER[oldId]) || TYKY;
const ownerNames = { [TYKY]: 'Tyky', '6a22ae54015caeda1af7d046': 'FOksiGen', '6a23f4f4f01021af8f8ce5b0': 'Willscar', '6a23f4f4f01021af8f8ce5c0': 'Mandloň' };

const iso = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : undefined);
const str = (v) => (v == null ? undefined : String(v));
const clean = (o) => {
  // odstran undefined klice (aby JSON nenesl prazdne)
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
};

// --- SUBJECTS ---
const rawSubjects = readBson('CampaignSubjects');
const subjects = rawSubjects.map((s) => {
  const page = mapSlug(s.linkedPageSlug || undefined);
  const isPcNpc = s.type === 'PC' || s.type === 'NPC';
  return clean({
    _id: String(s._id),
    ownerId: ownerOf(s.ownerId),
    type: s.type,
    name: s.name,
    tags: s.tags || [],
    status: s.status || 'active',
    notes: s.notes || undefined,
    linkedPageSlug: page,
    linkedCharacterSlug: isPcNpc ? page : undefined,
    createdAt: iso(s.createdAtUtc),
    updatedAt: iso(s.updatedAtUtc),
  });
});

// --- RELATIONSHIPS ---
const rawRels = readBson('CampaignRelationships');
const relationships = rawRels.map((r) => {
  const side = (x) =>
    clean({
      tone: (x && x.tone) || undefined,
      behavior: (x && x.behavior) || undefined,
      gmIntent: (x && x.gmIntent) || undefined,
      strength: 5, // Matrix nema strength; schema default plati jen pres .create(), raw insert nikoli
    });
  return clean({
    _id: String(r._id),
    ownerId: ownerOf(r.ownerId),
    subjectAId: String(r.subjectAId),
    subjectBId: String(r.subjectBId),
    shared: clean({
      whatHappened: (r.shared && r.shared.whatHappened) || undefined,
      behindTheScenes: (r.shared && r.shared.behindTheScenes) || undefined,
    }),
    sideA: side(r.sideA),
    sideB: side(r.sideB),
    status: r.status || 'active',
    priority: typeof r.priority === 'number' ? r.priority : 3,
    storylineIds: (r.storylineIds || []).map(str),
    lastChangeNote: r.lastChangeNote || undefined,
    createdAt: iso(r.createdAtUtc),
    updatedAt: iso(r.updatedAtUtc),
  });
});

// --- STORYLINES ---
const rawStories = readBson('CampaignStorylines');
const storylines = rawStories.map((s) =>
  clean({
    _id: String(s._id),
    ownerId: ownerOf(s.ownerId),
    level: s.level || 'mid',
    title: s.title,
    status: s.status || 'active',
    phase: s.phase || undefined,
    summary: s.summary || undefined,
    whatHappened: s.whatHappened || undefined,
    truth: s.truth || undefined,
    playersBelief: s.playersBelief || undefined,
    gmIntent: s.gmIntent || undefined,
    nextStep: s.nextStep || undefined,
    subjectIds: (s.subjectIds || []).map(str),
    relationshipIds: (s.relationshipIds || []).map(str),
    createdAt: iso(s.createdAtUtc),
    updatedAt: iso(s.updatedAtUtc),
  }),
);

// --- QUICK NOTES ---
const rawNotes = readBson('CampaignQuickNotes');
const quickNotes = rawNotes.map((n) =>
  clean({
    _id: String(n._id),
    ownerId: ownerOf(n.ownerId),
    title: n.title,
    body: n.body || undefined,
    status: n.status || 'open',
    pinned: n.pinned === true,
    subjectIds: (n.subjectIds || []).map(str),
    storylineIds: (n.storylineIds || []).map(str),
    createdAt: iso(n.createdAtUtc),
    updatedAt: iso(n.updatedAtUtc),
  }),
);

const data = { subjects, relationships, storylines, quickNotes };
fs.writeFileSync(OUT, JSON.stringify(data));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(data)));

// --- souhrn ---
const typeDist = subjects.reduce((m, s) => ((m[s.type] = (m[s.type] || 0) + 1), m), {});
console.log('=== F6 build hotovo ===');
console.log('subjects:', subjects.length, '| type:', JSON.stringify(typeDist));
console.log('relationships:', relationships.length, '| storylines:', storylines.length, '| quickNotes:', quickNotes.length);
const ownerDist = (arr) => arr.reduce((m, x) => { const n = ownerNames[x.ownerId] || x.ownerId; m[n] = (m[n] || 0) + 1; return m; }, {});
console.log('owner subjects:', JSON.stringify(ownerDist(subjects)), '(bez-owner+nezn. → Tyky)');
console.log('owner relationships:', JSON.stringify(ownerDist(relationships)), '| storylines:', JSON.stringify(ownerDist(storylines)));
console.log('subjects s linkedCharacterSlug (PC/NPC):', subjects.filter((s) => s.linkedCharacterSlug).length);
console.log('slug premapovano aliasem:', aliased.size ? [...aliased].join(', ') : '(zadne)');
console.log('\nVystup:', OUT, '(+ .gz)');
console.log('Vzorek subject:', JSON.stringify(subjects[0]));
console.log('Vzorek relationship:', JSON.stringify(relationships[0]));
