// F9 — telo mongosh importu (game_events). Workflow predem definuje DRY/WORLD/data.
// data = {events[]}. IIFE (mongosh gotcha #3). Spec: f9-game-events.md (FE repo).
(function () {
  if (DRY) {
    print('existujici v matrix svete: game_events=' + db.game_events.countDocuments({ worldId: WORLD }));
    const n = new Date();
    let fut = 0, arch = 0;
    print('--- AKCE k importu (date | title | targetGroup | img | rsvp) ---');
    for (const e of data.events) {
      const isFut = new Date(e.date) >= n;
      if (isFut) fut++; else arch++;
      print('  ' + e.date + '  "' + e.title + '"  tg=' + (e.targetGroup || '-') + '  img=' + (e.imageUrl ? 'ANO' : 'ne') + '  rsvp=' + e.confirmedBy.length + (isFut ? '  [budouci]' : '  [archiv]'));
    }
    print('budouci=' + fut + ' | archiv (vidi jen PJ+)=' + arch);
  }

  const now = new Date();
  let ins = 0, upd = 0;
  for (const e of data.events) {
    const _id = ObjectId(e._id);
    const doc = Object.assign({}, e);
    delete doc._id;
    doc.worldId = WORLD;
    doc._mig = 'f9';
    doc.createdAt = now;
    doc.updatedAt = now;
    if (doc.targetGroup === undefined) doc.targetGroup = null; // schema default neplati pri raw insertu
    const exists = db.game_events.findOne({ _id: _id }, { _id: 1 });
    if (!DRY) db.game_events.updateOne({ _id: _id }, { $set: doc }, { upsert: true });
    if (exists) upd++;
    else ins++;
  }
  print('=== F9 game_events ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (world=' + WORLD + ') ===');
  print('game_events: novych=' + ins + ' existujicich(update)=' + upd);
})();
