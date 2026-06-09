// F10 skupiny — telo mongosh importu. Workflow predem definuje DRY/WORLD/data.
// data = {groups:[{_id,name,order}], items:[{slug,groupId}]}.
// Vytvori campaignShopGroups (deterministicke _id) + zaradi polozky (groupId podle referenceLink=slug).
// IIFE (mongosh gotcha #3). Spec: f10-obchod.md (FE repo).
(function () {
  const tyky = db.users.findOne({ email: 'tykytanjunior@gmail.com' }, { _id: 1 });
  if (!tyky) {
    print('CHYBA: Tyky (tykytanjunior@gmail.com) nenalezen v users -> STOP');
    return;
  }
  const ownerId = String(tyky._id);
  const now = new Date();

  // 1) skupiny (upsert podle deterministickeho _id => idempotence)
  let gIns = 0, gUpd = 0;
  for (const g of data.groups) {
    const _id = ObjectId(g._id);
    const exists = db.campaignShopGroups.findOne({ _id: _id }, { _id: 1 });
    if (!DRY)
      db.campaignShopGroups.updateOne(
        { _id: _id },
        { $set: { worldId: WORLD, ownerId: ownerId, isShared: true, name: g.name, order: g.order, discountPercent: 0, _mig: 'f10g', createdAt: now, updatedAt: now } },
        { upsert: true },
      );
    if (exists) gUpd++;
    else gIns++;
  }

  // 2) polozky -> groupId (podle referenceLink = slug, z F10)
  let iUpd = 0, iMiss = 0;
  for (const it of data.items) {
    const item = db.campaignShopItems.findOne({ worldId: WORLD, referenceLink: it.slug }, { _id: 1 });
    if (!item) { iMiss++; continue; }
    if (!DRY) db.campaignShopItems.updateOne({ _id: item._id }, { $set: { groupId: it.groupId, updatedAt: now } });
    iUpd++;
  }

  print('=== F10 skupiny ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (owner=Tyky ' + ownerId + ') ===');
  print('campaignShopGroups: novych=' + gIns + ' existujicich(update)=' + gUpd);
  print('campaignShopItems zarazeno (groupId nastaven): ' + iUpd + ' | NEnalezena polozka: ' + iMiss);
  if (DRY) {
    print('--- skupiny (nazev: pocet polozek) ---');
    for (const g of data.groups) {
      const cnt = data.items.filter(function (x) { return x.groupId === g._id; }).length;
      print('  ' + g.name + ': ' + cnt);
    }
  }
})();
