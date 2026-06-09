// Rulebook kapitoly 10-13 — parsuje docs/arch/phase-2/rulebook-content.md (sekce 10-13)
// na HTML stránky pro seed do matrix světa. Výstup migration/rulebook-ch10-13-data.json(.gz).
// Doplnění chybějících kapitol pravidlové knihy (magie, programování, jazyky).
//
// Spuštění: node migration/rulebook-ch10-13-build.mjs

import fs from 'node:fs';
import zlib from 'node:zlib';

const SRC = 'c:/Matrix/ProjektIkaros/Projekt-ikaros-FE/docs/arch/phase-2/rulebook-content.md';
const OUT = 'C:/Matrix/ProjektIkaros/Projekt-ikaros/migration/rulebook-ch10-13-data.json';

// kapitola -> {slug, title, imageUrl?, order}
const CHAPTERS = [
  { num: 10, slug: 'magicka-pravidla', title: 'Magická pravidla', imageUrl: '/rulebook/magicka-pravidla.webp', order: 9 },
  { num: 11, slug: 'programovani', title: 'Programování', imageUrl: '/rulebook/programovani-hub.webp', order: 10 },
  { num: 12, slug: 'jazykova-politika', title: 'Jazyková politika', imageUrl: undefined, order: 11 },
  { num: 13, slug: 'jazykove-rodiny', title: 'Jazykové rodiny', imageUrl: '/rulebook/jazykove-rodiny.webp', order: 12 },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(t) {
  // escape HTML, pak inline markdown. uvozovky/pomlčky ponechat.
  let s = esc(t);
  s = s.replace(/`([^`]+)`/g, (_, x) => '<code>' + x + '</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, x) => '<strong>' + x + '</strong>');
  s = s.replace(/\*([^*]+)\*/g, (_, x) => '<em>' + x + '</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, url) => '<a href="' + url + '">' + txt + '</a>');
  return s;
}

// Markdown -> HTML pro tělo kapitoly (ploché seznamy, h3, blockquote, odstavce, víceřádkové li/p).
function mdToHtml(lines) {
  const out = [];
  let para = [];
  let list = null; // {tag:'ul'|'ol', items:[string]}
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushList = () => {
    if (list) {
      out.push('<' + list.tag + '>' + list.items.map((it) => '<li>' + inline(it) + '</li>').join('') + '</' + list.tag + '>');
      list = null;
    }
  };
  const flushAll = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    const t = line.trim();
    if (!t) { flushAll(); continue; }
    if (t === '---') { flushAll(); continue; }
    const h3 = t.match(/^###\s+(.*)/);
    if (h3) { flushAll(); out.push('<h3>' + inline(h3[1]) + '</h3>'); continue; }
    if (/^##\s/.test(t)) { flushAll(); continue; } // nadpis kapitoly — title je zvlášť
    const bq = t.match(/^>\s?(.*)/);
    if (bq) {
      flushAll();
      // poznámka pro PJ (K ověření PJ) = interní, vynech z hráčského obsahu
      if (/K ověření PJ/i.test(bq[1])) {
        while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1].trim())) i++;
        continue;
      }
      out.push('<blockquote><p>' + inline(bq[1]) + '</p></blockquote>');
      continue;
    }
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
    if (li) {
      flushPara();
      const tag = /\d+\./.test(li[2]) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(li[3]);
      continue;
    }
    // pokračovací řádek (odsazený) k poslednímu li, jinak odstavec
    if (/^\s+\S/.test(raw) && list && list.items.length) {
      list.items[list.items.length - 1] += ' ' + t;
    } else {
      flushList();
      para.push(t);
    }
  }
  flushAll();
  return out.join('');
}

// načti zdroj, rozděl na kapitoly podle "## N. Title"
const text = fs.readFileSync(SRC, 'utf8');
const allLines = text.split(/\r?\n/);
const headIdx = [];
allLines.forEach((l, i) => { const m = l.match(/^##\s+(\d+)\.\s+(.*)/); if (m) headIdx.push({ i, num: +m[1] }); });

function chapterLines(num) {
  const start = headIdx.find((h) => h.num === num);
  const next = headIdx.find((h) => h.num === num + 1);
  return allLines.slice(start.i + 1, next ? next.i : allLines.length);
}

const pages = CHAPTERS.map((ch) => {
  const body = chapterLines(ch.num);
  const content = mdToHtml(body);
  const p = { slug: ch.slug, title: ch.title, type: 'Ostatní', order: ch.order + 1, content };
  if (ch.imageUrl) p.imageUrl = ch.imageUrl;
  return p;
});
const menuItems = CHAPTERS.map((ch) => ({ label: ch.title, href: ch.slug, order: ch.order }));

const data = { pages, menuItems };
fs.writeFileSync(OUT, JSON.stringify(data));
fs.writeFileSync(OUT + '.gz', zlib.gzipSync(JSON.stringify(data)));

console.log('=== rulebook ch10-13 build ===');
for (const p of pages) console.log(`  ${p.slug} (${p.title}): ${p.content.length} znaků HTML, img=${p.imageUrl || 'ne'}`);
console.log('menu položky:', menuItems.map((m) => m.label).join(', '));
console.log('\nVzorek magie (prvních 300 zn):');
console.log(pages[0].content.slice(0, 300));
console.log('\nVystup:', OUT);
