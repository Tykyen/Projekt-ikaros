// F8 — telo mongosh importu (timeline + sounds). Workflow predem definuje DRY/WORLD/data.
// data = {timeline[], sounds[]}. IIFE (mongosh gotcha #3). Spec: f8-timeline-sounds.md (FE repo).
(function () {
  const tyky = db.users.findOne({ email: 'tykytanjunior@gmail.com' }, { _id: 1 });
  if (!tyky) {
    print('CHYBA: Tyky (tykytanjunior@gmail.com) nenalezen v users -> STOP (createdBy by chybel)');
    return;
  }
  const createdBy = String(tyky._id);
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

  // --- DRY: overeni proti prod DB ---
  if (DRY) {
    const ps = db.pages.findOne({ worldId: WORLD }, { _id: 1 });
    const psO = oid ? db.pages.findOne({ worldId: oid }, { _id: 1 }) : null;
    print('pages.worldId: string match=' + (ps ? 'ANO' : 'ne') + ' | ObjectId match=' + (psO ? 'ANO' : 'ne'));

    const miss = [];
    let withSlug = 0;
    for (const t of data.timeline) {
      if (t.pageSlug) {
        withSlug++;
        if (!pageExists(t.pageSlug)) miss.push(t.pageSlug);
      }
    }
    print('timeline s pageSlug=' + withSlug + ' | NEsedi na prod Page=' + miss.length);
    if (miss.length) print('NESEDI pageSlug (-> ALIAS v f8-build.mjs): ' + miss.join(', '));

    print(
      'existujici v matrix svete: timeline_events=' +
        db.timeline_events.countDocuments({ worldId: WORLD }) +
        ' sounds=' +
        db.sounds.countDocuments({ worldId: WORLD }),
    );

    print('--- SOUNDS kategorie (vizualni kontrola enum poradi) ---');
    for (const s of data.sounds) {
      print('  "' + s.name + '": media=' + s.mediaType + ' fn=' + s.primaryFunction + ' env=' + s.environment + ' tone=' + s.emotionalTone + ' faction=' + s.factionStyle + ' tech=' + s.techLevel + ' magic=' + s.magicLevel + ' combat=' + s.combatEnergy);
    }
  }

  // --- import (upsert podle _id) ---
  const now = new Date();
  function imp(coll, arr, extra) {
    let ins = 0, upd = 0;
    for (const item of arr) {
      const _id = ObjectId(item._id);
      const doc = Object.assign({}, item, extra);
      delete doc._id;
      doc.worldId = WORLD;
      doc._mig = 'f8';
      doc.createdAt = now;
      doc.updatedAt = now;
      const exists = db.getCollection(coll).findOne({ _id: _id }, { _id: 1 });
      if (!DRY) db.getCollection(coll).updateOne({ _id: _id }, { $set: doc }, { upsert: true });
      if (exists) upd++;
      else ins++;
    }
    print((DRY ? '[DRY] ' : '') + coll + ': novych=' + ins + ' existujicich(update)=' + upd);
  }

  print('=== F8 timeline+sounds ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (world=' + WORLD + ', sounds createdBy=Tyky ' + createdBy + ') ===');
  imp('timeline_events', data.timeline, {});
  imp('sounds', data.sounds, { createdBy: createdBy, status: 'active' });
})();
