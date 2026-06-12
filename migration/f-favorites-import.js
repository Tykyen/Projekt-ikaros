// F-favorites — tělo mongosh importu (users.favoritePageSlugs[WORLD]).
// Workflow předem definuje DRY/WORLD/data. data = {favorites:[{userId,slugs}]}.
// Filtruje propadlé slugy proti pages světa, zapisuje per-uživatel osobní pořadí.
// Idempotentní (replace klíče WORLD). Spec: f-favorites.md (FE repo).
(function () {
  // Live page slugy ve světě → filtr propadlých (smazaných) oblíbených.
  const liveSlugs = new Set(
    db.pages.find({ worldId: WORLD }, { slug: 1 }).map((p) => p.slug),
  );

  let upd = 0, skipped = 0, keptSlugs = 0, droppedSlugs = 0;
  for (const f of data.favorites) {
    const kept = f.slugs.filter((s) => {
      if (liveSlugs.has(s)) return true;
      droppedSlugs++;
      return false;
    });
    keptSlugs += kept.length;

    if (kept.length === 0) {
      skipped++;
      if (DRY) print('  user ' + f.userId + ': 0/' + f.slugs.length + ' (vše propadlé)');
      continue;
    }
    if (DRY) {
      print('  user ' + f.userId + ': ' + kept.length + '/' + f.slugs.length + ' slugů');
      continue;
    }
    const r = db.users.updateOne(
      { _id: ObjectId(f.userId) },
      { $set: { ['favoritePageSlugs.' + WORLD]: kept } },
    );
    if (r.matchedCount) upd++;
    else {
      skipped++;
      print('  VAROVÁNÍ: user ' + f.userId + ' nenalezen v Ikaros DB → SKIP');
    }
  }

  print('=== F-favorites ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (world=' + WORLD + ') ===');
  print('users updated=' + upd + ' skipped=' + skipped);
  print('slugy: kept=' + keptSlugs + ' dropped(propadlé)=' + droppedSlugs);
})();
