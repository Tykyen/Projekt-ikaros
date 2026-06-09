// Rulebook kapitoly 10-13 — telo mongosh importu. Workflow predem definuje DRY/WORLD/data.
// data = {pages:[{slug,title,type,order,content,imageUrl?}], menuItems:[{label,href,order}]}.
// Vlozi 4 kapitoly jako Page (vzor existujici kapitoly 'aspekty' pro povinna pole) +
// zaradi je do hubu 'pravidla' menu (merge). IIFE (mongosh gotcha #3).
(function () {
  const tpl = db.pages.findOne({ slug: 'aspekty', worldId: WORLD });
  if (!tpl) {
    print('CHYBA: vzor kapitoly "aspekty" nenalezen (rulebook neseednut?) -> STOP');
    return;
  }
  const now = new Date();
  let ins = 0, upd = 0;
  for (const p of data.pages) {
    const exists = db.pages.findOne({ slug: p.slug, worldId: WORLD }, { _id: 1 });
    const setFields = {
      title: p.title,
      type: p.type,
      order: p.order,
      content: p.content,
      imageUrl: p.imageUrl || null,
      _mig: 'rulebook-ch10-13',
      updatedAt: now,
    };
    if (exists) {
      if (!DRY) db.pages.updateOne({ _id: exists._id }, { $set: setFields });
      upd++;
    } else {
      // novy dokument = kopie vzoru (povinna pole) + override
      const doc = Object.assign({}, tpl);
      delete doc._id;
      delete doc.menu; // kapitola nema menu (jen hub)
      Object.assign(doc, setFields, { slug: p.slug, worldId: WORLD, createdAt: now });
      if (!p.imageUrl) delete doc.imageUrl;
      if (!DRY) db.pages.insertOne(doc);
      ins++;
    }
  }

  // hub 'pravidla' menu — merge chybejici polozky (idempotent)
  const hub = db.pages.findOne({ slug: 'pravidla', worldId: WORLD });
  let menuBefore = hub && hub.menu ? hub.menu.length : 0;
  let added = 0;
  if (hub) {
    const menu = (hub.menu || []).slice();
    const have = {};
    menu.forEach((m) => (have[m.href] = true));
    for (const mi of data.menuItems) {
      if (!have[mi.href]) { menu.push(mi); added++; }
    }
    menu.sort((a, b) => a.order - b.order);
    if (!DRY && added) db.pages.updateOne({ _id: hub._id }, { $set: { menu: menu, updatedAt: now } });
  } else {
    print('VAROVANI: hub "pravidla" nenalezen -> kapitoly se nezaradi do menu');
  }

  print('=== rulebook ch10-13 ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (world=' + WORLD + ') ===');
  print('kapitoly (Page): novych=' + ins + ' existujicich(update)=' + upd);
  print('hub "pravidla" menu: bylo ' + menuBefore + ' polozek, pridano ' + added + ' (kapitoly 10-13)');
  if (DRY) {
    for (const p of data.pages) print('  ' + p.slug + ' (' + p.title + ') | ' + p.content.length + ' zn HTML | img=' + (p.imageUrl || 'ne'));
  }
})();
