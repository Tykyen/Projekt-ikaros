// F6 — telo mongosh importu (pavucina). Spousti se v mongosh kontextu, kde
// workflow predem definuje globaly: DRY (bool), WORLD (str), data ({subjects,...}).
// Logika v IIFE (mongosh gotcha #3: vyhodnocuje po prikazech).
// Spec: docs/arch/migration-matrix/f6-pavucina.md (FE repo).
(function () {
  const tyky = db.users.findOne({ email: 'tykytanjunior@gmail.com' }, { _id: 1 });
  if (!tyky) {
    print('CHYBA: Tyky (tykytanjunior@gmail.com) nenalezen v users -> STOP (owner by chybel)');
    return;
  }
  const ownerId = String(tyky._id);
  let oid = null;
  try {
    oid = ObjectId(WORLD);
  } catch (e) {}

  function pageExists(slug) {
    if (!slug) return false;
    let p = db.pages.findOne({ slug: slug, worldId: WORLD }, { _id: 1 });
    if (!p && oid) p = db.pages.findOne({ slug: slug, worldId: oid }, { _id: 1 });
    return !!p;
  }

  // --- DRY: overeni proti prod DB (F12 lekce: prod != dump) ---
  if (DRY) {
    const ps = db.pages.findOne({ worldId: WORLD }, { _id: 1 });
    const psO = oid ? db.pages.findOne({ worldId: oid }, { _id: 1 }) : null;
    print('pages.worldId: string match=' + (ps ? 'ANO' : 'ne') + ' | ObjectId match=' + (psO ? 'ANO' : 'ne'));

    const miss = [];
    let withSlug = 0;
    for (const s of data.subjects) {
      if (s.linkedPageSlug) {
        withSlug++;
        if (!pageExists(s.linkedPageSlug)) miss.push({ slug: s.linkedPageSlug, name: s.name, type: s.type });
      }
    }
    print('subjekty s linkedPageSlug=' + withSlug + ' | NEsedi na prod Page=' + miss.length);
    if (miss.length) print('NESEDI (slug): ' + miss.map(function (m) { return m.slug + ' (' + m.name + ')'; }).join(', '));

    // DIAG: slug-drift se stal v PROD (v dumpu slugy existuji) -> dohledej prod kandidaty podle jmena.
    if (miss.length) {
      print('--- DIAG kandidati (NESEDI slug -> prod pages/characters podle jmena) ---');
      function cand(coll, field, rx) {
        let arr = db.getCollection(coll).find({ [field]: rx, worldId: WORLD }, { slug: 1, [field]: 1 }).limit(6).toArray();
        if (!arr.length && oid) arr = db.getCollection(coll).find({ [field]: rx, worldId: oid }, { slug: 1, [field]: 1 }).limit(6).toArray();
        return arr.map(function (x) { return x.slug + ' /' + x[field]; }).join(' | ') || '-';
      }
      for (const m of miss) {
        const first = String(m.name).split(' ')[0];
        const rx = new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        print('  ' + m.slug + ' ("' + m.name + '", ' + m.type + ')');
        print('     pages: ' + cand('pages', 'title', rx));
        print('     chars: ' + cand('characters', 'name', rx));
      }
    }

    print(
      'existujici v matrix svete: subjects=' +
        db.campaignSubjects.countDocuments({ worldId: WORLD }) +
        ' rels=' +
        db.campaignRelationships.countDocuments({ worldId: WORLD }) +
        ' stories=' +
        db.campaignStorylines.countDocuments({ worldId: WORLD }) +
        ' notes=' +
        db.campaignQuickNotes.countDocuments({ worldId: WORLD }),
    );
  }

  // --- import (upsert podle zachovaneho _id => idempotence) ---
  const now = new Date();
  function imp(coll, arr) {
    let ins = 0,
      upd = 0;
    for (const item of arr) {
      const _id = ObjectId(item._id);
      const doc = Object.assign({}, item);
      delete doc._id; // _id nesmi byt v $set pri upsertu (immutable)
      doc.worldId = WORLD;
      doc.ownerId = ownerId;
      doc.isShared = true;
      doc._mig = 'f6';
      doc.createdAt = item.createdAt ? new Date(item.createdAt) : now;
      doc.updatedAt = item.updatedAt ? new Date(item.updatedAt) : now;
      const exists = db.getCollection(coll).findOne({ _id: _id }, { _id: 1 });
      if (!DRY) db.getCollection(coll).updateOne({ _id: _id }, { $set: doc }, { upsert: true });
      if (exists) upd++;
      else ins++;
    }
    print((DRY ? '[DRY] ' : '') + coll + ': novych=' + ins + ' existujicich(update)=' + upd);
  }

  print('=== F6 pavucina ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (owner=' + ownerId + ', world=' + WORLD + ') ===');
  imp('campaignSubjects', data.subjects);
  imp('campaignRelationships', data.relationships);
  imp('campaignStorylines', data.storylines);
  imp('campaignQuickNotes', data.quickNotes);
})();
