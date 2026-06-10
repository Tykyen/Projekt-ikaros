// F-Seznam: extrakce odkazů z Page.content do Page.menu pro type:'Seznam' (mongosh).
// Spec: docs/arch/migration-matrix/f-seznam-menu.md
//
// Starý Matrix neměl strukturované menu — položky seznamu byly jen odkazy v textu.
// F4a je převzala 1:1 → menu zůstalo [] a SeznamLayout hlásí "Seznam je zatím
// prázdný". Tenhle skript přesune odkazové paragrafy z content do menu.
//
// Vkládá se za `tiptap2html-mongo.js` (kvůli tiptapToHtml — sjednotí JSON i HTML
// vstup na HTML; funkce je idempotentní: HTML projde beze změny). Workflow vkládá
// globální `DRY` a `MAP` (f5-links.json — remap přejmenovaných slugů).
//
// Heuristika: <p> obsahující POUZE <a> (po odečtení textu z odkazů nezbývá text)
// → každý <a> = menu položka {label,href,order}, paragraf z content odstraněn.
// Paragraf s textem mimo odkaz, heading, hr, list… → zůstává v content.
//
// href normalizace na holý world-relativní slug (SeznamLayout pak složí
// /svet/<svět>/<slug>): strip starého webu projekt-ikaros.com, strip leading "/",
// remap přezdívek (MAP). Pravý externí (jiná doména / mailto/tel) → ponechán celý.
//
// Idempotence + rollback: per-stránka záloha _migSeznamBefore={content,menu} jen
// jednou, flag _migSeznamMenu. Stránka s flagem / s neprázdným menu / rulebook hub
// → skip.

var RULEBOOK_HUBS = { pravidla: 1, 'magicka-pravidla': 1 };

// Max délka doprovodného textu (mimo odkaz) v "prefix: odkaz" položce — nad tím
// je to popisný odstavec s inline odkazem, ne seznamová položka (necháme v content).
var PREFIX_MAX = 40;

// href → holý slug (nebo celá URL u pravého externího; null = zahodit prázdný)
function __normHref(href) {
  if (!href) return null;
  var h = String(href).trim();
  if (!h) return null;
  // strip starého webu → /<slug>
  var dm = h.match(/^https?:\/\/(?:www\.)?projekt-ikaros\.com\/(.+)$/i);
  if (dm) h = '/' + dm[1];
  // pravý externí odkaz / mailto / tel / kotva → ponech beze změny (v Seznam datech nenastává)
  if (/^https?:\/\//i.test(h) || /^(mailto:|tel:|#)/i.test(h)) return h;
  // odděl #kotvu / ?query, normalizuj jen slug, pak připoj zpět
  var tail = '';
  var qi = h.search(/[#?]/);
  if (qi >= 0) { tail = h.slice(qi); h = h.slice(0, qi); }
  h = h.replace(/^\/+/, '').replace(/\/+$/, ''); // strip lomítka
  if (!h) return null;
  for (var i = 0; i < MAP.length; i++) { if (MAP[i].old === h) { h = MAP[i].new; break; } }
  return h + tail;
}

// dekóduj HTML entity (tiptapToHtml escapuje &,<,>,")
function __unesc(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// HTML fragment → plaintext (tagy/<br> → mezera, decode entit, collapse whitespace)
function __plain(html) {
  return __unesc(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

// normalizovaný href z anchoru
function __href(a) {
  var m = a.match(/href="([^"]*)"/i) || a.match(/href='([^']*)'/i);
  return __normHref(m ? m[1] : '');
}

// zpracuj jeden HTML content → { html, menu }
function __extract(html) {
  var menu = [], order = 0;
  function add(label, href) { if (href && label) menu.push({ label: label, href: href, order: order++ }); }

  var out = html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, function (full, inner) {
    var anchors = inner.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi);
    if (!anchors || !anchors.length) return full; // bez odkazu → ponech (úvod/nadpis)

    // text mimo odkazy (odkazy nesou marks → HTML obalí do <span>/<u>, ty taky pryč)
    var outside = __plain(inner.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ''));

    if (anchors.length === 1) {
      if (outside.length === 0) { add(__plain(anchors[0]), __href(anchors[0])); return ''; } // čistý odkaz → label = text odkazu
      if (outside.length <= PREFIX_MAX) { add(__plain(inner), __href(anchors[0])); return ''; } // "prefix: odkaz" → label = celý řádek
      return full; // dlouhý doprovodný text → popisný odstavec, ponech v content
    }
    // víc odkazů: jen čistě odkazový řádek (žádný text mimo) rozsekat na položky;
    // víc odkazů + text (noviny: titulek+datum+zdroj) → ponech v content
    if (outside.length === 0) { for (var i = 0; i < anchors.length; i++) add(__plain(anchors[i]), __href(anchors[i])); return ''; }
    return full;
  });
  // úklid trailing prázdných <p></p> po extrakci
  out = out.replace(/(?:<p>\s*<\/p>\s*)+$/i, '').trim();
  return { html: out, menu: menu };
}

function runExtract() {
  var changed = 0, items = 0, skipMenu = 0, skipFlag = 0, sample = null;
  db.pages.find({ type: 'Seznam', _mig: { $exists: true } }).forEach(function (p) {
    if (p._migSeznamMenu === true) { skipFlag++; return; }                 // idempotence
    if (RULEBOOK_HUBS[p.slug]) return;                                      // rulebook hub
    if (Array.isArray(p.menu) && p.menu.length > 0) { skipMenu++; return; } // neprázdné menu → nech být
    if (typeof p.content !== 'string') return;

    var html = tiptapToHtml(p.content); // JSON→HTML, HTML beze změny
    var r = __extract(html);
    if (r.menu.length === 0) return; // žádné odkazy k přesunu

    var set = {
      menu: r.menu,
      content: r.html,
      _migSeznamMenu: true,
      updatedAt: new Date(),
    };
    if (p._migSeznamBefore === undefined) {
      set._migSeznamBefore = { content: p.content, menu: p.menu === undefined ? [] : p.menu };
    }
    if (!sample) sample = p.slug + ' (' + r.menu.length + ' položek)';
    if (!DRY) db.pages.updateOne({ _id: p._id }, { $set: set });
    changed++; items += r.menu.length;
  });
  print(DRY
    ? ('DRY-RUN: zmenilo by se ' + changed + ' stranek, ' + items + ' polozek menu. '
       + 'skip(flag) ' + skipFlag + ', skip(menu neprazdne) ' + skipMenu + '. vzorek: ' + sample)
    : ('HOTOVO: zpracovano ' + changed + ' stranek, ' + items + ' polozek menu. '
       + 'skip(flag) ' + skipFlag + ', skip(menu) ' + skipMenu));
}

function runRollback() {
  var n = 0;
  db.pages.find({ _migSeznamMenu: true }).forEach(function (p) {
    var set = {}, unset = { _migSeznamMenu: '' };
    if (p._migSeznamBefore !== undefined) {
      set.content = p._migSeznamBefore.content;
      set.menu = p._migSeznamBefore.menu;
      unset._migSeznamBefore = '';
    }
    var upd = { $unset: unset };
    if (Object.keys(set).length) upd.$set = set;
    db.pages.updateOne({ _id: p._id }, upd);
    n++;
  });
  print('ROLLBACK: vraceno ' + n + ' stranek (content+menu)');
}
