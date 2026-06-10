// F-Pravidla B — telo mongosh importu. Spousti se v mongosh kontextu, kde
// workflow predem definuje globaly: MODE ('dry'|'import'|'rollback'), WORLD (str),
// data (pole {slug,decision,title,type,content,plainText,imageUrl,table?,parent?}).
// Logika v IIFE (mongosh gotcha: vyhodnocuje po prikazech).
//
// UPSERT podle slugu (prod != dump, lekce F12): create / fill placeholder / skip konflikt.
//  - stranka:  neexistuje -> create ; existuje placeholder -> fill ; existuje realny -> KONFLIKT (neprepisovat)
//  - rulebook: existuje -> fill ; neexistuje -> skip (ceka na rulebook seed)
//  - AKJ:      staty-X -> PJ-only akjTab (access:[]) na rodicovske strance X
// worldId = STRING (jako F4d/F6; zive stranky drzi hex string, ne ObjectId).
// Spec: docs/arch/migration-matrix/f-pravidla-b.md (FE repo).
(function () {
  let oid = null; try { oid = ObjectId(WORLD); } catch (e) {}
  function findPage(slug) {
    let p = db.pages.findOne({ worldId: WORLD, slug: slug });
    if (!p && oid) p = db.pages.findOne({ worldId: oid, slug: slug });
    return p;
  }
  // placeholder = kratky/prazdny content nebo seed marker -> smi se prepsat
  function isPlaceholder(p) {
    const c = (p && p.content) || '';
    if (c.length < 400) return true;
    return /Predpripraven|Předpřipraven|placeholder|dostupn. pouze p|dostupn. pouze p/i.test(c);
  }

  // ── ROLLBACK ──
  if (MODE === 'rollback') {
    const del = db.pages.deleteMany({ worldId: WORLD, _mig: 'fpravidlab' });
    let restored = 0;
    db.pages.find({ worldId: WORLD, _migPravBBefore: { $exists: true } }).forEach(function (p) {
      const b = p._migPravBBefore || {};
      db.pages.updateOne({ _id: p._id }, {
        $set: { content: b.content || '', plainText: b.plainText || '', imageUrl: b.imageUrl || '' },
        $unset: { _migPravBBefore: '' },
      });
      restored++;
    });
    const tab = db.pages.updateMany({ worldId: WORLD, 'akjTabs._mig': 'fpravidlab' }, { $pull: { akjTabs: { _mig: 'fpravidlab' } } });
    print('ROLLBACK F-PravidlaB: smazano stranek=' + del.deletedCount + ', obnoveno fill=' + restored + ', stranek s odebranou AKJ=' + tab.modifiedCount);
    return;
  }

  const DRY = MODE !== 'import';
  const now = new Date();
  const R = { create: 0, fill: 0, already: 0, conflict: 0, skipRulebook: 0, akjAdd: 0, akjExists: 0, akjNoParent: 0 };
  const conflicts = [], skips = [], noParents = [];

  // rodic statu muze vzniknout v teto davce (stranka/rulebook) -> pro dry-run vedomi
  const slugInBatch = {};
  for (const r of data) if (r.decision === 'stranka' || r.decision === 'rulebook') slugInBatch[r.slug] = true;

  function buildPageDoc(r) {
    const doc = {
      slug: r.slug, worldId: WORLD, type: r.type || 'Ostatní', title: r.title,
      content: r.content || '', plainText: r.plainText || '', imageUrl: r.imageUrl || '',
      bigImage: false, sections: [], galleryImages: [], videos: [], menu: [],
      isWoodWide: false, accessRequirements: [], order: 0, customData: {},
      _mig: 'fpravidlab', createdAt: now, updatedAt: now,
    };
    if (r.table) doc.table = r.table;
    return doc;
  }
  function fillExisting(p, r) {
    if (DRY) return;
    if (!p._migPravBBefore) {
      db.pages.updateOne({ _id: p._id }, { $set: { _migPravBBefore: { content: p.content || '', plainText: p.plainText || '', imageUrl: p.imageUrl || '' } } });
    }
    const set = { content: r.content || '', plainText: r.plainText || '', updatedAt: now };
    if (!p.imageUrl && r.imageUrl) set.imageUrl = r.imageUrl;
    if (r.table) set.table = r.table;
    db.pages.updateOne({ _id: p._id }, { $set: set });
  }

  // ── 1) STRÁNKY (stranka + rulebook) ──
  for (const r of data) {
    if (r.decision !== 'stranka' && r.decision !== 'rulebook') continue;
    const p = findPage(r.slug);
    if (!p) {
      if (r.decision === 'rulebook') { R.skipRulebook++; skips.push(r.slug); continue; }
      R.create++; if (!DRY) db.pages.insertOne(buildPageDoc(r));
      continue;
    }
    if (p._mig === 'fpravidlab' || p._migPravBBefore) { R.already++; continue; } // už naimportováno mnou (idempotence)
    if (isPlaceholder(p)) { R.fill++; fillExisting(p, r); }
    else { R.conflict++; conflicts.push(r.slug); }
  }

  // ── 2) STATY → PJ-AKJ záložka (access:[] = jen PJ) na rodiči ──
  for (const r of data) {
    if (r.decision !== 'AKJ') continue;
    const parent = findPage(r.parent);
    if (!parent) {
      if (slugInBatch[r.parent] && DRY) { R.akjAdd++; continue; } // rodic vznikne v import fazi
      R.akjNoParent++; noParents.push(r.slug + '->' + r.parent); continue;
    }
    const tabId = 'mig-pravb-' + r.slug;
    const has = (parent.akjTabs || []).some(function (t) { return t.id === tabId; });
    if (has) R.akjExists++; else R.akjAdd++;
    if (!DRY) { // idempotentni: pull + push (prepise i pripadnou starou verzi)
      const co = { content: r.content || '', imageUrl: r.imageUrl || '' };
      if (r.table) co.table = r.table;
      const tab = { id: tabId, name: 'Staty', order: (parent.akjTabs || []).length, access: [], ownerHidden: false, contentOverride: co, _mig: 'fpravidlab' };
      db.pages.updateOne({ _id: parent._id }, { $pull: { akjTabs: { id: tabId } } });
      db.pages.updateOne({ _id: parent._id }, { $push: { akjTabs: tab }, $set: { updatedAt: now } });
    }
  }

  print((DRY ? 'DRY-RUN' : 'IMPORT') + ' F-PravidlaB (v souboru ' + data.length + '):');
  print('  stranky: create=' + R.create + ' fill=' + R.fill + ' already=' + R.already + ' konflikt=' + R.conflict + ' rulebook-skip=' + R.skipRulebook);
  print('  staty:   akj-add=' + R.akjAdd + ' akj-exists=' + R.akjExists + ' bez-rodice=' + R.akjNoParent);
  if (conflicts.length) print('  KONFLIKT (existuje realny obsah, NEprepsano): ' + conflicts.join(', '));
  if (skips.length) print('  rulebook-skip (ceka na rulebook seed): ' + skips.join(', '));
  if (noParents.length) print('  staty bez rodice: ' + noParents.join(', '));
})();
