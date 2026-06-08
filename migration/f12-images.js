// F12 fáze B (mongosh) — zápis rehostnutých Cloudinary webp URL do Page.imageUrl
// + worldsettings.groupImages (znaky frakcí). Čte globální DRY a MAP (vkládá
// workflow). MAP = [{slug,gdriveId,secure_url,public_id,width,height}] z fáze A.
//
// Párování: page.imageUrl je buď platné GDrive ID (33 znaků) → přímý lookup,
// nebo string "true" (poškozeno krokem F4) → lookup přes slug→gdriveId z MAP.
// Idempotence: stránka s imageUrl už na res.cloudinary.com se přeskočí.
// Záloha _migImgBefore (jen poprvé) → rollback vrátí přesný originál.

var GID_RE = /^[A-Za-z0-9_-]{33}$/;
var CLOUD = 'res.cloudinary.com';

// lookupy z MAP
function buildLookups() {
  var byId = {}, bySlug = {};
  for (var i = 0; i < MAP.length; i++) {
    var r = MAP[i];
    byId[r.gdriveId] = r;
    if (r.slug && r.slug.indexOf('__group__') !== 0) bySlug[r.slug] = r; // jen stránky
  }
  return { byId: byId, bySlug: bySlug };
}

function runFix() {
  var L = buildLookups();
  var changed = 0, skipDone = 0, skipNoMap = 0, viaTrue = 0, sample = null;
  db.pages.find({ _mig: { $exists: true } }).forEach(function (p) {
    var cur = p.imageUrl;
    if (typeof cur !== 'string' || cur === '') return; // bez obrázku
    if (cur.indexOf(CLOUD) !== -1) { skipDone++; return; } // už rehostnuto (idempotence)

    // urči gdriveId
    var gid = GID_RE.test(cur) ? cur : null;
    if (!gid) {
      // poškozené (např. "true") → přes slug
      var bySlug = L.bySlug[p.slug];
      if (bySlug) { gid = bySlug.gdriveId; viaTrue++; }
    }
    if (!gid) { skipNoMap++; return; }

    var rec = L.byId[gid];
    if (!rec || !rec.secure_url) { skipNoMap++; return; }

    var set = { imageUrl: rec.secure_url, _migF12: true, updatedAt: new Date() };
    if (p._migImgBefore === undefined) set._migImgBefore = cur; // záloha jen poprvé
    if (!DRY) db.pages.updateOne({ _id: p._id }, { $set: set });
    if (!sample) sample = p.slug + ' → ' + rec.secure_url;
    changed++;
  });

  // znaky frakcí (worldsettings.groupImages)
  var grpChanged = 0;
  db.worldsettings.find({}).forEach(function (ws) {
    if (!ws.groupImages) return;
    var gi = {}, hit = false;
    for (var name in ws.groupImages) {
      var v = ws.groupImages[name];
      if (typeof v === 'string' && v.indexOf(CLOUD) === -1 && L.byId[v]) {
        gi[name] = L.byId[v].secure_url; hit = true;
      } else { gi[name] = v; }
    }
    if (hit) {
      var set = { groupImages: gi };
      if (ws._migGroupImagesBefore === undefined) set._migGroupImagesBefore = ws.groupImages;
      if (!DRY) db.worldsettings.updateOne({ _id: ws._id }, { $set: set });
      grpChanged++;
    }
  });

  print(
    (DRY ? 'DRY-RUN: ' : 'FIX HOTOVO: ') +
    'stranky=' + changed + ' (z toho pres slug/true=' + viaTrue + '), ' +
    'frakce-ws=' + grpChanged + ', preskoceno: jiz-hotovo=' + skipDone +
    ', bez-mapy=' + skipNoMap + (sample ? ' | vzorek: ' + sample : '')
  );
}

function runRollback() {
  var n = 0, g = 0;
  db.pages.find({ _migF12: true }).forEach(function (p) {
    var unset = { _migF12: '' }, set = {};
    if (p._migImgBefore !== undefined) { set.imageUrl = p._migImgBefore; unset._migImgBefore = ''; }
    var upd = { $unset: unset };
    if (Object.keys(set).length) upd.$set = set;
    db.pages.updateOne({ _id: p._id }, upd); n++;
  });
  db.worldsettings.find({ _migGroupImagesBefore: { $exists: true } }).forEach(function (ws) {
    db.worldsettings.updateOne(
      { _id: ws._id },
      { $set: { groupImages: ws._migGroupImagesBefore }, $unset: { _migGroupImagesBefore: '' } }
    );
    g++;
  });
  print('ROLLBACK: stranky=' + n + ', frakce-ws=' + g);
}
