// F5 fix logika (mongosh) — přepis broken slug v Page.content + table + akjTabs.
// Čte globální `DRY` a `MAP` (vkládá workflow). Slugy jsou [a-z0-9-] → bez escapu.
// Per-pole záloha (_migF5Before/_migF5TableBefore/_migF5AkjBefore) jen jednou →
// idempotentní i napříč běhy (už opravené pole najde 0 změn a nezálohuje znovu).
function __f5fix(str) {
  let c = str, n = 0;
  for (const m of MAP) {
    const re = new RegExp('(href="/?)' + m.old + '"', 'g');
    const cnt = (c.match(re) || []).length;
    if (cnt) { n += cnt; c = c.replace(re, '$1' + m.new + '"'); }
  }
  return { c: c, n: n };
}
function runFix() {
  let changed = 0, refs = 0, sample = null, seen = 0, withTable = 0, withAkj = 0;
  db.pages.find({ _mig: { $exists: true } }).forEach(function (p) {
    seen++;
    if (p.table && typeof p.table === 'object') withTable++;
    if (Array.isArray(p.akjTabs) && p.akjTabs.length) withAkj++;
    const set = {}; let n = 0;
    // 1) content
    if (typeof p.content === 'string') {
      const r = __f5fix(p.content);
      if (r.n) { n += r.n; set.content = r.c; if (p._migF5Before === undefined) set._migF5Before = p.content; }
    }
    // 2) datová tabulka (headers + values = pole HTML buněk)
    if (p.table && typeof p.table === 'object') {
      const t = JSON.parse(JSON.stringify(p.table)); let tn = 0;
      ['headers', 'values'].forEach(function (k) {
        if (Array.isArray(t[k])) for (let i = 0; i < t[k].length; i++) {
          if (typeof t[k][i] === 'string') { const r = __f5fix(t[k][i]); if (r.n) { t[k][i] = r.c; tn += r.n; } }
        }
      });
      if (tn) { n += tn; set.table = t; if (p._migF5TableBefore === undefined) set._migF5TableBefore = p.table; }
    }
    // 3) AKJ záložky (contentOverride.content = HTML)
    if (Array.isArray(p.akjTabs)) {
      const tabs = JSON.parse(JSON.stringify(p.akjTabs)); let an = 0;
      for (const tab of tabs) {
        if (tab && tab.contentOverride && typeof tab.contentOverride.content === 'string') {
          const r = __f5fix(tab.contentOverride.content);
          if (r.n) { tab.contentOverride.content = r.c; an += r.n; }
        }
      }
      if (an) { n += an; set.akjTabs = tabs; if (p._migF5AkjBefore === undefined) set._migF5AkjBefore = p.akjTabs; }
    }
    if (n > 0) {
      if (!sample) sample = p.slug;
      set._migF5Links = true; set.updatedAt = new Date();
      if (!DRY) db.pages.updateOne({ _id: p._id }, { $set: set });
      changed++; refs += n;
    }
  });
  print('DEBUG: MAP=' + MAP.length + ' pages=' + seen + ' sTable=' + withTable + ' sAkj=' + withAkj);
  if (DRY) {
    var dH = 0, dJ = 0, dW = 0, dS = null, dAH = 0;
    db.pages.find({ _mig: { $exists: true } }).forEach(function (p) {
      if (p.table) ['headers', 'values'].forEach(function (k) {
        if (Array.isArray(p.table[k])) p.table[k].forEach(function (c) {
          if (typeof c === 'string') {
            dH += (c.match(/href="/g) || []).length;
            dJ += (c.match(/"href":/g) || []).length;
            if (/wattson|rosier|of-lindsay|dodwell/i.test(c)) { dW++; if (!dS) dS = c.slice(0, 170); }
          }
        });
      });
      if (Array.isArray(p.akjTabs)) p.akjTabs.forEach(function (t) {
        if (t && t.contentOverride && typeof t.contentOverride.content === 'string') dAH += (t.contentOverride.content.match(/href="/g) || []).length;
      });
    });
    print('DEBUG2: table html-href=' + dH + ' json-href=' + dJ + ' wattson/rosier/lindsay/dodwell=' + dW + ' | akj html-href=' + dAH);
    print('DEBUG2 vzorek table buňky: ' + dS);
  }
  print(DRY
    ? ('DRY-RUN: zmenilo by se ' + changed + ' stranek, ' + refs + ' odkazu (content+table+akjTabs, vzorek ' + sample + ')')
    : ('FIX HOTOVO: stranek ' + changed + ', odkazu prepsano ' + refs + ' (content+table+akjTabs)'));
}
function runRollback() {
  let n = 0;
  db.pages.find({ _migF5Links: true }).forEach(function (p) {
    const set = {}, unset = { _migF5Links: '' };
    if (p._migF5Before !== undefined) { set.content = p._migF5Before; unset._migF5Before = ''; }
    if (p._migF5TableBefore !== undefined) { set.table = p._migF5TableBefore; unset._migF5TableBefore = ''; }
    if (p._migF5AkjBefore !== undefined) { set.akjTabs = p._migF5AkjBefore; unset._migF5AkjBefore = ''; }
    const upd = { $unset: unset }; if (Object.keys(set).length) upd.$set = set;
    db.pages.updateOne({ _id: p._id }, upd); n++;
  });
  print('ROLLBACK: vraceno ' + n + ' stranek (content+table+akjTabs)');
}
