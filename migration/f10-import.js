// F10 — telo mongosh importu (obchod). Workflow predem definuje DRY/WORLD/data.
// data = {items:[{slug,name,price,currencyCode,description}]}. Resolve slug->Page:
// shop item _id = page._id (idempotence + vazba), referenceLink = page.slug.
// IIFE (mongosh gotcha #3). Spec: f10-obchod.md (FE repo).
(function () {
  const tyky = db.users.findOne({ email: 'tykytanjunior@gmail.com' }, { _id: 1 });
  if (!tyky) {
    print('CHYBA: Tyky (tykytanjunior@gmail.com) nenalezen v users -> STOP (ownerId by chybel)');
    return;
  }
  const ownerId = String(tyky._id);
  let oid = null;
  try {
    oid = ObjectId(WORLD);
  } catch (e) {}

  function findPage(slug) {
    let p = db.pages.findOne({ slug: slug, worldId: WORLD }, { _id: 1, slug: 1 });
    if (!p && oid) p = db.pages.findOne({ slug: slug, worldId: oid }, { _id: 1, slug: 1 });
    return p;
  }

  const now = new Date();
  let ins = 0, upd = 0, skip = 0;
  const missing = [];
  for (const it of data.items) {
    const page = findPage(it.slug);
    if (!page) { skip++; missing.push(it.slug); continue; }
    const _id = page._id;
    const doc = {
      worldId: WORLD,
      ownerId: ownerId,
      isShared: true,
      name: it.name,
      description: it.description || '',
      groupId: '',
      price: it.price,
      currencyCode: it.currencyCode,
      discountPercent: 0,
      linkedItemIds: [],
      referenceLink: page.slug,
      isRecommended: false,
      _mig: 'f10',
      createdAt: now,
      updatedAt: now,
    };
    const exists = db.campaignShopItems.findOne({ _id: _id }, { _id: 1 });
    if (!DRY) db.campaignShopItems.updateOne({ _id: _id }, { $set: doc }, { upsert: true });
    if (exists) upd++;
    else ins++;
  }

  if (DRY) {
    const ps = db.pages.findOne({ worldId: WORLD }, { _id: 1 });
    print('pages.worldId: string match=' + (ps ? 'ANO' : 'ne') + ' | ObjectId match=' + (oid && db.pages.findOne({ worldId: oid }, { _id: 1 }) ? 'ANO' : 'ne'));
    print('existujici campaignShopItems v matrix: ' + db.campaignShopItems.countDocuments({ worldId: WORLD }));
    print('polozek=' + data.items.length + ' | napárováno na Page=' + (ins + upd) + ' | NEnalezena stránka (skip)=' + skip);
    if (missing.length) print('NEnalezene slugy (-> ALIAS/kontrola): ' + missing.join(', '));
  }
  print('=== F10 obchod ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (owner=Tyky ' + ownerId + ', isShared=true) ===');
  print('campaignShopItems: novych=' + ins + ' existujicich(update)=' + upd + ' | skip(bez stranky)=' + skip);
})();
