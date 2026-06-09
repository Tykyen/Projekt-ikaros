// Rulebook kapitoly 10-13 (graficke) — telo mongosh importu. Workflow predem definuje DRY/WORLD/data.
// data = {pages:[...], menuItems:[...]}. MAGIE = sub-hub (Seznam + menu 21 typu) + 21 typu (Ostatni
// + imageUrl + quickRef). PROGRAMOVANI + JAZYKY = stranky. Vzor Page: 'pravidla' (Seznam) / 'aspekty' (Ostatni).
// Zaradi kapitoly 10-13 do hubu 'pravidla' menu (merge). IIFE (mongosh gotcha #3).
(function () {
  const tplHub = db.pages.findOne({ slug: 'pravidla', worldId: WORLD });
  const tplCh = db.pages.findOne({ slug: 'aspekty', worldId: WORLD });
  if (!tplHub || !tplCh) {
    print('CHYBA: vzory "pravidla"/"aspekty" nenalezeny (rulebook neseednut?) -> STOP');
    return;
  }
  const now = new Date();
  let ins = 0, upd = 0;
  for (const p of data.pages) {
    const setFields = {
      title: p.title,
      type: p.type,
      order: p.order,
      content: p.content,
      imageUrl: p.imageUrl || null,
      _mig: 'rulebook-ch10-13',
      updatedAt: now,
    };
    if ('quickRef' in p) setFields.quickRef = p.quickRef || '';
    if ('menu' in p) setFields.menu = p.menu;

    const exists = db.pages.findOne({ slug: p.slug, worldId: WORLD }, { _id: 1 });
    if (exists) {
      if (!DRY) db.pages.updateOne({ _id: exists._id }, { $set: setFields });
      upd++;
    } else {
      const tpl = p.type === 'Seznam' ? tplHub : tplCh;
      const doc = Object.assign({}, tpl);
      delete doc._id;
      if (p.type !== 'Seznam') delete doc.menu; // kapitola nema menu
      Object.assign(doc, setFields, { slug: p.slug, worldId: WORLD, createdAt: now });
      if (!p.imageUrl) delete doc.imageUrl;
      if (!('quickRef' in p)) delete doc.quickRef;
      if (!DRY) db.pages.insertOne(doc);
      ins++;
    }
  }

  // hub 'pravidla' menu — merge kapitol 10-13 (idempotent)
  const hub = db.pages.findOne({ slug: 'pravidla', worldId: WORLD });
  let menuBefore = hub && hub.menu ? hub.menu.length : 0, added = 0;
  if (hub) {
    const menu = (hub.menu || []).slice();
    const have = {};
    menu.forEach((m) => (have[m.href] = true));
    for (const mi of data.menuItems) if (!have[mi.href]) { menu.push(mi); added++; }
    menu.sort((a, b) => a.order - b.order);
    if (!DRY && added) db.pages.updateOne({ _id: hub._id }, { $set: { menu: menu, updatedAt: now } });
  }

  print('=== rulebook ch10-13 (graficke) ' + (DRY ? 'DRY-RUN' : 'IMPORT') + ' (world=' + WORLD + ') ===');
  print('stranky (Page): novych=' + ins + ' existujicich(update)=' + upd);
  print('hub "pravidla" menu: bylo ' + menuBefore + ' polozek, pridano ' + added + ' (kapitoly 10-13)');
  if (DRY) {
    const hubMagic = data.pages.find((p) => p.slug === 'magicka-pravidla');
    print('magie sub-hub: ' + (hubMagic && hubMagic.menu ? hubMagic.menu.length : 0) + ' typu (dlazdice s obrazky)');
    const noImg = data.pages.filter((p) => p.type === 'Ostatní' && !p.imageUrl).map((p) => p.slug);
    print('typy/stranky bez obrazku: ' + (noImg.length ? noImg.join(', ') : '(zadne)'));
  }
})();
