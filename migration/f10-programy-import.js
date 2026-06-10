// F10 programy — telo mongosh importu. Workflow predem definuje DRY/WORLD/data.
// data = {groups:[{_id,name,order}], items:[{_id,slug,name,price,currencyCode,description,groupId}]}.
// 1) upsert skupin do campaignShopGroups (deterministicke _id). 2) upsert polozek do campaignShopItems
//    s deterministickym _id (slug+nazev => varianty koexistuji). Resolve slug->live Page JEN kvuli
//    overeni existence + referenceLink (NE kvuli _id). Stranka chybi => skip+log.
// owner=Tyky, isShared=true (hraci vidi), marker _mig:'f10p'. IIFE (mongosh gotcha #3).
// Spec: f10-obchod.md (FE repo, sekce "Programy follow-up").
(function () {
  const tyky = db.users.findOne({ email: 'tykytanjunior@gmail.com' }, { _id: 1 });
  if (!tyky) {
    print('CHYBA: Tyky (tykytanjunior@gmail.com) nenalezen v users -> STOP (ownerId by chybel)');
    return;
  }
  const ownerId = String(tyky._id);
  let oid = null;
  try { oid = ObjectId(WORLD); } catch (e) {}
  const now = new Date();

  function findPage(slug) {
    let p = db.pages.findOne({ slug: slug, worldId: WORLD }, { _id: 1, slug: 1 });
    if (!p && oid) p = db.pages.findOne({ slug: slug, worldId: oid }, { _id: 1, slug: 1 });
    return p;
  }

  // 1) skupiny (upsert podle deterministickeho _id => idempotence)
  let gIns = 0, gUpd = 0;
  for (const g of data.groups) {
    const _id = ObjectId(g._id);
    const exists = db.campaignShopGroups.findOne({ _id: _id }, { _id: 1 });
    if (!DRY)
      db.campaignShopGroups.updateOne(
        { _id: _id },
        { $set: { worldId: WORLD, ownerId: ownerId, isShared: true, name: g.name, order: g.order, discountPercent: 0, _mig: 'f10p', createdAt: now, updatedAt: now } },
        { upsert: true },
      );
    if (exists) gUpd++; else gIns++;
  }

  // 2) polozky (deterministicke _id => varianty koexistuji; resolve page kvuli existence + referenceLink)
  let ins = 0, upd = 0, skip = 0;
  const missing = [];
  for (const it of data.items) {
    const page = findPage(it.slug);
    if (!page) { skip++; missing.push(it.slug); continue; }
    const _id = ObjectId(it._id);
    const doc = {
      worldId: WORLD,
      ownerId: ownerId,
      isShared: true,
      name: it.name,
      description: it.description || '',
      groupId: it.groupId || '',
      price: it.price,
      currencyCode: it.currencyCode,
      discountPercent: 0,
      linkedItemIds: [],
      referenceLink: page.slug,
      isRecommended: false,
      _mig: 'f10p',
      createdAt: now,
      updatedAt: now,
    };
    const exists = db.campaignShopItems.findOne({ _id: _id }, { _id: 1 });
    if (!DRY) db.campaignShopItems.updateOne({ _id: _id }, { $set: doc }, { upsert: true });
    if (exists) upd++; else ins++;
  }

  print('=== F10 programy ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (owner=Tyky ' + ownerId + ', isShared=true) ===');
  print('campaignShopGroups: novych=' + gIns + ' existujicich(update)=' + gUpd);
  print('campaignShopItems: novych=' + ins + ' existujicich(update)=' + upd + ' | skip(bez stranky)=' + skip);
  if (DRY) {
    const ps = db.pages.findOne({ worldId: WORLD }, { _id: 1 });
    print('pages.worldId: string match=' + (ps ? 'ANO' : 'ne') + ' | ObjectId match=' + (oid && db.pages.findOne({ worldId: oid }, { _id: 1 }) ? 'ANO' : 'ne'));
    print('polozek=' + data.items.length + ' | napárováno na Page=' + (ins + upd) + ' | NEnalezena stránka (skip)=' + skip);
    if (missing.length) print('NEnalezene slugy (-> ALIAS/kontrola): ' + missing.join(', '));
    print('--- skupiny (nazev: pocet polozek) ---');
    for (const g of data.groups) print('  ' + g.name + ': ' + data.items.filter(function (x) { return x.groupId === g._id; }).length);
  }
})();
