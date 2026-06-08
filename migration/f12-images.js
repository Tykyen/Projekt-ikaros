// F12 fáze B (mongosh) — zápis rehostnutých Cloudinary webp URL do:
//   • Page.imageUrl
//   • Page.akjTabs[].contentOverride.imageUrl  (AKJ chráněné záložky)
//   • worldsettings.groupImages               (znaky frakcí)
// Čte globální DRY a MAP (vkládá workflow). MAP = [{slug,gdriveId,secure_url,...}].
//
// Párování: imageUrl je platné GDrive ID (33 znaků) → přímý lookup; string "true"
// (poškozeno krokem F4) → page přes slug→gdriveId; AKJ "true" nemá ID (neřešitelné).
// Idempotence: hodnota už na res.cloudinary.com se přeskočí.
// Záloha _migImgBefore / _migAkjImgBefore / _migGroupImagesBefore (jen poprvé) → rollback.

var GID_RE = /^[A-Za-z0-9_-]{33}$/;
var CLOUD = 'res.cloudinary.com';

// slugifikace názvu AKJ záložky → slug stránky (pro záchranu AKJ "true", které
// odkazují na stejnojmennou stránku, např. "Zubní víly" → "zubni-vily").
function slugify(s) {
  return String(s).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
  var noMapSamples = [], worldIds = {}, noMapFull = [];
  // AKJ countery
  var akjTabsFixed = 0, akjPages = 0, akjSkipDone = 0, akjNoMap = 0, akjTrue = 0, akjTrueFixed = 0, akjNoMapFull = [];

  // filtr: stránky s imageUrl NEBO s aspoň 1 AKJ tabem (AKJ-only stub má imageUrl prázdné)
  db.pages
    .find({ $or: [{ imageUrl: { $type: 'string', $ne: '' } }, { 'akjTabs.0': { $exists: true } }] })
    .forEach(function (p) {
      var set = {};

      // --- 1) Page.imageUrl ---
      (function () {
        var cur = p.imageUrl;
        if (typeof cur !== 'string' || cur === '') return;
        if (cur.indexOf(CLOUD) !== -1) { skipDone++; return; }
        var isTrue = (cur === 'true');
        var gid = GID_RE.test(cur) ? cur : null;
        if (!gid && !isTrue) return; // normální URL / jiný obsah
        var wid = String(p.worldId);
        worldIds[wid] = (worldIds[wid] || 0) + 1;
        if (!gid && isTrue) {
          var bs = L.bySlug[p.slug];
          if (bs) { gid = bs.gdriveId; viaTrue++; }
        }
        var rec = gid ? L.byId[gid] : null;
        if (!rec || !rec.secure_url) {
          skipNoMap++;
          noMapFull.push({ slug: p.slug, imageUrl: cur });
          if (noMapSamples.length < 10)
            noMapSamples.push(p.slug + '[' + (isTrue ? 'true' : cur.slice(0, 8)) + ',w=' + wid + ']');
          return;
        }
        set.imageUrl = rec.secure_url;
        if (p._migImgBefore === undefined) set._migImgBefore = cur;
        if (!sample) sample = p.slug + ' → ' + rec.secure_url;
        changed++;
      })();

      // --- 2) Page.akjTabs[].contentOverride.imageUrl ---
      if (Array.isArray(p.akjTabs) && p.akjTabs.length) {
        var tabs = JSON.parse(JSON.stringify(p.akjTabs));
        var tabHit = false;
        for (var i = 0; i < tabs.length; i++) {
          var co = tabs[i] && tabs[i].contentOverride;
          if (!co) continue;
          var iu = co.imageUrl;
          if (typeof iu !== 'string' || iu === '') continue;
          if (iu.indexOf(CLOUD) !== -1) { akjSkipDone++; continue; }
          if (iu === 'true') {
            // bez ID — zkus záchranu: název záložky → stejnojmenná stránka v mapě
            var trec = L.bySlug[slugify(tabs[i].name)];
            if (trec && trec.secure_url) { co.imageUrl = trec.secure_url; tabHit = true; akjTrueFixed++; }
            else akjTrue++;
            continue;
          }
          if (!GID_RE.test(iu)) continue;
          var arec = L.byId[iu];
          if (!arec || !arec.secure_url) {
            akjNoMap++;
            akjNoMapFull.push({ slug: p.slug, tab: tabs[i].name, imageUrl: iu });
            continue;
          }
          co.imageUrl = arec.secure_url; tabHit = true; akjTabsFixed++;
        }
        if (tabHit) {
          set.akjTabs = tabs;
          if (p._migAkjImgBefore === undefined) set._migAkjImgBefore = p.akjTabs;
          akjPages++;
        }
      }

      // --- zápis (imageUrl + akjTabs jeden update) ---
      if (Object.keys(set).length) {
        set._migF12 = true; set.updatedAt = new Date();
        if (!DRY) db.pages.updateOne({ _id: p._id }, { $set: set });
      }
    });

  // diag
  var widStr = Object.keys(worldIds).map(function (k) { return k + '=' + worldIds[k]; }).join(', ');
  print('DIAG worldId kandidátů: ' + widStr);
  if (noMapSamples.length) print('DIAG bez-mapy vzorky: ' + noMapSamples.join(' | '));
  if (noMapFull.length) print('NOMAP=' + JSON.stringify(noMapFull));
  if (akjNoMapFull.length) print('AKJ_NOMAP=' + JSON.stringify(akjNoMapFull));

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
    'stranky=' + changed + ' (pres slug/true=' + viaTrue + '), ' +
    'AKJ-taby=' + akjTabsFixed + ' (na ' + akjPages + ' strankach), AKJ-true-zachraneno=' + akjTrueFixed +
    ', frakce-ws=' + grpChanged +
    ' | preskoceno: stranky-hotovo=' + skipDone + ', AKJ-hotovo=' + akjSkipDone +
    ' | bez-mapy: stranky=' + skipNoMap + ', AKJ=' + akjNoMap + ', AKJ-true=' + akjTrue +
    (sample ? ' | vzorek: ' + sample : '')
  );
}

function runRollback() {
  var n = 0, g = 0;
  db.pages.find({ _migF12: true }).forEach(function (p) {
    var unset = { _migF12: '' }, set = {};
    if (p._migImgBefore !== undefined) { set.imageUrl = p._migImgBefore; unset._migImgBefore = ''; }
    if (p._migAkjImgBefore !== undefined) { set.akjTabs = p._migAkjImgBefore; unset._migAkjImgBefore = ''; }
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
